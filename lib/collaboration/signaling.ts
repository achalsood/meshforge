import type { RealtimeSignal } from "./protocol";

/** Stable initiator election prevents both peers from creating offers at once. */
export function shouldInitiateOffer(selfId: string, peerId: string): boolean {
  return Boolean(selfId && peerId && selfId !== peerId && selfId < peerId);
}

export function signalTargetsPeer(packet: RealtimeSignal, selfId: string): boolean {
  return packet.clientId !== selfId && (!packet.targetClientId || packet.targetClientId === selfId);
}
