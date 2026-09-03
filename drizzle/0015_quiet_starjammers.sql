ALTER TABLE `cases` ADD `review_requested_at` integer;--> statement-breakpoint
ALTER TABLE `cases` ADD `manager_action_due_at` integer;--> statement-breakpoint
ALTER TABLE `manuals` ADD `document_type` text;--> statement-breakpoint
ALTER TABLE `manuals` ADD `publication_date` integer;--> statement-breakpoint
ALTER TABLE `manuals` ADD `effective_date` integer;--> statement-breakpoint
ALTER TABLE `manuals` ADD `language` text;--> statement-breakpoint
ALTER TABLE `manuals` ADD `revalidation_due_at` integer;--> statement-breakpoint
ALTER TABLE `manuals` ADD `document_owner_user_id` text REFERENCES users(id);