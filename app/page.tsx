"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ActionsDrawer } from "@/components/workspace/actions-drawer";
import { CollaborationPanel } from "@/components/workspace/collaboration-panel";
import { FileTree } from "@/components/workspace/file-tree";
import { Icon } from "@/components/workspace/icon";
import { IssuesDrawer } from "@/components/workspace/issues-drawer";
import { TeamDrawer } from "@/components/workspace/team-drawer";
import { TelemetryFooter } from "@/components/workspace/telemetry-footer";
import { useRoomSync } from "@/lib/collaboration/use-room-sync";
import { useAudioRoom } from "@/lib/collaboration/use-audio-room";
import { roomSlug } from "@/lib/collaboration/room-id";
import { chatGPTSignInUrl, chatGPTSignOutUrl, chatGPTSwitchUserUrl } from "@/lib/auth/navigation";
import type { RepositoryPermission, RepositoryRole } from "@/lib/auth/permissions";
import type { RepositoryMember, SessionPayload, TeamPayload } from "@/lib/auth/types";
import type { AnalysisFinding, RepositoryAnalysis } from "@/lib/intelligence/repository-analyzer";
import type { RepositorySnapshot } from "@/lib/repository/types";
import { useRepositoryActions } from "@/lib/workspace/use-repository-actions";
import { useRepositoryIssues } from "@/lib/workspace/use-repository-issues";
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
  const [teamOpen, setTeamOpen] = useState(false);
  const [team, setTeam] = useState<TeamPayload | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<RepositoryRole, "owner">>("contributor");
  const [teamMutation, setTeamMutation] = useState(false);
  const [draft, setDraft] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisTab, setAnalysisTab] = useState<"findings" | "hotspots" | "graph" | "algorithms">("findings");
  const [selectedFindingId, setSelectedFindingId] = useState("");
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
  const selectedFinding = analysis?.findings.find((finding) => finding.id === selectedFindingId) ?? analysis?.findings[0];

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
    setTeam(null);
    setTeamOpen(false);
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

  async function openTeam() {
    if (!repository) return;
    setTeamOpen(true);
    setTeamLoading(true);
    setTeamError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/members`, { cache: "no-store" });
      const result = await response.json() as TeamPayload | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Repository team could not be loaded");
      setTeam(result);
    } catch (cause) {
      setTeamError(cause instanceof Error ? cause.message : "Repository team could not be loaded");
    } finally {
      setTeamLoading(false);
    }
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault();
    if (!repository || !inviteEmail.trim() || teamMutation) return;
    setTeamMutation(true);
    setTeamError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const result = await response.json() as TeamPayload | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Invitation could not be sent");
      setTeam(result);
      setInviteEmail("");
      flash(`Invited ${inviteEmail.trim().toLowerCase()} as ${inviteRole}`);
    } catch (cause) {
      setTeamError(cause instanceof Error ? cause.message : "Invitation could not be sent");
    } finally {
      setTeamMutation(false);
    }
  }

  async function respondToInvitation(invitationId: number, accept: boolean) {
    if (teamMutation) return;
    setTeamMutation(true);
    setRepositoryError("");
    try {
      const response = await fetch(`/api/invitations/${invitationId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept }),
      });
      const result = await response.json() as SessionPayload | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Invitation could not be updated");
      const invitation = session?.invitations.find((candidate) => candidate.id === invitationId);
      setSession(result);
      if (accept && invitation) await selectRepository(invitation.owner, invitation.repositoryName);
      flash(accept ? "Repository invitation accepted" : "Repository invitation declined");
    } catch (cause) {
      setRepositoryError(cause instanceof Error ? cause.message : "Invitation could not be updated");
    } finally {
      setTeamMutation(false);
    }
  }

  async function changeMember(member: RepositoryMember, role: RepositoryRole | null) {
    if (!repository || teamMutation) return;
    setTeamMutation(true);
    setTeamError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/members/${member.userId}`, {
        method: role ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: role ? JSON.stringify({ role }) : undefined,
      });
      const result = await response.json() as TeamPayload | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Member could not be updated");
      setTeam(result);
      flash(role ? `${member.displayName} is now ${role}` : `${member.displayName} was removed`);
    } catch (cause) {
      setTeamError(cause instanceof Error ? cause.message : "Member could not be updated");
    } finally {
      setTeamMutation(false);
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

  async function runMeshAnalysis() {
    if (!repository || analyzing) return;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const response = await fetch("/api/intelligence/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: workingSnapshot }),
      });
      const result = await response.json() as RepositoryAnalysis | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Analysis failed");
      setAnalysis(result);
      setSelectedFindingId(result.findings[0]?.id ?? "");
    } catch (cause) {
      setAnalysisError(cause instanceof Error ? cause.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function openMeshAI() {
    setAiOpen(true);
    setHistoryOpen(false);
    setActiveNav("Code");
    if (!analysis && repository) await runMeshAnalysis();
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        void openMeshAI();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  function applySuggestion(finding: AnalysisFinding) {
    if (!finding.patch) return;
    const file = workingSnapshot.find((candidate) => candidate.path === finding.patch?.path);
    if (!file || !file.content.includes(finding.patch.before)) {
      setAnalysisError("The file changed after analysis. Run the review again before applying this patch.");
      return;
    }
    const next = file.content.replace(finding.patch.before, finding.patch.after);
    if (file.path === activeFile) sync.edit(next);
    else {
      setWorkingFiles((current) => ({ ...current, [file.path]: next }));
      setActiveFile(file.path);
    }
    setAnalysis(null);
    setSelectedFindingId("");
    setAiOpen(false);
    flash(`Applied Mesh AI patch to ${file.path}`);
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
        {!!session.invitations.length && <div className="empty-invitations">{session.invitations.map((invitation) => <article key={invitation.id}><div><strong>{invitation.owner}/{invitation.repositoryName}</strong><span>{invitation.role} · invited by {invitation.invitedBy}</span></div><button onClick={() => void respondToInvitation(invitation.id, true)} disabled={teamMutation}>Accept</button><button onClick={() => void respondToInvitation(invitation.id, false)} disabled={teamMutation}>Decline</button></article>)}</div>}
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
            {!!session?.invitations.length && <section className="pending-invites"><strong>Pending invitations</strong>{session.invitations.map((invitation) => <article key={invitation.id}><div><span>{invitation.owner}/{invitation.repositoryName}</span><small>{invitation.role} · from {invitation.invitedBy}</small></div><button onClick={() => void respondToInvitation(invitation.id, true)} disabled={teamMutation}>Accept</button><button onClick={() => void respondToInvitation(invitation.id, false)} disabled={teamMutation}>Decline</button></article>)}</section>}
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
          {["Code", "Issues", "Pull requests", "Actions"].map((item) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => { setActiveNav(item); setBranchMenuOpen(false); setHistoryOpen(false); setAiOpen(false); }}>{item}{item === "Issues" && openIssues > 0 && <span className="nav-count">{openIssues}</span>}{item === "Pull requests" && openPulls > 0 && <span className="nav-count">{openPulls}</span>}{item === "Actions" && workflowRuns[0]?.status === "failure" && <span className="nav-count alert">!</span>}</button>)}
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
        <button className="share-button" onClick={() => void openTeam()} disabled={!repository}><Icon name="share" /><span>{can("invite") ? "Invite team" : "View team"}</span></button>
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
          <button className="ai-fab" onClick={() => aiOpen ? setAiOpen(false) : void openMeshAI()} aria-expanded={aiOpen}><Icon name="sparkles"/><span>Mesh Intelligence</span><kbd>⌘ K</kbd></button>
          {aiOpen && <aside className="intelligence-drawer" aria-label="Mesh Intelligence repository review">
            <header><div><span className="ai-glyph"><Icon name="sparkles"/></span><div><strong>Mesh Intelligence</strong><span>Local repository analysis · no external APIs</span></div></div><div><button className="rerun-analysis" onClick={() => void runMeshAnalysis()} disabled={analyzing}>{analyzing ? "Analyzing…" : "Run again"}</button><button className="close-intelligence" onClick={() => setAiOpen(false)} aria-label="Close Mesh Intelligence">×</button></div></header>
            {analysisError && <div className="analysis-error" role="alert">{analysisError}</div>}
            {analyzing && !analysis ? <div className="analysis-loading"><Icon name="activity" size={25}/><strong>Indexing repository…</strong><span>Building dependency graph, rolling hashes, and risk heap</span><i/></div> : analysis && <>
              <section className="analysis-summary"><div className="health-score"><strong>{analysis.summary.score}</strong><span>health score</span></div><div className={analysis.summary.syntaxErrors ? "syntax-total alert" : "syntax-total"}><strong>{analysis.summary.syntaxErrors}</strong><span>syntax errors</span></div><div><strong>{analysis.summary.findings}</strong><span>findings</span></div><div><strong>{analysis.summary.files}</strong><span>files</span></div><div><strong>{analysis.summary.lines}</strong><span>lines</span></div><div><strong>{analysis.summary.dependencyEdges}</strong><span>edges</span></div><div><strong>{analysis.summary.duplicateBlocks}</strong><span>duplicates</span></div></section>
              <nav className="analysis-tabs" aria-label="Analysis sections">{(["findings", "hotspots", "graph", "algorithms"] as const).map((tab) => <button key={tab} className={analysisTab === tab ? "active" : ""} onClick={() => setAnalysisTab(tab)}>{tab}</button>)}</nav>
              <div className="analysis-body">
                {analysisTab === "findings" && <div className="findings-layout"><div className="finding-list">{analysis.findings.length ? analysis.findings.map((finding) => <button key={finding.id} className={selectedFinding?.id === finding.id ? "active" : ""} onClick={() => setSelectedFindingId(finding.id)}><span className={`severity ${finding.severity}`}>{finding.severity}</span><div><strong>{finding.title}</strong><code>{finding.path}:{finding.line}:{finding.column}</code></div><em>{finding.category}</em></button>) : <div className="clean-analysis"><Icon name="check" size={25}/><strong>No actionable risks found</strong><span>The repository passed every active rule.</span></div>}</div>{selectedFinding && <article className="finding-detail"><header><span className={`severity ${selectedFinding.severity}`}>{selectedFinding.severity}</span><span>{selectedFinding.category}</span></header><h3>{selectedFinding.title}</h3><p>{selectedFinding.explanation}</p><label>Evidence</label><pre><code>{selectedFinding.evidence}</code></pre><label>Recommendation</label><p>{selectedFinding.suggestion}</p><div className="finding-location"><Icon name="file" size={14}/><code>{selectedFinding.path}:{selectedFinding.line}:{selectedFinding.column}</code><button onClick={() => { openFile(selectedFinding.path); setAiOpen(false); }}>Open file</button></div>{selectedFinding.patch && <button className="apply-patch" onClick={() => applySuggestion(selectedFinding)}><Icon name="sparkles" size={15}/>Apply deterministic patch</button>}</article>}</div>}
                {analysisTab === "hotspots" && <div className="hotspot-list">{analysis.hotspots.map((hotspot, index) => <button key={hotspot.path} onClick={() => { openFile(hotspot.path); setAiOpen(false); }}><strong>#{index + 1}</strong><div><span>{hotspot.path}</span><i style={{width: `${Math.min(100, hotspot.risk)}%`}}/></div><code>C{hotspot.complexity} · {hotspot.lines} lines · {hotspot.imports} imports</code></button>)}</div>}
                {analysisTab === "graph" && <div className="dependency-list"><header><span>Source</span><span>Dependency</span><span>Type</span></header>{analysis.dependencies.length ? analysis.dependencies.map((edge) => <div key={`${edge.from}-${edge.to}`}><code>{edge.from}</code><code>{edge.to}</code><span className={edge.external ? "external" : "internal"}>{edge.external ? "package" : "internal"}</span></div>) : <div className="empty-analysis">No import edges found.</div>}</div>}
                {analysisTab === "algorithms" && <div className="algorithm-grid">{analysis.algorithms.map((algorithm) => <article key={algorithm.name}><Icon name="activity" size={18}/><div><strong>{algorithm.name}</strong><p>{algorithm.purpose}</p></div><code>{algorithm.complexity}</code></article>)}</div>}
              </div>
              <footer className="analysis-footer"><span>Runs inside MeshForge</span><span>Source never leaves your deployment</span><span>{new Date(analysis.generatedAt).toLocaleTimeString()}</span></footer>
            </>}
          </aside>}
          {historyOpen && <aside className="history-drawer" aria-label="Commit history">
            <header><div><Icon name="git"/><div><strong>Commit history</strong><span>{repository?.branch ?? "main"} · immutable DAG</span></div></div><button onClick={() => setHistoryOpen(false)} aria-label="Close history">×</button></header>
            <div className="history-list">{repository?.history.map((commit, index) => <article key={commit.oid} className={index === 0 ? "head" : ""}>
              <div className="commit-node"><i/><span/></div><div className="commit-body"><div><strong>{commit.message}</strong>{index === 0 && <em>HEAD</em>}{commit.secondParentOid && <em className="merge-label">MERGE</em>}</div><p>{commit.author} · {new Date(commit.createdAt).toLocaleString()}</p><code>{commit.shortOid}</code><span className="diff-total">+{commit.insertions} −{commit.deletions}</span>
              {commit.diffs.length > 0 && <details><summary>{commit.filesChanged} {commit.filesChanged === 1 ? "file" : "files"} changed</summary>{commit.diffs.map((diff) => <div className="diff-file" key={diff.path}><span>{diff.status[0].toUpperCase()}</span><code>{diff.path}</code><b>+{diff.insertions} −{diff.deletions}</b></div>)}</details>}
              </div></article>)}</div>
            <footer><span>{repository?.metrics.objectCount ?? 0} objects</span><span>{repository?.metrics.deduplicatedBytes ?? 0} bytes deduplicated</span></footer>
          </aside>}
          {activeNav === "Pull requests" && <aside className="pull-drawer" aria-label="Pull requests">
            <header><div><Icon name="git"/><div><strong>Pull requests</strong><span>Review snapshots and merge guarded changes</span></div></div><button onClick={() => setActiveNav("Code")} aria-label="Close pull requests">×</button></header>
            <div className="pull-content">
              <form className="pull-form" onSubmit={createPullRequest}>
                <div><strong>Open a pull request</strong><span>Compare a feature branch against {repository?.defaultBranch ?? "main"}</span></div>
                <label><span>Head branch</span><select value={pullHeadBranch} onChange={(event) => setPrHeadBranch(event.target.value)} disabled={!can("pull_request") || !repository?.branches.some((branch) => !branch.isDefault)}><option value="">Create a feature branch first</option>{repository?.branches.filter((branch) => !branch.isDefault).map((branch) => <option value={branch.name} key={branch.name}>{branch.name} · {branch.shortOid}</option>)}</select></label>
                <label><span>Title</span><input value={prTitle} onChange={(event) => setPrTitle(event.target.value)} placeholder="Describe the change" maxLength={160} disabled={!can("pull_request")}/></label>
                <label><span>Description</span><textarea value={prBody} onChange={(event) => setPrBody(event.target.value)} placeholder="What changed, and why?" maxLength={2000} disabled={!can("pull_request")}/></label>
                <button disabled={!pullHeadBranch || creatingPull || !can("pull_request")}>{creatingPull ? "Opening…" : "Open pull request"}</button>
                {!can("pull_request") && <p className="permission-note">Contributor access is required to open pull requests.</p>}
              </form>
              <section className="pull-list">
                <div className="pull-list-title"><strong>Repository activity</strong><span>{repository?.pullRequests.length ?? 0} total</span></div>
                {repository?.pullRequests.length ? repository.pullRequests.map((pull) => <article className={`pull-card ${pull.status}`} key={pull.number}>
                  <div className="pull-card-top"><span className={`pull-status ${pull.status}`}>{pull.status}</span><code>#{pull.number}</code><span>{pull.headBranch}</span><b>→</b><span>{pull.baseBranch}</span></div>
                  <h3>{pull.title}</h3>{pull.body && <p>{pull.body}</p>}
                  <div className="pull-meta"><span>{pull.author} · {new Date(pull.createdAt).toLocaleString()}</span><strong>{pull.filesChanged} files</strong><em>+{pull.insertions} −{pull.deletions}</em></div>
                  {pull.diffs.length > 0 && <details><summary>View changed files</summary>{pull.diffs.map((diff) => <div className="diff-file" key={diff.path}><span>{diff.status[0].toUpperCase()}</span><code>{diff.path}</code><b>+{diff.insertions} −{diff.deletions}</b></div>)}</details>}
                  {pull.status === "open" && <footer><span>{can("merge") ? pull.mergeable ? "Base is unchanged · ready to merge" : "Base moved · rebase required" : "Maintainer access is required to merge"}</span><button disabled={!pull.mergeable || mergingNumber !== null || !can("merge")} onClick={() => void mergePullRequest(pull.number)}>{mergingNumber === pull.number ? "Merging…" : "Merge pull request"}</button></footer>}
                  {pull.status === "merged" && <footer className="merged-footer"><span>Merged {pull.mergedAt ? new Date(pull.mergedAt).toLocaleString() : ""}</span><code>{pull.mergeCommitOid?.slice(0, 8)}</code></footer>}
                </article>) : <div className="empty-pulls"><Icon name="branch" size={30}/><strong>No pull requests yet</strong><span>Create a feature branch, commit a change, then open your first review.</span></div>}
              </section>
            </div>
          </aside>}
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
          {teamOpen && <TeamDrawer
            canInvite={can("invite")}
            canManageMembers={can("manage_members")}
            currentRole={currentAccess?.role}
            error={teamError}
            inviteEmail={inviteEmail}
            inviteRole={inviteRole}
            loading={teamLoading}
            mutating={teamMutation}
            repository={repository}
            team={team}
            onChangeInviteEmail={setInviteEmail}
            onChangeInviteRole={setInviteRole}
            onChangeMember={(member, role) => void changeMember(member, role)}
            onClose={() => setTeamOpen(false)}
            onInvite={inviteMember}
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
