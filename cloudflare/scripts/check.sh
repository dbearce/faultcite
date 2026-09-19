#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

for config in cloudflare/wrangler.staging.toml cloudflare/wrangler.production.toml; do
  assert_config_ready "$config"
  grep -q 'FAULTCITE_DEPLOYMENT_TARGET = "standalone"' "$config" || die "$config is not standalone"
  grep -q 'FAULTCITE_AUTH_PROVIDER = "clerk"' "$config" || die "$config is not configured for Clerk"
  grep -q 'FAULTCITE_RUNTIME = "standalone"' "$config" || die "$config lacks standalone runtime switch"
  grep -q 'CLERK_AUTHORIZED_PARTIES = "https://' "$config" || die "$config lacks Clerk authorized parties"
  grep -q 'binding = "DB"' "$config" || die "$config lacks DB binding"
  grep -q 'binding = "BUCKET"' "$config" || die "$config lacks BUCKET binding"
  grep -q 'binding = "ASSETS"' "$config" || die "$config lacks ASSETS binding"
  grep -q 'compatibility_flags = \["nodejs_compat"\]' "$config" || die "$config lacks nodejs_compat"
  grep -q '^\[observability\]$' "$config" || die "$config lacks observability configuration"
  grep -q '^redact_query_string = true$' "$config" || die "$config must redact query strings from telemetry"
  grep -q '^\[observability.logs\]$' "$config" || die "$config lacks Workers Logs configuration"
  grep -q '^\[observability.traces\]$' "$config" || die "$config lacks Workers Traces configuration"
  ! grep -Eq '(^|[[:space:]])(CLERK_SECRET_KEY|RESEND_API_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|OPENAI_API_KEY|CLOUDFLARE_API_TOKEN)[[:space:]]*=' "$config" || die "$config must not contain secrets"
done

grep -q '^name = "faultcite-staging"$' cloudflare/wrangler.staging.toml || die "staging Worker name changed"
grep -q '^database_name = "faultcite-staging-db"$' cloudflare/wrangler.staging.toml || die "staging D1 name changed"
grep -q '^bucket_name = "faultcite-staging-files"$' cloudflare/wrangler.staging.toml || die "staging R2 name changed"
grep -q '^FAULTCITE_APP_ORIGIN = "https://staging.faultcite.com"$' cloudflare/wrangler.staging.toml || die "staging app origin changed"
grep -q '^CLERK_AUTHORIZED_PARTIES = "https://staging.faultcite.com"$' cloudflare/wrangler.staging.toml || die "staging Clerk authorized party changed"
grep -q '^FAULTCITE_PAID_BILLING_ENABLED = "false"$' cloudflare/wrangler.staging.toml || die "staging billing must remain disabled"
grep -q '^workers_dev = false$' cloudflare/wrangler.staging.toml || die "staging workers.dev must remain disabled"
grep -q '^preview_urls = false$' cloudflare/wrangler.staging.toml || die "staging preview URLs must remain disabled"

grep -q '^name = "faultcite-production"$' cloudflare/wrangler.production.toml || die "production Worker name changed"
grep -q '^database_name = "faultcite-production-db"$' cloudflare/wrangler.production.toml || die "production D1 name changed"
grep -q '^bucket_name = "faultcite-production-files"$' cloudflare/wrangler.production.toml || die "production R2 name changed"
grep -q '^FAULTCITE_APP_ORIGIN = "https://app.faultcite.com"$' cloudflare/wrangler.production.toml || die "production app origin changed"
grep -q '^CLERK_AUTHORIZED_PARTIES = "https://app.faultcite.com"$' cloudflare/wrangler.production.toml || die "production Clerk authorized party changed"
grep -q '^FAULTCITE_PAID_BILLING_ENABLED = "false"$' cloudflare/wrangler.production.toml || die "production billing must remain disabled"
grep -q '^workers_dev = false$' cloudflare/wrangler.production.toml || die "production workers.dev must remain disabled"
grep -q '^preview_urls = false$' cloudflare/wrangler.production.toml || die "production preview URLs must remain disabled"

for script in cloudflare/scripts/*.sh; do bash -n "$script"; done
printf 'Cloudflare package checks passed (one approved Custom Domain per environment).\n'
