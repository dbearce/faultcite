CREATE TRIGGER `cases_machine_tenant_insert_guard`
BEFORE INSERT ON `cases`
WHEN NOT EXISTS (
  SELECT 1 FROM `machines`
  WHERE `machines`.`id` = NEW.`machine_id`
    AND `machines`.`organization_id` = NEW.`organization_id`
)
BEGIN
  SELECT RAISE(ABORT, 'case machine tenant mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `cases_machine_tenant_update_guard`
BEFORE UPDATE OF `machine_id`, `organization_id` ON `cases`
WHEN NOT EXISTS (
  SELECT 1 FROM `machines`
  WHERE `machines`.`id` = NEW.`machine_id`
    AND `machines`.`organization_id` = NEW.`organization_id`
)
BEGIN
  SELECT RAISE(ABORT, 'case machine tenant mismatch');
END;
