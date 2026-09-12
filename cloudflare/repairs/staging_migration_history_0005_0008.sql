-- Staging-only repair for a database whose schema was partially synchronized
-- outside Wrangler's migration journal. The guarded shell wrapper verifies the
-- exact known drift before this file can run.

INSERT OR IGNORE INTO platform_admins (user_id, active, created_at)
SELECT DISTINCT user_id, 1, unixepoch() * 1000
FROM memberships
WHERE role = 'owner';

UPDATE memberships
SET active = 0
WHERE active = 1
  AND id NOT IN (
    SELECT id
    FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id
          ORDER BY updated_at DESC, id DESC
        ) AS rn
      FROM memberships
      WHERE active = 1
    )
    WHERE rn = 1
  );

CREATE UNIQUE INDEX memberships_one_active_uq
ON memberships (user_id)
WHERE active = 1;

INSERT OR IGNORE INTO user_settings (
  user_id,
  selected_organization_id,
  updated_at
)
SELECT user_id, organization_id, unixepoch() * 1000
FROM memberships
WHERE active = 1;

DROP INDEX memberships_one_active_uq;

UPDATE memberships
SET active = 1
WHERE role = 'owner';

ALTER TABLE invitations ADD token_hash text;
ALTER TABLE invitations ADD revoked_at integer;
ALTER TABLE invitations ADD delivered_at integer;

-- These two 0010 triggers exist even though 0010 is not journaled. Remove them
-- so the canonical 0010 migration can recreate them in sequence.
DROP TRIGGER cases_machine_tenant_insert_guard;
DROP TRIGGER cases_machine_tenant_update_guard;

INSERT OR IGNORE INTO d1_migrations (name)
VALUES
  ('0005_lonely_cassandra_nova.sql'),
  ('0006_tan_wolverine.sql'),
  ('0007_silky_donald_blake.sql'),
  ('0008_chilly_red_wolf.sql');
