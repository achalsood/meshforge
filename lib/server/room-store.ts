import type { PresencePayload, PresenceRecord, ReplayResponse, RoomEvent } from "../collaboration/protocol";

let schemaReady: Promise<void> | null = null;

export async function ensureRoomSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS room_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        client_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS room_events_room_seq_idx ON room_events (room_id, seq)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS room_presence (
        room_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        cursor_from INTEGER NOT NULL DEFAULT 0,
        cursor_to INTEGER NOT NULL DEFAULT 0,
        last_seen INTEGER NOT NULL,
        PRIMARY KEY (room_id, client_id)
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS room_presence_room_seen_idx ON room_presence (room_id, last_seen)"),
    ]).then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function isPresencePayload(payload: RoomEvent["payload"]): payload is PresencePayload {
  return "name" in payload && "cursorFrom" in payload;
}

export async function persistRoomEvents(db: D1Database, roomId: string, events: RoomEvent[]): Promise<void> {
  await ensureRoomSchema(db);
  const statements: D1PreparedStatement[] = [];
  for (const event of events.slice(0, 100)) {
    if (event.kind === "presence" && isPresencePayload(event.payload)) {
      statements.push(db.prepare(`INSERT INTO room_presence
        (room_id, client_id, name, color, cursor_from, cursor_to, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(room_id, client_id) DO UPDATE SET
          name = excluded.name,
          color = excluded.color,
          cursor_from = excluded.cursor_from,
          cursor_to = excluded.cursor_to,
          last_seen = excluded.last_seen`)
        .bind(roomId, event.clientId, event.payload.name.slice(0, 80), event.payload.color.slice(0, 24), event.payload.cursorFrom, event.payload.cursorTo, event.createdAt));
      continue;
    }
    statements.push(db.prepare(`INSERT INTO room_events
      (room_id, event_id, client_id, kind, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO NOTHING`)
      .bind(roomId, event.eventId, event.clientId, event.kind, JSON.stringify(event.payload), event.createdAt));
  }
  if (statements.length) await db.batch(statements);
}

interface EventRow {
  seq: number;
  event_id: string;
  client_id: string;
  kind: "operations" | "chat";
  payload: string;
  created_at: number;
}

interface PresenceRow {
  client_id: string;
  name: string;
  color: string;
  cursor_from: number;
  cursor_to: number;
  last_seen: number;
}

export async function replayRoom(db: D1Database, roomId: string, since: number): Promise<ReplayResponse> {
  await ensureRoomSchema(db);
  const now = Date.now();
  const [eventResult, presenceResult] = await db.batch([
    db.prepare(`SELECT seq, event_id, client_id, kind, payload, created_at
      FROM room_events WHERE room_id = ? AND seq > ? ORDER BY seq ASC LIMIT 500`).bind(roomId, since),
    db.prepare(`SELECT client_id, name, color, cursor_from, cursor_to, last_seen
      FROM room_presence WHERE room_id = ? AND last_seen >= ? ORDER BY last_seen DESC LIMIT 50`).bind(roomId, now - 15_000),
  ]);
  const rows = (eventResult.results ?? []) as unknown as EventRow[];
  const presenceRows = (presenceResult.results ?? []) as unknown as PresenceRow[];
  const events: RoomEvent[] = rows.map((row) => ({
    seq: row.seq,
    eventId: row.event_id,
    clientId: row.client_id,
    kind: row.kind,
    payload: JSON.parse(row.payload) as RoomEvent["payload"],
    createdAt: row.created_at,
  }));
  const presence: PresenceRecord[] = presenceRows.map((row) => ({
    clientId: row.client_id,
    name: row.name,
    color: row.color,
    cursorFrom: row.cursor_from,
    cursorTo: row.cursor_to,
    lastSeen: row.last_seen,
  }));
  return { events, latestSeq: rows.at(-1)?.seq ?? since, presence };
}
