CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`selected_organization_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `user_settings` (`user_id`, `selected_organization_id`, `updated_at`)
SELECT `user_id`, `organization_id`, unixepoch() * 1000
FROM `memberships`
WHERE `active` = 1;
--> statement-breakpoint
DROP INDEX `memberships_one_active_uq`;
--> statement-breakpoint
UPDATE `memberships` SET `active` = 1 WHERE `role` = 'owner';
