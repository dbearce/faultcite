#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

for config in cloudflare/wrangler.staging.toml cloudflare/wrangler.production.toml; do
  if [[ "$config" == "cloudflare/wrangler.staging.toml" ]]; then
    assert_config_ready "$config"
  else
    ! grep -Eq '(^|[[:space:]])routes?[[:space:]]*=' "$config" || die "production routes are forbidden"
    ! grep -q '^\[\[routes\]\]$' "$config" || die "production Custom Domains are forbidden"
  fi
  grep -q 'FAULTCITE_DEPLOYMENT_TARGET = "standalone"' "$config" || die "$config is not standalone"
  grep -q 'FAULTCITE_AUTH_PROVIDER = "clerk"' "$config" || die "$config is not configured for Clerk"
  grep -q 'FAULTCITE_RUNTIME = "standalone"' "$config" || die "$config lacks standalone runtime switch"
  grep -q 'CLERK_AUTHORIZED_PARTIES = "https://' "$config" || die "$config lacks Clerk authorized parties"
  grep -q 'binding = "DB"' "$config" || die "$config lacks DB binding"
  grep -q 'binding = "BUCKET"' "$config" || die "$config lacks BUCKET binding"
  grep -q 'binding = "ASSETS"' "$config" || die "$config lacks ASSETS binding"
  ! grep -Eq 'CLERK_SECRET_KEY|RESEND_API_KEY[[:space:]]*=' "$config" || die "$config must not contain secrets"
done

for script in cloudflare/scripts/*.sh; do bash -n "$script"; done
printf 'Cloudflare package checks passed (staging-only Custom Domain; production route-free).\n'
