#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

base_url="${FAULTCITE_SMOKE_URL:-}"
[[ "$base_url" == https://* ]] || die "set FAULTCITE_SMOKE_URL to the HTTPS staging URL"
case "$base_url" in
  https://app.faultcite.com*) die "production smoke is blocked by this staging script" ;;
esac
need curl

curl_flags=(--fail --silent --show-error --location --max-time 20)
curl "${curl_flags[@]}" "$base_url/" >/dev/null
curl "${curl_flags[@]}" "$base_url/api/health" >/dev/null

status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 20 \
  -H 'oai-authenticated-user-email: forged@example.com' \
  -H 'oai-authenticated-user-full-name: Forged%20User' \
  -H 'oai-authenticated-user-full-name-encoding: percent-encoded-utf-8' \
  "$base_url/api/bootstrap")"
[[ "$status" == "401" || "$status" == "403" ]] || die "forged ChatGPT identity header was not rejected (HTTP $status)"
printf 'Staging smoke checks passed; forged ChatGPT identity was rejected.\n'
