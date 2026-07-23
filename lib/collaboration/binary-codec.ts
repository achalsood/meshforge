import type { RoomEvent } from "./protocol";
import type { TextOperation } from "./rga";

export const CRDT_BINARY_ENCODING = "mf-crdt-v1" as const;
const ROOT_ID = "@root";

const OP_MAGIC = [0x4d, 0x46, 0x01];
const EVENT_MAGIC = [0x4d, 0x46, 0x42, 0x01];
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

class ByteWriter {
  readonly bytes: number[] = [];

  byte(value: number): void {
    this.bytes.push(value & 0xff);
  }

  varuint(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid unsigned integer");
    do {
      const remainder = value % 128;
      value = Math.floor(value / 128);
      this.byte(remainder | (value ? 0x80 : 0));
    } while (value);
  }

  raw(value: Uint8Array): void {
    for (const byte of value) this.byte(byte);
  }

  string(value: string): void {
    const bytes = encoder.encode(value);
    this.varuint(bytes.length);
    this.raw(bytes);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

class ByteReader {
  private offset = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  byte(): number {
    if (this.offset >= this.bytes.length) throw new Error("Unexpected end of binary CRDT payload");
    return this.bytes[this.offset++];
  }

  expect(magic: readonly number[]): void {
    for (const byte of magic) if (this.byte() !== byte) throw new Error("Unsupported binary CRDT payload");
  }

  varuint(): number {
    let value = 0;
    let multiplier = 1;
    for (let index = 0; index < 8; index += 1) {
      const byte = this.byte();
      value += (byte & 0x7f) * multiplier;
      if (!Number.isSafeInteger(value)) throw new Error("Binary integer exceeds safe range");
      if (!(byte & 0x80)) return value;
      multiplier *= 128;
    }
    throw new Error("Invalid binary integer");
  }

  raw(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.bytes.length) {
      throw new Error("Invalid binary field length");
    }
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  string(maxBytes = 65_536): string {
    const length = this.varuint();
    if (length > maxBytes) throw new Error("Binary string is too large");
    return decoder.decode(this.raw(length));
  }

  done(): boolean {
    return this.offset === this.bytes.length;
  }
}

interface ParsedId {
  kind: "root" | "seed" | "replica" | "raw";
  replica?: string;
  sequence?: number;
  raw?: string;
}

function parseId(id: string): ParsedId {
  if (id === ROOT_ID) return { kind: "root" };
  const seed = /^seed:(\d+)$/.exec(id);
  if (seed) return { kind: "seed", sequence: Number(seed[1]) };
  const replica = /^(.*):0*(\d+)$/.exec(id);
  if (replica?.[1] && Number.isSafeInteger(Number(replica[2]))) {
    return { kind: "replica", replica: replica[1], sequence: Number(replica[2]) };
  }
  return { kind: "raw", raw: id };
}

function writeId(writer: ByteWriter, id: string, dictionary: Map<string, number>): void {
  const parsed = parseId(id);
  if (parsed.kind === "root") return writer.byte(0);
  if (parsed.kind === "seed") {
    writer.byte(1);
    writer.varuint(parsed.sequence!);
    return;
  }
  if (parsed.kind === "replica" && dictionary.has(parsed.replica!)) {
    writer.byte(2);
    writer.varuint(dictionary.get(parsed.replica!)!);
    writer.varuint(parsed.sequence!);
    return;
  }
  writer.byte(3);
  writer.string(id);
}

function readId(reader: ByteReader, dictionary: string[]): string {
  const tag = reader.byte();
  if (tag === 0) return ROOT_ID;
  if (tag === 1) return `seed:${String(reader.varuint()).padStart(8, "0")}`;
  if (tag === 2) {
    const replica = dictionary[reader.varuint()];
    if (replica === undefined) throw new Error("Invalid CRDT replica dictionary reference");
    return `${replica}:${String(reader.varuint()).padStart(12, "0")}`;
  }
  if (tag === 3) return reader.string(512);
  throw new Error("Invalid CRDT identifier tag");
}

export function encodeOperations(operations: readonly TextOperation[]): Uint8Array {
  if (operations.length > 10_000) throw new Error("Too many CRDT operations");
  const replicas = new Set<string>();
  for (const operation of operations) {
    for (const id of operation.type === "insert" ? [operation.id, operation.parentId] : [operation.id]) {
      const parsed = parseId(id);
      if (parsed.kind === "replica") replicas.add(parsed.replica!);
    }
  }
  const dictionaryValues = [...replicas].sort();
  const dictionary = new Map(dictionaryValues.map((value, index) => [value, index]));
  const writer = new ByteWriter();
  for (const byte of OP_MAGIC) writer.byte(byte);
  writer.varuint(dictionaryValues.length);
  for (const value of dictionaryValues) writer.string(value);
  writer.varuint(operations.length);
  for (const operation of operations) {
    writer.byte(operation.type === "insert" ? 0 : 1);
    writeId(writer, operation.id, dictionary);
    if (operation.type === "insert") {
      writeId(writer, operation.parentId, dictionary);
      writer.string(operation.value);
    }
  }
  return writer.finish();
}

export function decodeOperations(bytes: Uint8Array): TextOperation[] {
  if (bytes.byteLength > 256_000) throw new Error("Binary CRDT payload is too large");
  const reader = new ByteReader(bytes);
  reader.expect(OP_MAGIC);
  const dictionaryCount = reader.varuint();
  if (dictionaryCount > 1_000) throw new Error("CRDT replica dictionary is too large");
  const dictionary = Array.from({ length: dictionaryCount }, () => reader.string(128));
  const operationCount = reader.varuint();
  if (operationCount > 10_000) throw new Error("Too many CRDT operations");
  const operations: TextOperation[] = [];
  for (let index = 0; index < operationCount; index += 1) {
    const tag = reader.byte();
    const id = readId(reader, dictionary);
    if (tag === 0) {
      const parentId = readId(reader, dictionary);
      const value = reader.string(16);
      if (!value || Array.from(value).length !== 1) throw new Error("CRDT inserts must contain one character");
      operations.push({ type: "insert", id, parentId, value });
    } else if (tag === 1) {
      operations.push({ type: "delete", id });
    } else {
      throw new Error("Invalid CRDT operation tag");
    }
  }
  if (!reader.done()) throw new Error("Trailing bytes in binary CRDT payload");
  return operations;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  if (value.length > 350_000) throw new Error("Encoded CRDT payload is too large");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export interface BinaryOperationPayload {
  encoding: typeof CRDT_BINARY_ENCODING;
  data: string;
  count: number;
}

export function operationPayload(operations: readonly TextOperation[]): BinaryOperationPayload {
  return { encoding: CRDT_BINARY_ENCODING, data: bytesToBase64(encodeOperations(operations)), count: operations.length };
}

export function operationsFromPayload(payload: RoomEvent["payload"]): TextOperation[] | null {
  if ("operations" in payload && Array.isArray(payload.operations)) return payload.operations;
  if ("encoding" in payload && payload.encoding === CRDT_BINARY_ENCODING && "data" in payload && typeof payload.data === "string") {
    return decodeOperations(base64ToBytes(payload.data));
  }
  return null;
}

export function encodeBinaryOperationEvent(event: RoomEvent): Uint8Array {
  const operations = operationsFromPayload(event.payload);
  if (event.kind !== "operations" || !operations) throw new Error("Expected an operation event");
  const operationBytes = encodeOperations(operations);
  const writer = new ByteWriter();
  for (const byte of EVENT_MAGIC) writer.byte(byte);
  writer.string(event.eventId);
  writer.string(event.clientId);
  writer.varuint(event.createdAt);
  writer.varuint(operationBytes.length);
  writer.raw(operationBytes);
  return writer.finish();
}

export function decodeBinaryOperationEvent(bytes: Uint8Array): RoomEvent {
  if (bytes.byteLength > 256_000) throw new Error("Binary event is too large");
  const reader = new ByteReader(bytes);
  reader.expect(EVENT_MAGIC);
  const eventId = reader.string(256);
  const clientId = reader.string(128);
  const createdAt = reader.varuint();
  const operationBytes = reader.raw(reader.varuint());
  if (!reader.done()) throw new Error("Trailing bytes in binary event");
  const operations = decodeOperations(operationBytes);
  return { eventId, clientId, kind: "operations", payload: operationPayload(operations), createdAt };
}
