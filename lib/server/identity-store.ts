import {
  canChangeMemberRole,
  canInviteRole,
  hasRepositoryPermission,
  permissionsForRole,
  type RepositoryPermission,
  type RepositoryRole,
} from "../auth/permissions";
import type {
  AuthenticatedUser,
  RepositoryAccessSummary,
  RepositoryInvitation,
  RepositoryMember,
  SessionPayload,
  TeamPayload,
} from "../auth/types";
import type { RepositorySnapshot } from "../repository/types";
import { ensureRepositorySchema, getRepositorySnapshot } from "./repository-store";

interface IdentityClaims {
  email: string;
  displayName: string;
}

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  username: string;
}

interface RepositoryRow {
  id: number;
  owner: string;
  name: string;
  default_branch: string;
}

export class AccessError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function decodeDisplayName(request: Request): string {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (!encoded || encoding !== "percent-encoded-utf-8") return "";
  try { return decodeURIComponent(encoded).trim(); } catch { return ""; }
}

export function identityClaimsFromRequest(request: Request): IdentityClaims | null {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return { email, displayName: decodeDisplayName(request) || email.split("@")[0] };
}

function usernameBase(displayName: string, email: string): string {
  const fromName = displayName.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
  const fromEmail = email.split("@")[0].replace(/[^a-z0-9]+/g, "").toLowerCase();
  return (fromName || fromEmail || "developer").slice(0, 32);
}

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0]}` : parts[0]?.slice(0, 2) || "MF").toUpperCase();
}

async function uniqueUsername(db: D1Database, base: string, email: string): Promise<string> {
  const existing = await db.prepare("SELECT email FROM users WHERE username = ?").bind(base).first<{ email: string }>();
  if (!existing || existing.email === email) return base;
  let hash = 2166136261;
  for (const character of email) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${base.slice(0, 25)}-${(hash >>> 0).toString(36).slice(0, 6)}`;
}

export async function ensureAuthenticatedUser(db: D1Database, claims: IdentityClaims): Promise<AuthenticatedUser> {
  await ensureRepositorySchema(db);
  const now = Date.now();
  const existing = await db.prepare("SELECT id, email, display_name, username FROM users WHERE email = ?")
    .bind(claims.email).first<UserRow>();
  if (existing) {
    await db.prepare("UPDATE users SET display_name = ?, last_seen_at = ? WHERE id = ?")
      .bind(claims.displayName.slice(0, 100), now, existing.id).run();
    return {
      id: existing.id, email: existing.email, displayName: claims.displayName.slice(0, 100),
      username: existing.username, initials: initials(claims.displayName),
    };
  }
  const username = await uniqueUsername(db, usernameBase(claims.displayName, claims.email), claims.email);
  const result = await db.prepare(`INSERT INTO users (email, display_name, username, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)`).bind(claims.email, claims.displayName.slice(0, 100), username, now, now).run();
  const userId = Number(result.meta.last_row_id);
  return { id: userId, email: claims.email, displayName: claims.displayName.slice(0, 100), username, initials: initials(claims.displayName) };
}

async function bootstrapLegacyOwnership(db: D1Database, user: AuthenticatedUser): Promise<void> {
  const membership = await db.prepare("SELECT repository_id FROM repository_members WHERE user_id = ? LIMIT 1")
    .bind(user.id).first<{ repository_id: number }>();
  if (membership) return;
  const emailAlias = user.email.split("@")[0].replace(/\d+$/g, "").replace(/[^a-z0-9]/g, "");
  const candidates = [...new Set([user.username, emailAlias])].filter(Boolean);
  for (const owner of candidates) {
    const result = await db.prepare(`SELECT r.id FROM repositories r
      WHERE r.owner = ? AND NOT EXISTS (SELECT 1 FROM repository_members m WHERE m.repository_id = r.id)`)
      .bind(owner).all<{ id: number }>();
    for (const repository of result.results ?? []) {
      await db.prepare(`INSERT INTO repository_members (repository_id, user_id, role, added_at)
        VALUES (?, ?, 'owner', ?) ON CONFLICT(repository_id, user_id) DO NOTHING`)
        .bind(repository.id, user.id, Date.now()).run();
    }
  }
}

async function listRepositoryAccess(db: D1Database, userId: number): Promise<RepositoryAccessSummary[]> {
  const result = await db.prepare(`SELECT r.id, r.owner, r.name, r.default_branch, m.role,
      COALESCE(MAX(ref.updated_at), r.created_at) updated_at
    FROM repository_members m JOIN repositories r ON r.id = m.repository_id
    LEFT JOIN repo_refs ref ON ref.repository_id = r.id
    WHERE m.user_id = ? GROUP BY r.id, r.owner, r.name, r.default_branch, m.role
    ORDER BY updated_at DESC, r.name ASC`).bind(userId).all<{
      id: number; owner: string; name: string; default_branch: string; role: RepositoryRole; updated_at: number;
    }>();
  return (result.results ?? []).map((row) => ({
    id: row.id, owner: row.owner, name: row.name, defaultBranch: row.default_branch,
    role: row.role, permissions: permissionsForRole(row.role), updatedAt: row.updated_at,
  }));
}

