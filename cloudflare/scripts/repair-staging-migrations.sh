#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

config="$(environment_config staging)"
assert_config_ready "$config"
confirm_exact "MIGRATE-staging"

expected_database_id="0a9b513b-1067-4939-81b4-4fe9c01b8dd9"
grep -q "database_id = \"$expected_database_id\"" "$config" ||
  die "staging D1 ID does not match the reviewed database"

state_file="$(mktemp)"
verified_file="$(mktemp)"
trap 'rm -f "$state_file" "$verified_file"' EXIT

wrangler d1 execute DB --remote --config "$config" --json --command "
  SELECT
    (SELECT COUNT(*) FROM d1_migrations) AS journal_rows,
    (SELECT COUNT(*) FROM d1_migrations
      WHERE name IN (
        '0000_hard_lethal_legion.sql',
        '0001_parallel_captain_america.sql',
        '0002_same_kabuki.sql',
        '0003_curved_kinsey_walden.sql',
        '0004_faultcite_pilot_invariants.sql',
        '0005_lonely_cassandra_nova.sql',
        '0006_tan_wolverine.sql',
        '0007_silky_donald_blake.sql'
      )) AS canonical_journal_rows,
    (SELECT COUNT(*) FROM d1_migrations
      WHERE name IN (
        '0005_invitation_expiry.sql',
        '0006_clerk_identity_binding.sql',
        '0007_case_machine_tenant_guard.sql'
      )) AS legacy_journal_rows,
    (SELECT COUNT(*) FROM sqlite_schema
      WHERE type = 'table' AND name IN ('platform_admins', 'user_settings')) AS repaired_tables,
    (SELECT COUNT(*) FROM pragma_table_info('invitations')
      WHERE name = 'expires_at') AS existing_expiry_column,
    (SELECT COUNT(*) FROM pragma_table_info('invitations')
      WHERE name IN ('token_hash', 'revoked_at', 'delivered_at')) AS missing_invitation_columns,
    (SELECT COUNT(*) FROM sqlite_schema
      WHERE type = 'index' AND name = 'memberships_one_active_uq') AS transient_index,
    (SELECT COUNT(*) FROM sqlite_schema
      WHERE type = 'trigger' AND name IN (
        'cases_machine_tenant_insert_guard',
        'cases_machine_tenant_update_guard'
      )) AS early_0010_triggers;
" > "$state_file"

jq -e '
  .[0].success == true and
  .[0].results[0].journal_rows == 11 and
  .[0].results[0].canonical_journal_rows == 8 and
  .[0].results[0].legacy_journal_rows == 3 and
  .[0].results[0].repaired_tables == 2 and
  .[0].results[0].existing_expiry_column == 1 and
  .[0].results[0].missing_invitation_columns == 0 and
  .[0].results[0].transient_index == 0 and
  .[0].results[0].early_0010_triggers == 2
' "$state_file" > /dev/null ||
  die "staging schema no longer matches the reviewed migration drift"

wrangler d1 execute DB --remote --config "$config" --yes \
  --file cloudflare/repairs/staging_migration_history_0005_0008.sql

wrangler d1 execute DB --remote --config "$config" --json --command "
  SELECT
    (SELECT COUNT(*) FROM d1_migrations) AS journal_rows,
    (SELECT COUNT(*) FROM pragma_table_info('invitations')
      WHERE name IN ('token_hash', 'expires_at', 'revoked_at', 'delivered_at')) AS invitation_columns,
    (SELECT COUNT(*) FROM sqlite_schema
      WHERE type = 'trigger' AND name IN (
        'cases_machine_tenant_insert_guard',
        'cases_machine_tenant_update_guard'
      )) AS removed_0010_triggers;
" > "$verified_file"

jq -e '
  .[0].success == true and
  .[0].results[0].journal_rows == 12 and
  .[0].results[0].invitation_columns == 4 and
  .[0].results[0].removed_0010_triggers == 0
' "$verified_file" > /dev/null ||
  die "staging migration-history repair did not reach its expected state"

printf 'Staging migration history 0005-0008 repaired and verified.\n'
