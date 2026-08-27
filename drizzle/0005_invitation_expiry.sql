ALTER TABLE `invitations` ADD COLUMN `expires_at` integer;
--> statement-breakpoint
UPDATE `invitations`
SET `expires_at` = COALESCE(`updated_at`, `created_at`) + 604800000
WHERE `expires_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `invitations_email_status_expiry_idx`
ON `invitations` (`email`, `status`, `expires_at`);
