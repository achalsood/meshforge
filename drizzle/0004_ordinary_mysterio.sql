CREATE TABLE `repo_issue_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`issue_number` integer NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `repo_issue_comments_issue_idx` ON `repo_issue_comments` (`repository_id`,`issue_number`,`created_at`);--> statement-breakpoint
CREATE TABLE `repo_issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`author` text NOT NULL,
	`assignee` text,
	`labels` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_issues_repo_number_unique` ON `repo_issues` (`repository_id`,`number`);--> statement-breakpoint
CREATE INDEX `repo_issues_repo_status_updated_idx` ON `repo_issues` (`repository_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `repo_workflow_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`workflow` text NOT NULL,
	`status` text NOT NULL,
	`trigger` text NOT NULL,
	`branch` text NOT NULL,
	`commit_oid` text NOT NULL,
	`author` text NOT NULL,
	`steps` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `repo_workflow_runs_repo_created_idx` ON `repo_workflow_runs` (`repository_id`,`created_at`);