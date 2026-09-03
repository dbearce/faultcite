ALTER TABLE `invitations` ADD `token_hash` text;--> statement-breakpoint
ALTER TABLE `invitations` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `invitations` ADD `revoked_at` integer;--> statement-breakpoint
ALTER TABLE `invitations` ADD `delivered_at` integer;