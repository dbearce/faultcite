-- Staging-only repair for migration 0008. Wrangler already completed and
-- journaled canonical migrations 0005-0007 before 0008 encountered the legacy
-- expires_at column. The guarded wrapper verifies that exact state first.

ALTER TABLE invitations ADD token_hash text;
ALTER TABLE invitations ADD revoked_at integer;
ALTER TABLE invitations ADD delivered_at integer;

-- These two 0010 triggers exist even though 0010 is not journaled. Remove them
-- so the canonical 0010 migration can recreate them in sequence.
DROP TRIGGER cases_machine_tenant_insert_guard;
DROP TRIGGER cases_machine_tenant_update_guard;

INSERT OR IGNORE INTO d1_migrations (name)
VALUES
  ('0008_chilly_red_wolf.sql');
