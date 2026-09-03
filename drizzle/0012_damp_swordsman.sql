ALTER TABLE `cases` ADD `closeout_submitted_by_user_id` text REFERENCES users(id);
--> statement-breakpoint
CREATE TRIGGER `cases_restart_separation_guard`
BEFORE UPDATE OF `status`, `closeout_submitted_by_user_id`, `restart_approved_by_user_id` ON `cases`
WHEN NEW.`status` = 'closed' AND (
  NEW.`closeout_submitted_by_user_id` IS NULL
  OR NEW.`restart_approved_by_user_id` IS NULL
  OR NEW.`closeout_submitted_by_user_id` = NEW.`restart_approved_by_user_id`
)
BEGIN
  SELECT RAISE(ABORT, 'restart approval requires a different authenticated manager');
END;
