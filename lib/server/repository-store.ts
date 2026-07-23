import { myersDiffStats } from "../repository/myers-diff";
import { repositoryObjectId, utf8Bytes } from "../repository/object-id";
import type { FileDiff, RepositoryCommit, RepositoryFile, RepositorySnapshot } from "../repository/types";

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

async function createSnapshotCommit(db: D1Database, repository: RepositoryRow, branch: string, author: string, message: string, inputFiles: Array<{ path: string; content: string }>): Promise<string> {
  const head = await db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?")
    .bind(repository.id, branch).first<HeadRow>();
  const previousFiles = await filesAtCommit(db, head?.commit_oid ?? null);
  const previous = new Map(previousFiles.map((file) => [file.path, file]));
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

  const next = new Map(normalized.map((file) => [file.path, file.content]));
  const paths = new Set([...previous.keys(), ...next.keys()]);
  const diffs: FileDiff[] = [];
  for (const path of [...paths].sort()) {
    const before = previous.get(path)?.content;
    const after = next.get(path);
    if (before === after) continue;
    const stats = myersDiffStats(before ?? "", after ?? "");
    diffs.push({ path, status: before === undefined ? "added" : after === undefined ? "deleted" : "modified", ...stats });
  }
  const insertions = diffs.reduce((sum, diff) => sum + diff.insertions, 0);
  const deletions = diffs.reduce((sum, diff) => sum + diff.deletions, 0);
  const commitContent = JSON.stringify({ treeOid, parentOid: head?.commit_oid ?? null, author, message, createdAt: now });
  const commitOid = await repositoryObjectId("commit", commitContent);
  statements.push(db.prepare(`INSERT INTO repo_objects (oid, object_type, content, size, created_at)
    VALUES (?, 'commit', ?, ?, ?) ON CONFLICT(oid) DO NOTHING`).bind(commitOid, commitContent, utf8Bytes(commitContent), now));
  statements.push(db.prepare(`INSERT INTO repo_commits
    (oid, repository_id, tree_oid, parent_oid, message, author, created_at, files_changed, insertions, deletions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(oid) DO NOTHING`)
    .bind(commitOid, repository.id, treeOid, head?.commit_oid ?? null, message.slice(0, 160), author.slice(0, 80), now, diffs.length, insertions, deletions));
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
  if (!head) await createSnapshotCommit(db, repository, "main", "Achal Sood", "Initial repository snapshot", INITIAL_FILES);
  return repository;
}

async function loadHistory(db: D1Database, repositoryId: number): Promise<RepositoryCommit[]> {
  const commits = await db.prepare(`SELECT oid, tree_oid, parent_oid, message, author, created_at, files_changed, insertions, deletions
    FROM repo_commits WHERE repository_id = ? ORDER BY created_at DESC LIMIT 20`).bind(repositoryId).all<{
      oid: string; tree_oid: string; parent_oid: string | null; message: string; author: string; created_at: number;
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
      oid: row.oid, shortOid: row.oid.slice(0, 8), parentOid: row.parent_oid, treeOid: row.tree_oid,
      message: row.message, author: row.author, createdAt: row.created_at, filesChanged: row.files_changed,
      insertions: row.insertions, deletions: row.deletions, diffs: diffsByCommit.get(row.oid) ?? [],
    });
  }
  return history;
}

export async function getRepositorySnapshot(db: D1Database, owner: string, name: string, branch = "main"): Promise<RepositorySnapshot> {
  const repository = await ensureSeedRepository(db, owner, name);
  const head = await db.prepare("SELECT commit_oid FROM repo_refs WHERE repository_id = ? AND name = ?")
    .bind(repository.id, branch).first<HeadRow>();
  if (!head) throw new Error("Branch not found");
  const files = await filesAtCommit(db, head.commit_oid);
  const history = await loadHistory(db, repository.id);
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
    headOid: head.commit_oid, files, history,
    metrics: {
      objectCount: Number(objectMetrics?.object_count ?? 0),
      uniqueBlobCount: Number(objectMetrics?.unique_blob_count ?? 0),
      logicalBytes,
      storedBytes,
      deduplicatedBytes: Math.max(0, logicalBytes * Math.max(1, history.length) - storedBytes),
    },
  };
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
  await createSnapshotCommit(db, repository, branch, input.author || "Achal Sood", input.message?.trim() || "Update collaborative workspace", files);
  return getRepositorySnapshot(db, owner, name, branch);
}
