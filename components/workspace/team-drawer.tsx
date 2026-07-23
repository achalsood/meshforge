import type { FormEventHandler } from "react";
import type { RepositoryRole } from "@/lib/auth/permissions";
import type { RepositoryMember, TeamPayload } from "@/lib/auth/types";
import type { RepositorySnapshot } from "@/lib/repository/types";
import { Icon } from "./icon";

interface TeamDrawerProps {
  canInvite: boolean;
  canManageMembers: boolean;
  currentRole?: RepositoryRole;
  error: string;
  inviteEmail: string;
  inviteRole: Exclude<RepositoryRole, "owner">;
  loading: boolean;
  mutating: boolean;
  repository: RepositorySnapshot | null;
  team: TeamPayload | null;
  onChangeInviteEmail: (value: string) => void;
  onChangeInviteRole: (role: Exclude<RepositoryRole, "owner">) => void;
  onChangeMember: (member: RepositoryMember, role: RepositoryRole | null) => void;
  onClose: () => void;
  onInvite: FormEventHandler<HTMLFormElement>;
}

export function TeamDrawer(props: TeamDrawerProps) {
  const {
    canInvite, canManageMembers, currentRole, error, inviteEmail, inviteRole, loading,
    mutating, repository, team, onChangeInviteEmail, onChangeInviteRole, onChangeMember,
    onClose, onInvite,
  } = props;

  return (
    <aside className="product-drawer team-drawer" aria-label="Repository access">
      <header><div><Icon name="users"/><div><strong>Repository access</strong><span>{repository?.owner}/{repository?.name} · your role is {currentRole}</span></div></div><button onClick={onClose} aria-label="Close repository access">×</button></header>
      {error && <div className="drawer-error" role="alert">{error}</div>}
      <div className="team-content">
        <section className="team-members">
          <header><div><strong>Members</strong><span>{team?.members.length ?? 0} people with access</span></div></header>
          {loading && <p className="team-loading">Loading repository members…</p>}
          {!loading && team?.members.map((member) => <article key={member.userId}>
            <span className="avatar violet">{member.displayName.slice(0, 2).toUpperCase()}</span>
            <div><strong>{member.displayName}</strong><span>@{member.username} · {member.email}</span></div>
            {canManageMembers && member.role !== "owner" ? <select value={member.role} onChange={(event) => onChangeMember(member, event.target.value as RepositoryRole)} disabled={mutating}><option value="maintainer">Maintainer</option><option value="contributor">Contributor</option><option value="viewer">Viewer</option></select> : <span className={`role-badge ${member.role}`}>{member.role}</span>}
            {canManageMembers && member.role !== "owner" && <button className="remove-member" onClick={() => onChangeMember(member, null)} disabled={mutating}>Remove</button>}
          </article>)}
        </section>
        <aside className="team-invitations">
          <div><strong>Invite a teammate</strong><span>Permissions are enforced for source control and live rooms.</span></div>
          {canInvite ? <form onSubmit={onInvite}>
            <label><span>Email</span><input type="email" value={inviteEmail} onChange={(event) => onChangeInviteEmail(event.target.value)} placeholder="teammate@example.com" required/></label>
            <label><span>Role</span><select value={inviteRole} onChange={(event) => onChangeInviteRole(event.target.value as Exclude<RepositoryRole, "owner">)}>{currentRole === "owner" && <option value="maintainer">Maintainer</option>}<option value="contributor">Contributor</option><option value="viewer">Viewer</option></select></label>
            <button disabled={!inviteEmail.trim() || mutating}>{mutating ? "Updating…" : "Send invitation"}</button>
          </form> : <p className="permission-note">Only owners and maintainers can invite repository members.</p>}
          <section className="invitation-list"><strong>Invitations</strong>{team?.invitations.length ? team.invitations.map((invitation) => <article key={invitation.id}><div><span>{invitation.email}</span><small>{invitation.role} · {invitation.status}</small></div><time>{new Date(invitation.createdAt).toLocaleDateString()}</time></article>) : <p>No invitations yet.</p>}</section>
        </aside>
      </div>
    </aside>
  );
}
