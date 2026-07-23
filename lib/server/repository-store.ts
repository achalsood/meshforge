import { evaluateRepositoryWorkflow } from "../actions/workflow-engine";
import { myersDiffStats } from "../repository/myers-diff";
import { pullRequestMergeability } from "../repository/merge-policy";
import { repositoryObjectId, utf8Bytes } from "../repository/object-id";
import type {
  FileDiff, IssueComment, PullRequest, RepositoryBranch, RepositoryCommit, RepositoryFile,
  RepositoryIssue, RepositorySnapshot, WorkflowRun, WorkflowStep,
} from "../repository/types";

const INITIAL_FILES = [
  {
    path: "src/retrieval/hnsw.ts",
    content: `import { cosineSim } from "../utils/distance";

export interface HNSWOptions {
  M: number;
  efConstruction: number;
  efSearch: number;
  metric?: "cosine" | "l2";
}

type Neighbor = { id: number; score: number };

export class HNSWIndex {
  private entryPoint = -1;
  private levels: Neighbor[][] = [[]];

  constructor(private dim: number, private opts: HNSWOptions) {}

  addPoint(id: number, vector: Float32Array): void {
    if (this.entryPoint === -1) {
      this.entryPoint = id;
      this.levels[0].push({ id, score: cosineSim(vector, vector) });
      return;
    }
    this.insert(id, vector);
  }

  private insert(id: number, vector: Float32Array): void {
    void vector;
    this.levels[0].push({ id, score: 0 });
  }
}
`,
  },
  { path: "src/retrieval/embeddings.ts", content: `export function normalize(vector: Float32Array): Float32Array {
  const magnitude = Math.hypot(...vector) || 1;
  return Float32Array.from(vector, (value) => value / magnitude);
}
` },
  { path: "src/retrieval/search.ts", content: `import type { HNSWOptions } from "./hnsw";

export function adaptiveEfSearch(options: HNSWOptions, candidates: number): number {
  return Math.min(512, Math.max(options.efSearch, Math.ceil(Math.log2(candidates + 1) * 16)));
}
` },
  { path: "tests/retrieval.test.ts", content: `import { strict as assert } from "node:assert";
import { adaptiveEfSearch } from "../src/retrieval/search";

assert.equal(adaptiveEfSearch({ M: 16, efConstruction: 200, efSearch: 64 }, 1024), 176);
` },
  { path: "README.md", content: "# Synapse AI\n\nVector retrieval experiments built collaboratively in MeshForge.\n" },
  { path: ".gitignore", content: "node_modules\ndist\n.env\n" },
  { path: "tsconfig.json", content: "{\n  \"compilerOptions\": {\n    \"strict\": true,\n    \"target\": \"ES2022\"\n  }\n}\n" },
];

let repositorySchemaReady: Promise<void> | null = null;

