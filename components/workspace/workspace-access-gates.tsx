import { chatGPTSignInUrl } from "@/lib/auth/navigation";
import type { useRepositoryTeam } from "@/lib/workspace/use-repository-team";
import type { useSourceControl } from "@/lib/workspace/use-source-control";
import type { useWorkspaceSession } from "@/lib/workspace/use-workspace-session";

type SessionController = ReturnType<typeof useWorkspaceSession>;
type SourceController = ReturnType<typeof useSourceControl>;
type TeamController = ReturnType<typeof useRepositoryTeam>;

interface WorkspaceAccessGatesProps {
  workspace: SessionController;
  source: SourceController;
  team: TeamController;
}

export function WorkspaceAccessGates({ workspace, source, team }: WorkspaceAccessGatesProps) {
  const { authState, authError, session, repository } = workspace;
  return <>
    {authState !== "ready" && <section className="auth-gate" aria-live="polite">
      <span className="brand-mark large"><span /></span>
      <h1>{authState === "required" ? "Sign in to MeshForge" : authState === "error" ? "Workspace unavailable" : "Opening your workspace…"}</h1>
      <p>{authState === "required" ? "Use your ChatGPT identity to access repositories, collaboration rooms, and attributed source history." : authState === "error" ? authError : "Resolving your repositories and permissions."}</p>
      {authState === "required" && <a href={chatGPTSignInUrl()}>Sign in with ChatGPT</a>}
      {authState === "error" && <button onClick={() => window.location.reload()}>Try again</button>}
    </section>}
    {authState === "ready" && session && !repository && <section className="auth-gate empty-workspace">
      <span className="brand-mark large"><span /></span>
      <h1>{session.invitations.length ? "You’ve been invited" : "Create your first repository"}</h1>
      <p>{session.invitations.length ? "Accept a repository invitation or start a new workspace of your own." : "Your workspace is ready. Start a repository to unlock source control, issues, actions, and live collaboration."}</p>
      {!!session.invitations.length && <div className="empty-invitations">{session.invitations.map((invitation) => <article key={invitation.id}><div><strong>{invitation.owner}/{invitation.repositoryName}</strong><span>{invitation.role} · invited by {invitation.invitedBy}</span></div><button onClick={() => void team.respondToInvitation(invitation.id, true)} disabled={team.mutating}>Accept</button><button onClick={() => void team.respondToInvitation(invitation.id, false)} disabled={team.mutating}>Decline</button></article>)}</div>}
      <form onSubmit={source.createRepository}><input value={source.newRepositoryName} onChange={(event) => source.setNewRepositoryName(event.target.value)} placeholder="my-project" aria-label="Repository name" autoFocus/><button disabled={!source.newRepositoryName.trim() || source.creatingRepository}>{source.creatingRepository ? "Creating…" : "Create repository"}</button></form>
      {source.error && <span className="empty-error">{source.error}</span>}
    </section>}
  </>;
}
