#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

environment="${1:-}"
config="$(environment_config "$environment")"
assert_config_ready "$config"
confirm_exact "DEPLOY-${environment}"

npm run build
npm run validate:artifact
wrangler deploy --config "$config"

