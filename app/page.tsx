"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ActionsDrawer } from "@/components/workspace/actions-drawer";
import { CollaborationPanel } from "@/components/workspace/collaboration-panel";
import { FileTree } from "@/components/workspace/file-tree";
import { Icon } from "@/components/workspace/icon";
import { HistoryDrawer } from "@/components/workspace/history-drawer";
import { IntelligenceDrawer } from "@/components/workspace/intelligence-drawer";
import { IssuesDrawer } from "@/components/workspace/issues-drawer";
import { PullRequestsDrawer } from "@/components/workspace/pull-requests-drawer";
import { TeamDrawer } from "@/components/workspace/team-drawer";
import { TelemetryFooter } from "@/components/workspace/telemetry-footer";
import { useRoomSync } from "@/lib/collaboration/use-room-sync";
import { useAudioRoom } from "@/lib/collaboration/use-audio-room";
import { roomSlug } from "@/lib/collaboration/room-id";
import { chatGPTSignInUrl, chatGPTSignOutUrl, chatGPTSwitchUserUrl } from "@/lib/auth/navigation";
import type { RepositoryPermission } from "@/lib/auth/permissions";
import type { SessionPayload } from "@/lib/auth/types";
import type { RepositorySnapshot } from "@/lib/repository/types";
import { useRepositoryActions } from "@/lib/workspace/use-repository-actions";
import { useRepositoryIssues } from "@/lib/workspace/use-repository-issues";
import { useMeshAnalysis } from "@/lib/workspace/use-mesh-analysis";
import { useRepositoryTeam } from "@/lib/workspace/use-repository-team";
import { buildFileTree } from "@/lib/workspace/build-file-tree";

const INITIAL_CODE = `import { cosineSim, L2Distance } from "../utils/distance";
import { MaxHeap } from "../utils/heap";

export interface HNSWOptions {
  M: number;                 // max connections
  efConstruction: number;    // dynamic candidate list
  efSearch: number;          // search dynamic candidate list
  maxLevel?: number;
  metric?: "cosine" | "l2";
}

type Neighbor = { id: number; score: number };

export class HNSWIndex {
  private entryPoint: number = -1;
  private maxLevel: number = 0;
  private levels: Neighbor[][] = [];

  constructor(private dim: number, private opts: HNSWOptions) {
    this.opts.metric ??= "cosine";
    this.levels = [[]];
  }

  addPoint(id: number, vector: Float32Array): void {
    const level = this.randomLevel();
    if (this.entryPoint === -1) {
      this.entryPoint = id;
      this.maxLevel = level;
      this.levels[level].push({ id, score: 0 });
      return;
    }
    this.insert(id, vector, level);
  }
}`;

