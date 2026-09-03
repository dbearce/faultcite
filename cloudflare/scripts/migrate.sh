#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

environment="${1:-}"
config="$(environment_config "$environment")"
assert_config_ready "$config"
confirm_exact "MIGRATE-${environment}"

wrangler d1 migrations list DB --remote --config "$config"
wrangler d1 migrations apply DB --remote --config "$config"

