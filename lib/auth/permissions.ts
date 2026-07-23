export type RepositoryRole = "owner" | "maintainer" | "contributor" | "viewer";

export type RepositoryPermission =
  | "read"
  | "commit"
  | "branch"
  | "pull_request"
  | "merge"
  | "issues"
  | "actions"
  | "chat"
  | "audio"
  | "invite"
  | "manage_members";

const ROLE_PERMISSIONS: Record<RepositoryRole, readonly RepositoryPermission[]> = {
  owner: ["read", "commit", "branch", "pull_request", "merge", "issues", "actions", "chat", "audio", "invite", "manage_members"],
  maintainer: ["read", "commit", "branch", "pull_request", "merge", "issues", "actions", "chat", "audio", "invite"],
  contributor: ["read", "commit", "branch", "pull_request", "issues", "chat", "audio"],
  viewer: ["read"],
};

const ROLE_WEIGHT: Record<RepositoryRole, number> = {
  viewer: 0,
  contributor: 1,
  maintainer: 2,
  owner: 3,
};

export function permissionsForRole(role: RepositoryRole): RepositoryPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasRepositoryPermission(role: RepositoryRole, permission: RepositoryPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canInviteRole(actorRole: RepositoryRole, invitedRole: RepositoryRole): boolean {
  if (invitedRole === "owner") return false;
  if (actorRole === "owner") return true;
  return actorRole === "maintainer" && ROLE_WEIGHT[invitedRole] < ROLE_WEIGHT.maintainer;
}

export function canChangeMemberRole(actorRole: RepositoryRole, currentRole: RepositoryRole, nextRole: RepositoryRole): boolean {
  return actorRole === "owner" && currentRole !== "owner" && nextRole !== "owner";
}
