import type { TextOperation } from "./rga";

export type RoomEventKind = "operations" | "chat" | "presence";

export interface PresencePayload {
  name: string;
  color: string;
  cursorFrom: number;
  cursorTo: number;
}

export interface ChatPayload {
  body: string;
  name: string;
  initials: string;
  color: string;
}

export interface RoomEvent {
  eventId: string;
  clientId: string;
  kind: RoomEventKind;
  payload: { operations: TextOperation[] } | ChatPayload | PresencePayload;
  createdAt: number;
  seq?: number;
}

export interface PresenceRecord extends PresencePayload {
  clientId: string;
  lastSeen: number;
}

export interface ReplayResponse {
  events: RoomEvent[];
  latestSeq: number;
  presence: PresenceRecord[];
}

export interface RealtimeBatch {
  type: "batch";
  roomId: string;
  clientId: string;
  events: RoomEvent[];
}

export type WebRTCSignal =
  | { kind: "ready" }
  | { kind: "description"; description: RTCSessionDescriptionInit }
  | { kind: "candidate"; candidate: RTCIceCandidateInit }
  | { kind: "leave" };

export interface RealtimeSignal {
  type: "signal";
  roomId: string;
  clientId: string;
  targetClientId?: string;
  signal: WebRTCSignal;
}
