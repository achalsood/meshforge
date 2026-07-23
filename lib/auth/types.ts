import type { RepositoryPermission, RepositoryRole } from "./permissions";

export interface AuthenticatedUser {
  id: number;
  email: string;
  displayName: string;
  username: string;
  initials: string;
}

export interface RepositoryAccessSummary {
  id: number;
  owner: string;
  name: string;
  defaultBranch: string;
  role: RepositoryRole;
  permissions: RepositoryPermission[];
  updatedAt: number;
}

export interface RepositoryInvitation {
  id: number;
  repositoryId: number;
  owner: string;
  repositoryName: string;
  email: string;
  role: Exclude<RepositoryRole, "owner">;
  invitedBy: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  createdAt: number;
}

export interface RepositoryMember {
  userId: number;
  email: string;
  displayName: string;
  username: string;
  role: RepositoryRole;
  addedAt: number;
}

export interface SessionPayload {
  user: AuthenticatedUser;
  repositories: RepositoryAccessSummary[];
  invitations: RepositoryInvitation[];
}

export interface TeamPayload {
  members: RepositoryMember[];
  invitations: RepositoryInvitation[];
}
