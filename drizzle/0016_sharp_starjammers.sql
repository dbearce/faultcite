CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`recipient_user_id` text NOT NULL,
	`type` text NOT NULL,
	`case_id` text,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`read_at` integer,
	`dedupe_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_recipient_dedupe_uq` ON `notifications` (`recipient_user_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_read_time_idx` ON `notifications` (`recipient_user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_org_idx` ON `notifications` (`organization_id`);--> statement-breakpoint
ALTER TABLE `cases` ADD `failure_category` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `labor_minutes` integer;--> statement-breakpoint
ALTER TABLE `cases` ADD `parts_cost_cents` integer;--> statement-breakpoint
ALTER TABLE `organizations` ADD `plan` text DEFAULT 'pilot' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `subscription_status` text DEFAULT 'not_configured' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `review_sla_minutes` integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `data_retention_days` integer DEFAULT 2555 NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `safety_contact_email` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `support_contact_email` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `terms_accepted_at` integer;