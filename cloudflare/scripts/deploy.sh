#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

environment="${1:-}"
config="$(environment_config "$environment")"
assert_config_ready "$config"
confirm_exact "DEPLOY-${environment}"

npm run build
npm run validate:artifact
# Preserve non-secret values intentionally managed in the Cloudflare dashboard
# (for example the Clerk publishable key and verified sender). Wrangler already
# preserves Worker secrets, but replaces plain-text variables by default.
wrangler deploy --config "$config" --keep-vars --strict
