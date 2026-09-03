CREATE TABLE `platform_admins` (
	`user_id` text PRIMARY KEY NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT OR IGNORE INTO `platform_admins` (`user_id`, `active`, `created_at`)
SELECT DISTINCT `user_id`, 1, unixepoch() * 1000 FROM `memberships` WHERE `role` = 'owner';
