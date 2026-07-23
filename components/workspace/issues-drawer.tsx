import type { FormEventHandler } from "react";
import type { RepositoryIssue } from "@/lib/repository/types";
import { Icon } from "./icon";

export type IssueFilter = "open" | "closed" | "all";

interface IssuesDrawerProps {
  canManage: boolean;
  error: string;
  filter: IssueFilter;
  filteredIssues: RepositoryIssue[];
  issueBody: string;
  issueComment: string;
  issueLabels: string;
  issueTitle: string;
  issues: RepositoryIssue[];
  loading: boolean;
  mutating: boolean;
  selectedIssue: RepositoryIssue | null;
  onAddComment: FormEventHandler<HTMLFormElement>;
  onChangeBody: (value: string) => void;
  onChangeComment: (value: string) => void;
  onChangeFilter: (filter: IssueFilter) => void;
  onChangeLabels: (value: string) => void;
  onChangeStatus: (issue: RepositoryIssue) => void;
  onChangeTitle: (value: string) => void;
  onClose: () => void;
  onCreateIssue: FormEventHandler<HTMLFormElement>;
  onRefresh: () => void;
  onSelectIssue: (number: number) => void;
}

export function IssuesDrawer(props: IssuesDrawerProps) {
  const {
    canManage, error, filter, filteredIssues, issueBody, issueComment, issueLabels,
    issueTitle, issues, loading, mutating, selectedIssue, onAddComment, onChangeBody,
    onChangeComment, onChangeFilter, onChangeLabels, onChangeStatus, onChangeTitle,
    onClose, onCreateIssue, onRefresh, onSelectIssue,
  } = props;

  return (
    <aside className="product-drawer issues-drawer" aria-label="Repository issues">
      <header>
        <div><Icon name="activity"/><div><strong>Issues</strong><span>Track bugs, enhancements, decisions, and follow-up work</span></div></div>
        <button onClick={onClose} aria-label="Close issues">×</button>
      </header>
      {error && <div className="drawer-error" role="alert">{error}</div>}
      <div className="issues-content">
        <form className="issue-create" onSubmit={onCreateIssue}>
          <div><strong>Open a new issue</strong><span>Issues are stored with the repository and shared with the team.</span></div>
          <label><span>Title</span><input value={issueTitle} onChange={(event) => onChangeTitle(event.target.value)} placeholder="What needs attention?" maxLength={160} disabled={!canManage}/></label>
          <label><span>Description</span><textarea value={issueBody} onChange={(event) => onChangeBody(event.target.value)} placeholder="Add context, expected behavior, or acceptance criteria." maxLength={5000} disabled={!canManage}/></label>
          <label><span>Labels</span><input value={issueLabels} onChange={(event) => onChangeLabels(event.target.value)} placeholder="bug, performance" maxLength={180} disabled={!canManage}/><small>Comma-separated · up to six labels</small></label>
          <button disabled={!issueTitle.trim() || mutating || !canManage}>{mutating ? "Saving…" : "Open issue"}</button>
          {!canManage && <p className="permission-note">Contributor access is required to manage issues.</p>}
        </form>
        <section className="issues-browser">
          <div className="issue-toolbar">
            <div>{(["open", "closed", "all"] as const).map((candidate) => <button key={candidate} className={filter === candidate ? "active" : ""} onClick={() => onChangeFilter(candidate)}>{candidate}<span>{candidate === "all" ? issues.length : issues.filter((issue) => issue.status === candidate).length}</span></button>)}</div>
            <button onClick={onRefresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
          <div className="issue-workspace">
            <div className="issue-list">
              {filteredIssues.map((issue) => <button key={issue.number} className={selectedIssue?.number === issue.number ? "active" : ""} onClick={() => onSelectIssue(issue.number)}><i className={issue.status}/><div><strong>{issue.title}</strong><span>#{issue.number} opened by {issue.author}</span><p>{issue.labels.map((label) => <em key={label}>{label}</em>)}</p></div><b>{issue.comments.length}</b></button>)}
              {!loading && !filteredIssues.length && <div className="empty-issues"><Icon name="check" size={28}/><strong>No {filter === "all" ? "" : filter} issues</strong><span>Use the form to capture the next piece of work.</span></div>}
            </div>
            {selectedIssue ? <article className="issue-detail">
              <header><div><span className={`issue-state ${selectedIssue.status}`}>{selectedIssue.status}</span><code>#{selectedIssue.number}</code></div><button onClick={() => onChangeStatus(selectedIssue)} disabled={mutating || !canManage}>{selectedIssue.status === "open" ? "Close issue" : "Reopen issue"}</button></header>
              <h2>{selectedIssue.title}</h2>
              <div className="issue-author"><span className="avatar xs mint">{selectedIssue.author.slice(0, 2).toUpperCase()}</span><p><strong>{selectedIssue.author}</strong> opened this issue · {new Date(selectedIssue.createdAt).toLocaleString()}</p></div>
              <p className="issue-description">{selectedIssue.body || "No description was provided."}</p>
              <div className="issue-labels">{selectedIssue.labels.map((label) => <span key={label}>{label}</span>)}</div>
              <section className="issue-comments"><h3>Discussion <span>{selectedIssue.comments.length}</span></h3>{selectedIssue.comments.map((comment) => <article key={comment.id}><span className="avatar xs violet">{comment.author.slice(0, 2).toUpperCase()}</span><div><header><strong>{comment.author}</strong><time>{new Date(comment.createdAt).toLocaleString()}</time></header><p>{comment.body}</p></div></article>)}</section>
              <form className="comment-form" onSubmit={onAddComment}><textarea value={issueComment} onChange={(event) => onChangeComment(event.target.value)} placeholder={canManage ? "Add to the discussion…" : "Read-only discussion"} maxLength={3000} disabled={!canManage}/><button disabled={!issueComment.trim() || mutating || !canManage}>{mutating ? "Posting…" : "Comment"}</button></form>
            </article> : <div className="empty-issues detail"><Icon name="activity" size={28}/><strong>Select an issue</strong><span>Open an issue to view its details and discussion.</span></div>}
          </div>
        </section>
      </div>
    </aside>
  );
}
