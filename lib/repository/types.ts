export interface RepositoryFile {
  path: string;
  content: string;
  oid: string;
  size: number;
}

export interface FileDiff {
  path: string;
  status: "added" | "modified" | "deleted";
  insertions: number;
  deletions: number;
}

export interface RepositoryCommit {
  oid: string;
  shortOid: string;
  parentOid: string | null;
  treeOid: string;
  message: string;
  author: string;
  createdAt: number;
  filesChanged: number;
  insertions: number;
  deletions: number;
  diffs: FileDiff[];
}

export interface RepositorySnapshot {
  owner: string;
  name: string;
  defaultBranch: string;
  branch: string;
  headOid: string;
  files: RepositoryFile[];
  history: RepositoryCommit[];
  metrics: {
    objectCount: number;
    uniqueBlobCount: number;
    logicalBytes: number;
    storedBytes: number;
    deduplicatedBytes: number;
  };
}
