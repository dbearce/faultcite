#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

environment="${1:-staging}"
config="$(environment_config "$environment")"
assert_config_ready "$config"
backup_dir="${FAULTCITE_BACKUP_DIR:-}"
[[ -f "$backup_dir/database.sql" && -f "$backup_dir/SHA256SUMS" ]] || die "set FAULTCITE_BACKUP_DIR to a completed backup"
(cd "$backup_dir" && sha256sum -c SHA256SUMS)

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
wrangler d1 export DB --remote --config "$config" --output "$tmp_dir/database.sql"

source_counts="$tmp_dir/source.counts"
target_counts="$tmp_dir/target.counts"
need sqlite3
sqlite3 "$tmp_dir/source.db" < "$backup_dir/database.sql"
sqlite3 "$tmp_dir/target.db" < "$tmp_dir/database.sql"
tables="$(sqlite3 "$tmp_dir/source.db" '.tables' 2>/dev/null || true)"
[[ -n "$tables" ]] || die "unable to read table list from backup export"
for table in $tables; do
  printf '%s\t%s\n' "$table" "$(sqlite3 "$tmp_dir/source.db" "SELECT COUNT(*) FROM \"$table\";")" >> "$source_counts"
  printf '%s\t%s\n' "$table" "$(sqlite3 "$tmp_dir/target.db" "SELECT COUNT(*) FROM \"$table\";")" >> "$target_counts"
done
diff -u "$source_counts" "$target_counts"
printf 'D1 table counts reconcile.\n'

if [[ -d "$backup_dir/r2" ]]; then
  [[ -n "${FAULTCITE_R2_RCLONE_REMOTE:-}" ]] || die "set FAULTCITE_R2_RCLONE_REMOTE for R2 reconciliation"
  need rclone
  rclone check "$backup_dir/r2" "$FAULTCITE_R2_RCLONE_REMOTE" --checksum --one-way
fi
