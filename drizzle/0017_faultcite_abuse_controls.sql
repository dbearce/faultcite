CREATE TABLE `rate_limit_buckets` (
  `key` text PRIMARY KEY NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  `reset_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_reset_idx` ON `rate_limit_buckets` (`reset_at`);
--> statement-breakpoint
CREATE TABLE `manual_upload_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `user_id` text NOT NULL,
  `total_chunks` integer NOT NULL,
  `reserved_bytes` integer NOT NULL,
  `status` text DEFAULT 'uploading' NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `manual_upload_org_status_idx` ON `manual_upload_sessions` (`organization_id`,`status`);
--> statement-breakpoint
CREATE INDEX `manual_upload_expiry_idx` ON `manual_upload_sessions` (`expires_at`);
