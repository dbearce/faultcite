CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'technician' NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`accepted_by_user_id` text,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_org_email_uq` ON `invitations` (`organization_id`,`email`);--> statement-breakpoint
CREATE INDEX `invitations_email_status_idx` ON `invitations` (`email`,`status`);