CREATE TABLE `storage_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`upload_kind` text NOT NULL,
	`reserved_bytes` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `storage_reservation_org_kind_idx` ON `storage_reservations` (`organization_id`,`upload_kind`);--> statement-breakpoint
CREATE INDEX `storage_reservation_expiry_idx` ON `storage_reservations` (`expires_at`);
