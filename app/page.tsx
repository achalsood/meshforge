"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRoomSync } from "@/lib/collaboration/use-room-sync";
import { useAudioRoom } from "@/lib/collaboration/use-audio-room";
import { roomSlug } from "@/lib/collaboration/room-id";
import { chatGPTSignInUrl, chatGPTSignOutUrl, chatGPTSwitchUserUrl } from "@/lib/auth/navigation";
import type { RepositoryPermission, RepositoryRole } from "@/lib/auth/permissions";
import type { RepositoryMember, SessionPayload, TeamPayload } from "@/lib/auth/types";
import type { AnalysisFinding, RepositoryAnalysis } from "@/lib/intelligence/repository-analyzer";
import type { RepositoryIssue, RepositorySnapshot, WorkflowRun } from "@/lib/repository/types";

type IconName =
  | "branch" | "chevron" | "code" | "search" | "more" | "share"
  | "folder" | "file" | "git" | "book" | "mic" | "headphones"
  | "settings" | "phone" | "send" | "sparkles" | "users" | "activity"
  | "radio" | "check" | "plus" | "panel";

const paths: Record<IconName, string> = {
  branch: "M6 3v12a4 4 0 0 0 4 4h2M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0-14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 0v6a4 4 0 0 1-4 4h-2",
  chevron: "m9 18 6-6-6-6",
  code: "m8 9-3 3 3 3m8-6 3 3-3 3m-2-10-4 14",
  search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  share: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-4v6m3-3h-6",
  folder: "M3 6h6l2 2h10v11H3V6Z",
  file: "M6 2h8l4 4v16H6V2Zm8 0v5h5",
  git: "M9 18a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm12-12a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM8 16 16 8",
  book: "M4 5a3 3 0 0 1 3-3h5v19H7a3 3 0 0 0-3 3V5Zm16 0a3 3 0 0 0-3-3h-5v19h5a3 3 0 0 1 3 3V5Z",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 18v4m-4 0h8",
  headphones: "M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v7H4v-7Zm13 0h3v7h-3v-7Z",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-13v2m0 15v2M4.6 4.6 6 6m12 12 1.4 1.4M2.5 12h2m15 0h2M4.6 19.4 6 18M18 6l1.4-1.4",
  phone: "M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24l4 1.34a1 1 0 0 1 .68.95V21a1 1 0 0 1-1 1C10.1 22 2 13.9 2 4a1 1 0 0 1 1-1h3.75a1 1 0 0 1 .95.68l1.34 4a1 1 0 0 1-.24 1l-2.2 2.12Z",
  send: "m22 2-7 20-4-9-9-4 20-7Zm-11 11 5-5",
  sparkles: "m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm7 10 .8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13ZM5 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z",
  users: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11.5 10v-2a4 4 0 0 0-3-3.87m-1-12a4 4 0 0 1 0 7.75",
  activity: "M3 12h4l2-7 4 14 2-7h6",
  radio: "M5.6 18.4a9 9 0 0 1 0-12.8m12.8 0a9 9 0 0 1 0 12.8M9 15a4 4 0 0 1 0-6m6 0a4 4 0 0 1 0 6m-3-1a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  check: "m5 12 4 4L19 6",
  plus: "M12 5v14M5 12h14",
  panel: "M3 4h18v16H3V4Zm13 0v16",
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

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

interface TreeItem { type: "folder-open" | "ts" | "git" | "book" | "file"; name: string; path: string; depth: number; }

function buildTree(paths: string[]): TreeItem[] {
  const items: TreeItem[] = [];
  const folders = new Set<string>();
  for (const path of [...paths].sort()) {
    const segments = path.split("/");
    for (let index = 0; index < segments.length - 1; index += 1) {
      const folderPath = segments.slice(0, index + 1).join("/");
      if (!folders.has(folderPath)) {
        folders.add(folderPath);
        items.push({ type: "folder-open", name: segments[index], path: folderPath, depth: index });
      }
    }
    const name = segments.at(-1) ?? path;
    const type = name === "README.md" ? "book" : name === ".gitignore" ? "git" : /\.(ts|tsx|json)$/.test(name) ? "ts" : "file";
    items.push({ type, name, path, depth: segments.length - 1 });
  }
  return items;
}

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
  const [issues, setIssues] = useState<RepositoryIssue[]>([]);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [issueLabels, setIssueLabels] = useState("enhancement");
  const [issueFilter, setIssueFilter] = useState<"open" | "closed" | "all">("open");
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null);
  const [issueComment, setIssueComment] = useState("");
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issueMutation, setIssueMutation] = useState(false);
  const [issueError, setIssueError] = useState("");
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [runningWorkflow, setRunningWorkflow] = useState(false);
  const [actionsError, setActionsError] = useState("");
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
  const tree = useMemo(() => buildTree(repository?.files.map((file) => file.path) ?? [activeFile]), [activeFile, repository]);
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
  const openIssues = issues.filter((issue) => issue.status === "open").length;
  const filteredIssues = issues.filter((issue) => issueFilter === "all" || issue.status === issueFilter);
  const selectedIssue = issues.find((issue) => issue.number === selectedIssueNumber) ?? filteredIssues[0] ?? null;
  const selectedFinding = analysis?.findings.find((finding) => finding.id === selectedFindingId) ?? analysis?.findings[0];
  const repositoryOwner = repository?.owner;
  const repositoryName = repository?.name;

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

  useEffect(() => {
    if (!repositoryOwner || !repositoryName || (activeNav !== "Issues" && activeNav !== "Actions")) return;
    let cancelled = false;
    const load = async () => {
      if (activeNav === "Issues") {
        setIssuesLoading(true);
        setIssueError("");
        try {
          const response = await fetch(`/api/repos/${repositoryOwner}/${repositoryName}/issues`, { cache: "no-store" });
          const result = await response.json() as RepositoryIssue[] | { error: string };
          if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Issues could not be loaded");
          if (!cancelled) {
            setIssues(result);
            setSelectedIssueNumber((current) => result.some((issue) => issue.number === current) ? current : result[0]?.number ?? null);
          }
        } catch (cause) {
          if (!cancelled) setIssueError(cause instanceof Error ? cause.message : "Issues could not be loaded");
        } finally {
          if (!cancelled) setIssuesLoading(false);
        }
      } else {
        setActionsLoading(true);
        setActionsError("");
        try {
          const response = await fetch(`/api/repos/${repositoryOwner}/${repositoryName}/actions`, { cache: "no-store" });
          const result = await response.json() as WorkflowRun[] | { error: string };
          if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Workflow runs could not be loaded");
          if (!cancelled) setWorkflowRuns(result);
        } catch (cause) {
          if (!cancelled) setActionsError(cause instanceof Error ? cause.message : "Workflow runs could not be loaded");
        } finally {
          if (!cancelled) setActionsLoading(false);
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [activeNav, repositoryOwner, repositoryName]);

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
    setIssues([]);
    setWorkflowRuns([]);
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

  async function loadIssues() {
    if (!repository || issuesLoading) return;
    setIssuesLoading(true);
    setIssueError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/issues`, { cache: "no-store" });
      const result = await response.json() as RepositoryIssue[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Issues could not be loaded");
      setIssues(result);
      setSelectedIssueNumber((current) => result.some((issue) => issue.number === current) ? current : result[0]?.number ?? null);
    } catch (cause) {
      setIssueError(cause instanceof Error ? cause.message : "Issues could not be loaded");
    } finally {
      setIssuesLoading(false);
    }
  }

  async function createIssue(event: FormEvent) {
    event.preventDefault();
    if (!repository || !issueTitle.trim() || issueMutation) return;
    setIssueMutation(true);
    setIssueError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/issues`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: issueTitle, body: issueBody,
          labels: issueLabels.split(",").map((label) => label.trim()).filter(Boolean),
        }),
      });
      const result = await response.json() as RepositoryIssue[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Issue could not be created");
      setIssues(result);
      setIssueTitle("");
      setIssueBody("");
      setIssueLabels("enhancement");
      setIssueFilter("open");
      setSelectedIssueNumber(result[0]?.number ?? null);
      flash(`Opened issue #${result[0]?.number ?? ""}`);
    } catch (cause) {
      setIssueError(cause instanceof Error ? cause.message : "Issue could not be created");
    } finally {
      setIssueMutation(false);
    }
  }

  async function changeIssueStatus(issue: RepositoryIssue) {
    if (!repository || issueMutation) return;
    setIssueMutation(true);
    setIssueError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/issues/${issue.number}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: issue.status === "open" ? "closed" : "open" }),
      });
      const result = await response.json() as RepositoryIssue[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Issue could not be updated");
      setIssues(result);
      flash(`${issue.status === "open" ? "Closed" : "Reopened"} issue #${issue.number}`);
    } catch (cause) {
      setIssueError(cause instanceof Error ? cause.message : "Issue could not be updated");
    } finally {
      setIssueMutation(false);
    }
  }

  async function addIssueComment(event: FormEvent) {
    event.preventDefault();
    if (!repository || !selectedIssue || !issueComment.trim() || issueMutation) return;
    setIssueMutation(true);
    setIssueError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/issues/${selectedIssue.number}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: issueComment }),
      });
      const result = await response.json() as RepositoryIssue[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Comment could not be added");
      setIssues(result);
      setIssueComment("");
      flash(`Commented on issue #${selectedIssue.number}`);
    } catch (cause) {
      setIssueError(cause instanceof Error ? cause.message : "Comment could not be added");
    } finally {
      setIssueMutation(false);
    }
  }

  async function loadActions() {
    if (!repository || actionsLoading) return;
    setActionsLoading(true);
    setActionsError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/actions`, { cache: "no-store" });
      const result = await response.json() as WorkflowRun[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Workflow runs could not be loaded");
      setWorkflowRuns(result);
    } catch (cause) {
      setActionsError(cause instanceof Error ? cause.message : "Workflow runs could not be loaded");
    } finally {
      setActionsLoading(false);
    }
  }

  async function runWorkflow() {
    if (!repository || runningWorkflow) return;
    setRunningWorkflow(true);
    setActionsError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: repository.branch }),
      });
      const result = await response.json() as WorkflowRun[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Workflow could not be started");
      setWorkflowRuns(result);
      flash(`Mesh CI ${result[0]?.status === "success" ? "passed" : "found an issue"}`);
    } catch (cause) {
      setActionsError(cause instanceof Error ? cause.message : "Workflow could not be started");
    } finally {
      setRunningWorkflow(false);
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
          <div className="file-tree">
            {tree.map((item, index) => (
              <button key={`${item.path}-${index}`} style={{ paddingLeft: 13 + item.depth * 20 }} className={`tree-row ${activeFile === item.path ? "active" : ""}`} onClick={() => !item.type.startsWith("folder") && openFile(item.path)}>
                {item.type.startsWith("folder") && <span className={`tree-caret ${item.type === "folder-open" ? "open" : ""}`}>›</span>}
                {item.type === "ts" ? <span className="ts-icon">TS</span> : <Icon name={item.type.startsWith("folder") ? "folder" : item.type as IconName} size={17} />}
                <span>{item.name}</span>{dirtyPaths.has(item.path) && <em>M</em>}
              </button>
            ))}
          </div>
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
          {activeNav === "Issues" && <aside className="product-drawer issues-drawer" aria-label="Repository issues">
            <header><div><Icon name="activity"/><div><strong>Issues</strong><span>Track bugs, enhancements, decisions, and follow-up work</span></div></div><button onClick={() => setActiveNav("Code")} aria-label="Close issues">×</button></header>
            {issueError && <div className="drawer-error" role="alert">{issueError}</div>}
            <div className="issues-content">
              <form className="issue-create" onSubmit={createIssue}>
                <div><strong>Open a new issue</strong><span>Issues are stored with the repository and shared with the team.</span></div>
                <label><span>Title</span><input value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} placeholder="What needs attention?" maxLength={160} disabled={!can("issues")}/></label>
                <label><span>Description</span><textarea value={issueBody} onChange={(event) => setIssueBody(event.target.value)} placeholder="Add context, expected behavior, or acceptance criteria." maxLength={5000} disabled={!can("issues")}/></label>
                <label><span>Labels</span><input value={issueLabels} onChange={(event) => setIssueLabels(event.target.value)} placeholder="bug, performance" maxLength={180} disabled={!can("issues")}/><small>Comma-separated · up to six labels</small></label>
                <button disabled={!issueTitle.trim() || issueMutation || !can("issues")}>{issueMutation ? "Saving…" : "Open issue"}</button>
                {!can("issues") && <p className="permission-note">Contributor access is required to manage issues.</p>}
              </form>
              <section className="issues-browser">
                <div className="issue-toolbar"><div>{(["open", "closed", "all"] as const).map((filter) => <button key={filter} className={issueFilter === filter ? "active" : ""} onClick={() => setIssueFilter(filter)}>{filter}<span>{filter === "all" ? issues.length : issues.filter((issue) => issue.status === filter).length}</span></button>)}</div><button onClick={() => void loadIssues()} disabled={issuesLoading}>{issuesLoading ? "Refreshing…" : "Refresh"}</button></div>
                <div className="issue-workspace">
                  <div className="issue-list">
                    {filteredIssues.map((issue) => <button key={issue.number} className={selectedIssue?.number === issue.number ? "active" : ""} onClick={() => setSelectedIssueNumber(issue.number)}><i className={issue.status}/><div><strong>{issue.title}</strong><span>#{issue.number} opened by {issue.author}</span><p>{issue.labels.map((label) => <em key={label}>{label}</em>)}</p></div><b>{issue.comments.length}</b></button>)}
                    {!issuesLoading && !filteredIssues.length && <div className="empty-issues"><Icon name="check" size={28}/><strong>No {issueFilter === "all" ? "" : issueFilter} issues</strong><span>Use the form to capture the next piece of work.</span></div>}
                  </div>
                  {selectedIssue ? <article className="issue-detail">
                    <header><div><span className={`issue-state ${selectedIssue.status}`}>{selectedIssue.status}</span><code>#{selectedIssue.number}</code></div><button onClick={() => void changeIssueStatus(selectedIssue)} disabled={issueMutation || !can("issues")}>{selectedIssue.status === "open" ? "Close issue" : "Reopen issue"}</button></header>
                    <h2>{selectedIssue.title}</h2>
                    <div className="issue-author"><span className="avatar xs mint">{selectedIssue.author.slice(0, 2).toUpperCase()}</span><p><strong>{selectedIssue.author}</strong> opened this issue · {new Date(selectedIssue.createdAt).toLocaleString()}</p></div>
                    <p className="issue-description">{selectedIssue.body || "No description was provided."}</p>
                    <div className="issue-labels">{selectedIssue.labels.map((label) => <span key={label}>{label}</span>)}</div>
                    <section className="issue-comments"><h3>Discussion <span>{selectedIssue.comments.length}</span></h3>{selectedIssue.comments.map((comment) => <article key={comment.id}><span className="avatar xs violet">{comment.author.slice(0, 2).toUpperCase()}</span><div><header><strong>{comment.author}</strong><time>{new Date(comment.createdAt).toLocaleString()}</time></header><p>{comment.body}</p></div></article>)}</section>
                    <form className="comment-form" onSubmit={addIssueComment}><textarea value={issueComment} onChange={(event) => setIssueComment(event.target.value)} placeholder={can("issues") ? "Add to the discussion…" : "Read-only discussion"} maxLength={3000} disabled={!can("issues")}/><button disabled={!issueComment.trim() || issueMutation || !can("issues")}>{issueMutation ? "Posting…" : "Comment"}</button></form>
                  </article> : <div className="empty-issues detail"><Icon name="activity" size={28}/><strong>Select an issue</strong><span>Open an issue to view its details and discussion.</span></div>}
                </div>
              </section>
            </div>
          </aside>}
          {activeNav === "Actions" && <aside className="product-drawer actions-drawer" aria-label="Repository actions">
            <header><div><Icon name="radio"/><div><strong>Actions</strong><span>Self-hosted repository checks · no external CI service</span></div></div><div><button className="run-workflow" onClick={() => void runWorkflow()} disabled={runningWorkflow || !repository || !can("actions")}>{runningWorkflow ? "Running…" : "Run workflow"}</button><button onClick={() => setActiveNav("Code")} aria-label="Close actions">×</button></div></header>
            {actionsError && <div className="drawer-error" role="alert">{actionsError}</div>}
            <div className="actions-content">
              <aside className="workflow-sidebar"><strong>Workflows</strong><button className="active"><Icon name="activity" size={15}/><div><span>Mesh CI</span><small>Repository quality gate</small></div></button><footer><span>Triggers</span><code>push · manual</code></footer></aside>
              <section className="run-list">
                <header><div><strong>Workflow runs</strong><span>{repository?.owner}/{repository?.name} · {repository?.branch}</span></div><button onClick={() => void loadActions()} disabled={actionsLoading}>{actionsLoading ? "Refreshing…" : "Refresh"}</button></header>
                {workflowRuns.map((run) => <article className={`workflow-run ${run.status}`} key={run.id}>
                  <details open={run.id === workflowRuns[0]?.id}>
                    <summary><span className={`run-icon ${run.status}`}>{run.status === "success" ? "✓" : "×"}</span><div><strong>{run.workflow}</strong><span>Run #{run.id} · {run.trigger} by {run.author}</span></div><code>{run.commitOid.slice(0, 8)}</code><time>{run.durationMs}ms</time><b>{new Date(run.createdAt).toLocaleString()}</b></summary>
                    <div className="run-steps">{run.steps.map((step, index) => <article key={`${step.name}-${index}`}><span className={step.status}>{step.status === "success" ? "✓" : "×"}</span><div><header><strong>{step.name}</strong><time>{step.durationMs}ms</time></header><pre>{step.logs.join("\n")}</pre></div></article>)}</div>
                  </details>
                </article>)}
                {!actionsLoading && !workflowRuns.length && <div className="empty-actions"><Icon name="activity" size={30}/><strong>No workflow runs yet</strong><span>{can("actions") ? "Run Mesh CI against the current branch to create the first result." : "Maintainer access is required to start workflow runs."}</span><button onClick={() => void runWorkflow()} disabled={!can("actions")}>Run workflow</button></div>}
              </section>
            </div>
          </aside>}
          {teamOpen && <aside className="product-drawer team-drawer" aria-label="Repository access">
            <header><div><Icon name="users"/><div><strong>Repository access</strong><span>{repository?.owner}/{repository?.name} · your role is {currentAccess?.role}</span></div></div><button onClick={() => setTeamOpen(false)} aria-label="Close repository access">×</button></header>
            {teamError && <div className="drawer-error" role="alert">{teamError}</div>}
            <div className="team-content">
              <section className="team-members">
                <header><div><strong>Members</strong><span>{team?.members.length ?? 0} people with access</span></div></header>
                {teamLoading && <p className="team-loading">Loading repository members…</p>}
                {!teamLoading && team?.members.map((member) => <article key={member.userId}>
                  <span className="avatar violet">{member.displayName.slice(0, 2).toUpperCase()}</span>
                  <div><strong>{member.displayName}</strong><span>@{member.username} · {member.email}</span></div>
                  {can("manage_members") && member.role !== "owner" ? <select value={member.role} onChange={(event) => void changeMember(member, event.target.value as RepositoryRole)} disabled={teamMutation}><option value="maintainer">Maintainer</option><option value="contributor">Contributor</option><option value="viewer">Viewer</option></select> : <span className={`role-badge ${member.role}`}>{member.role}</span>}
                  {can("manage_members") && member.role !== "owner" && <button className="remove-member" onClick={() => void changeMember(member, null)} disabled={teamMutation}>Remove</button>}
                </article>)}
              </section>
              <aside className="team-invitations">
                <div><strong>Invite a teammate</strong><span>Permissions are enforced for source control and live rooms.</span></div>
                {can("invite") ? <form onSubmit={inviteMember}>
                  <label><span>Email</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teammate@example.com" required/></label>
                  <label><span>Role</span><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Exclude<RepositoryRole, "owner">)}>{currentAccess?.role === "owner" && <option value="maintainer">Maintainer</option>}<option value="contributor">Contributor</option><option value="viewer">Viewer</option></select></label>
                  <button disabled={!inviteEmail.trim() || teamMutation}>{teamMutation ? "Updating…" : "Send invitation"}</button>
                </form> : <p className="permission-note">Only owners and maintainers can invite repository members.</p>}
                <section className="invitation-list"><strong>Invitations</strong>{team?.invitations.length ? team.invitations.map((invitation) => <article key={invitation.id}><div><span>{invitation.email}</span><small>{invitation.role} · {invitation.status}</small></div><time>{new Date(invitation.createdAt).toLocaleDateString()}</time></article>) : <p>No invitations yet.</p>}</section>
              </aside>
            </div>
          </aside>}
        </section>

        <aside className="collab panel">
          <div className="room-heading"><div><strong>Live room</strong><span>{actualPeers}</span></div><span className={`audio-state ${audio.status}`}>{audio.status === "connected" ? `${audio.connectedPeers + 1} on audio` : audio.status === "idle" ? "Audio off" : audio.status}</span><button aria-label="Room options"><Icon name="more"/></button></div>
          <section className="voice-section"><div className="voice-title"><p className="section-label">Voice · WebRTC</p>{audio.status === "idle" || audio.status === "error" ? <button className="join-audio" onClick={audio.join} disabled={!can("audio")}><Icon name="headphones" size={15}/>{can("audio") ? audio.status === "error" ? "Retry audio" : "Join audio" : "Audio restricted"}</button> : null}</div>
            <div className="people-list">{(sync.presence.length ? sync.presence : [{ clientId: sync.selfId || "local", name: "You", color: "mint" }]).slice(0, 4).map((person) => {
              const isSelf = person.clientId === sync.selfId || person.clientId === "local";
              const peerState = audio.peerStates[person.clientId];
              const personStatus = isSelf
                ? audio.status === "connected" ? audio.muted ? "Muted" : audio.speaking ? "Speaking" : "In audio" : "Available"
                : peerState === "connected" ? "Audio connected" : peerState === "connecting" ? "Connecting audio" : "Available";
              return <div className="person" key={person.clientId}><span className={`avatar ${person.color}`}>{person.name.slice(0,2).toUpperCase()}</span><div><strong>{person.name}</strong><small className={personStatus === "Speaking" ? "speaking" : ""}>{personStatus}</small></div>{isSelf && audio.speaking ? <div className="waveform" style={{opacity: Math.min(1, .45 + audio.level * 8)}}>{Array.from({length: 17}).map((_, i) => <i key={i} style={{height: `${5 + ((i * 7) % 17)}px`}} />)}</div> : <span className={`presence-dot ${peerState === "connected" || (isSelf && audio.status === "connected") ? "audio-live" : ""}`}/>}</div>;
            })}</div>
            <div className="call-controls-wrap">
              <div className="call-controls"><button disabled={audio.status !== "connected" || !can("audio")} className={audio.muted ? "active" : ""} onClick={audio.toggleMute} aria-label={audio.muted ? "Unmute microphone" : "Mute microphone"}><Icon name="mic"/></button><button disabled={!can("audio")} className={deviceMenuOpen ? "active" : ""} onClick={() => { setDeviceMenuOpen((open) => !open); void audio.refreshDevices(); }} aria-label="Choose microphone and speaker" aria-expanded={deviceMenuOpen} aria-haspopup="dialog" aria-controls="audio-device-menu"><Icon name="chevron" size={14}/></button><button className={audio.status === "connected" ? "active connected" : ""} onClick={audio.status === "connected" ? undefined : audio.join} disabled={!can("audio") || audio.status === "requesting" || audio.status === "connecting"} aria-label={audio.status === "connected" ? "Audio connected" : "Join audio"}><Icon name="headphones"/></button><button aria-label="Room settings" onClick={() => flash("Echo cancellation and noise suppression are enabled")}><Icon name="settings"/></button><button className="hangup" disabled={audio.status === "idle"} aria-label="Leave audio" onClick={() => { audio.leave(); setDeviceMenuOpen(false); }}><Icon name="phone"/></button></div>
              {deviceMenuOpen && <div className="device-menu" id="audio-device-menu" role="dialog" aria-label="Voice chat devices">
                <header><div><strong>Voice chat devices</strong><span>{audio.devicesLoading ? "Finding devices…" : "Changes apply immediately"}</span></div><button onClick={() => setDeviceMenuOpen(false)} aria-label="Close audio device options">×</button></header>
                <label><span>Microphone</span><select value={audio.inputDeviceId} onChange={(event) => void audio.selectInputDevice(event.target.value)} disabled={audio.devicesLoading}><option value="">System default</option>{audio.inputDevices.filter((device) => device.deviceId !== "default").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></label>
                <label><span>Speaker</span><select value={audio.outputDeviceId} onChange={(event) => void audio.selectOutputDevice(event.target.value)} disabled={audio.devicesLoading || !audio.outputSelectionSupported}><option value="">System default</option>{audio.outputDevices.filter((device) => device.deviceId !== "default").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></label>
                {!audio.outputSelectionSupported && <p>Speaker selection is not supported by this browser. Your system default will be used.</p>}
                {audio.deviceError && <p className="audio-error" role="alert">{audio.deviceError}</p>}
              </div>}
            </div>
            {audio.status === "requesting" && <p className="audio-help">Choose Allow in the microphone permission prompt.</p>}
            {audio.error && <p className="audio-error" role="alert">{audio.error}</p>}
          </section>
          <section className="chat-section"><p className="section-label">Chat</p><div className="messages">{messages.map((message, index) => <article className="message" key={`${message.time}-${index}`}><span className={`avatar xs ${message.color}`}>{message.initials}</span><div><header><strong>{message.who}</strong><time>{message.time}</time></header><p>{message.body}</p></div></article>)}</div>
            <form className="composer" onSubmit={sendMessage}><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={can("chat") ? "Message the room…" : "Chat requires contributor access"} aria-label="Message the room" disabled={!can("chat")}/><button aria-label="Send message" disabled={!can("chat") || !draft.trim()}><Icon name="send" size={17}/></button></form><small className="composer-help">{can("chat") ? "Enter to send · synced to everyone" : "Viewer access is read-only"}</small>
          </section>
        </aside>
      </section>

      <footer className="telemetry">
        <div><Icon name="radio"/><span>round trip</span><strong>{sync.latency || "—"}{sync.latency ? "ms" : ""}</strong></div><div><Icon name="users"/><strong>{actualPeers}</strong><span>{actualPeers === 1 ? "peer" : "peers"}</span></div><div><i className={`status-dot ${sync.status}`}/><strong className="mint">{sync.status === "live" ? "Connected" : sync.status}</strong></div><div><Icon name="activity"/><span>CRDT ops</span><strong>{sync.appliedOperations.toLocaleString()}</strong></div><div title={`${sync.binaryBytesSent.toLocaleString()} binary bytes sent`}><Icon name="radio"/><span>wire saved</span><strong>{sync.jsonBytesAvoided.toLocaleString()}B</strong></div><div title="Deleted payloads compacted while retaining causal anchors"><Icon name="git"/><span>compacted</span><strong>{sync.compactedTombstones}/{sync.tombstones}</strong></div><div className="sparkline" aria-label="Live synchronization activity">{Array.from({length: 34}).map((_, i) => <i key={i} style={{height: `${7 + ((i * 11) % 17)}px`}} />)}</div><button onClick={() => flash("Binary CRDT v1 · durable replay · causal-safe tombstone compaction")}>View details</button>
      </footer>
      {toast && <div className="toast"><Icon name="check" size={16}/>{toast}</div>}
    </main>
  );
}
