#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

environment="${1:-staging}"
config="$(environment_config "$environment")"
assert_config_ready "$config"
[[ "$environment" == "staging" ]] || die "automated restore is staging-only"
confirm_exact "RESTORE-staging"

source_dir="${FAULTCITE_RESTORE_DIR:-}"
[[ -f "$source_dir/database.sql" && -f "$source_dir/SHA256SUMS" ]] || die "restore directory is incomplete"
(cd "$source_dir" && sha256sum -c SHA256SUMS)
need jq
preflight_file="$(mktemp)"
trap 'rm -f "$preflight_file"' EXIT
wrangler d1 execute DB --remote --config "$config" --json \
  --command "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';" > "$preflight_file"
table_count="$(jq -r '.[0].results[0].count // empty' "$preflight_file")"
[[ "$table_count" == "0" ]] || die "restore target is not empty; create a fresh isolated staging D1 database"
wrangler d1 execute DB --remote --config "$config" --file "$source_dir/database.sql"

if [[ -d "$source_dir/r2" ]]; then
  [[ -n "${FAULTCITE_R2_RCLONE_REMOTE:-}" ]] || die "set FAULTCITE_R2_RCLONE_REMOTE for R2 restore"
  need rclone
  rclone sync "$source_dir/r2" "$FAULTCITE_R2_RCLONE_REMOTE" --checksum --metadata
fi
