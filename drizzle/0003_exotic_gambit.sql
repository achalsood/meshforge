CREATE TABLE `repo_pull_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`head_branch` text NOT NULL,
	`base_branch` text NOT NULL,
	`head_oid` text NOT NULL,
	`base_oid` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`author` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`merged_at` integer,
	`merge_commit_oid` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_pull_requests_repo_number_unique` ON `repo_pull_requests` (`repository_id`,`number`);--> statement-breakpoint
CREATE INDEX `repo_pull_requests_repo_status_idx` ON `repo_pull_requests` (`repository_id`,`status`);--> statement-breakpoint
ALTER TABLE `repo_commits` ADD `second_parent_oid` text;