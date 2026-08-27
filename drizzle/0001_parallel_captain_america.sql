ALTER TABLE `cases` ADD `parts_used` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `verification_readings` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `test_cycles` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `safety_devices_verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cases` ADD `temporary_expires_at` integer;--> statement-breakpoint
ALTER TABLE `cases` ADD `operating_restrictions` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `followup_work` text;