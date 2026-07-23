CREATE TABLE `repo_commit_diffs` (
	`commit_oid` text NOT NULL,
	`path` text NOT NULL,
	`status` text NOT NULL,
	`insertions` integer NOT NULL,
	`deletions` integer NOT NULL,
	PRIMARY KEY(`commit_oid`, `path`)
);
--> statement-breakpoint
CREATE TABLE `repo_commits` (
	`oid` text PRIMARY KEY NOT NULL,
	`repository_id` integer NOT NULL,
	`tree_oid` text NOT NULL,
	`parent_oid` text,
	`message` text NOT NULL,
	`author` text NOT NULL,
	`created_at` integer NOT NULL,
	`files_changed` integer DEFAULT 0 NOT NULL,
	`insertions` integer DEFAULT 0 NOT NULL,
	`deletions` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `repo_commits_repo_created_idx` ON `repo_commits` (`repository_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `repo_objects` (
	`oid` text PRIMARY KEY NOT NULL,
	`object_type` text NOT NULL,
	`content` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `repo_objects_type_idx` ON `repo_objects` (`object_type`);--> statement-breakpoint
CREATE TABLE `repo_refs` (
	`repository_id` integer NOT NULL,
	`name` text NOT NULL,
	`commit_oid` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`repository_id`, `name`)
);
--> statement-breakpoint
CREATE TABLE `repo_tree_entries` (
	`tree_oid` text NOT NULL,
	`path` text NOT NULL,
	`blob_oid` text NOT NULL,
	`size` integer NOT NULL,
	PRIMARY KEY(`tree_oid`, `path`)
);
--> statement-breakpoint
CREATE INDEX `repo_tree_entries_blob_idx` ON `repo_tree_entries` (`blob_oid`);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_owner_name_unique` ON `repositories` (`owner`,`name`);