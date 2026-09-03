#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

environment="${1:-staging}"
config="$(environment_config "$environment")"
assert_config_ready "$config"
confirm_exact "BACKUP-${environment}"

destination="${FAULTCITE_BACKUP_DIR:-}"
[[ -n "$destination" ]] || die "set FAULTCITE_BACKUP_DIR to a new protected directory"
[[ ! -e "$destination" ]] || die "backup destination already exists: $destination"
mkdir -m 700 -p "$destination"
wrangler d1 export DB --remote --config "$config" --output "$destination/database.sql"
(cd "$destination" && sha256sum database.sql > SHA256SUMS)

if [[ -n "${FAULTCITE_R2_RCLONE_REMOTE:-}" ]]; then
  need rclone
  mkdir -p "$destination/r2"
  rclone sync "$FAULTCITE_R2_RCLONE_REMOTE" "$destination/r2" --checksum --metadata
  (cd "$destination" && find r2 -type f -print0 | sort -z | xargs -0 -r sha256sum >> SHA256SUMS)
else
  printf 'warning: R2 was not copied; set FAULTCITE_R2_RCLONE_REMOTE to the full remote bucket path.\n' >&2
fi
chmod -R go-rwx "$destination"
printf 'Backup created at %s\n' "$destination"
