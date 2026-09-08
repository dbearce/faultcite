ALTER TABLE `manual_sources` ADD `revoked_at` integer;
--> statement-breakpoint
CREATE INDEX `manual_sources_active_machine_idx` ON `manual_sources` (`organization_id`, `machine_id`, `revoked_at`);
