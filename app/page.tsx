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
import { WorkspaceHeader, type WorkspaceNav } from "@/components/workspace/workspace-header";
import { useRoomSync } from "@/lib/collaboration/use-room-sync";
import { useAudioRoom } from "@/lib/collaboration/use-audio-room";
import { roomSlug } from "@/lib/collaboration/room-id";
import { chatGPTSignInUrl } from "@/lib/auth/navigation";
import type { RepositoryPermission } from "@/lib/auth/permissions";
import type { SessionPayload } from "@/lib/auth/types";
import type { RepositorySnapshot } from "@/lib/repository/types";
import { useRepositoryActions } from "@/lib/workspace/use-repository-actions";
import { useRepositoryIssues } from "@/lib/workspace/use-repository-issues";
import { useMeshAnalysis } from "@/lib/workspace/use-mesh-analysis";
import { useRepositoryTeam } from "@/lib/workspace/use-repository-team";
import { useSourceControl } from "@/lib/workspace/use-source-control";
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
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [activeNav, setActiveNav] = useState<WorkspaceNav>("Code");
  const [activeFile, setActiveFile] = useState("src/retrieval/hnsw.ts");
  const [toast, setToast] = useState("");
  const [repository, setRepository] = useState<RepositorySnapshot | null>(null);
  const [workingFiles, setWorkingFiles] = useState<Record<string, string>>({});
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
    if (!deviceMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeviceMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deviceMenuOpen]);

  const source = useSourceControl({
    setSession,
    repository,
    setRepository,
    activeFile,
    setActiveFile,
    workingFiles,
    setWorkingFiles,
    currentText: sync.text,
    onNavigateCode: () => setActiveNav("Code"),
    onFlash: flash,
  });

  const team = useRepositoryTeam({
    repository,
    session,
    setSession,
    selectRepository: source.selectRepository,
    onRepositoryError: source.setError,
    onFlash: flash,
  });

  const intelligence = useMeshAnalysis({
    repository,
    files: source.workingSnapshot,
    activeFile,
    editActiveFile: sync.edit,
    openFile: source.openFile,
    updateFile: (path, content) => setWorkingFiles((current) => ({ ...current, [path]: content })),
    onBeforeOpen: () => {
      source.closeHistory();
      setActiveNav("Code");
    },
    onFlash: flash,
  });

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
        <form onSubmit={source.createRepository}><input value={source.newRepositoryName} onChange={(event) => source.setNewRepositoryName(event.target.value)} placeholder="my-project" aria-label="Repository name" autoFocus/><button disabled={!source.newRepositoryName.trim() || source.creatingRepository}>{source.creatingRepository ? "Creating…" : "Create repository"}</button></form>
        {source.error && <span className="empty-error">{source.error}</span>}
      </section>}
      <WorkspaceHeader
        activeNav={activeNav}
        actualPeers={actualPeers}
        canCreateBranch={can("branch")}
        canInvite={can("invite")}
        currentAccess={currentAccess}
        latestWorkflow={workflowRuns[0]}
        openIssues={openIssues}
        openPulls={openPulls}
        presence={sync.presence}
        repository={repository}
        session={session}
        source={source}
        teamMutating={team.mutating}
        onNavigate={(item) => {
          setActiveNav(item);
          source.closeBranchMenu();
          source.closeHistory();
          intelligence.close();
        }}
        onOpenTeam={() => void team.show()}
        onRespondToInvitation={(invitationId, accept) => void team.respondToInvitation(invitationId, accept)}
      />

      <section className="workspace">
        <aside className="explorer panel">
          <div className="panel-heading"><span>Explorer</span><button aria-label="Collapse explorer">↤</button></div>
          <div className="repo-row"><strong>{repository ? `${repository.owner}/${repository.name}` : "No repository selected"}</strong><Icon name="chevron" size={14} /><button aria-label="Repository options"><Icon name="more" /></button></div>
          <FileTree activeFile={activeFile} dirtyPaths={source.dirtyPaths} items={tree} onOpenFile={source.openFile}/>
          <div className="explorer-foot"><Icon name="branch" size={14} /><span>{source.dirtyPaths.size} working {source.dirtyPaths.size === 1 ? "change" : "changes"}</span><span>{repository?.metrics.uniqueBlobCount ?? 0} blobs</span></div>
        </aside>

        <section className="editor panel">
          <div className="editor-tabs"><button className="file-tab active"><span className="ts-icon">TS</span><span>{activeFile.split("/").at(-1)}</span>{source.dirtyPaths.has(activeFile) && <i>●</i>}<b>×</b></button><button className="icon-button" aria-label="New file"><Icon name="plus" size={16} /></button><span className="spacer"/><button className="history-button" onClick={source.toggleHistory}><Icon name="git" size={15}/>{repository?.headOid.slice(0, 8) ?? "loading"}</button><button className="icon-button" aria-label="Search"><Icon name="search" /></button><button className="icon-button" aria-label="Split editor"><Icon name="panel" /></button><button className="icon-button" aria-label="More editor options"><Icon name="more" /></button></div>
          <div className="breadcrumbs">{activeFile.split("/").map((part, index, parts) => <span key={`${part}-${index}`} className={index === parts.length - 1 ? "crumb-current" : ""}>{part}{index < parts.length - 1 && <b>/</b>}</span>)}<span className={`sync-note ${sync.status}`}><Icon name={sync.status === "live" ? "check" : "radio"} size={13}/> {sync.status === "live" ? "Live · WebSocket" : sync.status}</span></div>
          <form className="repo-toolbar" onSubmit={source.createCommit}>
            <div><Icon name="git" size={15}/><span>{source.dirtyPaths.size ? `${source.dirtyPaths.size} modified ${source.dirtyPaths.size === 1 ? "file" : "files"}` : "Working tree clean"}</span></div>
            <input value={source.commitMessage} onChange={(event) => source.setCommitMessage(event.target.value)} placeholder={can("commit") ? "Commit message" : "Read-only repository"} aria-label="Commit message" maxLength={160} disabled={!can("commit")}/>
            <button disabled={!source.dirtyPaths.size || source.committing || !can("commit")}>{source.committing ? "Committing…" : "Commit changes"}</button>
          </form>
          {source.error && <div className="repository-error" role="alert">{source.error}</div>}
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
          {source.historyOpen && <HistoryDrawer repository={repository} onClose={source.closeHistory}/>}
          {activeNav === "Pull requests" && <PullRequestsDrawer
            body={source.pullBody}
            canCreate={can("pull_request")}
            canMerge={can("merge")}
            creating={source.creatingPull}
            headBranch={source.headBranch}
            mergingNumber={source.mergingNumber}
            repository={repository}
            title={source.pullTitle}
            onChangeBody={source.setPullBody}
            onChangeHeadBranch={source.setPullHeadBranch}
            onChangeTitle={source.setPullTitle}
            onClose={() => setActiveNav("Code")}
            onCreate={source.createPullRequest}
            onMerge={(number) => void source.mergePullRequest(number)}
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
