"use client";

import { useState, type FormEvent } from "react";
import type { RepositoryRole } from "@/lib/auth/permissions";
import type { RepositoryMember, SessionPayload, TeamPayload } from "@/lib/auth/types";
import type { RepositorySnapshot } from "@/lib/repository/types";

interface RepositoryTeamOptions {
  repository: RepositorySnapshot | null;
  session: SessionPayload | null;
  setSession: (session: SessionPayload) => void;
  selectRepository: (owner: string, name: string) => Promise<void>;
  onRepositoryError: (message: string) => void;
  onFlash: (message: string) => void;
}

export function useRepositoryTeam(options: RepositoryTeamOptions) {
  const {
    repository, session, setSession, selectRepository, onRepositoryError, onFlash,
  } = options;
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<TeamPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<RepositoryRole, "owner">>("contributor");
  const [mutating, setMutating] = useState(false);

  function reset() {
    setTeam(null);
    setOpen(false);
    setError("");
  }

  async function show() {
    if (!repository) return;
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/members`, { cache: "no-store" });
      const result = await response.json() as TeamPayload | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Repository team could not be loaded");
      }
      setTeam(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Repository team could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!repository || !inviteEmail.trim() || mutating) return;
    setMutating(true);
    setError("");
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const result = await response.json() as TeamPayload | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Invitation could not be sent");
      }
      setTeam(result);
      setInviteEmail("");
      onFlash(`Invited ${normalizedEmail} as ${inviteRole}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invitation could not be sent");
    } finally {
      setMutating(false);
    }
  }

  async function respondToInvitation(invitationId: number, accept: boolean) {
    if (mutating) return;
    setMutating(true);
    onRepositoryError("");
    try {
      const response = await fetch(`/api/invitations/${invitationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      const result = await response.json() as SessionPayload | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Invitation could not be updated");
      }
      const invitation = session?.invitations.find((candidate) => candidate.id === invitationId);
      setSession(result);
      if (accept && invitation) await selectRepository(invitation.owner, invitation.repositoryName);
      onFlash(accept ? "Repository invitation accepted" : "Repository invitation declined");
    } catch (cause) {
      onRepositoryError(cause instanceof Error ? cause.message : "Invitation could not be updated");
    } finally {
      setMutating(false);
    }
  }

  async function changeMember(member: RepositoryMember, role: RepositoryRole | null) {
    if (!repository || mutating) return;
    setMutating(true);
    setError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/members/${member.userId}`, {
        method: role ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: role ? JSON.stringify({ role }) : undefined,
      });
      const result = await response.json() as TeamPayload | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Member could not be updated");
      }
      setTeam(result);
      onFlash(role ? `${member.displayName} is now ${role}` : `${member.displayName} was removed`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Member could not be updated");
    } finally {
      setMutating(false);
    }
  }

  return {
    changeMember,
    close: () => setOpen(false),
    error,
    invite,
    inviteEmail,
    inviteRole,
    loading,
    mutating,
    open,
    reset,
    respondToInvitation,
    setInviteEmail,
    setInviteRole,
    show,
    team,
  };
}
