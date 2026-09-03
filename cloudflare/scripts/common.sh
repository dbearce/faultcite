#!/usr/bin/env bash
set -euo pipefail

cf_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$cf_root"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }

environment_config() {
  case "${1:-}" in
    staging) printf '%s\n' "cloudflare/wrangler.staging.toml" ;;
    production) printf '%s\n' "cloudflare/wrangler.production.toml" ;;
    *) die "environment must be staging or production" ;;
  esac
}

assert_config_ready() {
  local config="$1"
  [[ -f "$config" ]] || die "missing config: $config"
  ! grep -q 'REPLACE_WITH_' "$config" || die "replace every placeholder in $config first"
  grep -q 'FAULTCITE_DEPLOYMENT_TARGET = "standalone"' "$config" || die "standalone deployment target missing"
  grep -q 'FAULTCITE_AUTH_PROVIDER = "clerk"' "$config" || die "Clerk auth provider missing"
  grep -q 'FAULTCITE_RUNTIME = "standalone"' "$config" || die "standalone runtime switch missing"
  ! grep -Eq '(^|[[:space:]])routes?[[:space:]]*=' "$config" || die "routes are forbidden before approved cutover"
}

confirm_exact() {
  local expected="$1"
  [[ "${FAULTCITE_CONFIRM:-}" == "$expected" ]] || die "set FAULTCITE_CONFIRM=$expected to authorize this operation"
}

wrangler() {
  need npx
  npx --no-install wrangler "$@"
}
