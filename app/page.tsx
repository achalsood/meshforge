"use client";

import { useMemo, useState } from "react";
import { ActionsDrawer } from "@/components/workspace/actions-drawer";
import { CollaborationPanel } from "@/components/workspace/collaboration-panel";
import { IssuesDrawer } from "@/components/workspace/issues-drawer";
import { PullRequestsDrawer } from "@/components/workspace/pull-requests-drawer";
import { TeamDrawer } from "@/components/workspace/team-drawer";
import { TelemetryFooter } from "@/components/workspace/telemetry-footer";
import { WorkspaceAccessGates } from "@/components/workspace/workspace-access-gates";
import { WorkspaceEditor } from "@/components/workspace/workspace-editor";
import { WorkspaceHeader, type WorkspaceNav } from "@/components/workspace/workspace-header";
import type { RepositoryPermission } from "@/lib/auth/permissions";
import { useRepositoryActions } from "@/lib/workspace/use-repository-actions";
import { useRepositoryIssues } from "@/lib/workspace/use-repository-issues";
import { useMeshAnalysis } from "@/lib/workspace/use-mesh-analysis";
import { useRepositoryTeam } from "@/lib/workspace/use-repository-team";
import { useSourceControl } from "@/lib/workspace/use-source-control";
import { useWorkspaceSession } from "@/lib/workspace/use-workspace-session";
import { useWorkspaceCollaboration } from "@/lib/workspace/use-workspace-collaboration";
import { useWorkspaceNotifications } from "@/lib/workspace/use-workspace-notifications";
import { useWorkspacePanels } from "@/lib/workspace/use-workspace-panels";
import { buildFileTree } from "@/lib/workspace/build-file-tree";
import { WorkspaceToast } from "@/components/workspace/workspace-toast";

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
  const [activeNav, setActiveNav] = useState<WorkspaceNav>("Code");
  const [workingFiles, setWorkingFiles] = useState<Record<string, string>>({});
  const { flash, toast } = useWorkspaceNotifications();
  const panels = useWorkspacePanels();
  const workspace = useWorkspaceSession("src/retrieval/hnsw.ts");
  const {
    activeFile, authState, repository, session, setActiveFile, setRepository, setSession,
  } = workspace;
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
  const collaboration = useWorkspaceCollaboration({
    activeContent,
    activeFile,
    authState,
    canAudio: can("audio"),
    canChat: can("chat"),
    canCommit: can("commit"),
    repository,
    session,
  });
  const { actualPeers, sync } = collaboration;
  const tree = useMemo(() => buildFileTree(repository?.files.map((file) => file.path) ?? [activeFile]), [activeFile, repository]);
  const openPulls = repository?.pullRequests.filter((pull) => pull.status === "open").length ?? 0;

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

  return (
    <main className="app-shell">
      <WorkspaceAccessGates workspace={workspace} source={source} team={team}/>
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

      <section className={`workspace${panels.explorerCollapsed ? " explorer-collapsed" : ""}${panels.roomCollapsed ? " room-collapsed" : ""}`}>
        <WorkspaceEditor
          activeFile={activeFile}
          canCommit={can("commit")}
          explorerCollapsed={panels.explorerCollapsed}
          intelligence={intelligence}
          repository={repository}
          source={source}
          sync={sync}
          tree={tree}
          onToggleExplorer={panels.toggleExplorer}
        >
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
        </WorkspaceEditor>

        <CollaborationPanel
          collapsed={panels.roomCollapsed}
          controller={collaboration}
          onFlash={flash}
          onToggleCollapsed={() => {
            if (!panels.roomCollapsed) collaboration.setDeviceMenuOpen(false);
            panels.toggleRoom();
          }}
        />
      </section>

      <TelemetryFooter actualPeers={actualPeers} sync={sync} onShowDetails={() => flash("Binary CRDT v1 · durable replay · causal-safe tombstone compaction")}/>
      <WorkspaceToast message={toast}/>
    </main>
  );
}
