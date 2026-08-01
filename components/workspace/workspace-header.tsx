"use client";

import { useEffect, useState } from "react";
import { chatGPTSignOutUrl, chatGPTSwitchUserUrl } from "@/lib/auth/navigation";
import type { RepositoryAccessSummary, SessionPayload } from "@/lib/auth/types";
import type { PresenceRecord } from "@/lib/collaboration/protocol";
import type { RepositorySnapshot, WorkflowRun } from "@/lib/repository/types";
import type { useSourceControl } from "@/lib/workspace/use-source-control";
import { Icon } from "./icon";

export type WorkspaceNav = "Code" | "Issues" | "Pull requests" | "Actions";
type SourceControlController = ReturnType<typeof useSourceControl>;

interface WorkspaceHeaderProps {
  session: SessionPayload | null;
  repository: RepositorySnapshot | null;
  currentAccess?: RepositoryAccessSummary;
  source: SourceControlController;
  activeNav: WorkspaceNav;
  openIssues: number;
  openPulls: number;
  latestWorkflow?: WorkflowRun;
  actualPeers: number;
  presence: PresenceRecord[];
  canCreateBranch: boolean;
  canInvite: boolean;
  teamMutating: boolean;
  onNavigate: (item: WorkspaceNav) => void;
  onOpenTeam: () => void;
  onRespondToInvitation: (invitationId: number, accept: boolean) => void;
}

const NAV_ITEMS: WorkspaceNav[] = ["Code", "Issues", "Pull requests", "Actions"];

export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const {
    session, repository, currentAccess, source, activeNav, openIssues, openPulls,
    latestWorkflow, actualPeers, presence, canCreateBranch, canInvite,
    teamMutating, onNavigate, onOpenTeam, onRespondToInvitation,
  } = props;
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [accountMenuOpen]);

  return <header className="topbar">
    <a className="brand" href="#" aria-label="MeshForge home"><span className="brand-mark"><span /></span><strong>MeshForge</strong></a>
    <div className="repo-picker">
      <button className="repo-select" onClick={() => { source.toggleRepositoryMenu(); setAccountMenuOpen(false); }} aria-expanded={source.repositoryMenuOpen}><span className="repo-cube">◇</span><strong>{repository?.name ?? "Choose repository"}</strong><Icon name="chevron" size={14}/></button>
      {source.repositoryMenuOpen && <div className="repo-menu">
        <header><div><strong>Your repositories</strong><span>{session?.repositories.length ?? 0} available</span></div><span className="user-role">{currentAccess?.role ?? "signed in"}</span></header>
        <div className="repo-menu-list">{session?.repositories.map((item) => <button key={`${item.owner}/${item.name}`} className={item.owner === repository?.owner && item.name === repository?.name ? "active" : ""} onClick={() => void source.selectRepository(item.owner, item.name)}><span className="repo-cube">◇</span><div><strong>{item.owner}/{item.name}</strong><small>{item.role} · {item.defaultBranch}</small></div>{item.owner === repository?.owner && item.name === repository?.name && <Icon name="check" size={14}/>}</button>)}</div>
        <form onSubmit={source.createRepository}><input value={source.newRepositoryName} onChange={(event) => source.setNewRepositoryName(event.target.value)} placeholder="new-repository" aria-label="New repository name"/><button disabled={!source.newRepositoryName.trim() || source.creatingRepository}><Icon name="plus" size={14}/>{source.creatingRepository ? "Creating…" : "Create"}</button></form>
        {!!session?.invitations.length && <section className="pending-invites"><strong>Pending invitations</strong>{session.invitations.map((invitation) => <article key={invitation.id}><div><span>{invitation.owner}/{invitation.repositoryName}</span><small>{invitation.role} · from {invitation.invitedBy}</small></div><button onClick={() => onRespondToInvitation(invitation.id, true)} disabled={teamMutating}>Accept</button><button onClick={() => onRespondToInvitation(invitation.id, false)} disabled={teamMutating}>Decline</button></article>)}</section>}
      </div>}
    </div>
    <div className="branch-control">
      <button className="branch-pill" onClick={() => { source.toggleBranchMenu(); setAccountMenuOpen(false); }} aria-expanded={source.branchMenuOpen}><Icon name="branch" size={17}/><span>{repository?.branch ?? "main"}</span><Icon name="chevron" size={12}/></button>
      {source.branchMenuOpen && <div className="branch-menu">
        <header><strong>Switch branches</strong><span>{repository?.branches.length ?? 0} total</span></header>
        <div className="branch-list">{repository?.branches.map((branch) => <button key={branch.name} className={branch.name === repository.branch ? "active" : ""} onClick={() => void source.switchBranch(branch.name)}><Icon name="branch" size={14}/><span>{branch.name}</span><code>{branch.shortOid}</code>{branch.isDefault && <em>default</em>}</button>)}</div>
        {canCreateBranch ? <form onSubmit={source.createBranch}><input value={source.newBranchName} onChange={(event) => source.setNewBranchName(event.target.value)} placeholder="feat/branch-name" aria-label="New branch name"/><button disabled={!source.newBranchName.trim() || source.creatingBranch}><Icon name="plus" size={14}/>{source.creatingBranch ? "Creating…" : "New branch"}</button></form> : <p className="permission-note">Contributor access is required to create branches.</p>}
      </div>}
    </div>
    <nav className="nav-tabs" aria-label="Repository navigation">
      {NAV_ITEMS.map((item) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => onNavigate(item)}>{item}{item === "Issues" && openIssues > 0 && <span className="nav-count">{openIssues}</span>}{item === "Pull requests" && openPulls > 0 && <span className="nav-count">{openPulls}</span>}{item === "Actions" && latestWorkflow?.status === "failure" && <span className="nav-count alert">!</span>}</button>)}
    </nav>
    <div className="top-presence" aria-label={`${actualPeers} realtime peers online`}>
      {(presence.length ? presence : [{ clientId: "local", name: "You", color: "mint" } as PresenceRecord]).slice(0, 4).map((person) => <span className={`avatar sm ${person.color}`} key={person.clientId}>{person.name.slice(0, 2).toUpperCase()}<i /></span>)}
    </div>
    <div className="account-control">
      <button className="account-chip" title={session?.user.email} onClick={() => { setAccountMenuOpen((open) => !open); source.closeRepositoryMenu(); source.closeBranchMenu(); }} aria-expanded={accountMenuOpen} aria-haspopup="menu" aria-controls="account-menu" aria-label={`Account menu for ${session?.user.displayName ?? "signed-in user"}`}>
        <b>{session?.user.initials ?? "MF"}</b><span>{session?.user.displayName ?? "Account"}</span><Icon name="chevron" size={12}/>
      </button>
      {accountMenuOpen && <div className="account-menu" id="account-menu" role="menu">
        <header><b>{session?.user.initials ?? "MF"}</b><div><strong>{session?.user.displayName}</strong><span>{session?.user.email}</span></div></header>
        <a href={chatGPTSwitchUserUrl()} role="menuitem"><Icon name="users" size={15}/><div><strong>Switch user</strong><span>Sign in with another ChatGPT account</span></div></a>
        <a href={chatGPTSignOutUrl()} role="menuitem"><Icon name="phone" size={15}/><div><strong>Sign out</strong><span>End this MeshForge session</span></div></a>
      </div>}
    </div>
    <button className="share-button" onClick={onOpenTeam} disabled={!repository}><Icon name="share"/><span>{canInvite ? "Invite team" : "View team"}</span></button>
  </header>;
}
