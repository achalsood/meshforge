/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { RealtimeBatch, RealtimeSignal } from "../lib/collaboration/protocol";
import {
  decodeBinaryOperationEvent,
  operationPayload,
  operationsFromPayload,
} from "../lib/collaboration/binary-codec";
import { roomSlug } from "../lib/collaboration/room-id";
import { isRealtimeSignalPacket } from "../lib/collaboration/signaling";
import { hasRepositoryPermission } from "../lib/auth/permissions";
import type { AuthenticatedUser } from "../lib/auth/types";
import { analyzeRepository } from "../lib/intelligence/repository-analyzer";
import {
  addRepositoryIssueComment, commitRepository, createRepositoryBranch, createRepositoryIssue,
  createRepositoryPullRequest, getRepositorySnapshot, listRepositoryIssues, listRepositoryWorkflowRuns,
  mergeRepositoryPullRequest, runRepositoryWorkflow, updateRepositoryIssue,
} from "../lib/server/repository-store";
import {
  AccessError, createUserRepository, ensureAuthenticatedUser, getRepositoryTeam, getSession,
  identityClaimsFromRequest, inviteRepositoryMember, requireRepositoryPermission,
  respondToInvitation, updateRepositoryMember,
} from "../lib/server/identity-store";
import { persistAudioSignal, persistRoomEvents, replayAudioSignals, replayRoom } from "../lib/server/room-store";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const liveRooms = new Map<string, Set<WebSocket>>();

function errorResponse(cause: unknown, fallback: string): Response {
  const message = cause instanceof Error ? cause.message : fallback;
  const status = cause instanceof AccessError ? cause.status
    : message.includes("not found") ? 404
      : message.includes("moved") || message.includes("rebase") || message.includes("exists") ? 409
        : 400;
  return Response.json({ error: message }, { status });
}

function repositoryCoordinates(request: Request): { owner: string; name: string } {
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner")?.trim() ?? "";
  const name = url.searchParams.get("repo")?.trim() ?? "";
  if (!/^[a-z0-9_.-]+$/i.test(owner) || !/^[a-z0-9_.-]+$/i.test(name)) throw new AccessError("Repository context is required", 400);
  return { owner, name };
}

function assertRoomContext(request: Request, roomId: string, owner: string, name: string): void {
  const scope = new URL(request.url).searchParams.get("scope")?.trim() ?? "";
  if (!scope || scope.length > 320 || roomSlug(`${owner}:${name}:${scope}`) !== roomId) {
    throw new AccessError("Realtime room does not match this repository", 403);
  }
}

function sanitizeRealtimeEvents(events: RealtimeBatch["events"], user: AuthenticatedUser, canCollaborate: boolean): RealtimeBatch["events"] {
  return events.flatMap((event) => {
    if ((event.kind === "operations" || event.kind === "chat") && !canCollaborate) return [];
    if (event.kind === "operations") {
      const operations = operationsFromPayload(event.payload);
      if (!operations?.length || operations.length > 10_000) return [];
      return [{ ...event, payload: operationPayload(operations) }];
    }
    if (event.kind === "chat" && "body" in event.payload) {
      return [{ ...event, payload: { ...event.payload, name: user.displayName, initials: user.initials } }];
    }
    if (event.kind === "presence" && "name" in event.payload) {
      return [{ ...event, payload: { ...event.payload, name: user.displayName } }];
    }
    return [event];
  });
}

function acceptRealtimeSocket(request: Request, env: Env, roomId: string, user: AuthenticatedUser, canCollaborate: boolean): Response {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  const sockets = liveRooms.get(roomId) ?? new Set<WebSocket>();
  sockets.add(server);
  liveRooms.set(roomId, sockets);
  server.send(JSON.stringify({ type: "ready", roomId }));

  server.addEventListener("message", async (message) => {
    try {
      if (message.data instanceof ArrayBuffer) {
        if (!canCollaborate || message.data.byteLength > 256_000) return;
        const events = sanitizeRealtimeEvents(
          [decodeBinaryOperationEvent(new Uint8Array(message.data))],
          user,
          canCollaborate,
        );
        if (!events.length) return;
        await persistRoomEvents(env.DB, roomId, events);
        for (const peer of sockets) {
          if (peer !== server && peer.readyState === WebSocket.OPEN) peer.send(message.data);
        }
        return;
      }
      if (typeof message.data !== "string" || message.data.length > 256_000) return;
      const packet = JSON.parse(message.data) as RealtimeBatch | RealtimeSignal;
      if (packet.roomId !== roomId) return;
      if (packet.type === "batch") {
        if (!Array.isArray(packet.events)) return;
        const events = sanitizeRealtimeEvents(packet.events, user, canCollaborate);
        if (!events.length) return;
        const serialized = JSON.stringify({ ...packet, events });
        await persistRoomEvents(env.DB, roomId, events);
        for (const peer of sockets) {
          if (peer !== server && peer.readyState === WebSocket.OPEN) peer.send(serialized);
        }
        return;
      } else if (packet.type !== "signal" || !packet.signal || !packet.clientId) return;
      if (!canCollaborate) return;
      for (const peer of sockets) {
        if (peer !== server && peer.readyState === WebSocket.OPEN) peer.send(message.data);
      }
    } catch {
      server.send(JSON.stringify({ type: "error", message: "Invalid realtime message" }));
    }
  });

  const remove = () => {
    sockets.delete(server);
    if (!sockets.size) liveRooms.delete(roomId);
  };
  server.addEventListener("close", remove);
  server.addEventListener("error", remove);
  return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
}

