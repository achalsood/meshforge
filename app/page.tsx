"use client";

import { FormEvent, useState } from "react";
import { useRoomSync } from "@/lib/collaboration/use-room-sync";
import { useAudioRoom } from "@/lib/collaboration/use-audio-room";

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

const initialMessages = [
  { who: "Maya", initials: "MK", color: "coral", time: "10:21", body: "I’m bumping efSearch to 128. Recall was dipping on the dev set." },
  { who: "Noah", initials: "NP", color: "violet", time: "10:22", body: "Good call. I’ll add an adaptive efSearch based on query norm." },
  { who: "Alex", initials: "AC", color: "lilac", time: "10:23", body: "Let’s log recall@10 beside latency so we can plot the curve." },
];

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

const tree = [
  { type: "folder", name: ".meshforge", depth: 0 },
  { type: "folder", name: ".vscode", depth: 0 },
  { type: "folder-open", name: "src", depth: 0 },
  { type: "folder", name: "core", depth: 1 },
  { type: "folder-open", name: "retrieval", depth: 1 },
  { type: "ts", name: "hnsw.ts", depth: 2, active: true, badge: "M" },
  { type: "ts", name: "embeddings.ts", depth: 2, badge: "A" },
  { type: "ts", name: "search.ts", depth: 2 },
  { type: "folder", name: "types", depth: 1 },
  { type: "folder", name: "utils", depth: 1 },
  { type: "folder-open", name: "tests", depth: 0 },
  { type: "ts", name: "retrieval.test.ts", depth: 1 },
  { type: "ts", name: "search.test.ts", depth: 1 },
  { type: "git", name: ".gitignore", depth: 0 },
  { type: "ts", name: "tsconfig.json", depth: 0 },
  { type: "book", name: "README.md", depth: 0 },
];

