DROP TRIGGER `manual_sources_immutable_update`;
--> statement-breakpoint
CREATE TRIGGER `manual_sources_immutable_update`
BEFORE UPDATE ON `manual_sources`
WHEN NOT (
  OLD.`revoked_at` IS NULL
  AND NEW.`revoked_at` IS NOT NULL
  AND typeof(NEW.`revoked_at`) = 'integer'
  AND NEW.`id` IS OLD.`id`
  AND NEW.`organization_id` IS OLD.`organization_id`
  AND NEW.`manual_id` IS OLD.`manual_id`
  AND NEW.`machine_id` IS OLD.`machine_id`
  AND NEW.`approved_by_user_id` IS OLD.`approved_by_user_id`
  AND NEW.`manufacturer` IS OLD.`manufacturer`
  AND NEW.`model` IS OLD.`model`
  AND NEW.`serial_number` IS OLD.`serial_number`
  AND NEW.`alarm_code` IS OLD.`alarm_code`
  AND NEW.`section_title` IS OLD.`section_title`
  AND NEW.`page_start` IS OLD.`page_start`
  AND NEW.`page_end` IS OLD.`page_end`
  AND NEW.`source_summary` IS OLD.`source_summary`
  AND NEW.`safety_notes` IS OLD.`safety_notes`
  AND NEW.`approved_at` IS OLD.`approved_at`
  AND NEW.`created_at` IS OLD.`created_at`
)
BEGIN
  SELECT RAISE(ABORT, 'approved manual sources are immutable except for one-way revocation');
END;
