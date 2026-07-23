/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { RealtimeBatch, RealtimeSignal } from "../lib/collaboration/protocol";
import { isRealtimeSignalPacket } from "../lib/collaboration/signaling";
import { commitRepository, getRepositorySnapshot } from "../lib/server/repository-store";
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

function acceptRealtimeSocket(request: Request, env: Env, roomId: string): Response {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  const sockets = liveRooms.get(roomId) ?? new Set<WebSocket>();
  sockets.add(server);
  liveRooms.set(roomId, sockets);
  server.send(JSON.stringify({ type: "ready", roomId }));

  server.addEventListener("message", (message) => {
    if (typeof message.data !== "string" || message.data.length > 256_000) return;
    try {
      const packet = JSON.parse(message.data) as RealtimeBatch | RealtimeSignal;
      if (packet.roomId !== roomId) return;
      if (packet.type === "batch") {
        if (!Array.isArray(packet.events)) return;
        void persistRoomEvents(env.DB, roomId, packet.events);
      } else if (packet.type !== "signal" || !packet.signal || !packet.clientId) return;
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

async function handleRoomEvents(request: Request, env: Env, roomId: string): Promise<Response> {
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
    await persistRoomEvents(env.DB, roomId, body.events);
    return Response.json({ accepted: body.events.length }, { status: 202 });
  }
  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
}

async function handleAudioSignals(request: Request, env: Env, roomId: string): Promise<Response> {
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

async function handleRepository(request: Request, env: Env, owner: string, name: string, commitRoute: boolean): Promise<Response> {
  try {
    if (request.method === "GET" && !commitRoute) {
      const branch = new URL(request.url).searchParams.get("branch") || "main";
      return Response.json(await getRepositorySnapshot(env.DB, owner, name, branch), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (request.method === "POST" && commitRoute) {
      const raw = await request.text();
      if (raw.length > 2_200_000) return Response.json({ error: "Commit payload is too large" }, { status: 413 });
      const input = JSON.parse(raw) as Parameters<typeof commitRepository>[3];
      return Response.json(await commitRepository(env.DB, owner, name, input), { status: 201 });
    }
    return new Response("Method not allowed", { status: 405, headers: { Allow: commitRoute ? "POST" : "GET" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Repository request failed";
    return Response.json({ error: message }, { status: message === "Branch not found" ? 404 : message.startsWith("Branch moved") ? 409 : 400 });
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

    const roomMatch = url.pathname.match(/^\/api\/realtime\/([a-z0-9][a-z0-9-]{0,63})$/i);
    if (roomMatch && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return acceptRealtimeSocket(request, env, roomMatch[1]);
    }

    const eventMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9][a-z0-9-]{0,63})\/events$/i);
    if (eventMatch) return handleRoomEvents(request, env, eventMatch[1]);

    const signalMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9][a-z0-9-]{0,63})\/signals$/i);
    if (signalMatch) return handleAudioSignals(request, env, signalMatch[1]);

    const repositoryMatch = url.pathname.match(/^\/api\/repos\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)(\/commits)?$/i);
    if (repositoryMatch) return handleRepository(request, env, repositoryMatch[1], repositoryMatch[2], Boolean(repositoryMatch[3]));

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
