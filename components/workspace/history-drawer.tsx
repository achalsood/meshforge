import { Icon } from "./icon";
import type { RepositorySnapshot } from "@/lib/repository/types";

interface HistoryDrawerProps {
  repository: RepositorySnapshot | null;
  onClose: () => void;
}

export function HistoryDrawer({ repository, onClose }: HistoryDrawerProps) {
  return <aside className="history-drawer" aria-label="Commit history">
    <header><div><Icon name="git"/><div><strong>Commit history</strong><span>{repository?.branch ?? "main"} · immutable DAG</span></div></div><button onClick={onClose} aria-label="Close history">×</button></header>
    <div className="history-list">{repository?.history.map((commit, index) => <article key={commit.oid} className={index === 0 ? "head" : ""}>
      <div className="commit-node"><i/><span/></div><div className="commit-body"><div><strong>{commit.message}</strong>{index === 0 && <em>HEAD</em>}{commit.secondParentOid && <em className="merge-label">MERGE</em>}</div><p>{commit.author} · {new Date(commit.createdAt).toLocaleString()}</p><code>{commit.shortOid}</code><span className="diff-total">+{commit.insertions} −{commit.deletions}</span>
      {commit.diffs.length > 0 && <details><summary>{commit.filesChanged} {commit.filesChanged === 1 ? "file" : "files"} changed</summary>{commit.diffs.map((diff) => <div className="diff-file" key={diff.path}><span>{diff.status[0].toUpperCase()}</span><code>{diff.path}</code><b>+{diff.insertions} −{diff.deletions}</b></div>)}</details>}
      </div>
    </article>)}</div>
    <footer><span>{repository?.metrics.objectCount ?? 0} objects</span><span>{repository?.metrics.deduplicatedBytes ?? 0} bytes deduplicated</span></footer>
  </aside>;
}
