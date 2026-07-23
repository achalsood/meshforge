CREATE TABLE `audio_signals` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`client_id` text NOT NULL,
	`target_client_id` text,
	`signal` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audio_signals_room_seq_idx` ON `audio_signals` (`room_id`,`seq`);--> statement-breakpoint
CREATE INDEX `audio_signals_created_at_idx` ON `audio_signals` (`created_at`);