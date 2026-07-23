import type { useRoomSync } from "@/lib/collaboration/use-room-sync";
import { Icon } from "./icon";

type RoomSync = ReturnType<typeof useRoomSync>;

interface TelemetryFooterProps {
  actualPeers: number;
  sync: RoomSync;
  onShowDetails: () => void;
}

export function TelemetryFooter({ actualPeers, sync, onShowDetails }: TelemetryFooterProps) {
  return (
    <footer className="telemetry">
      <div><Icon name="radio"/><span>round trip</span><strong>{sync.latency || "—"}{sync.latency ? "ms" : ""}</strong></div>
      <div><Icon name="users"/><strong>{actualPeers}</strong><span>{actualPeers === 1 ? "peer" : "peers"}</span></div>
      <div><i className={`status-dot ${sync.status}`}/><strong className="mint">{sync.status === "live" ? "Connected" : sync.status}</strong></div>
      <div><Icon name="activity"/><span>CRDT ops</span><strong>{sync.appliedOperations.toLocaleString()}</strong></div>
      <div title={`${sync.binaryBytesSent.toLocaleString()} binary bytes sent`}><Icon name="radio"/><span>wire saved</span><strong>{sync.jsonBytesAvoided.toLocaleString()}B</strong></div>
      <div title="Deleted payloads compacted while retaining causal anchors"><Icon name="git"/><span>compacted</span><strong>{sync.compactedTombstones}/{sync.tombstones}</strong></div>
      <div className="sparkline" aria-label="Live synchronization activity">{Array.from({length: 34}).map((_, index) => <i key={index} style={{height: `${7 + ((index * 11) % 17)}px`}} />)}</div>
      <button onClick={onShowDetails}>View details</button>
    </footer>
  );
}
