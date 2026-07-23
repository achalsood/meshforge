import type { RepositorySnapshot, WorkflowRun } from "@/lib/repository/types";
import { Icon } from "./icon";

interface ActionsDrawerProps {
  canRun: boolean;
  error: string;
  loading: boolean;
  repository: RepositorySnapshot | null;
  running: boolean;
  runs: WorkflowRun[];
  onClose: () => void;
  onRefresh: () => void;
  onRun: () => void;
}

export function ActionsDrawer({ canRun, error, loading, repository, running, runs, onClose, onRefresh, onRun }: ActionsDrawerProps) {
  return (
    <aside className="product-drawer actions-drawer" aria-label="Repository actions">
      <header>
        <div><Icon name="radio"/><div><strong>Actions</strong><span>Self-hosted repository checks · no external CI service</span></div></div>
        <div><button className="run-workflow" onClick={onRun} disabled={running || !repository || !canRun}>{running ? "Running…" : "Run workflow"}</button><button onClick={onClose} aria-label="Close actions">×</button></div>
      </header>
      {error && <div className="drawer-error" role="alert">{error}</div>}
      <div className="actions-content">
        <aside className="workflow-sidebar"><strong>Workflows</strong><button className="active"><Icon name="activity" size={15}/><div><span>Mesh CI</span><small>Repository quality gate</small></div></button><footer><span>Triggers</span><code>push · manual</code></footer></aside>
        <section className="run-list">
          <header><div><strong>Workflow runs</strong><span>{repository?.owner}/{repository?.name} · {repository?.branch}</span></div><button onClick={onRefresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></header>
          {runs.map((run) => <article className={`workflow-run ${run.status}`} key={run.id}>
            <details open={run.id === runs[0]?.id}>
              <summary><span className={`run-icon ${run.status}`}>{run.status === "success" ? "✓" : "×"}</span><div><strong>{run.workflow}</strong><span>Run #{run.id} · {run.trigger} by {run.author}</span></div><code>{run.commitOid.slice(0, 8)}</code><time>{run.durationMs}ms</time><b>{new Date(run.createdAt).toLocaleString()}</b></summary>
              <div className="run-steps">{run.steps.map((step, index) => <article key={`${step.name}-${index}`}><span className={step.status}>{step.status === "success" ? "✓" : "×"}</span><div><header><strong>{step.name}</strong><time>{step.durationMs}ms</time></header><pre>{step.logs.join("\n")}</pre></div></article>)}</div>
            </details>
          </article>)}
          {!loading && !runs.length && <div className="empty-actions"><Icon name="activity" size={30}/><strong>No workflow runs yet</strong><span>{canRun ? "Run Mesh CI against the current branch to create the first result." : "Maintainer access is required to start workflow runs."}</span><button onClick={onRun} disabled={!canRun}>Run workflow</button></div>}
        </section>
      </div>
    </aside>
  );
}
