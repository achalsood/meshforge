import { decodeBinaryOperationEvent } from "./binary-codec.ts";
import type { RealtimeBatch, RealtimeSignal, RoomEvent } from "./protocol";

export type RealtimeFrame =
  | { encoding: "binary"; event: RoomEvent; bytes: Uint8Array }
  | { encoding: "json"; packet: RealtimeBatch | RealtimeSignal };

function binaryView(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

export function decodeRealtimeFrame(data: unknown, maxBytes = 256_000): RealtimeFrame {
  const bytes = binaryView(data);
  if (bytes) {
    if (bytes.byteLength > maxBytes) throw new Error("Realtime frame is too large");
    return { encoding: "binary", event: decodeBinaryOperationEvent(bytes), bytes };
  }
  if (typeof data !== "string") throw new Error("Unsupported realtime frame");
  if (new TextEncoder().encode(data).byteLength > maxBytes) throw new Error("Realtime frame is too large");
  const packet = JSON.parse(data) as Partial<RealtimeBatch | RealtimeSignal>;
  if (packet.type === "batch") {
    if (typeof packet.roomId !== "string" || typeof packet.clientId !== "string" || !Array.isArray(packet.events)) {
      throw new Error("Invalid realtime batch");
    }
    return { encoding: "json", packet: packet as RealtimeBatch };
  }
  if (packet.type === "signal") {
    if (typeof packet.roomId !== "string" || typeof packet.clientId !== "string" || !packet.signal) {
      throw new Error("Invalid realtime signal");
    }
    return { encoding: "json", packet: packet as RealtimeSignal };
  }
  throw new Error("Unknown realtime frame type");
}
