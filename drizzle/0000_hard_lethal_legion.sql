CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_org_time_idx` ON `audit_logs` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `case_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`case_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`result` text,
	`reading` text,
	`notes` text,
	`payload_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `case_events_case_time_idx` ON `case_events` (`case_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `case_events_org_idx` ON `case_events` (`organization_id`);--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`case_number` text NOT NULL,
	`machine_id` text NOT NULL,
	`opened_by_user_id` text NOT NULL,
	`assigned_to_user_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`symptom` text NOT NULL,
	`alarm_code` text,
	`preceding_change` text,
	`notes` text,
	`confirmed_cause` text,
	`repair_summary` text,
	`repair_type` text,
	`restart_approved_by_user_id` text,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opened_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`restart_approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cases_org_number_uq` ON `cases` (`organization_id`,`case_number`);--> statement-breakpoint
CREATE INDEX `cases_org_status_idx` ON `cases` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `cases_machine_idx` ON `cases` (`machine_id`);--> statement-breakpoint
CREATE TABLE `machines` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`asset_number` text NOT NULL,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`serial_number` text,
	`control` text,
	`location` text,
	`status` text DEFAULT 'running' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `machines_org_asset_uq` ON `machines` (`organization_id`,`asset_number`);--> statement-breakpoint
CREATE INDEX `machines_org_idx` ON `machines` (`organization_id`);--> statement-breakpoint
CREATE TABLE `manuals` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`title` text NOT NULL,
	`manufacturer` text NOT NULL,
	`model` text,
	`revision` text,
	`serial_applicability` text,
	`file_name` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`rights_confirmed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `manuals_org_idx` ON `manuals` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `manuals_object_key_uq` ON `manuals` (`object_key`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'technician' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_user_uq` ON `memberships` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'pilot' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_uq` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);