import type { RealtimeSignal } from "./protocol";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isOptionalBoundedString(value: unknown, maxLength: number): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.length <= maxLength);
}

/** Stable initiator election prevents both peers from creating offers at once. */
export function shouldInitiateOffer(selfId: string, peerId: string): boolean {
  return Boolean(selfId && peerId && selfId !== peerId && selfId < peerId);
}

export function signalTargetsPeer(packet: RealtimeSignal, selfId: string): boolean {
  return packet.clientId !== selfId && (!packet.targetClientId || packet.targetClientId === selfId);
}

export function isRealtimeSignalPacket(value: unknown, roomId: string): value is RealtimeSignal {
  if (!isRecord(value)) return false;
  const packet = value as Partial<RealtimeSignal>;
  if (packet.type !== "signal" || packet.roomId !== roomId || typeof packet.clientId !== "string") return false;
  if (!packet.clientId || packet.clientId.length > 128 || !isOptionalBoundedString(packet.targetClientId, 128)) return false;
  if (!isRecord(packet.signal) || typeof packet.signal.kind !== "string") return false;
  if (packet.signal.kind === "ready" || packet.signal.kind === "leave") return true;
  if (packet.signal.kind === "description") {
    const description = packet.signal.description;
    return isRecord(description)
      && (description.type === "offer" || description.type === "answer")
      && typeof description.sdp === "string"
      && description.sdp.length <= 96_000;
  }
  if (packet.signal.kind === "candidate") {
    const candidate = packet.signal.candidate;
    return isRecord(candidate)
      && typeof candidate.candidate === "string"
      && candidate.candidate.length <= 32_000
      && isOptionalBoundedString(candidate.sdpMid, 256)
      && (candidate.sdpMLineIndex === undefined || candidate.sdpMLineIndex === null
        || (Number.isInteger(candidate.sdpMLineIndex) && Number(candidate.sdpMLineIndex) >= 0 && Number(candidate.sdpMLineIndex) <= 65_535))
      && isOptionalBoundedString(candidate.usernameFragment, 256);
  }
  return false;
}
