CREATE TABLE `room_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`event_id` text NOT NULL,
	`client_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_events_event_id_unique` ON `room_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `room_events_room_seq_idx` ON `room_events` (`room_id`,`seq`);--> statement-breakpoint
CREATE TABLE `room_presence` (
	`room_id` text NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`cursor_from` integer DEFAULT 0 NOT NULL,
	`cursor_to` integer DEFAULT 0 NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`room_id`, `client_id`)
);
--> statement-breakpoint
CREATE INDEX `room_presence_room_seen_idx` ON `room_presence` (`room_id`,`last_seen`);