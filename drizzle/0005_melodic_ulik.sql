CREATE TABLE `repository_invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`invited_by` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`responded_at` integer
);
--> statement-breakpoint
CREATE INDEX `repository_invitations_email_status_idx` ON `repository_invitations` (`email`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `repository_invitations_repo_email_unique` ON `repository_invitations` (`repository_id`,`email`);--> statement-breakpoint
CREATE TABLE `repository_members` (
	`repository_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`added_at` integer NOT NULL,
	`invited_by` integer,
	PRIMARY KEY(`repository_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `repository_members_user_idx` ON `repository_members` (`user_id`,`repository_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`username` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);