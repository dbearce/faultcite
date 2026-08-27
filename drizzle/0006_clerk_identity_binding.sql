ALTER TABLE `users` ADD COLUMN `clerk_user_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_user_uq` ON `users` (`clerk_user_id`);
