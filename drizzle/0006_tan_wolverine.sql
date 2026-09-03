UPDATE `memberships`
SET `active` = 0
WHERE `active` = 1
  AND `id` NOT IN (
    SELECT `id` FROM (
      SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `user_id` ORDER BY `updated_at` DESC, `id` DESC) AS `rn`
      FROM `memberships` WHERE `active` = 1
    ) WHERE `rn` = 1
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_one_active_uq` ON `memberships` (`user_id`) WHERE "memberships"."active" = 1;
