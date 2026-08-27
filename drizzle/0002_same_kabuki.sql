CREATE TABLE `case_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`case_id` text NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`file_name` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `case_evidence_case_time_idx` ON `case_evidence` (`case_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `case_evidence_org_idx` ON `case_evidence` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `case_evidence_object_key_uq` ON `case_evidence` (`object_key`);--> statement-breakpoint
ALTER TABLE `case_events` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `case_events_org_case_idempotency_uq` ON `case_events` (`organization_id`,`case_id`,`idempotency_key`);