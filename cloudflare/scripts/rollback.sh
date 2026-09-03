#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

environment="${1:-}"
config="$(environment_config "$environment")"
assert_config_ready "$config"
deployment_id="${FAULTCITE_ROLLBACK_DEPLOYMENT_ID:-}"
[[ -n "$deployment_id" ]] || die "set FAULTCITE_ROLLBACK_DEPLOYMENT_ID after reviewing deployment history"
confirm_exact "ROLLBACK-${environment}-${deployment_id}"
wrangler deployments status --config "$config"
wrangler rollback "$deployment_id" --config "$config" --message "FaultCite approved rollback"

