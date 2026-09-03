CREATE TABLE `pilot_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`submitted_by_user_id` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`case_number` text,
	`contact_requested` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pilot_feedback_org_time_idx` ON `pilot_feedback` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `pilot_feedback_org_status_idx` ON `pilot_feedback` (`organization_id`,`status`);