export async function ensureRepositorySchema(db: D1Database): Promise<void> {
  if (!repositorySchemaReady) {
    repositorySchemaReady = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        default_branch TEXT NOT NULL DEFAULT 'main',
        created_at INTEGER NOT NULL,
        UNIQUE(owner, name)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS repository_members (
        repository_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        invited_by INTEGER,
        PRIMARY KEY(repository_id, user_id)
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS repository_members_user_idx ON repository_members (user_id, repository_id)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS repository_invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        invited_by INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        responded_at INTEGER,
        UNIQUE(repository_id, email)
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS repository_invitations_email_status_idx ON repository_invitations (email, status)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS repo_objects (
        oid TEXT PRIMARY KEY,
        object_type TEXT NOT NULL,
        content TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS repo_objects_type_idx ON repo_objects (object_type)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS repo_tree_entries (
        tree_oid TEXT NOT NULL,
        path TEXT NOT NULL,
        blob_oid TEXT NOT NULL,
        size INTEGER NOT NULL,
        PRIMARY KEY(tree_oid, path)
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS repo_tree_entries_blob_idx ON repo_tree_entries (blob_oid)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS repo_commits (
        oid TEXT PRIMARY KEY,
        repository_id INTEGER NOT NULL,
        tree_oid TEXT NOT NULL,
        parent_oid TEXT,
        second_parent_oid TEXT,
        message TEXT NOT NULL,
        author TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        files_changed INTEGER NOT NULL DEFAULT 0,
        insertions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS repo_commits_repo_created_idx ON repo_commits (repository_id, created_at DESC)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS repo_commit_diffs (
        commit_oid TEXT NOT NULL,
        path TEXT NOT NULL,
        status TEXT NOT NULL,
        insertions INTEGER NOT NULL,
        deletions INTEGER NOT NULL,
        PRIMARY KEY(commit_oid, path)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS repo_refs (
        repository_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        commit_oid TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(repository_id, name)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS repo_pull_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        head_branch TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        head_oid TEXT NOT NULL,
        base_oid TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        author TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        merged_at INTEGER,
        merge_commit_oid TEXT,
        UNIQUE(repository_id, number)
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS repo_pull_requests_repo_status_idx ON repo_pull_requests (repository_id, status)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS repo_issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        author TEXT NOT NULL,
        assignee TEXT,
        labels TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        closed_at INTEGER,
        UNIQUE(repository_id, number)
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS repo_issues_repo_status_updated_idx ON repo_issues (repository_id, status, updated_at DESC)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS repo_issue_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL,
        issue_number INTEGER NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS repo_issue_comments_issue_idx ON repo_issue_comments (repository_id, issue_number, created_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS repo_workflow_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL,
        workflow TEXT NOT NULL,
        status TEXT NOT NULL,
        trigger TEXT NOT NULL,
        branch TEXT NOT NULL,
        commit_oid TEXT NOT NULL,
        author TEXT NOT NULL,
        steps TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS repo_workflow_runs_repo_created_idx ON repo_workflow_runs (repository_id, created_at DESC)"),
    ]).then(() => undefined).catch((error) => {
      repositorySchemaReady = null;
      throw error;
    });
  }
  return repositorySchemaReady;
}

interface RepositoryRow { id: number; owner: string; name: string; default_branch: string; }
interface HeadRow { commit_oid: string; }
interface TreeRow { path: string; oid: string; content: string; size: number; }

async function findRepository(db: D1Database, owner: string, name: string): Promise<RepositoryRow | null> {
  return db.prepare("SELECT id, owner, name, default_branch FROM repositories WHERE owner = ? AND name = ?")
    .bind(owner, name).first<RepositoryRow>();
}

async function filesAtCommit(db: D1Database, commitOid: string | null): Promise<RepositoryFile[]> {
  if (!commitOid) return [];
  const result = await db.prepare(`SELECT e.path, o.oid, o.content, e.size
    FROM repo_commits c
    JOIN repo_tree_entries e ON e.tree_oid = c.tree_oid
    JOIN repo_objects o ON o.oid = e.blob_oid
    WHERE c.oid = ? ORDER BY e.path ASC`).bind(commitOid).all<TreeRow>();
  return (result.results ?? []).map((row) => ({ path: row.path, oid: row.oid, content: row.content, size: row.size }));
}

function calculateDiffs(beforeFiles: RepositoryFile[], afterFiles: Array<{ path: string; content: string }>): FileDiff[] {
  const before = new Map(beforeFiles.map((file) => [file.path, file.content]));
  const after = new Map(afterFiles.map((file) => [file.path, file.content]));
  const paths = new Set([...before.keys(), ...after.keys()]);
  const diffs: FileDiff[] = [];
  for (const path of [...paths].sort()) {
    const previous = before.get(path);
    const next = after.get(path);
    if (previous === next) continue;
    const stats = myersDiffStats(previous ?? "", next ?? "");
    diffs.push({ path, status: previous === undefined ? "added" : next === undefined ? "deleted" : "modified", ...stats });
  }
  return diffs;
}

async function createSnapshotCommit(db: D1Database, repository: RepositoryRow, branch: string, author: string, message: string, inputFiles: Array<{ path: string; content: string }>, secondParentOid: string | null = null, expectedHeadOid?: string): Promise<string> {
  const head = await db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?")
    .bind(repository.id, branch).first<HeadRow>();
  if (expectedHeadOid && head?.commit_oid !== expectedHeadOid) throw new Error("Base branch moved; rebase before merging");
  const previousFiles = await filesAtCommit(db, head?.commit_oid ?? null);
  const normalized = [...inputFiles]
    .map((file) => ({ path: file.path.replace(/^\/+/, "").slice(0, 240), content: file.content }))
    .filter((file) => file.path && !file.path.includes(".."))
    .sort((left, right) => left.path.localeCompare(right.path));
  const now = Date.now();
  const entries: Array<{ path: string; oid: string; size: number }> = [];
  const statements: D1PreparedStatement[] = [];

  for (const file of normalized) {
    const size = utf8Bytes(file.content);
    const oid = await repositoryObjectId("blob", file.content);
    entries.push({ path: file.path, oid, size });
    statements.push(db.prepare(`INSERT INTO repo_objects (oid, object_type, content, size, created_at)
      VALUES (?, 'blob', ?, ?, ?) ON CONFLICT(oid) DO NOTHING`).bind(oid, file.content, size, now));
  }

  const treeContent = JSON.stringify(entries.map(({ path, oid, size }) => ({ path, oid, size })));
  const treeOid = await repositoryObjectId("tree", treeContent);
  statements.push(db.prepare(`INSERT INTO repo_objects (oid, object_type, content, size, created_at)
    VALUES (?, 'tree', ?, ?, ?) ON CONFLICT(oid) DO NOTHING`).bind(treeOid, treeContent, utf8Bytes(treeContent), now));
  for (const entry of entries) {
    statements.push(db.prepare(`INSERT INTO repo_tree_entries (tree_oid, path, blob_oid, size)
      VALUES (?, ?, ?, ?) ON CONFLICT(tree_oid, path) DO NOTHING`).bind(treeOid, entry.path, entry.oid, entry.size));
  }

  const diffs = calculateDiffs(previousFiles, normalized);
  const insertions = diffs.reduce((sum, diff) => sum + diff.insertions, 0);
  const deletions = diffs.reduce((sum, diff) => sum + diff.deletions, 0);
  const commitContent = JSON.stringify({ treeOid, parentOids: [head?.commit_oid ?? null, secondParentOid].filter(Boolean), author, message, createdAt: now });
  const commitOid = await repositoryObjectId("commit", commitContent);
  statements.push(db.prepare(`INSERT INTO repo_objects (oid, object_type, content, size, created_at)
    VALUES (?, 'commit', ?, ?, ?) ON CONFLICT(oid) DO NOTHING`).bind(commitOid, commitContent, utf8Bytes(commitContent), now));
  statements.push(db.prepare(`INSERT INTO repo_commits
    (oid, repository_id, tree_oid, parent_oid, second_parent_oid, message, author, created_at, files_changed, insertions, deletions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(oid) DO NOTHING`)
    .bind(commitOid, repository.id, treeOid, head?.commit_oid ?? null, secondParentOid, message.slice(0, 160), author.slice(0, 80), now, diffs.length, insertions, deletions));
  for (const diff of diffs) {
    statements.push(db.prepare(`INSERT INTO repo_commit_diffs (commit_oid, path, status, insertions, deletions)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(commit_oid, path) DO NOTHING`)
      .bind(commitOid, diff.path, diff.status, diff.insertions, diff.deletions));
  }
  statements.push(db.prepare(`INSERT INTO repo_refs (repository_id, name, commit_oid, updated_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(repository_id, name) DO UPDATE SET commit_oid = excluded.commit_oid, updated_at = excluded.updated_at`)
    .bind(repository.id, branch, commitOid, now));
  await db.batch(statements);
  return commitOid;
}

async function ensureSeedRepository(db: D1Database, owner: string, name: string): Promise<RepositoryRow> {
  await ensureRepositorySchema(db);
  const now = Date.now();
  await db.prepare(`INSERT INTO repositories (owner, name, default_branch, created_at)
    VALUES (?, ?, 'main', ?) ON CONFLICT(owner, name) DO NOTHING`).bind(owner, name, now).run();
  const repository = await findRepository(db, owner, name);
  if (!repository) throw new Error("Repository could not be initialized");
  const head = await db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = 'main'")
    .bind(repository.id).first<HeadRow>();
  if (!head) await createSnapshotCommit(db, repository, "MeshForge", "Initial repository snapshot", INITIAL_FILES);
  return repository;
}

async function loadHistory(db: D1Database, repositoryId: number): Promise<RepositoryCommit[]> {
  const commits = await db.prepare(`SELECT oid, tree_oid, parent_oid, second_parent_oid, message, author, created_at, files_changed, insertions, deletions
    FROM repo_commits WHERE repository_id = ? ORDER BY created_at DESC LIMIT 20`).bind(repositoryId).all<{
      oid: string; tree_oid: string; parent_oid: string | null; second_parent_oid: string | null; message: string; author: string; created_at: number;
      files_changed: number; insertions: number; deletions: number;
    }>();
  const diffResult = await db.prepare(`SELECT d.commit_oid, d.path, d.status, d.insertions, d.deletions
    FROM repo_commit_diffs d JOIN repo_commits c ON c.oid = d.commit_oid
    WHERE c.repository_id = ? ORDER BY c.created_at DESC, d.path`).bind(repositoryId).all<FileDiff & { commit_oid: string }>();
  const diffsByCommit = new Map<string, FileDiff[]>();
  for (const diff of diffResult.results ?? []) {
    const current = diffsByCommit.get(diff.commit_oid) ?? [];
    current.push({ path: diff.path, status: diff.status, insertions: diff.insertions, deletions: diff.deletions });
    diffsByCommit.set(diff.commit_oid, current);
  }
  const history: RepositoryCommit[] = [];
  for (const row of commits.results ?? []) {
    history.push({
      oid: row.oid, shortOid: row.oid.slice(0, 8), parentOid: row.parent_oid, secondParentOid: row.second_parent_oid, treeOid: row.tree_oid,
      message: row.message, author: row.author, createdAt: row.created_at, filesChanged: row.files_changed,
      insertions: row.insertions, deletions: row.deletions, diffs: diffsByCommit.get(row.oid) ?? [],
    });
  }
  return history;
}

interface BranchRow { name: string; commit_oid: string; updated_at: number; }

async function loadBranches(db: D1Database, repository: RepositoryRow): Promise<RepositoryBranch[]> {
  const result = await db.prepare(`SELECT name, commit_oid, updated_at FROM repo_refs
    WHERE repository_id = ? ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END, name`)
    .bind(repository.id, repository.default_branch).all<BranchRow>();
  return (result.results ?? []).map((row) => ({
    name: row.name,
    headOid: row.commit_oid,
    shortOid: row.commit_oid.slice(0, 8),
    updatedAt: row.updated_at,
    isDefault: row.name === repository.default_branch,
  }));
}

interface PullRequestRow {
  number: number; title: string; body: string; head_branch: string; base_branch: string;
  head_oid: string; base_oid: string; status: "open" | "merged" | "closed"; author: string;
  created_at: number; merged_at: number | null; merge_commit_oid: string | null;
}

async function loadPullRequests(db: D1Database, repository: RepositoryRow, branches: RepositoryBranch[]): Promise<PullRequest[]> {
  const result = await db.prepare(`SELECT number, title, body, head_branch, base_branch, head_oid, base_oid,
    status, author, created_at, merged_at, merge_commit_oid FROM repo_pull_requests
    WHERE repository_id = ? ORDER BY number DESC LIMIT 30`).bind(repository.id).all<PullRequestRow>();
  const heads = new Map(branches.map((branch) => [branch.name, branch.headOid]));
  const fileCache = new Map<string, RepositoryFile[]>();
  const at = async (oid: string) => {
    if (!fileCache.has(oid)) fileCache.set(oid, await filesAtCommit(db, oid));
    return fileCache.get(oid) ?? [];
  };
  const pullRequests: PullRequest[] = [];
  for (const row of result.results ?? []) {
    const headOid = row.status === "open" ? heads.get(row.head_branch) ?? row.head_oid : row.head_oid;
    const currentBaseOid = row.status === "open" ? heads.get(row.base_branch) ?? row.base_oid : row.base_oid;
    const diffs = calculateDiffs(await at(currentBaseOid), await at(headOid));
    pullRequests.push({
      number: row.number, title: row.title, body: row.body, headBranch: row.head_branch, baseBranch: row.base_branch,
      headOid, baseOid: currentBaseOid, status: row.status, author: row.author, createdAt: row.created_at,
      mergedAt: row.merged_at, mergeCommitOid: row.merge_commit_oid,
      mergeable: pullRequestMergeability({ status: row.status, openedBaseOid: row.base_oid, currentBaseOid, currentHeadOid: headOid }).mergeable,
      filesChanged: diffs.length,
      insertions: diffs.reduce((sum, diff) => sum + diff.insertions, 0),
      deletions: diffs.reduce((sum, diff) => sum + diff.deletions, 0),
      diffs,
    });
  }
  return pullRequests;
}

export async function getRepositorySnapshot(db: D1Database, owner: string, name: string, branch = "main"): Promise<RepositorySnapshot> {
  const repository = await ensureSeedRepository(db, owner, name);
  const head = await db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?")
    .bind(repository.id, branch).first<HeadRow>();
  if (!head) throw new Error("Branch not found");
  const files = await filesAtCommit(db, head.commit_oid);
  const history = await loadHistory(db, repository.id);
  const branches = await loadBranches(db, repository);
  const pullRequests = await loadPullRequests(db, repository, branches);
  const objectMetrics = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM repo_commits WHERE repository_id = ?) +
    (SELECT COUNT(DISTINCT tree_oid) FROM repo_commits WHERE repository_id = ?) +
    (SELECT COUNT(DISTINCT e.blob_oid) FROM repo_tree_entries e JOIN repo_commits c ON c.tree_oid = e.tree_oid WHERE c.repository_id = ?) object_count,
    (SELECT COUNT(DISTINCT e.blob_oid) FROM repo_tree_entries e JOIN repo_commits c ON c.tree_oid = e.tree_oid WHERE c.repository_id = ?) unique_blob_count,
    (SELECT COALESCE(SUM(size), 0) FROM repo_objects WHERE oid IN
      (SELECT DISTINCT e.blob_oid FROM repo_tree_entries e JOIN repo_commits c ON c.tree_oid = e.tree_oid WHERE c.repository_id = ?)) stored_bytes,
    (SELECT COALESCE(SUM(e.size), 0) FROM repo_tree_entries e JOIN repo_commits c ON c.tree_oid = e.tree_oid WHERE c.repository_id = ?) logical_bytes`)
    .bind(repository.id, repository.id, repository.id, repository.id, repository.id, repository.id)
    .first<{ object_count: number; unique_blob_count: number; stored_bytes: number; logical_bytes: number }>();
  const logicalBytes = Number(objectMetrics?.logical_bytes ?? files.reduce((sum, file) => sum + file.size, 0));
  const storedBytes = Number(objectMetrics?.stored_bytes ?? logicalBytes);
  return {
    owner: repository.owner, name: repository.name, defaultBranch: repository.default_branch, branch,
    headOid: head.commit_oid, files, history, branches, pullRequests,
    metrics: {
      objectCount: Number(objectMetrics?.object_count ?? 0),
      uniqueBlobCount: Number(objectMetrics?.unique_blob_count ?? 0),
      logicalBytes,
      storedBytes,
      deduplicatedBytes: Math.max(0, logicalBytes * Math.max(1, history.length) - storedBytes),
    },
  };
}

function branchName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._/-]/g, "-").replace(/-{2,}/g, "-").replace(/^[-/.]+|[-/.]+$/g, "").slice(0, 120);
  if (!normalized) throw new Error("Branch name is required");
  return normalized;
}

export async function createRepositoryBranch(db: D1Database, owner: string, name: string, input: {
  name?: string; fromBranch?: string; expectedHeadOid?: string;
}): Promise<RepositorySnapshot> {
  const repository = await ensureSeedRepository(db, owner, name);
  const nextName = branchName(input.name ?? "");
  const sourceName = branchName(input.fromBranch || repository.default_branch);
  const source = await db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?")
    .bind(repository.id, sourceName).first<HeadRow>();
  if (!source) throw new Error("Source branch not found");
  if (input.expectedHeadOid && input.expectedHeadOid !== source.commit_oid) throw new Error("Source branch moved; reload before branching");
  const existing = await db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?")
    .bind(repository.id, nextName).first<HeadRow>();
  if (existing) throw new Error("Branch already exists");
  await db.prepare("INSERT INTO repo_refs (repository_id, name, commit_oid, updated_at) VALUES (?, ?, ?, ?)")
    .bind(repository.id, nextName, source.commit_oid, Date.now()).run();
  return getRepositorySnapshot(db, owner, name, nextName);
}

export async function createRepositoryPullRequest(db: D1Database, owner: string, name: string, input: {
  title?: string; body?: string; headBranch?: string; baseBranch?: string; author?: string;
}): Promise<RepositorySnapshot> {
  const repository = await ensureSeedRepository(db, owner, name);
  const headBranch = branchName(input.headBranch ?? "");
  const baseBranch = branchName(input.baseBranch || repository.default_branch);
  if (headBranch === baseBranch) throw new Error("Pull request branches must be different");
  const [head, base, duplicate, numberRow] = await Promise.all([
    db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?").bind(repository.id, headBranch).first<HeadRow>(),
    db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?").bind(repository.id, baseBranch).first<HeadRow>(),
    db.prepare("SELECT number FROM repo_pull_requests WHERE repository_id = ? AND head_branch = ? AND base_branch = ? AND status = 'open'").bind(repository.id, headBranch, baseBranch).first<{ number: number }>(),
    db.prepare("SELECT COALESCE(MAX(number), 0) + 1 next_number FROM repo_pull_requests WHERE repository_id = ?").bind(repository.id).first<{ next_number: number }>(),
  ]);
  if (!head || !base) throw new Error("Pull request branch not found");
  if (head.commit_oid === base.commit_oid) throw new Error("Branches do not contain different commits");
  if (duplicate) throw new Error(`Pull request #${duplicate.number} is already open`);
  const now = Date.now();
  await db.prepare(`INSERT INTO repo_pull_requests
    (repository_id, number, title, body, head_branch, base_branch, head_oid, base_oid, status, author, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`)
    .bind(repository.id, Number(numberRow?.next_number ?? 1), (input.title?.trim() || `Merge ${headBranch} into ${baseBranch}`).slice(0, 160),
      (input.body ?? "").slice(0, 2000), headBranch, baseBranch, head.commit_oid, base.commit_oid, (input.author || "MeshForge user").slice(0, 80), now, now).run();
  return getRepositorySnapshot(db, owner, name, headBranch);
}

export async function mergeRepositoryPullRequest(db: D1Database, owner: string, name: string, number: number, author = "MeshForge user"): Promise<RepositorySnapshot> {
  const repository = await ensureSeedRepository(db, owner, name);
  const pull = await db.prepare(`SELECT number, title, head_branch, base_branch, head_oid, base_oid, status
    FROM repo_pull_requests WHERE repository_id = ? AND number = ?`).bind(repository.id, number).first<{
      number: number; title: string; head_branch: string; base_branch: string; head_oid: string; base_oid: string; status: string;
    }>();
  if (!pull) throw new Error("Pull request not found");
  if (pull.status !== "open") throw new Error("Pull request is not open");
  const [head, base] = await Promise.all([
    db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?").bind(repository.id, pull.head_branch).first<HeadRow>(),
    db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?").bind(repository.id, pull.base_branch).first<HeadRow>(),
  ]);
  if (!head || !base) throw new Error("Pull request branch no longer exists");
  if (base.commit_oid !== pull.base_oid) throw new Error("Base branch moved; rebase before merging");
  const headFiles = await filesAtCommit(db, head.commit_oid);
  const mergeOid = await createSnapshotCommit(db, repository, pull.base_branch, author, `Merge pull request #${number}: ${pull.title}`, headFiles, head.commit_oid, pull.base_oid);
  const now = Date.now();
  await db.prepare(`UPDATE repo_pull_requests SET status = 'merged', head_oid = ?, merged_at = ?, updated_at = ?, merge_commit_oid = ?
    WHERE repository_id = ? AND number = ? AND status = 'open'`)
    .bind(head.commit_oid, now, now, mergeOid, repository.id, number).run();
  await createWorkflowRun(db, repository, pull.base_branch, mergeOid, author, "push", headFiles);
  return getRepositorySnapshot(db, owner, name, pull.base_branch);
}

export async function commitRepository(db: D1Database, owner: string, name: string, input: {
  branch?: string; author?: string; message?: string; expectedHeadOid?: string; files?: Array<{ path?: string; content?: string }>;
}): Promise<RepositorySnapshot> {
  const repository = await ensureSeedRepository(db, owner, name);
  const branch = (input.branch || repository.default_branch).replace(/[^a-zA-Z0-9._/-]/g, "").slice(0, 120);
  const files = (input.files ?? []).map((file) => ({ path: String(file.path ?? ""), content: String(file.content ?? "") }));
  if (!files.length || files.length > 100) throw new Error("A commit requires 1–100 files");
  if (files.reduce((sum, file) => sum + utf8Bytes(file.content), 0) > 2_000_000) throw new Error("Commit exceeds the 2 MB milestone limit");
  const head = await db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?")
    .bind(repository.id, branch).first<HeadRow>();
  if (input.expectedHeadOid && head?.commit_oid !== input.expectedHeadOid) throw new Error("Branch moved; reload before committing");
  const author = input.author || "MeshForge user";
  const commitOid = await createSnapshotCommit(db, repository, branch, author, input.message?.trim() || "Update collaborative workspace", files);
  await createWorkflowRun(db, repository, branch, commitOid, author, "push", files);
  return getRepositorySnapshot(db, owner, name, branch);
}

interface IssueRow {
  number: number; title: string; body: string; status: "open" | "closed"; author: string;
  assignee: string | null; labels: string; created_at: number; updated_at: number; closed_at: number | null;
}

interface IssueCommentRow {
  id: number; issue_number: number; author: string; body: string; created_at: number;
}

function normalizeLabels(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((label) => String(label).trim().toLowerCase()).filter(Boolean))]
    .slice(0, 6)
    .map((label) => label.slice(0, 28));
}

export async function listRepositoryIssues(db: D1Database, owner: string, name: string): Promise<RepositoryIssue[]> {
  const repository = await ensureSeedRepository(db, owner, name);
  const [issuesResult, commentsResult] = await Promise.all([
    db.prepare(`SELECT number, title, body, status, author, assignee, labels, created_at, updated_at, closed_at
      FROM repo_issues WHERE repository_id = ? ORDER BY updated_at DESC, number DESC LIMIT 100`)
      .bind(repository.id).all<IssueRow>(),
    db.prepare(`SELECT id, issue_number, author, body, created_at FROM repo_issue_comments
      WHERE repository_id = ? ORDER BY created_at ASC LIMIT 500`).bind(repository.id).all<IssueCommentRow>(),
  ]);
  const comments = new Map<number, IssueComment[]>();
  for (const row of commentsResult.results ?? []) {
    const current = comments.get(row.issue_number) ?? [];
    current.push({ id: row.id, author: row.author, body: row.body, createdAt: row.created_at });
    comments.set(row.issue_number, current);
  }
  return (issuesResult.results ?? []).map((row) => {
    let labels: string[] = [];
    try { labels = normalizeLabels(JSON.parse(row.labels)); } catch { labels = []; }
    return {
      number: row.number, title: row.title, body: row.body, status: row.status, author: row.author,
      assignee: row.assignee, labels, createdAt: row.created_at, updatedAt: row.updated_at,
      closedAt: row.closed_at, comments: comments.get(row.number) ?? [],
    };
  });
}

export async function createRepositoryIssue(db: D1Database, owner: string, name: string, input: {
  title?: string; body?: string; author?: string; assignee?: string; labels?: unknown;
}): Promise<RepositoryIssue[]> {
  const repository = await ensureSeedRepository(db, owner, name);
  const title = input.title?.trim();
  if (!title) throw new Error("Issue title is required");
  const numberRow = await db.prepare("SELECT COALESCE(MAX(number), 0) + 1 next_number FROM repo_issues WHERE repository_id = ?")
    .bind(repository.id).first<{ next_number: number }>();
  const now = Date.now();
  await db.prepare(`INSERT INTO repo_issues
    (repository_id, number, title, body, status, author, assignee, labels, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`)
    .bind(repository.id, Number(numberRow?.next_number ?? 1), title.slice(0, 160), (input.body ?? "").trim().slice(0, 5000),
      (input.author || "MeshForge user").slice(0, 80), input.assignee?.trim().slice(0, 80) || null,
      JSON.stringify(normalizeLabels(input.labels)), now, now).run();
  return listRepositoryIssues(db, owner, name);
}

export async function updateRepositoryIssue(db: D1Database, owner: string, name: string, number: number, input: {
  status?: "open" | "closed"; assignee?: string | null; labels?: unknown;
}): Promise<RepositoryIssue[]> {
  const repository = await ensureSeedRepository(db, owner, name);
  const issue = await db.prepare("SELECT number, status, assignee, labels FROM repo_issues WHERE repository_id = ? AND number = ?")
    .bind(repository.id, number).first<{ number: number; status: "open" | "closed"; assignee: string | null; labels: string }>();
  if (!issue) throw new Error("Issue not found");
  const status = input.status === "closed" ? "closed" : input.status === "open" ? "open" : issue.status;
  const now = Date.now();
  await db.prepare(`UPDATE repo_issues SET status = ?, assignee = ?, labels = ?, updated_at = ?, closed_at = ?
    WHERE repository_id = ? AND number = ?`)
    .bind(status, input.assignee === undefined ? issue.assignee : input.assignee?.trim().slice(0, 80) || null,
      input.labels === undefined ? issue.labels : JSON.stringify(normalizeLabels(input.labels)),
      now, status === "closed" ? now : null, repository.id, number).run();
  return listRepositoryIssues(db, owner, name);
}

export async function addRepositoryIssueComment(db: D1Database, owner: string, name: string, number: number, input: {
  body?: string; author?: string;
}): Promise<RepositoryIssue[]> {
  const repository = await ensureSeedRepository(db, owner, name);
  const issue = await db.prepare("SELECT number FROM repo_issues WHERE repository_id = ? AND number = ?")
    .bind(repository.id, number).first<{ number: number }>();
  if (!issue) throw new Error("Issue not found");
  const body = input.body?.trim();
  if (!body) throw new Error("Comment cannot be empty");
  const now = Date.now();
  await db.batch([
    db.prepare(`INSERT INTO repo_issue_comments (repository_id, issue_number, author, body, created_at)
      VALUES (?, ?, ?, ?, ?)`).bind(repository.id, number, (input.author || "MeshForge user").slice(0, 80), body.slice(0, 3000), now),
    db.prepare("UPDATE repo_issues SET updated_at = ? WHERE repository_id = ? AND number = ?").bind(now, repository.id, number),
  ]);
  return listRepositoryIssues(db, owner, name);
}

interface WorkflowRunRow {
  id: number; workflow: string; status: "success" | "failure"; trigger: "push" | "manual";
  branch: string; commit_oid: string; author: string; steps: string; duration_ms: number;
  created_at: number; completed_at: number;
}

async function createWorkflowRun(
  db: D1Database,
  repository: RepositoryRow,
  branch: string,
  commitOid: string,
  author: string,
  trigger: "push" | "manual",
  files?: Array<{ path: string; content: string }>,
): Promise<void> {
  const sourceFiles = files ?? await filesAtCommit(db, commitOid);
  const evaluation = evaluateRepositoryWorkflow(sourceFiles);
  const createdAt = Date.now();
  await db.prepare(`INSERT INTO repo_workflow_runs
    (repository_id, workflow, status, trigger, branch, commit_oid, author, steps, duration_ms, created_at, completed_at)
    VALUES (?, 'Mesh CI', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(repository.id, evaluation.status, trigger, branch, commitOid, author.slice(0, 80),
      JSON.stringify(evaluation.steps), evaluation.durationMs, createdAt, createdAt + evaluation.durationMs).run();
}

export async function listRepositoryWorkflowRuns(db: D1Database, owner: string, name: string): Promise<WorkflowRun[]> {
  const repository = await ensureSeedRepository(db, owner, name);
  const existing = await db.prepare("SELECT id FROM repo_workflow_runs WHERE repository_id = ? LIMIT 1")
    .bind(repository.id).first<{ id: number }>();
  if (!existing) {
    const head = await db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?")
      .bind(repository.id, repository.default_branch).first<HeadRow>();
    if (head) await createWorkflowRun(db, repository, repository.default_branch, head.commit_oid, "MeshForge", "push");
  }
  const result = await db.prepare(`SELECT id, workflow, status, trigger, branch, commit_oid, author, steps,
    duration_ms, created_at, completed_at FROM repo_workflow_runs
    WHERE repository_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`).bind(repository.id).all<WorkflowRunRow>();
  return (result.results ?? []).map((row) => {
    let steps: WorkflowStep[] = [];
    try { steps = JSON.parse(row.steps) as WorkflowStep[]; } catch { steps = []; }
    return {
      id: row.id, workflow: row.workflow, status: row.status, trigger: row.trigger, branch: row.branch,
      commitOid: row.commit_oid, author: row.author, steps, durationMs: row.duration_ms,
      createdAt: row.created_at, completedAt: row.completed_at,
    };
  });
}

export async function runRepositoryWorkflow(db: D1Database, owner: string, name: string, input: {
  branch?: string; author?: string;
}): Promise<WorkflowRun[]> {
  const repository = await ensureSeedRepository(db, owner, name);
  const branch = branchName(input.branch || repository.default_branch);
  const head = await db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?")
    .bind(repository.id, branch).first<HeadRow>();
  if (!head) throw new Error("Branch not found");
  await createWorkflowRun(db, repository, branch, head.commit_oid, input.author || "MeshForge user", "manual");
  return listRepositoryWorkflowRuns(db, owner, name);
}
