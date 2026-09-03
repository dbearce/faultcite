#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

base_url="${FAULTCITE_ACCEPTANCE_URL:-}"
[[ "$base_url" == https://*.workers.dev ]] || die "set FAULTCITE_ACCEPTANCE_URL to the isolated HTTPS workers.dev staging URL"
need curl
need jq

for role in OWNER TECHNICIAN MANAGER OUTSIDER; do
  variable="FAULTCITE_${role}_TOKEN"
  [[ -n "${!variable:-}" ]] || die "set $variable to a short-lived Clerk staging session token"
done

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fetch_bootstrap() {
  local role="$1" token="$2"
  curl --fail --silent --show-error --max-time 20 \
    -H "authorization: Bearer $token" \
    "$base_url/api/bootstrap" > "$tmp_dir/$role.json"
}

fetch_bootstrap owner "$FAULTCITE_OWNER_TOKEN"
fetch_bootstrap technician "$FAULTCITE_TECHNICIAN_TOKEN"
fetch_bootstrap manager "$FAULTCITE_MANAGER_TOKEN"
fetch_bootstrap outsider "$FAULTCITE_OUTSIDER_TOKEN"

[[ "$(jq -r '.user.role' "$tmp_dir/owner.json")" == "owner" ]] || die "owner account did not receive the owner role"
[[ "$(jq -r '.user.role' "$tmp_dir/technician.json")" == "technician" ]] || die "technician account did not receive the technician role"
[[ "$(jq -r '.user.role' "$tmp_dir/manager.json")" == "manager" ]] || die "manager account did not receive the manager role"

pilot_org="$(jq -r '.organization.id // empty' "$tmp_dir/owner.json")"
[[ -n "$pilot_org" ]] || die "owner bootstrap did not include a company"
[[ "$(jq -r '.organization.id // empty' "$tmp_dir/technician.json")" == "$pilot_org" ]] || die "technician is not in the pilot company"
[[ "$(jq -r '.organization.id // empty' "$tmp_dir/manager.json")" == "$pilot_org" ]] || die "manager is not in the pilot company"
[[ "$(jq -r '.organization.id // empty' "$tmp_dir/outsider.json")" != "$pilot_org" ]] || die "company isolation failed: outsider resolved to the pilot company"

printf 'Staging role and company isolation acceptance passed. Continue the human workflow checklist before cutover.\n'