async function invitationRows(db: D1Database, where: string, value: string | number): Promise<RepositoryInvitation[]> {
  const result = await db.prepare(`SELECT i.id, i.repository_id, r.owner, r.name, i.email, i.role,
      u.display_name invited_by, i.status, i.created_at
    FROM repository_invitations i JOIN repositories r ON r.id = i.repository_id
    JOIN users u ON u.id = i.invited_by WHERE ${where}
    ORDER BY i.created_at DESC`).bind(value).all<{
      id: number; repository_id: number; owner: string; name: string; email: string;
      role: Exclude<RepositoryRole, "owner">; invited_by: string;
      status: RepositoryInvitation["status"]; created_at: number;
    }>();
  return (result.results ?? []).map((row) => ({
    id: row.id, repositoryId: row.repository_id, owner: row.owner, repositoryName: row.name,
    email: row.email, role: row.role, invitedBy: row.invited_by, status: row.status, createdAt: row.created_at,
  }));
}

export async function getSession(db: D1Database, claims: IdentityClaims): Promise<SessionPayload> {
  const user = await ensureAuthenticatedUser(db, claims);
  await bootstrapLegacyOwnership(db, user);
  const [repositories, invitations] = await Promise.all([
    listRepositoryAccess(db, user.id),
    invitationRows(db, "i.email = ? AND i.status = 'pending'", user.email),
  ]);
  return { user, repositories, invitations };
}

export async function requireRepositoryPermission(
  db: D1Database,
  owner: string,
  name: string,
  user: AuthenticatedUser,
  permission: RepositoryPermission,
): Promise<{ repository: RepositoryRow; role: RepositoryRole }> {
  const row = await db.prepare(`SELECT r.id, r.owner, r.name, r.default_branch, m.role
    FROM repositories r LEFT JOIN repository_members m ON m.repository_id = r.id AND m.user_id = ?
    WHERE r.owner = ? AND r.name = ?`).bind(user.id, owner, name).first<RepositoryRow & { role: RepositoryRole | null }>();
  if (!row) throw new AccessError("Repository not found", 404);
  if (!row.role) throw new AccessError("You do not have access to this repository", 403);
  if (!hasRepositoryPermission(row.role, permission)) throw new AccessError(`The ${row.role} role cannot perform this action`, 403);
  return { repository: row, role: row.role };
}

function repositoryName(value: string): string {
  const name = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-._]+|[-._]+$/g, "").slice(0, 80);
  if (!name) throw new AccessError("Repository name is required", 400);
  return name;
}

function isAssignableRole(value: unknown): value is Exclude<RepositoryRole, "owner"> {
  return value === "maintainer" || value === "contributor" || value === "viewer";
}

export async function createUserRepository(db: D1Database, user: AuthenticatedUser, input: { name?: string }): Promise<{
  session: SessionPayload;
  repository: RepositorySnapshot;
}> {
  const name = repositoryName(input.name ?? "");
  const now = Date.now();
  try {
    const result = await db.prepare(`INSERT INTO repositories (owner, name, default_branch, created_at)
      VALUES (?, ?, 'main', ?)`).bind(user.username, name, now).run();
    const repositoryId = Number(result.meta.last_row_id);
    await db.prepare(`INSERT INTO repository_members (repository_id, user_id, role, added_at)
      VALUES (?, ?, 'owner', ?)`).bind(repositoryId, user.id, now).run();
  } catch (cause) {
    if (cause instanceof Error && /unique|constraint/i.test(cause.message)) throw new AccessError("A repository with that name already exists", 409);
    throw cause;
  }
  const repository = await getRepositorySnapshot(db, user.username, name);
  const session = await getSession(db, { email: user.email, displayName: user.displayName });
  return { session, repository };
}

