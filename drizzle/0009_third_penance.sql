ALTER TABLE `manuals` ADD `reviewed_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `manuals` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `manuals` ADD `review_notes` text;