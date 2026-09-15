#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

environment="${1:-}"
mode="${2:-}"
[[ -z "$mode" || "$mode" == "--dry-run" ]] || die "optional deploy mode must be --dry-run"
config="$(environment_config "$environment")"
assert_config_ready "$config"
confirm_exact "DEPLOY-${environment}"

npm run build
npm run validate:artifact
# Preserve non-secret values intentionally managed in the Cloudflare dashboard
# (for example the Clerk publishable key and verified sender). Wrangler already
# preserves Worker secrets, but replaces plain-text variables by default.
deploy_config="$config"
if [[ "$environment" == "staging" ]]; then
  # The staging Custom Domain is created and audited separately. Uploading the
  # Worker with a route-free copy prevents a routine code deployment from
  # mutating or re-creating that domain/DNS association.
  deploy_config="$(mktemp --suffix=.toml cloudflare/.wrangler.staging.deploy.XXXXXX)"
  trap 'rm -f "$deploy_config"' EXIT
  awk '
    /^\[\[routes\]\]$/ { skipping_routes = 1; next }
    skipping_routes && /^\[/ { skipping_routes = 0 }
    !skipping_routes { print }
  ' "$config" > "$deploy_config"
  ! grep -Eq '^\[\[routes\]\]$|^[[:space:]]*(route|routes|domain|domains|pattern|custom_domain)[[:space:]]*=' "$deploy_config" ||
    die "temporary staging deploy config must be route-free"
  grep -q '^name = "faultcite-staging"$' "$deploy_config" ||
    die "temporary staging deploy config targets the wrong Worker"
  grep -q '^database_id = "0a9b513b-1067-4939-81b4-4fe9c01b8dd9"$' "$deploy_config" ||
    die "temporary staging deploy config targets the wrong D1 database"
  grep -q '^bucket_name = "faultcite-staging-files"$' "$deploy_config" ||
    die "temporary staging deploy config targets the wrong R2 bucket"
  grep -q '^FAULTCITE_PAID_BILLING_ENABLED = "false"$' "$deploy_config" ||
    die "temporary staging deploy config must keep billing disabled"
  grep -q '^FAULTCITE_APP_ORIGIN = "https://staging.faultcite.com"$' "$deploy_config" ||
    die "temporary staging deploy config has the wrong app origin"
  grep -q '^CLERK_AUTHORIZED_PARTIES = "https://staging.faultcite.com"$' "$deploy_config" ||
    die "temporary staging deploy config has the wrong Clerk authorized party"
  grep -q '^workers_dev = false$' "$deploy_config" ||
    die "temporary staging deploy config must keep workers.dev disabled"
  grep -q '^preview_urls = false$' "$deploy_config" ||
    die "temporary staging deploy config must keep preview URLs disabled"
fi

deploy_args=()
[[ "$mode" == "--dry-run" ]] && deploy_args+=(--dry-run)
wrangler deploy --config "$deploy_config" --keep-vars --strict "${deploy_args[@]}"
