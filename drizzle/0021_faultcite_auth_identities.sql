CREATE TABLE `auth_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`user_id` text NOT NULL,
	`verified_email` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identities_provider_subject_uq` ON `auth_identities` (`provider`,`provider_subject`);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identities_provider_user_uq` ON `auth_identities` (`provider`,`user_id`);
--> statement-breakpoint
CREATE INDEX `auth_identities_user_idx` ON `auth_identities` (`user_id`);
--> statement-breakpoint
CREATE TRIGGER `auth_identities_immutable_update`
BEFORE UPDATE ON `auth_identities`
BEGIN
  SELECT RAISE(ABORT, 'auth identity mappings are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `auth_identities_immutable_delete`
BEFORE DELETE ON `auth_identities`
BEGIN
  SELECT RAISE(ABORT, 'auth identity mappings are immutable');
END;
