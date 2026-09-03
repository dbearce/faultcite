DROP TRIGGER `cases_status_transition_guard`;
--> statement-breakpoint
DROP TRIGGER `cases_closed_immutable_guard`;
--> statement-breakpoint
DROP TRIGGER `case_events_state_guard`;
--> statement-breakpoint
DROP INDEX `cases_one_active_per_machine_uq`;
--> statement-breakpoint
CREATE UNIQUE INDEX `cases_one_active_per_machine_uq`
ON `cases` (`machine_id`)
WHERE `status` IN ('open', 'diagnosing', 'review_requested', 'cause_confirmed', 'closeout_requested', 'escalated');
--> statement-breakpoint
CREATE TRIGGER `cases_status_transition_guard`
BEFORE UPDATE OF `status` ON `cases`
WHEN NEW.`status` <> OLD.`status`
AND NOT (
  (OLD.`status` = 'open' AND NEW.`status` IN ('diagnosing', 'cause_confirmed', 'escalated')) OR
  (OLD.`status` = 'diagnosing' AND NEW.`status` IN ('review_requested', 'cause_confirmed', 'escalated')) OR
  (OLD.`status` = 'review_requested' AND NEW.`status` = 'cause_confirmed') OR
  (OLD.`status` = 'escalated' AND NEW.`status` IN ('diagnosing', 'canceled')) OR
  (OLD.`status` = 'cause_confirmed' AND NEW.`status` IN ('closeout_requested', 'closed')) OR
  (OLD.`status` = 'closeout_requested' AND NEW.`status` = 'closed')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid case status transition');
END;
--> statement-breakpoint
CREATE TRIGGER `cases_terminal_immutable_guard`
BEFORE UPDATE ON `cases`
WHEN OLD.`status` IN ('closed', 'canceled')
BEGIN
  SELECT RAISE(ABORT, 'terminal cases are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `case_events_state_guard`
BEFORE INSERT ON `case_events`
WHEN (
  NEW.`event_type` = 'diagnostic_result'
  AND NOT EXISTS (
    SELECT 1 FROM `cases`
    WHERE `id` = NEW.`case_id`
      AND ((NEW.`result` = 'Unsafe — escalate' AND `status` = 'escalated') OR (NEW.`result` <> 'Unsafe — escalate' AND `status` = 'diagnosing'))
  )
) OR (
  NEW.`event_type` = 'review_requested'
  AND NOT EXISTS (SELECT 1 FROM `cases` WHERE `id` = NEW.`case_id` AND `status` = 'review_requested')
) OR (
  NEW.`event_type` = 'cause_confirmed'
  AND NOT EXISTS (SELECT 1 FROM `cases` WHERE `id` = NEW.`case_id` AND `status` = 'cause_confirmed')
) OR (
  NEW.`event_type` = 'case_closed'
  AND NOT EXISTS (SELECT 1 FROM `cases` WHERE `id` = NEW.`case_id` AND `status` = 'closed')
) OR (
  NEW.`event_type` = 'escalation_returned'
  AND NOT EXISTS (SELECT 1 FROM `cases` WHERE `id` = NEW.`case_id` AND `status` = 'diagnosing')
) OR (
  NEW.`event_type` = 'case_canceled'
  AND NOT EXISTS (SELECT 1 FROM `cases` WHERE `id` = NEW.`case_id` AND `status` = 'canceled')
) OR (
  NEW.`event_type` = 'closeout_requested'
  AND NOT EXISTS (SELECT 1 FROM `cases` WHERE `id` = NEW.`case_id` AND `status` = 'closeout_requested')
)
BEGIN
  SELECT RAISE(ABORT, 'case event does not match case state');
END;
--> statement-breakpoint
CREATE TRIGGER `cases_machine_tenant_insert_guard`
BEFORE INSERT ON `cases`
WHEN NOT EXISTS (SELECT 1 FROM `machines` WHERE `id` = NEW.`machine_id` AND `organization_id` = NEW.`organization_id`)
BEGIN
  SELECT RAISE(ABORT, 'case machine tenant mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `cases_machine_tenant_update_guard`
BEFORE UPDATE OF `machine_id`, `organization_id` ON `cases`
WHEN NOT EXISTS (SELECT 1 FROM `machines` WHERE `id` = NEW.`machine_id` AND `organization_id` = NEW.`organization_id`)
BEGIN
  SELECT RAISE(ABORT, 'case machine tenant mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `case_events_immutable_update_guard`
BEFORE UPDATE ON `case_events`
BEGIN
  SELECT RAISE(ABORT, 'case timeline is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `case_events_immutable_delete_guard`
BEFORE DELETE ON `case_events`
BEGIN
  SELECT RAISE(ABORT, 'case timeline is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_logs_immutable_update_guard`
BEFORE UPDATE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'audit history is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_logs_immutable_delete_guard`
BEFORE DELETE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'audit history is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `cases_terminal_delete_guard`
BEFORE DELETE ON `cases`
WHEN OLD.`status` IN ('closed', 'canceled')
BEGIN
  SELECT RAISE(ABORT, 'terminal cases cannot be deleted');
END;
