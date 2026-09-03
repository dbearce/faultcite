ALTER TABLE `pilot_feedback` ADD `resolution_notes` text;--> statement-breakpoint
ALTER TABLE `pilot_feedback` ADD `resolved_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `pilot_feedback` ADD `resolved_at` integer;