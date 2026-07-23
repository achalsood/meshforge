import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const repositories = sqliteTable("repositories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("repositories_owner_name_unique").on(table.owner, table.name)]);

export const repoObjects = sqliteTable("repo_objects", {
  oid: text("oid").primaryKey(),
  objectType: text("object_type", { enum: ["blob", "tree", "commit"] }).notNull(),
  content: text("content").notNull(),
  size: integer("size").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("repo_objects_type_idx").on(table.objectType)]);

export const repoTreeEntries = sqliteTable("repo_tree_entries", {
  treeOid: text("tree_oid").notNull(),
  path: text("path").notNull(),
  blobOid: text("blob_oid").notNull(),
  size: integer("size").notNull(),
}, (table) => [
  primaryKey({ columns: [table.treeOid, table.path] }),
  index("repo_tree_entries_blob_idx").on(table.blobOid),
]);

export const repoCommits = sqliteTable("repo_commits", {
  oid: text("oid").primaryKey(),
  repositoryId: integer("repository_id").notNull(),
  treeOid: text("tree_oid").notNull(),
  parentOid: text("parent_oid"),
  message: text("message").notNull(),
  author: text("author").notNull(),
  createdAt: integer("created_at").notNull(),
  filesChanged: integer("files_changed").notNull().default(0),
  insertions: integer("insertions").notNull().default(0),
  deletions: integer("deletions").notNull().default(0),
}, (table) => [index("repo_commits_repo_created_idx").on(table.repositoryId, table.createdAt)]);

export const repoCommitDiffs = sqliteTable("repo_commit_diffs", {
  commitOid: text("commit_oid").notNull(),
  path: text("path").notNull(),
  status: text("status", { enum: ["added", "modified", "deleted"] }).notNull(),
  insertions: integer("insertions").notNull(),
  deletions: integer("deletions").notNull(),
}, (table) => [primaryKey({ columns: [table.commitOid, table.path] })]);

export const repoRefs = sqliteTable("repo_refs", {
  repositoryId: integer("repository_id").notNull(),
  name: text("name").notNull(),
  commitOid: text("commit_oid").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.repositoryId, table.name] })]);