async function handleRoomEvents(request: Request, env: Env, roomId: string, user: AuthenticatedUser): Promise<Response> {
  const { owner, name } = repositoryCoordinates(request);
  assertRoomContext(request, roomId, owner, name);
  const { role } = await requireRepositoryPermission(env.DB, owner, name, user, "read");
  if (request.method === "GET") {
    const since = Math.max(0, Number(new URL(request.url).searchParams.get("since")) || 0);
    return Response.json(await replayRoom(env.DB, roomId, since), {
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (request.method === "POST") {
    const body = await request.json() as { events?: RealtimeBatch["events"] };
    if (!Array.isArray(body.events) || body.events.length > 100) {
      return Response.json({ error: "Expected at most 100 events" }, { status: 400 });
    }
    const canCollaborate = hasRepositoryPermission(role, "chat") && hasRepositoryPermission(role, "commit");
    const events = sanitizeRealtimeEvents(body.events, user, canCollaborate);
    await persistRoomEvents(env.DB, roomId, events);
    return Response.json({ accepted: events.length }, { status: 202 });
  }
  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
}

async function handleAudioSignals(request: Request, env: Env, roomId: string, user: AuthenticatedUser): Promise<Response> {
  const { owner, name } = repositoryCoordinates(request);
  assertRoomContext(request, roomId, owner, name);
  await requireRepositoryPermission(env.DB, owner, name, user, "audio");
  if (request.method === "GET") {
    const since = Math.max(0, Number(new URL(request.url).searchParams.get("since")) || 0);
    return Response.json(await replayAudioSignals(env.DB, roomId, since), {
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (request.method === "POST") {
    const raw = await request.text();
    if (raw.length > 128_000) return Response.json({ error: "Signal is too large" }, { status: 413 });
    let packet: unknown;
    try { packet = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    if (!isRealtimeSignalPacket(packet, roomId)) return Response.json({ error: "Invalid signal" }, { status: 400 });
    const seq = await persistAudioSignal(env.DB, roomId, packet);
    return Response.json({ accepted: true, seq }, { status: 202 });
  }
  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
}

async function handleRepository(request: Request, env: Env, owner: string, name: string, commitRoute: boolean, user: AuthenticatedUser): Promise<Response> {
  try {
    if (request.method === "GET" && !commitRoute) {
      await requireRepositoryPermission(env.DB, owner, name, user, "read");
      const branch = new URL(request.url).searchParams.get("branch") || "main";
      return Response.json(await getRepositorySnapshot(env.DB, owner, name, branch), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (request.method === "POST" && commitRoute) {
      await requireRepositoryPermission(env.DB, owner, name, user, "commit");
      const raw = await request.text();
      if (raw.length > 2_200_000) return Response.json({ error: "Commit payload is too large" }, { status: 413 });
      const input = JSON.parse(raw) as Parameters<typeof commitRepository>[3];
      return Response.json(await commitRepository(env.DB, owner, name, { ...input, author: user.displayName }), { status: 201 });
    }
    return new Response("Method not allowed", { status: 405, headers: { Allow: commitRoute ? "POST" : "GET" } });
  } catch (cause) {
    return errorResponse(cause, "Repository request failed");
  }
}

async function handleRepositoryBranches(request: Request, env: Env, owner: string, name: string, user: AuthenticatedUser): Promise<Response> {
  try {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    await requireRepositoryPermission(env.DB, owner, name, user, "branch");
    const input = await request.json() as Parameters<typeof createRepositoryBranch>[3];
    return Response.json(await createRepositoryBranch(env.DB, owner, name, input), { status: 201 });
  } catch (cause) {
    return errorResponse(cause, "Branch request failed");
  }
}

async function handlePullRequests(request: Request, env: Env, owner: string, name: string, user: AuthenticatedUser, number?: number, merge = false): Promise<Response> {
  try {
    if (request.method === "GET" && !number) {
      await requireRepositoryPermission(env.DB, owner, name, user, "read");
      return Response.json(await getRepositorySnapshot(env.DB, owner, name));
    }
    if (request.method === "POST" && !number) {
      await requireRepositoryPermission(env.DB, owner, name, user, "pull_request");
      const input = await request.json() as Parameters<typeof createRepositoryPullRequest>[3];
      return Response.json(await createRepositoryPullRequest(env.DB, owner, name, { ...input, author: user.displayName }), { status: 201 });
    }
    if (request.method === "POST" && number && merge) {
      await requireRepositoryPermission(env.DB, owner, name, user, "merge");
      return Response.json(await mergeRepositoryPullRequest(env.DB, owner, name, number, user.displayName), { status: 201 });
    }
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  } catch (cause) {
    return errorResponse(cause, "Pull request failed");
  }
}

async function handleIssues(request: Request, env: Env, owner: string, name: string, user: AuthenticatedUser, number?: number, comments = false): Promise<Response> {
  try {
    if (request.method === "GET" && !number) {
      await requireRepositoryPermission(env.DB, owner, name, user, "read");
      return Response.json(await listRepositoryIssues(env.DB, owner, name), { headers: { "Cache-Control": "no-store" } });
    }
    if (request.method === "POST" && !number) {
      await requireRepositoryPermission(env.DB, owner, name, user, "issues");
      const input = await request.json() as Parameters<typeof createRepositoryIssue>[3];
      return Response.json(await createRepositoryIssue(env.DB, owner, name, { ...input, author: user.displayName }), { status: 201 });
    }
    if (request.method === "PATCH" && number && !comments) {
      await requireRepositoryPermission(env.DB, owner, name, user, "issues");
      const input = await request.json() as Parameters<typeof updateRepositoryIssue>[4];
      return Response.json(await updateRepositoryIssue(env.DB, owner, name, number, input));
    }
    if (request.method === "POST" && number && comments) {
      await requireRepositoryPermission(env.DB, owner, name, user, "issues");
      const input = await request.json() as Parameters<typeof addRepositoryIssueComment>[4];
      return Response.json(await addRepositoryIssueComment(env.DB, owner, name, number, { ...input, author: user.displayName }), { status: 201 });
    }
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, PATCH" } });
  } catch (cause) {
    return errorResponse(cause, "Issue request failed");
  }
}

async function handleActions(request: Request, env: Env, owner: string, name: string, user: AuthenticatedUser): Promise<Response> {
  try {
    if (request.method === "GET") {
      await requireRepositoryPermission(env.DB, owner, name, user, "read");
      return Response.json(await listRepositoryWorkflowRuns(env.DB, owner, name), { headers: { "Cache-Control": "no-store" } });
    }
    if (request.method === "POST") {
      await requireRepositoryPermission(env.DB, owner, name, user, "actions");
      const input = await request.json() as Parameters<typeof runRepositoryWorkflow>[3];
      return Response.json(await runRepositoryWorkflow(env.DB, owner, name, { ...input, author: user.displayName }), { status: 201 });
    }
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  } catch (cause) {
    return errorResponse(cause, "Action request failed");
  }
}

async function handleSession(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  return Response.json(await getSession(env.DB, { email: user.email, displayName: user.displayName }), {
    headers: { "Cache-Control": "no-store" },
  });
}

async function handleRepositories(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  try {
    if (request.method === "GET") return handleSession(request, env, user);
    if (request.method === "POST") {
      const input = await request.json() as { name?: string };
      return Response.json(await createUserRepository(env.DB, user, input), { status: 201 });
    }
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  } catch (cause) {
    return errorResponse(cause, "Repository could not be created");
  }
}

async function handleInvitationResponse(request: Request, env: Env, user: AuthenticatedUser, invitationId: number): Promise<Response> {
  try {
    if (request.method !== "PATCH") return new Response("Method not allowed", { status: 405, headers: { Allow: "PATCH" } });
    const input = await request.json() as { accept?: boolean };
    return Response.json(await respondToInvitation(env.DB, user, invitationId, input.accept === true));
  } catch (cause) {
    return errorResponse(cause, "Invitation could not be updated");
  }
}

async function handleRepositoryTeam(
  request: Request,
  env: Env,
  owner: string,
  name: string,
  user: AuthenticatedUser,
  memberId?: number,
): Promise<Response> {
  try {
    if (request.method === "GET" && !memberId) return Response.json(await getRepositoryTeam(env.DB, owner, name, user));
    if (request.method === "POST" && !memberId) {
      const input = await request.json() as Parameters<typeof inviteRepositoryMember>[4];
      return Response.json(await inviteRepositoryMember(env.DB, owner, name, user, input), { status: 201 });
    }
    if (request.method === "PATCH" && memberId) {
      const input = await request.json() as { role?: "maintainer" | "contributor" | "viewer" };
      if (!input.role) return Response.json({ error: "A repository role is required" }, { status: 400 });
      return Response.json(await updateRepositoryMember(env.DB, owner, name, user, memberId, input.role));
    }
    if (request.method === "DELETE" && memberId) {
      return Response.json(await updateRepositoryMember(env.DB, owner, name, user, memberId, null));
    }
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, PATCH, DELETE" } });
  } catch (cause) {
    return errorResponse(cause, "Repository team request failed");
  }
}

async function handleRepositoryAnalysis(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const raw = await request.text();
  if (raw.length > 2_200_000) return Response.json({ error: "Analysis payload is too large" }, { status: 413 });
  try {
    const { owner, name } = repositoryCoordinates(request);
    await requireRepositoryPermission(env.DB, owner, name, user, "read");
    const input = JSON.parse(raw) as { files?: Array<{ path?: string; content?: string }> };
    if (!Array.isArray(input.files) || !input.files.length || input.files.length > 200) {
      return Response.json({ error: "Expected 1–200 repository files" }, { status: 400 });
    }
    const files = input.files.map((file) => ({ path: String(file.path ?? "").slice(0, 240), content: String(file.content ?? "") }));
    return Response.json(analyzeRepository(files), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Invalid analysis request" }, { status: 400 });
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const claims = identityClaimsFromRequest(request);
      if (!claims) {
        return Response.json({ error: "Sign in with ChatGPT to use MeshForge", signInUrl: "/signin-with-chatgpt?return_to=/" }, { status: 401 });
      }
      try {
        const user = await ensureAuthenticatedUser(env.DB, claims);

        if (url.pathname === "/api/session") return handleSession(request, env, user);
        if (url.pathname === "/api/repositories") return handleRepositories(request, env, user);

        const invitationMatch = url.pathname.match(/^\/api\/invitations\/(\d+)$/);
        if (invitationMatch) return handleInvitationResponse(request, env, user, Number(invitationMatch[1]));

        const roomMatch = url.pathname.match(/^\/api\/realtime\/([a-z0-9][a-z0-9-]{0,63})$/i);
        if (roomMatch && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
          const { owner, name } = repositoryCoordinates(request);
          assertRoomContext(request, roomMatch[1], owner, name);
          const { role } = await requireRepositoryPermission(env.DB, owner, name, user, "read");
          return acceptRealtimeSocket(request, env, roomMatch[1], user, hasRepositoryPermission(role, "chat") && hasRepositoryPermission(role, "commit"));
        }

        const eventMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9][a-z0-9-]{0,63})\/events$/i);
        if (eventMatch) return handleRoomEvents(request, env, eventMatch[1], user);

        const signalMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9][a-z0-9-]{0,63})\/signals$/i);
        if (signalMatch) return handleAudioSignals(request, env, signalMatch[1], user);

        if (url.pathname === "/api/intelligence/analyze") return handleRepositoryAnalysis(request, env, user);

        const teamMatch = url.pathname.match(/^\/api\/repos\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)\/members(?:\/(\d+))?$/i);
        if (teamMatch) return handleRepositoryTeam(request, env, teamMatch[1], teamMatch[2], user, teamMatch[3] ? Number(teamMatch[3]) : undefined);

        const branchMatch = url.pathname.match(/^\/api\/repos\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)\/branches$/i);
        if (branchMatch) return handleRepositoryBranches(request, env, branchMatch[1], branchMatch[2], user);

        const pullMatch = url.pathname.match(/^\/api\/repos\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)\/pulls(?:\/(\d+)(\/merge)?)?$/i);
        if (pullMatch) return handlePullRequests(request, env, pullMatch[1], pullMatch[2], user, pullMatch[3] ? Number(pullMatch[3]) : undefined, Boolean(pullMatch[4]));

        const issueMatch = url.pathname.match(/^\/api\/repos\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)\/issues(?:\/(\d+)(\/comments)?)?$/i);
        if (issueMatch) return handleIssues(request, env, issueMatch[1], issueMatch[2], user, issueMatch[3] ? Number(issueMatch[3]) : undefined, Boolean(issueMatch[4]));

        const actionMatch = url.pathname.match(/^\/api\/repos\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)\/actions$/i);
        if (actionMatch) return handleActions(request, env, actionMatch[1], actionMatch[2], user);

        const repositoryMatch = url.pathname.match(/^\/api\/repos\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)(\/commits)?$/i);
        if (repositoryMatch) return handleRepository(request, env, repositoryMatch[1], repositoryMatch[2], Boolean(repositoryMatch[3]), user);
      } catch (cause) {
        return errorResponse(cause, "Authenticated request failed");
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
