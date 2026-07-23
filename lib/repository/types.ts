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
  secondParentOid: string | null;
  treeOid: string;
  message: string;
  author: string;
  createdAt: number;
  filesChanged: number;
  insertions: number;
  deletions: number;
  diffs: FileDiff[];
}

export interface RepositoryBranch {
  name: string;
  headOid: string;
  shortOid: string;
  updatedAt: number;
  isDefault: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
  headOid: string;
  baseOid: string;
  status: "open" | "merged" | "closed";
  author: string;
  createdAt: number;
  mergedAt: number | null;
  mergeCommitOid: string | null;
  mergeable: boolean;
  filesChanged: number;
  insertions: number;
  deletions: number;
  diffs: FileDiff[];
}

export interface IssueComment {
  id: number;
  author: string;
  body: string;
  createdAt: number;
}

export interface RepositoryIssue {
  number: number;
  title: string;
  body: string;
  status: "open" | "closed";
  author: string;
  assignee: string | null;
  labels: string[];
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  comments: IssueComment[];
}

export interface WorkflowStep {
  name: string;
  status: "success" | "failure";
  durationMs: number;
  logs: string[];
}

export interface WorkflowRun {
  id: number;
  workflow: string;
  status: "success" | "failure";
  trigger: "push" | "manual";
  branch: string;
  commitOid: string;
  author: string;
  createdAt: number;
  completedAt: number;
  durationMs: number;
  steps: WorkflowStep[];
}

export interface RepositorySnapshot {
  owner: string;
  name: string;
  defaultBranch: string;
  branch: string;
  headOid: string;
  files: RepositoryFile[];
  history: RepositoryCommit[];
  branches: RepositoryBranch[];
  pullRequests: PullRequest[];
  metrics: {
    objectCount: number;
    uniqueBlobCount: number;
    logicalBytes: number;
    storedBytes: number;
    deduplicatedBytes: number;
  };
}