export default function Home() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [authState, setAuthState] = useState<"loading" | "ready" | "required" | "error">("loading");
  const [authError, setAuthError] = useState("");
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [newRepositoryName, setNewRepositoryName] = useState("");
  const [creatingRepository, setCreatingRepository] = useState(false);
  const [draft, setDraft] = useState("");
  const [activeNav, setActiveNav] = useState("Code");
  const [activeFile, setActiveFile] = useState("src/retrieval/hnsw.ts");
  const [toast, setToast] = useState("");
  const [repository, setRepository] = useState<RepositorySnapshot | null>(null);
  const [workingFiles, setWorkingFiles] = useState<Record<string, string>>({});
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prHeadBranch, setPrHeadBranch] = useState("");
  const [creatingPull, setCreatingPull] = useState(false);
  const [mergingNumber, setMergingNumber] = useState<number | null>(null);
  const [repositoryError, setRepositoryError] = useState("");
  const {
    addIssueComment, changeIssueStatus, createIssue, filteredIssues, issueBody,
    issueComment, issueError, issueFilter, issueLabels, issueMutation, issues,
    issuesLoading, issueTitle, loadIssues, openIssues, selectedIssue, setIssueBody,
    setIssueComment, setIssueFilter, setIssueLabels, setIssueTitle, setSelectedIssueNumber,
  } = useRepositoryIssues(repository, activeNav === "Issues", flash);
  const {
    actionsError, actionsLoading, loadActions, runWorkflow, runningWorkflow, workflowRuns,
  } = useRepositoryActions(repository, activeNav === "Actions", flash);
  const currentAccess = session?.repositories.find((candidate) => candidate.owner === repository?.owner && candidate.name === repository?.name);
  const can = (permission: RepositoryPermission) => currentAccess?.permissions.includes(permission) ?? false;
  const activeContent = workingFiles[activeFile] ?? repository?.files.find((file) => file.path === activeFile)?.content ?? INITIAL_CODE;
  const sync = useRoomSync(roomSlug(`${repository?.owner ?? "none"}:${repository?.name ?? "none"}:${repository?.branch ?? "main"}:${activeFile}`), activeContent, {
    owner: repository?.owner ?? "",
    repository: repository?.name ?? "",
    scope: `${repository?.branch ?? "main"}:${activeFile}`,
    displayName: session?.user.displayName ?? "Signed-in user",
    initials: session?.user.initials ?? "MF",
    canWrite: can("commit") && can("chat"),
    enabled: authState === "ready" && Boolean(repository),
  });
  const audio = useAudioRoom(roomSlug(`${repository?.owner ?? "none"}:${repository?.name ?? "none"}:audio`), sync.selfId, sync.presence, {
    owner: repository?.owner ?? "",
    repository: repository?.name ?? "",
    scope: "audio",
    enabled: can("audio"),
  });
  const tree = useMemo(() => buildFileTree(repository?.files.map((file) => file.path) ?? [activeFile]), [activeFile, repository]);
  const messages = sync.chats.map((message) => ({
      who: message.name,
      initials: message.initials,
      color: message.color,
      time: new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      body: message.body,
    }));
  const actualPeers = Math.max(1, sync.presence.length);
  const pullHeadBranch = prHeadBranch || repository?.branches.find((branch) => !branch.isDefault)?.name || "";
  const openPulls = repository?.pullRequests.filter((pull) => pull.status === "open").length ?? 0;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/session", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          if (!cancelled) setAuthState("required");
          return null;
        }
        if (!response.ok) throw new Error("Your MeshForge workspace could not be loaded");
        return response.json() as Promise<SessionPayload>;
      })
      .then(async (nextSession) => {
        if (cancelled || !nextSession) return;
        setSession(nextSession);
        setAuthState("ready");
        const first = nextSession.repositories[0];
        if (!first) return;
        const response = await fetch(`/api/repos/${first.owner}/${first.name}`, { cache: "no-store" });
        const result = await response.json() as RepositorySnapshot | { error: string };
        if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Repository could not be loaded");
        if (cancelled) return;
        setRepository(result);
        setActiveFile((current) => result.files.some((file) => file.path === current) ? current : result.files[0]?.path ?? current);
      })
      .catch((cause) => {
        if (cancelled) return;
        setAuthState("error");
        setAuthError(cause instanceof Error ? cause.message : "Your MeshForge workspace could not be loaded");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!deviceMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeviceMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deviceMenuOpen]);

  const workingSnapshot = repository?.files.map((file) => ({
    path: file.path,
    content: file.path === activeFile ? sync.text : workingFiles[file.path] ?? file.content,
  })) ?? [];
  const dirtyPaths = new Set(workingSnapshot.filter((file) => file.content !== repository?.files.find((stored) => stored.path === file.path)?.content).map((file) => file.path));

  function openFile(path: string) {
    if (path === activeFile) return;
    setWorkingFiles((current) => ({ ...current, [activeFile]: sync.text }));
    setActiveFile(path);
  }

  const intelligence = useMeshAnalysis({
    repository,
    files: workingSnapshot,
    activeFile,
    editActiveFile: sync.edit,
    openFile,
    updateFile: (path, content) => setWorkingFiles((current) => ({ ...current, [path]: content })),
    onBeforeOpen: () => {
      setHistoryOpen(false);
      setActiveNav("Code");
    },
    onFlash: flash,
  });

  async function createCommit(event: FormEvent) {
    event.preventDefault();
    if (!repository || !dirtyPaths.size || committing) return;
    setCommitting(true);
    setRepositoryError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/commits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: repository.branch, expectedHeadOid: repository.headOid, message: commitMessage || `Update ${activeFile}`, files: workingSnapshot }),
      });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Commit failed");
      setRepository(result);
      setWorkingFiles({});
      setCommitMessage("");
      setHistoryOpen(true);
      flash(`Committed ${result.headOid.slice(0, 8)} to ${result.branch}`);
    } catch (cause) {
      setRepositoryError(cause instanceof Error ? cause.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }

  function applyRepository(snapshot: RepositorySnapshot) {
    setRepository(snapshot);
    setWorkingFiles({});
    setRepositoryError("");
    team.reset();
    setActiveFile((current) => snapshot.files.some((file) => file.path === current) ? current : snapshot.files[0]?.path ?? current);
  }

  async function selectRepository(owner: string, name: string) {
    if (dirtyPaths.size) {
      flash("Commit your working changes before switching repositories");
      return;
    }
    setRepositoryError("");
    try {
      const response = await fetch(`/api/repos/${owner}/${name}`, { cache: "no-store" });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Repository could not be loaded");
      applyRepository(result);
      setRepoMenuOpen(false);
      setBranchMenuOpen(false);
      setActiveNav("Code");
      flash(`Opened ${owner}/${name}`);
    } catch (cause) {
      setRepositoryError(cause instanceof Error ? cause.message : "Repository could not be loaded");
    }
  }

  const team = useRepositoryTeam({
    repository,
    session,
    setSession,
    selectRepository,
    onRepositoryError: setRepositoryError,
    onFlash: flash,
  });

  async function createRepository(event: FormEvent) {
    event.preventDefault();
    if (!newRepositoryName.trim() || creatingRepository) return;
    setCreatingRepository(true);
    setRepositoryError("");
    try {
      const response = await fetch("/api/repositories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRepositoryName }),
      });
      const result = await response.json() as { session: SessionPayload; repository: RepositorySnapshot } | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Repository could not be created");
      setSession(result.session);
      applyRepository(result.repository);
      setNewRepositoryName("");
      setRepoMenuOpen(false);
      flash(`Created ${result.repository.owner}/${result.repository.name}`);
    } catch (cause) {
      setRepositoryError(cause instanceof Error ? cause.message : "Repository could not be created");
    } finally {
      setCreatingRepository(false);
    }
  }

  async function switchBranch(branch: string) {
    if (!repository || branch === repository.branch) {
      setBranchMenuOpen(false);
      return;
    }
    if (dirtyPaths.size) {
      flash("Commit your working changes before switching branches");
      return;
    }
    setRepositoryError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}?branch=${encodeURIComponent(branch)}`, { cache: "no-store" });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Branch could not be loaded");
      applyRepository(result);
      setBranchMenuOpen(false);
      setHistoryOpen(false);
      setActiveNav("Code");
      flash(`Switched to ${branch}`);
    } catch (cause) {
      setRepositoryError(cause instanceof Error ? cause.message : "Branch could not be loaded");
    }
  }

  async function createBranch(event: FormEvent) {
    event.preventDefault();
    if (!repository || !newBranchName.trim() || creatingBranch) return;
    if (dirtyPaths.size) {
      flash("Commit your working changes before creating a branch");
      return;
    }
    setCreatingBranch(true);
    setRepositoryError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/branches`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBranchName, fromBranch: repository.branch, expectedHeadOid: repository.headOid }),
      });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Branch could not be created");
      applyRepository(result);
      setNewBranchName("");
      setBranchMenuOpen(false);
      setHistoryOpen(false);
      flash(`Created and switched to ${result.branch}`);
    } catch (cause) {
      setRepositoryError(cause instanceof Error ? cause.message : "Branch could not be created");
    } finally {
      setCreatingBranch(false);
    }
  }

  async function createPullRequest(event: FormEvent) {
    event.preventDefault();
    if (!repository || !pullHeadBranch || creatingPull) return;
    setCreatingPull(true);
    setRepositoryError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/pulls`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: prTitle, body: prBody, headBranch: pullHeadBranch, baseBranch: repository.defaultBranch }),
      });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Pull request could not be created");
      applyRepository(result);
      setPrTitle("");
      setPrBody("");
      setPrHeadBranch("");
      flash(`Opened pull request #${result.pullRequests[0]?.number ?? ""}`);
    } catch (cause) {
      setRepositoryError(cause instanceof Error ? cause.message : "Pull request could not be created");
    } finally {
      setCreatingPull(false);
    }
  }

  async function mergePullRequest(number: number) {
    if (!repository || mergingNumber !== null) return;
    setMergingNumber(number);
    setRepositoryError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/pulls/${number}/merge`, { method: "POST" });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Pull request could not be merged");
      applyRepository(result);
      flash(`Merged pull request #${number} into ${result.branch}`);
    } catch (cause) {
      setRepositoryError(cause instanceof Error ? cause.message : "Pull request could not be merged");
    } finally {
      setMergingNumber(null);
    }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !can("chat")) return;
    sync.sendChat(body);
    setDraft("");
  }

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <main className="app-shell">
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
        <form onSubmit={createRepository}><input value={newRepositoryName} onChange={(event) => setNewRepositoryName(event.target.value)} placeholder="my-project" aria-label="Repository name" autoFocus/><button disabled={!newRepositoryName.trim() || creatingRepository}>{creatingRepository ? "Creating…" : "Create repository"}</button></form>
        {repositoryError && <span className="empty-error">{repositoryError}</span>}
      </section>}
      <header className="topbar">
        <a className="brand" href="#" aria-label="MeshForge home"><span className="brand-mark"><span /></span><strong>MeshForge</strong></a>
        <div className="repo-picker">
          <button className="repo-select" onClick={() => { setRepoMenuOpen((open) => !open); setAccountMenuOpen(false); }} aria-expanded={repoMenuOpen}><span className="repo-cube">◇</span><strong>{repository?.name ?? "Choose repository"}</strong><Icon name="chevron" size={14} /></button>
          {repoMenuOpen && <div className="repo-menu">
            <header><div><strong>Your repositories</strong><span>{session?.repositories.length ?? 0} available</span></div><span className="user-role">{currentAccess?.role ?? "signed in"}</span></header>
            <div className="repo-menu-list">{session?.repositories.map((item) => <button key={`${item.owner}/${item.name}`} className={item.owner === repository?.owner && item.name === repository?.name ? "active" : ""} onClick={() => void selectRepository(item.owner, item.name)}><span className="repo-cube">◇</span><div><strong>{item.owner}/{item.name}</strong><small>{item.role} · {item.defaultBranch}</small></div>{item.owner === repository?.owner && item.name === repository?.name && <Icon name="check" size={14}/>}</button>)}</div>
            <form onSubmit={createRepository}><input value={newRepositoryName} onChange={(event) => setNewRepositoryName(event.target.value)} placeholder="new-repository" aria-label="New repository name"/><button disabled={!newRepositoryName.trim() || creatingRepository}><Icon name="plus" size={14}/>{creatingRepository ? "Creating…" : "Create"}</button></form>
            {!!session?.invitations.length && <section className="pending-invites"><strong>Pending invitations</strong>{session.invitations.map((invitation) => <article key={invitation.id}><div><span>{invitation.owner}/{invitation.repositoryName}</span><small>{invitation.role} · from {invitation.invitedBy}</small></div><button onClick={() => void team.respondToInvitation(invitation.id, true)} disabled={team.mutating}>Accept</button><button onClick={() => void team.respondToInvitation(invitation.id, false)} disabled={team.mutating}>Decline</button></article>)}</section>}
          </div>}
        </div>
        <div className="branch-control">
          <button className="branch-pill" onClick={() => { setBranchMenuOpen((open) => !open); setAccountMenuOpen(false); }} aria-expanded={branchMenuOpen}><Icon name="branch" size={17} /><span>{repository?.branch ?? "main"}</span><Icon name="chevron" size={12}/></button>
          {branchMenuOpen && <div className="branch-menu">
            <header><strong>Switch branches</strong><span>{repository?.branches.length ?? 0} total</span></header>
            <div className="branch-list">{repository?.branches.map((branch) => <button key={branch.name} className={branch.name === repository.branch ? "active" : ""} onClick={() => void switchBranch(branch.name)}><Icon name="branch" size={14}/><span>{branch.name}</span><code>{branch.shortOid}</code>{branch.isDefault && <em>default</em>}</button>)}</div>
            {can("branch") ? <form onSubmit={createBranch}><input value={newBranchName} onChange={(event) => setNewBranchName(event.target.value)} placeholder="feat/branch-name" aria-label="New branch name"/><button disabled={!newBranchName.trim() || creatingBranch}><Icon name="plus" size={14}/>{creatingBranch ? "Creating…" : "New branch"}</button></form> : <p className="permission-note">Contributor access is required to create branches.</p>}
          </div>}
        </div>
        <nav className="nav-tabs" aria-label="Repository navigation">
          {["Code", "Issues", "Pull requests", "Actions"].map((item) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => { setActiveNav(item); setBranchMenuOpen(false); setHistoryOpen(false); intelligence.close(); }}>{item}{item === "Issues" && openIssues > 0 && <span className="nav-count">{openIssues}</span>}{item === "Pull requests" && openPulls > 0 && <span className="nav-count">{openPulls}</span>}{item === "Actions" && workflowRuns[0]?.status === "failure" && <span className="nav-count alert">!</span>}</button>)}
        </nav>
        <div className="top-presence" aria-label={`${actualPeers} realtime peers online`}>
          {(sync.presence.length ? sync.presence : [{ clientId: "local", name: "You", color: "mint" }]).slice(0, 4).map((person) => <span className={`avatar sm ${person.color}`} key={person.clientId}>{person.name.slice(0, 2).toUpperCase()}<i /></span>)}
        </div>
        <div className="account-control">
          <button className="account-chip" title={session?.user.email} onClick={() => { setAccountMenuOpen((open) => !open); setRepoMenuOpen(false); setBranchMenuOpen(false); }} aria-expanded={accountMenuOpen} aria-haspopup="menu" aria-controls="account-menu" aria-label={`Account menu for ${session?.user.displayName ?? "signed-in user"}`}>
            <b>{session?.user.initials ?? "MF"}</b><span>{session?.user.displayName ?? "Account"}</span><Icon name="chevron" size={12}/>
          </button>
          {accountMenuOpen && <div className="account-menu" id="account-menu" role="menu">
            <header><b>{session?.user.initials ?? "MF"}</b><div><strong>{session?.user.displayName}</strong><span>{session?.user.email}</span></div></header>
            <a href={chatGPTSwitchUserUrl()} role="menuitem"><Icon name="users" size={15}/><div><strong>Switch user</strong><span>Sign in with another ChatGPT account</span></div></a>
            <a href={chatGPTSignOutUrl()} role="menuitem"><Icon name="phone" size={15}/><div><strong>Sign out</strong><span>End this MeshForge session</span></div></a>
          </div>}
        </div>
        <button className="share-button" onClick={() => void team.show()} disabled={!repository}><Icon name="share" /><span>{can("invite") ? "Invite team" : "View team"}</span></button>
      </header>

      <section className="workspace">
        <aside className="explorer panel">
          <div className="panel-heading"><span>Explorer</span><button aria-label="Collapse explorer">↤</button></div>
          <div className="repo-row"><strong>{repository ? `${repository.owner}/${repository.name}` : "No repository selected"}</strong><Icon name="chevron" size={14} /><button aria-label="Repository options"><Icon name="more" /></button></div>
          <FileTree activeFile={activeFile} dirtyPaths={dirtyPaths} items={tree} onOpenFile={openFile}/>
          <div className="explorer-foot"><Icon name="branch" size={14} /><span>{dirtyPaths.size} working {dirtyPaths.size === 1 ? "change" : "changes"}</span><span>{repository?.metrics.uniqueBlobCount ?? 0} blobs</span></div>
        </aside>

        <section className="editor panel">
          <div className="editor-tabs"><button className="file-tab active"><span className="ts-icon">TS</span><span>{activeFile.split("/").at(-1)}</span>{dirtyPaths.has(activeFile) && <i>●</i>}<b>×</b></button><button className="icon-button" aria-label="New file"><Icon name="plus" size={16} /></button><span className="spacer"/><button className="history-button" onClick={() => setHistoryOpen((open) => !open)}><Icon name="git" size={15}/>{repository?.headOid.slice(0, 8) ?? "loading"}</button><button className="icon-button" aria-label="Search"><Icon name="search" /></button><button className="icon-button" aria-label="Split editor"><Icon name="panel" /></button><button className="icon-button" aria-label="More editor options"><Icon name="more" /></button></div>
          <div className="breadcrumbs">{activeFile.split("/").map((part, index, parts) => <span key={`${part}-${index}`} className={index === parts.length - 1 ? "crumb-current" : ""}>{part}{index < parts.length - 1 && <b>/</b>}</span>)}<span className={`sync-note ${sync.status}`}><Icon name={sync.status === "live" ? "check" : "radio"} size={13}/> {sync.status === "live" ? "Live · WebSocket" : sync.status}</span></div>
          <form className="repo-toolbar" onSubmit={createCommit}>
            <div><Icon name="git" size={15}/><span>{dirtyPaths.size ? `${dirtyPaths.size} modified ${dirtyPaths.size === 1 ? "file" : "files"}` : "Working tree clean"}</span></div>
            <input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder={can("commit") ? "Commit message" : "Read-only repository"} aria-label="Commit message" maxLength={160} disabled={!can("commit")}/>
            <button disabled={!dirtyPaths.size || committing || !can("commit")}>{committing ? "Committing…" : "Commit changes"}</button>
          </form>
          {repositoryError && <div className="repository-error" role="alert">{repositoryError}</div>}
          <div className="code-wrap">
            <div className="code-pane live-code-pane">
              <div className="live-line-numbers" aria-hidden="true">{sync.text.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div>
              <textarea
                className="live-editor"
                aria-label="Collaborative code editor"
                value={sync.text}
                onChange={(event) => sync.edit(event.target.value)}
                onSelect={(event) => sync.updateSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
                readOnly={!can("commit")}
                spellCheck={false}
              />
              <div className="remote-cursor-list" aria-label="Live peer cursors">{sync.presence.filter((peer) => peer.cursorFrom !== peer.cursorTo || peer.clientId).slice(0, 3).map((peer) => <span className={peer.color} key={peer.clientId}>{peer.name}<i>{peer.cursorFrom}</i></span>)}</div>
            </div>
            <div className="minimap" aria-hidden="true">{Array.from({length: 38}).map((_, i) => <i key={i} style={{width: `${28 + ((i * 17) % 58)}%`}} />)}<span /></div>
          </div>
          <button className="ai-fab" onClick={intelligence.toggle} aria-expanded={intelligence.open}><Icon name="sparkles"/><span>Mesh Intelligence</span><kbd>⌘ K</kbd></button>
          {intelligence.open && <IntelligenceDrawer controller={intelligence}/>}
          {historyOpen && <HistoryDrawer repository={repository} onClose={() => setHistoryOpen(false)}/>}
          {activeNav === "Pull requests" && <PullRequestsDrawer
            body={prBody}
            canCreate={can("pull_request")}
            canMerge={can("merge")}
            creating={creatingPull}
            headBranch={pullHeadBranch}
            mergingNumber={mergingNumber}
            repository={repository}
            title={prTitle}
            onChangeBody={setPrBody}
            onChangeHeadBranch={setPrHeadBranch}
            onChangeTitle={setPrTitle}
            onClose={() => setActiveNav("Code")}
            onCreate={createPullRequest}
            onMerge={(number) => void mergePullRequest(number)}
          />}
          {activeNav === "Issues" && <IssuesDrawer
            canManage={can("issues")}
            error={issueError}
            filter={issueFilter}
            filteredIssues={filteredIssues}
            issueBody={issueBody}
            issueComment={issueComment}
            issueLabels={issueLabels}
            issueTitle={issueTitle}
            issues={issues}
            loading={issuesLoading}
            mutating={issueMutation}
            selectedIssue={selectedIssue}
            onAddComment={addIssueComment}
            onChangeBody={setIssueBody}
            onChangeComment={setIssueComment}
            onChangeFilter={setIssueFilter}
            onChangeLabels={setIssueLabels}
            onChangeStatus={(issue) => void changeIssueStatus(issue)}
            onChangeTitle={setIssueTitle}
            onClose={() => setActiveNav("Code")}
            onCreateIssue={createIssue}
            onRefresh={() => void loadIssues()}
            onSelectIssue={setSelectedIssueNumber}
          />}
          {activeNav === "Actions" && <ActionsDrawer
            canRun={can("actions")}
            error={actionsError}
            loading={actionsLoading}
            repository={repository}
            running={runningWorkflow}
            runs={workflowRuns}
            onClose={() => setActiveNav("Code")}
            onRefresh={() => void loadActions()}
            onRun={() => void runWorkflow()}
          />}
          {team.open && <TeamDrawer
            canInvite={can("invite")}
            canManageMembers={can("manage_members")}
            currentRole={currentAccess?.role}
            error={team.error}
            inviteEmail={team.inviteEmail}
            inviteRole={team.inviteRole}
            loading={team.loading}
            mutating={team.mutating}
            repository={repository}
            team={team.team}
            onChangeInviteEmail={team.setInviteEmail}
            onChangeInviteRole={team.setInviteRole}
            onChangeMember={(member, role) => void team.changeMember(member, role)}
            onClose={team.close}
            onInvite={team.invite}
          />}
        </section>

        <CollaborationPanel
          actualPeers={actualPeers}
          audio={audio}
          canAudio={can("audio")}
          canChat={can("chat")}
          deviceMenuOpen={deviceMenuOpen}
          draft={draft}
          messages={messages}
          sync={sync}
          onChangeDraft={setDraft}
          onFlash={flash}
          onSendMessage={sendMessage}
          onSetDeviceMenuOpen={setDeviceMenuOpen}
        />
      </section>

      <TelemetryFooter actualPeers={actualPeers} sync={sync} onShowDetails={() => flash("Binary CRDT v1 · durable replay · causal-safe tombstone compaction")}/>
      {toast && <div className="toast"><Icon name="check" size={16}/>{toast}</div>}
    </main>
  );
}
