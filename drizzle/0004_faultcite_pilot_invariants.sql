CREATE UNIQUE INDEX `cases_one_active_per_machine_uq`
ON `cases` (`machine_id`)
WHERE `status` IN ('open', 'diagnosing', 'review_requested', 'cause_confirmed', 'escalated');
--> statement-breakpoint
CREATE UNIQUE INDEX `case_events_one_review_request_uq`
ON `case_events` (`case_id`, `event_type`)
WHERE `event_type` = 'review_requested';
--> statement-breakpoint
CREATE UNIQUE INDEX `case_events_one_cause_confirmation_uq`
ON `case_events` (`case_id`, `event_type`)
WHERE `event_type` = 'cause_confirmed';
--> statement-breakpoint
CREATE UNIQUE INDEX `case_events_one_close_uq`
ON `case_events` (`case_id`, `event_type`)
WHERE `event_type` = 'case_closed';
--> statement-breakpoint
CREATE TRIGGER `cases_status_transition_guard`
BEFORE UPDATE OF `status` ON `cases`
WHEN NEW.`status` <> OLD.`status`
AND NOT (
  (OLD.`status` = 'open' AND NEW.`status` IN ('diagnosing', 'cause_confirmed', 'escalated')) OR
  (OLD.`status` = 'diagnosing' AND NEW.`status` IN ('review_requested', 'cause_confirmed', 'escalated')) OR
  (OLD.`status` = 'review_requested' AND NEW.`status` = 'cause_confirmed') OR
  (OLD.`status` = 'cause_confirmed' AND NEW.`status` = 'closed')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid case status transition');
END;
--> statement-breakpoint
CREATE TRIGGER `cases_closed_immutable_guard`
BEFORE UPDATE ON `cases`
WHEN OLD.`status` = 'closed'
BEGIN
  SELECT RAISE(ABORT, 'closed cases are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `case_events_tenant_guard`
BEFORE INSERT ON `case_events`
WHEN NOT EXISTS (
  SELECT 1 FROM `cases`
  WHERE `cases`.`id` = NEW.`case_id`
    AND `cases`.`organization_id` = NEW.`organization_id`
)
BEGIN
  SELECT RAISE(ABORT, 'case event tenant mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `case_events_state_guard`
BEFORE INSERT ON `case_events`
WHEN (
  NEW.`event_type` = 'diagnostic_result'
  AND NOT EXISTS (SELECT 1 FROM `cases` WHERE `id` = NEW.`case_id` AND `status` = 'diagnosing')
) OR (
  NEW.`event_type` = 'review_requested'
  AND NOT EXISTS (SELECT 1 FROM `cases` WHERE `id` = NEW.`case_id` AND `status` = 'review_requested')
) OR (
  NEW.`event_type` = 'cause_confirmed'
  AND NOT EXISTS (SELECT 1 FROM `cases` WHERE `id` = NEW.`case_id` AND `status` = 'cause_confirmed')
) OR (
  NEW.`event_type` = 'case_closed'
  AND NOT EXISTS (SELECT 1 FROM `cases` WHERE `id` = NEW.`case_id` AND `status` = 'closed')
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
    AND `cases`.`status` <> 'closed'
)
BEGIN
  SELECT RAISE(ABORT, 'case evidence tenant or state mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `memberships_owner_promotion_guard`
BEFORE UPDATE OF `role` ON `memberships`
WHEN NEW.`role` = 'owner' AND OLD.`role` <> 'owner'
BEGIN
  SELECT RAISE(ABORT, 'owner promotion requires a verified transfer workflow');
END;
