CREATE TABLE `manual_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`manual_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`approved_by_user_id` text NOT NULL,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`serial_number` text,
	`alarm_code` text,
	`section_title` text NOT NULL,
	`page_start` integer NOT NULL,
	`page_end` integer NOT NULL,
	`source_summary` text NOT NULL,
	`safety_notes` text NOT NULL,
	`approved_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manual_id`) REFERENCES `manuals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `manual_sources_org_machine_idx` ON `manual_sources` (`organization_id`,`machine_id`);
--> statement-breakpoint
CREATE INDEX `manual_sources_manual_idx` ON `manual_sources` (`manual_id`);
--> statement-breakpoint
CREATE TRIGGER manual_sources_page_guard
BEFORE INSERT ON manual_sources
WHEN NEW.page_start < 1 OR NEW.page_end < NEW.page_start OR NEW.page_end > 9999
BEGIN
  SELECT RAISE(ABORT, 'manual source page range is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER manual_sources_manual_guard
BEFORE INSERT ON manual_sources
WHEN NOT EXISTS (
  SELECT 1 FROM manuals
  WHERE id = NEW.manual_id
    AND organization_id = NEW.organization_id
    AND status = 'approved'
)
BEGIN
  SELECT RAISE(ABORT, 'manual source manual tenant or approval mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER manual_sources_machine_guard
BEFORE INSERT ON manual_sources
WHEN NOT EXISTS (
  SELECT 1 FROM machines
  WHERE id = NEW.machine_id
    AND organization_id = NEW.organization_id
    AND lower(manufacturer) = lower(NEW.manufacturer)
    AND lower(model) = lower(NEW.model)
    AND coalesce(lower(serial_number), '') = coalesce(lower(NEW.serial_number), '')
)
BEGIN
  SELECT RAISE(ABORT, 'manual source machine tenant or identity mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER manual_sources_manager_guard
BEFORE INSERT ON manual_sources
WHEN NOT EXISTS (
  SELECT 1 FROM memberships
  WHERE organization_id = NEW.organization_id
    AND user_id = NEW.approved_by_user_id
    AND active = 1
    AND role IN ('owner', 'manager')
)
BEGIN
  SELECT RAISE(ABORT, 'manual source approval requires an enabled manager');
END;
--> statement-breakpoint
CREATE TRIGGER manual_sources_immutable_update
BEFORE UPDATE ON manual_sources
BEGIN
  SELECT RAISE(ABORT, 'approved manual sources are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER manual_sources_immutable_delete
BEFORE DELETE ON manual_sources
BEGIN
  SELECT RAISE(ABORT, 'approved manual sources are immutable');
END;
