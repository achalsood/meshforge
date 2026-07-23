import type { FormEventHandler } from "react";
import type { useAudioRoom } from "@/lib/collaboration/use-audio-room";
import type { useRoomSync } from "@/lib/collaboration/use-room-sync";
import { Icon } from "./icon";

type AudioRoom = ReturnType<typeof useAudioRoom>;
type RoomSync = ReturnType<typeof useRoomSync>;

interface ChatMessage {
  body: string;
  color: string;
  initials: string;
  time: string;
  who: string;
}

interface CollaborationPanelProps {
  actualPeers: number;
  audio: AudioRoom;
  canAudio: boolean;
  canChat: boolean;
  deviceMenuOpen: boolean;
  draft: string;
  messages: ChatMessage[];
  sync: RoomSync;
  onChangeDraft: (value: string) => void;
  onFlash: (message: string) => void;
  onSendMessage: FormEventHandler<HTMLFormElement>;
  onSetDeviceMenuOpen: (open: boolean) => void;
}

export function CollaborationPanel(props: CollaborationPanelProps) {
  const {
    actualPeers, audio, canAudio, canChat, deviceMenuOpen, draft, messages, sync,
    onChangeDraft, onFlash, onSendMessage, onSetDeviceMenuOpen,
  } = props;
  const people = sync.presence.length
    ? sync.presence
    : [{ clientId: sync.selfId || "local", name: "You", color: "mint" }];

  return (
    <aside className="collab panel">
      <div className="room-heading">
        <div><strong>Live room</strong><span>{actualPeers}</span></div>
        <span className={`audio-state ${audio.status}`}>{audio.status === "connected" ? `${audio.connectedPeers + 1} on audio` : audio.status === "idle" ? "Audio off" : audio.status}</span>
        <button aria-label="Room options"><Icon name="more"/></button>
      </div>
      <section className="voice-section">
        <div className="voice-title">
          <p className="section-label">Voice · WebRTC</p>
          {audio.status === "idle" || audio.status === "error"
            ? <button className="join-audio" onClick={audio.join} disabled={!canAudio}><Icon name="headphones" size={15}/>{canAudio ? audio.status === "error" ? "Retry audio" : "Join audio" : "Audio restricted"}</button>
            : null}
        </div>
        <div className="people-list">{people.slice(0, 4).map((person) => {
          const isSelf = person.clientId === sync.selfId || person.clientId === "local";
          const peerState = audio.peerStates[person.clientId];
          const personStatus = isSelf
            ? audio.status === "connected" ? audio.muted ? "Muted" : audio.speaking ? "Speaking" : "In audio" : "Available"
            : peerState === "connected" ? "Audio connected" : peerState === "connecting" ? "Connecting audio" : "Available";
          return <div className="person" key={person.clientId}><span className={`avatar ${person.color}`}>{person.name.slice(0,2).toUpperCase()}</span><div><strong>{person.name}</strong><small className={personStatus === "Speaking" ? "speaking" : ""}>{personStatus}</small></div>{isSelf && audio.speaking ? <div className="waveform" style={{opacity: Math.min(1, .45 + audio.level * 8)}}>{Array.from({length: 17}).map((_, index) => <i key={index} style={{height: `${5 + ((index * 7) % 17)}px`}} />)}</div> : <span className={`presence-dot ${peerState === "connected" || (isSelf && audio.status === "connected") ? "audio-live" : ""}`}/>}</div>;
        })}</div>
        <div className="call-controls-wrap">
          <div className="call-controls">
            <button disabled={audio.status !== "connected" || !canAudio} className={audio.muted ? "active" : ""} onClick={audio.toggleMute} aria-label={audio.muted ? "Unmute microphone" : "Mute microphone"}><Icon name="mic"/></button>
            <button disabled={!canAudio} className={deviceMenuOpen ? "active" : ""} onClick={() => { onSetDeviceMenuOpen(!deviceMenuOpen); void audio.refreshDevices(); }} aria-label="Choose microphone and speaker" aria-expanded={deviceMenuOpen} aria-haspopup="dialog" aria-controls="audio-device-menu"><Icon name="chevron" size={14}/></button>
            <button className={audio.status === "connected" ? "active connected" : ""} onClick={audio.status === "connected" ? undefined : audio.join} disabled={!canAudio || audio.status === "requesting" || audio.status === "connecting"} aria-label={audio.status === "connected" ? "Audio connected" : "Join audio"}><Icon name="headphones"/></button>
            <button aria-label="Room settings" onClick={() => onFlash("Echo cancellation and noise suppression are enabled")}><Icon name="settings"/></button>
            <button className="hangup" disabled={audio.status === "idle"} aria-label="Leave audio" onClick={() => { audio.leave(); onSetDeviceMenuOpen(false); }}><Icon name="phone"/></button>
          </div>
          {deviceMenuOpen && <div className="device-menu" id="audio-device-menu" role="dialog" aria-label="Voice chat devices">
            <header><div><strong>Voice chat devices</strong><span>{audio.devicesLoading ? "Finding devices…" : "Changes apply immediately"}</span></div><button onClick={() => onSetDeviceMenuOpen(false)} aria-label="Close audio device options">×</button></header>
            <label><span>Microphone</span><select value={audio.inputDeviceId} onChange={(event) => void audio.selectInputDevice(event.target.value)} disabled={audio.devicesLoading}><option value="">System default</option>{audio.inputDevices.filter((device) => device.deviceId !== "default").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></label>
            <label><span>Speaker</span><select value={audio.outputDeviceId} onChange={(event) => void audio.selectOutputDevice(event.target.value)} disabled={audio.devicesLoading || !audio.outputSelectionSupported}><option value="">System default</option>{audio.outputDevices.filter((device) => device.deviceId !== "default").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></label>
            {!audio.outputSelectionSupported && <p>Speaker selection is not supported by this browser. Your system default will be used.</p>}
            {audio.deviceError && <p className="audio-error" role="alert">{audio.deviceError}</p>}
          </div>}
        </div>
        {audio.status === "requesting" && <p className="audio-help">Choose Allow in the microphone permission prompt.</p>}
        {audio.error && <p className="audio-error" role="alert">{audio.error}</p>}
      </section>
      <section className="chat-section">
        <p className="section-label">Chat</p>
        <div className="messages">{messages.map((message, index) => <article className="message" key={`${message.time}-${index}`}><span className={`avatar xs ${message.color}`}>{message.initials}</span><div><header><strong>{message.who}</strong><time>{message.time}</time></header><p>{message.body}</p></div></article>)}</div>
        <form className="composer" onSubmit={onSendMessage}><input value={draft} onChange={(event) => onChangeDraft(event.target.value)} placeholder={canChat ? "Message the room…" : "Chat requires contributor access"} aria-label="Message the room" disabled={!canChat}/><button aria-label="Send message" disabled={!canChat || !draft.trim()}><Icon name="send" size={17}/></button></form>
        <small className="composer-help">{canChat ? "Enter to send · synced to everyone" : "Viewer access is read-only"}</small>
      </section>
    </aside>
  );
}