export default function Home() {
  const [draft, setDraft] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Code");
  const [activeFile, setActiveFile] = useState("hnsw.ts");
  const [toast, setToast] = useState("");
  const sync = useRoomSync("synapse-ai", INITIAL_CODE);
  const audio = useAudioRoom("synapse-ai", sync.selfId, sync.presence);
  const messages = [
    ...initialMessages,
    ...sync.chats.map((message) => ({
      who: message.name,
      initials: message.initials,
      color: message.color,
      time: new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      body: message.body,
    })),
  ];
  const actualPeers = Math.max(1, sync.presence.length);

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    sync.sendChat(body);
    setDraft("");
  }

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="MeshForge home"><span className="brand-mark"><span /></span><strong>MeshForge</strong></a>
        <button className="repo-select"><span className="repo-cube">◇</span><strong>synapse-ai</strong><Icon name="chevron" size={14} /></button>
        <button className="branch-pill"><Icon name="branch" size={17} /><span>feat/vector-search</span></button>
        <nav className="nav-tabs" aria-label="Repository navigation">
          {["Code", "Issues", "Pull requests", "Actions"].map((item) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => setActiveNav(item)}>{item}</button>)}
        </nav>
        <div className="top-presence" aria-label={`${actualPeers} realtime peers online`}>
          {(sync.presence.length ? sync.presence : [{ clientId: "local", name: "You", color: "mint" }]).slice(0, 4).map((person) => <span className={`avatar sm ${person.color}`} key={person.clientId}>{person.name.slice(0, 2).toUpperCase()}<i /></span>)}
        </div>
        <button className="share-button" onClick={() => flash("Invite link copied to clipboard")}><Icon name="share" /><span>Share workspace</span></button>
      </header>

      <section className="workspace">
        <aside className="explorer panel">
          <div className="panel-heading"><span>Explorer</span><button aria-label="Collapse explorer">↤</button></div>
          <div className="repo-row"><strong>synapse-ai</strong><Icon name="chevron" size={14} /><button aria-label="Repository options"><Icon name="more" /></button></div>
          <div className="file-tree">
            {tree.map((item, index) => (
              <button key={`${item.name}-${index}`} style={{ paddingLeft: 13 + item.depth * 20 }} className={`tree-row ${item.active || activeFile === item.name ? "active" : ""}`} onClick={() => !item.type.startsWith("folder") && setActiveFile(item.name)}>
                {item.type.startsWith("folder") && <span className={`tree-caret ${item.type === "folder-open" ? "open" : ""}`}>›</span>}
                {item.type === "ts" ? <span className="ts-icon">TS</span> : <Icon name={item.type.startsWith("folder") ? "folder" : item.type as IconName} size={17} />}
                <span>{item.name}</span>{item.badge && <em>{item.badge}</em>}
              </button>
            ))}
          </div>
          <div className="explorer-foot"><Icon name="branch" size={14} /><span>3 staged changes</span><span>+34 −8</span></div>
        </aside>

        <section className="editor panel">
          <div className="editor-tabs"><button className="file-tab active"><span className="ts-icon">TS</span><span>{activeFile}</span><b>×</b></button><button className="icon-button" aria-label="New file"><Icon name="plus" size={16} /></button><span className="spacer"/><button className="icon-button" aria-label="Search"><Icon name="search" /></button><button className="icon-button" aria-label="Split editor"><Icon name="panel" /></button><button className="icon-button" aria-label="More editor options"><Icon name="more" /></button></div>
          <div className="breadcrumbs">src <span>/</span> retrieval <span>/</span> <strong>{activeFile}</strong><span className={`sync-note ${sync.status}`}><Icon name={sync.status === "live" ? "check" : "radio"} size={13}/> {sync.status === "live" ? "Live · WebSocket" : sync.status}</span></div>
          <div className="code-wrap">
            <div className="code-pane live-code-pane">
              <div className="live-line-numbers" aria-hidden="true">{sync.text.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div>
              <textarea
                className="live-editor"
                aria-label="Collaborative code editor"
                value={sync.text}
                onChange={(event) => sync.edit(event.target.value)}
                onSelect={(event) => sync.updateSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
                spellCheck={false}
              />
              <div className="remote-cursor-list" aria-label="Live peer cursors">{sync.presence.filter((peer) => peer.cursorFrom !== peer.cursorTo || peer.clientId).slice(0, 3).map((peer) => <span className={peer.color} key={peer.clientId}>{peer.name}<i>{peer.cursorFrom}</i></span>)}</div>
            </div>
            <div className="minimap" aria-hidden="true">{Array.from({length: 38}).map((_, i) => <i key={i} style={{width: `${28 + ((i * 17) % 58)}%`}} />)}<span /></div>
          </div>
          <button className="ai-fab" onClick={() => setAiOpen((v) => !v)} aria-expanded={aiOpen}><Icon name="sparkles"/><span>Ask Mesh AI</span><kbd>⌘ K</kbd></button>
          {aiOpen && <div className="ai-card"><div><span className="ai-glyph"><Icon name="sparkles"/></span><div><strong>Optimize this index</strong><p>Mesh AI found one allocation hotspot and a safer adaptive efSearch strategy.</p></div></div><button onClick={() => flash("AI suggestion inserted as a reviewable patch")}>Review patch <span>+12 −4</span></button></div>}
        </section>

        <aside className="collab panel">
          <div className="room-heading"><div><strong>Live room</strong><span>{actualPeers}</span></div><span className={`audio-state ${audio.status}`}>{audio.status === "connected" ? `${audio.connectedPeers + 1} on audio` : audio.status === "idle" ? "Audio off" : audio.status}</span><button aria-label="Room options"><Icon name="more"/></button></div>
          <section className="voice-section"><div className="voice-title"><p className="section-label">Voice · WebRTC</p>{audio.status === "idle" || audio.status === "error" ? <button className="join-audio" onClick={audio.join}><Icon name="headphones" size={15}/>{audio.status === "error" ? "Retry audio" : "Join audio"}</button> : null}</div>
            <div className="people-list">{(sync.presence.length ? sync.presence : [{ clientId: sync.selfId || "local", name: "You", color: "mint" }]).slice(0, 4).map((person) => {
              const isSelf = person.clientId === sync.selfId || person.clientId === "local";
              const peerState = audio.peerStates[person.clientId];
              const personStatus = isSelf
                ? audio.status === "connected" ? audio.muted ? "Muted" : audio.speaking ? "Speaking" : "In audio" : "Available"
                : peerState === "connected" ? "Audio connected" : peerState === "connecting" ? "Connecting audio" : "Available";
              return <div className="person" key={person.clientId}><span className={`avatar ${person.color}`}>{person.name.slice(0,2).toUpperCase()}</span><div><strong>{person.name}</strong><small className={personStatus === "Speaking" ? "speaking" : ""}>{personStatus}</small></div>{isSelf && audio.speaking ? <div className="waveform" style={{opacity: Math.min(1, .45 + audio.level * 8)}}>{Array.from({length: 17}).map((_, i) => <i key={i} style={{height: `${5 + ((i * 7) % 17)}px`}} />)}</div> : <span className={`presence-dot ${peerState === "connected" || (isSelf && audio.status === "connected") ? "audio-live" : ""}`}/>}</div>;
            })}</div>
            <div className="call-controls"><button disabled={audio.status !== "connected"} className={audio.muted ? "active" : ""} onClick={audio.toggleMute} aria-label={audio.muted ? "Unmute microphone" : "Mute microphone"}><Icon name="mic"/></button><button disabled={audio.status !== "connected"} aria-label="Audio device options"><Icon name="chevron" size={14}/></button><button className={audio.status === "connected" ? "active connected" : ""} onClick={audio.status === "connected" ? undefined : audio.join} disabled={audio.status === "requesting" || audio.status === "connecting"} aria-label={audio.status === "connected" ? "Audio connected" : "Join audio"}><Icon name="headphones"/></button><button aria-label="Room settings" onClick={() => flash("Echo cancellation and noise suppression are enabled")}><Icon name="settings"/></button><button className="hangup" disabled={audio.status === "idle"} aria-label="Leave audio" onClick={audio.leave}><Icon name="phone"/></button></div>
            {audio.status === "requesting" && <p className="audio-help">Choose Allow in the microphone permission prompt.</p>}
            {audio.error && <p className="audio-error" role="alert">{audio.error}</p>}
          </section>
          <section className="chat-section"><p className="section-label">Chat</p><div className="messages">{messages.map((message, index) => <article className="message" key={`${message.time}-${index}`}><span className={`avatar xs ${message.color}`}>{message.initials}</span><div><header><strong>{message.who}</strong><time>{message.time}</time></header><p>{message.body}</p></div></article>)}</div>
            <form className="composer" onSubmit={sendMessage}><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message the room…" aria-label="Message the room"/><button aria-label="Send message"><Icon name="send" size={17}/></button></form><small className="composer-help">Enter to send · synced to everyone</small>
          </section>
        </aside>
      </section>

      <footer className="telemetry">
        <div><Icon name="radio"/><span>round trip</span><strong>{sync.latency || "—"}{sync.latency ? "ms" : ""}</strong></div><div><Icon name="users"/><strong>{actualPeers}</strong><span>{actualPeers === 1 ? "peer" : "peers"}</span></div><div><i className={`status-dot ${sync.status}`}/><strong className="mint">{sync.status === "live" ? "Connected" : sync.status}</strong></div><div><Icon name="activity"/><span>CRDT ops</span><strong>{sync.appliedOperations.toLocaleString()}</strong></div><div className="sparkline" aria-label="Live synchronization activity">{Array.from({length: 34}).map((_, i) => <i key={i} style={{height: `${7 + ((i * 11) % 17)}px`}} />)}</div><button onClick={() => flash("Realtime protocol: WebSocket + durable replay")}>View details</button>
      </footer>
      {toast && <div className="toast"><Icon name="check" size={16}/>{toast}</div>}
    </main>
  );
}
