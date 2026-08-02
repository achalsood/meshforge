import type { ReactNode } from "react";
import type { RepositorySnapshot } from "@/lib/repository/types";
import type { TreeItem } from "@/lib/workspace/build-file-tree";
import type { useMeshAnalysis } from "@/lib/workspace/use-mesh-analysis";
import type { useSourceControl } from "@/lib/workspace/use-source-control";
import type { useRoomSync } from "@/lib/collaboration/use-room-sync";
import { FileTree } from "./file-tree";
import { HistoryDrawer } from "./history-drawer";
import { Icon } from "./icon";
import { IntelligenceDrawer } from "./intelligence-drawer";

type SourceController = ReturnType<typeof useSourceControl>;
type IntelligenceController = ReturnType<typeof useMeshAnalysis>;
type RoomSyncController = ReturnType<typeof useRoomSync>;

interface WorkspaceEditorProps {
  activeFile: string;
  canCommit: boolean;
  children?: ReactNode;
  explorerCollapsed: boolean;
  intelligence: IntelligenceController;
  repository: RepositorySnapshot | null;
  source: SourceController;
  sync: RoomSyncController;
  tree: TreeItem[];
  onToggleExplorer: () => void;
}

export function WorkspaceEditor(props: WorkspaceEditorProps) {
  const {
    activeFile, canCommit, children, explorerCollapsed, intelligence, repository,
    source, sync, tree, onToggleExplorer,
  } = props;
  return <>
    <aside className={`explorer panel${explorerCollapsed ? " collapsed" : ""}`}>
      <div className="panel-heading">
        {!explorerCollapsed && <span>Explorer</span>}
        <button onClick={onToggleExplorer} aria-label={explorerCollapsed ? "Expand explorer" : "Collapse explorer"} aria-expanded={!explorerCollapsed}>{explorerCollapsed ? "↦" : "↤"}</button>
      </div>
      {explorerCollapsed
        ? <span className="panel-rail-label">Explorer</span>
        : <><div className="repo-row"><strong>{repository ? `${repository.owner}/${repository.name}` : "No repository selected"}</strong><Icon name="chevron" size={14}/><button aria-label="Repository options"><Icon name="more"/></button></div><FileTree activeFile={activeFile} dirtyPaths={source.dirtyPaths} items={tree} onOpenFile={source.openFile}/><div className="explorer-foot"><Icon name="branch" size={14}/><span>{source.dirtyPaths.size} working {source.dirtyPaths.size === 1 ? "change" : "changes"}</span><span>{repository?.metrics.uniqueBlobCount ?? 0} blobs</span></div></>}
    </aside>

    <section className="editor panel">
      <div className="editor-tabs"><button className="file-tab active"><span className="ts-icon">TS</span><span>{activeFile.split("/").at(-1)}</span>{source.dirtyPaths.has(activeFile) && <i>●</i>}<b>×</b></button><button className="icon-button" aria-label="New file"><Icon name="plus" size={16}/></button><span className="spacer"/><button className="history-button" onClick={source.toggleHistory}><Icon name="git" size={15}/>{repository?.headOid.slice(0, 8) ?? "loading"}</button><button className="icon-button" aria-label="Search"><Icon name="search"/></button><button className="icon-button" aria-label="Split editor"><Icon name="panel"/></button><button className="icon-button" aria-label="More editor options"><Icon name="more"/></button></div>
      <div className="breadcrumbs">{activeFile.split("/").map((part, index, parts) => <span key={`${part}-${index}`} className={index === parts.length - 1 ? "crumb-current" : ""}>{part}{index < parts.length - 1 && <b>/</b>}</span>)}<span className={`sync-note ${sync.status}`}><Icon name={sync.status === "live" ? "check" : "radio"} size={13}/> {sync.status === "live" ? "Live · WebSocket" : sync.status}</span></div>
      <form className="repo-toolbar" onSubmit={source.createCommit}>
        <div><Icon name="git" size={15}/><span>{source.dirtyPaths.size ? `${source.dirtyPaths.size} modified ${source.dirtyPaths.size === 1 ? "file" : "files"}` : "Working tree clean"}</span></div>
        <input value={source.commitMessage} onChange={(event) => source.setCommitMessage(event.target.value)} placeholder={canCommit ? "Commit message" : "Read-only repository"} aria-label="Commit message" maxLength={160} disabled={!canCommit}/>
        <button disabled={!source.dirtyPaths.size || source.committing || !canCommit}>{source.committing ? "Committing…" : "Commit changes"}</button>
      </form>
      {source.error && <div className="repository-error" role="alert">{source.error}</div>}
      <div className="code-wrap">
        <div className="code-pane live-code-pane">
          <div className="live-line-numbers" aria-hidden="true">{sync.text.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div>
          <textarea
            className="live-editor"
            aria-label="Collaborative code editor"
            value={sync.text}
            onChange={(event) => sync.edit(event.target.value)}
            onSelect={(event) => sync.updateSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
            readOnly={!canCommit}
            spellCheck={false}
          />
          <div className="remote-cursor-list" aria-label="Live peer cursors">{sync.presence.filter((peer) => peer.cursorFrom !== peer.cursorTo || peer.clientId).slice(0, 3).map((peer) => <span className={peer.color} key={peer.clientId}>{peer.name}<i>{peer.cursorFrom}</i></span>)}</div>
        </div>
        <div className="minimap" aria-hidden="true">{Array.from({ length: 38 }).map((_, index) => <i key={index} style={{ width: `${28 + ((index * 17) % 58)}%` }}/>) }<span/></div>
      </div>
      <button className="ai-fab" onClick={intelligence.toggle} aria-expanded={intelligence.open}><Icon name="sparkles"/><span>Mesh Intelligence</span><kbd>⌘ K</kbd></button>
      {intelligence.open && <IntelligenceDrawer controller={intelligence}/>} 
      {source.historyOpen && <HistoryDrawer repository={repository} onClose={source.closeHistory}/>} 
      {children}
    </section>
  </>;
}
