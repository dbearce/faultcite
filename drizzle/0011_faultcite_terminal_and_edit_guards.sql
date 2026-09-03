DROP TRIGGER `case_events_state_guard`;
--> statement-breakpoint
DROP TRIGGER `case_evidence_tenant_state_guard`;
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
  NEW.`event_type` = 'intake_updated'
  AND NOT EXISTS (SELECT 1 FROM `cases` WHERE `id` = NEW.`case_id` AND `status` IN ('open', 'diagnosing'))
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
CREATE TRIGGER `case_evidence_tenant_state_guard`
BEFORE INSERT ON `case_evidence`
WHEN NOT EXISTS (
  SELECT 1 FROM `cases`
  WHERE `cases`.`id` = NEW.`case_id`
    AND `cases`.`organization_id` = NEW.`organization_id`
    AND `cases`.`status` NOT IN ('closed', 'canceled')
)
BEGIN
  SELECT RAISE(ABORT, 'case evidence tenant or state mismatch');
END;
