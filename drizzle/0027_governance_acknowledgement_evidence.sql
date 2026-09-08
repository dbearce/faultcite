CREATE TABLE `governance_acknowledgements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version` text NOT NULL,
	`document_hash` text NOT NULL,
	`acknowledgement_text` text NOT NULL,
	`acknowledged_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `governance_acknowledgements_org_time_idx` ON `governance_acknowledgements` (`organization_id`,`acknowledged_at`);
--> statement-breakpoint
CREATE INDEX `governance_acknowledgements_actor_idx` ON `governance_acknowledgements` (`actor_user_id`);
--> statement-breakpoint
CREATE TRIGGER `governance_acknowledgements_immutable_update`
BEFORE UPDATE ON `governance_acknowledgements`
BEGIN
	SELECT RAISE(ABORT, 'governance acknowledgements are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `governance_acknowledgements_immutable_delete`
BEFORE DELETE ON `governance_acknowledgements`
BEGIN
	SELECT RAISE(ABORT, 'governance acknowledgements are immutable');
END;
