ALTER TABLE `organizations` ADD `stripe_event_created_at` integer;
--> statement-breakpoint
ALTER TABLE `organizations` ADD `stripe_event_id` text;