export async function getRepositoryTeam(db: D1Database, owner: string, name: string, user: AuthenticatedUser): Promise<TeamPayload> {
  const { repository } = await requireRepositoryPermission(db, owner, name, user, "read");
  const result = await db.prepare(`SELECT u.id user_id, u.email, u.display_name, u.username, m.role, m.added_at
    FROM repository_members m JOIN users u ON u.id = m.user_id
    WHERE m.repository_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'maintainer' THEN 1 WHEN 'contributor' THEN 2 ELSE 3 END, u.display_name`)
    .bind(repository.id).all<{
      user_id: number; email: string; display_name: string; username: string; role: RepositoryRole; added_at: number;
    }>();
  const members: RepositoryMember[] = (result.results ?? []).map((row) => ({
    userId: row.user_id, email: row.email, displayName: row.display_name, username: row.username,
    role: row.role, addedAt: row.added_at,
  }));
  const invitations = await invitationRows(db, "i.repository_id = ?", repository.id);
  return { members, invitations };
}

export async function inviteRepositoryMember(
  db: D1Database,
  owner: string,
  name: string,
  actor: AuthenticatedUser,
  input: { email?: string; role?: RepositoryRole },
): Promise<TeamPayload> {
  const { repository, role: actorRole } = await requireRepositoryPermission(db, owner, name, actor, "invite");
  const email = input.email?.trim().toLowerCase();
  const role = input.role;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AccessError("Enter a valid invitation email", 400);
  if (!isAssignableRole(role)) throw new AccessError("Choose a valid repository role", 400);
  if (!canInviteRole(actorRole, role)) throw new AccessError("You cannot invite that role", 403);
  if (email === actor.email) throw new AccessError("You are already a member", 400);
  const existingUser = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: number }>();
  if (existingUser) {
    const membership = await db.prepare("SELECT role FROM repository_members WHERE repository_id = ? AND user_id = ?")
      .bind(repository.id, existingUser.id).first<{ role: RepositoryRole }>();
    if (membership) throw new AccessError("That user is already a repository member", 409);
  }
  await db.prepare(`INSERT INTO repository_invitations
    (repository_id, email, role, invited_by, status, created_at, responded_at)
    VALUES (?, ?, ?, ?, 'pending', ?, NULL)
    ON CONFLICT(repository_id, email) DO UPDATE SET role = excluded.role, invited_by = excluded.invited_by,
      status = 'pending', created_at = excluded.created_at, responded_at = NULL`)
    .bind(repository.id, email, role, actor.id, Date.now()).run();
  return getRepositoryTeam(db, owner, name, actor);
}

export async function respondToInvitation(
  db: D1Database,
  user: AuthenticatedUser,
  invitationId: number,
  accept: boolean,
): Promise<SessionPayload> {
  const invitation = await db.prepare(`SELECT id, repository_id, email, role, invited_by, status
    FROM repository_invitations WHERE id = ?`).bind(invitationId).first<{
      id: number; repository_id: number; email: string; role: RepositoryRole; invited_by: number; status: string;
    }>();
  if (!invitation || invitation.email !== user.email || invitation.status !== "pending") throw new AccessError("Invitation not found", 404);
  const now = Date.now();
  const statements = [
    db.prepare("UPDATE repository_invitations SET status = ?, responded_at = ? WHERE id = ? AND status = 'pending'")
      .bind(accept ? "accepted" : "declined", now, invitation.id),
  ];
  if (accept) {
    statements.push(db.prepare(`INSERT INTO repository_members (repository_id, user_id, role, added_at, invited_by)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(repository_id, user_id) DO UPDATE SET role = excluded.role`)
      .bind(invitation.repository_id, user.id, invitation.role, now, invitation.invited_by));
  }
  await db.batch(statements);
  return getSession(db, { email: user.email, displayName: user.displayName });
}

export async function updateRepositoryMember(
  db: D1Database,
  owner: string,
  name: string,
  actor: AuthenticatedUser,
  userId: number,
  nextRole: RepositoryRole | null,
): Promise<TeamPayload> {
  const { repository, role: actorRole } = await requireRepositoryPermission(db, owner, name, actor, "manage_members");
  const member = await db.prepare("SELECT role FROM repository_members WHERE repository_id = ? AND user_id = ?")
    .bind(repository.id, userId).first<{ role: RepositoryRole }>();
  if (!member) throw new AccessError("Member not found", 404);
  if (nextRole === null) {
    if (!canChangeMemberRole(actorRole, member.role, "viewer")) throw new AccessError("The repository owner cannot be removed", 403);
    await db.prepare("DELETE FROM repository_members WHERE repository_id = ? AND user_id = ?").bind(repository.id, userId).run();
  } else {
    if (!isAssignableRole(nextRole)) throw new AccessError("Choose a valid repository role", 400);
    if (!canChangeMemberRole(actorRole, member.role, nextRole)) throw new AccessError("You cannot assign that role", 403);
    await db.prepare("UPDATE repository_members SET role = ? WHERE repository_id = ? AND user_id = ?")
      .bind(nextRole, repository.id, userId).run();
  }
  return getRepositoryTeam(db, owner, name, actor);
}
