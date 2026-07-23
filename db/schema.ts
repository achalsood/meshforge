import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const roomEvents = sqliteTable("room_events", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  roomId: text("room_id").notNull(),
  eventId: text("event_id").notNull().unique(),
  clientId: text("client_id").notNull(),
  kind: text("kind", { enum: ["operations", "chat"] }).notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("room_events_room_seq_idx").on(table.roomId, table.seq)]);

export const roomPresence = sqliteTable("room_presence", {
  roomId: text("room_id").notNull(),
  clientId: text("client_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  cursorFrom: integer("cursor_from").notNull().default(0),
  cursorTo: integer("cursor_to").notNull().default(0),
  lastSeen: integer("last_seen").notNull(),
}, (table) => [
  primaryKey({ columns: [table.roomId, table.clientId] }),
  index("room_presence_room_seen_idx").on(table.roomId, table.lastSeen),
]);

export const audioSignals = sqliteTable("audio_signals", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  roomId: text("room_id").notNull(),
  clientId: text("client_id").notNull(),
  targetClientId: text("target_client_id"),
  signal: text("signal").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("audio_signals_room_seq_idx").on(table.roomId, table.seq),
  index("audio_signals_created_at_idx").on(table.createdAt),
]);
