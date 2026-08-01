import type { FormEvent } from "react";
import { Icon } from "./icon";
import type { RepositorySnapshot } from "@/lib/repository/types";

interface PullRequestsDrawerProps {
  canCreate: boolean;
  canMerge: boolean;
  creating: boolean;
  headBranch: string;
  mergingNumber: number | null;
  repository: RepositorySnapshot | null;
  body: string;
  title: string;
  onChangeBody: (value: string) => void;
  onChangeHeadBranch: (value: string) => void;
  onChangeTitle: (value: string) => void;
  onClose: () => void;
  onCreate: (event: FormEvent) => void;
  onMerge: (number: number) => void;
}

export function PullRequestsDrawer(props: PullRequestsDrawerProps) {
  const {
    canCreate, canMerge, creating, headBranch, mergingNumber, repository,
    body, title, onChangeBody, onChangeHeadBranch, onChangeTitle, onClose,
    onCreate, onMerge,
  } = props;

  return <aside className="pull-drawer" aria-label="Pull requests">
    <header><div><Icon name="git"/><div><strong>Pull requests</strong><span>Review snapshots and merge guarded changes</span></div></div><button onClick={onClose} aria-label="Close pull requests">×</button></header>
    <div className="pull-content">
      <form className="pull-form" onSubmit={onCreate}>
        <div><strong>Open a pull request</strong><span>Compare a feature branch against {repository?.defaultBranch ?? "main"}</span></div>
        <label><span>Head branch</span><select value={headBranch} onChange={(event) => onChangeHeadBranch(event.target.value)} disabled={!canCreate || !repository?.branches.some((branch) => !branch.isDefault)}><option value="">Create a feature branch first</option>{repository?.branches.filter((branch) => !branch.isDefault).map((branch) => <option value={branch.name} key={branch.name}>{branch.name} · {branch.shortOid}</option>)}</select></label>
        <label><span>Title</span><input value={title} onChange={(event) => onChangeTitle(event.target.value)} placeholder="Describe the change" maxLength={160} disabled={!canCreate}/></label>
        <label><span>Description</span><textarea value={body} onChange={(event) => onChangeBody(event.target.value)} placeholder="What changed, and why?" maxLength={2000} disabled={!canCreate}/></label>
        <button disabled={!headBranch || creating || !canCreate}>{creating ? "Opening…" : "Open pull request"}</button>
        {!canCreate && <p className="permission-note">Contributor access is required to open pull requests.</p>}
      </form>
      <section className="pull-list">
        <div className="pull-list-title"><strong>Repository activity</strong><span>{repository?.pullRequests.length ?? 0} total</span></div>
        {repository?.pullRequests.length ? repository.pullRequests.map((pull) => <article className={`pull-card ${pull.status}`} key={pull.number}>
          <div className="pull-card-top"><span className={`pull-status ${pull.status}`}>{pull.status}</span><code>#{pull.number}</code><span>{pull.headBranch}</span><b>→</b><span>{pull.baseBranch}</span></div>
          <h3>{pull.title}</h3>{pull.body && <p>{pull.body}</p>}
          <div className="pull-meta"><span>{pull.author} · {new Date(pull.createdAt).toLocaleString()}</span><strong>{pull.filesChanged} files</strong><em>+{pull.insertions} −{pull.deletions}</em></div>
          {pull.diffs.length > 0 && <details><summary>View changed files</summary>{pull.diffs.map((diff) => <div className="diff-file" key={diff.path}><span>{diff.status[0].toUpperCase()}</span><code>{diff.path}</code><b>+{diff.insertions} −{diff.deletions}</b></div>)}</details>}
          {pull.status === "open" && <footer><span>{canMerge ? pull.mergeable ? "Base is unchanged · ready to merge" : "Base moved · rebase required" : "Maintainer access is required to merge"}</span><button disabled={!pull.mergeable || mergingNumber !== null || !canMerge} onClick={() => onMerge(pull.number)}>{mergingNumber === pull.number ? "Merging…" : "Merge pull request"}</button></footer>}
          {pull.status === "merged" && <footer className="merged-footer"><span>Merged {pull.mergedAt ? new Date(pull.mergedAt).toLocaleString() : ""}</span><code>{pull.mergeCommitOid?.slice(0, 8)}</code></footer>}
        </article>) : <div className="empty-pulls"><Icon name="branch" size={30}/><strong>No pull requests yet</strong><span>Create a feature branch, commit a change, then open your first review.</span></div>}
      </section>
    </div>
  </aside>;
}
