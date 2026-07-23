import type { RealtimeSignal } from "./protocol";

/** Stable initiator election prevents both peers from creating offers at once. */
export function shouldInitiateOffer(selfId: string, peerId: string): boolean {
  return Boolean(selfId && peerId && selfId !== peerId && selfId < peerId);
}

export function signalTargetsPeer(packet: RealtimeSignal, selfId: string): boolean {
  return packet.clientId !== selfId && (!packet.targetClientId || packet.targetClientId === selfId);
}

export function isRealtimeSignalPacket(value: unknown, roomId: string): value is RealtimeSignal {
  if (!value || typeof value !== "object") return false;
  const packet = value as Partial<RealtimeSignal>;
  if (packet.type !== "signal" || packet.roomId !== roomId || typeof packet.clientId !== "string") return false;
  if (!packet.clientId || packet.clientId.length > 128 || (packet.targetClientId?.length ?? 0) > 128) return false;
  return Boolean(packet.signal && ["ready", "description", "candidate", "leave"].includes(packet.signal.kind));
}
