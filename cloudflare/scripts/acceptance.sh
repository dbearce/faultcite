#!/usr/bin/env bash
# Session tokens must never appear in shell trace output.
set +x
set -euo pipefail
source "$(dirname "$0")/common.sh"

base_url="${FAULTCITE_ACCEPTANCE_URL:-}"
[[ "$base_url" == "https://staging.faultcite.com" ]] || die "set FAULTCITE_ACCEPTANCE_URL=https://staging.faultcite.com"
need curl
need jq

for role in OWNER TECHNICIAN MANAGER OUTSIDER; do
  variable="FAULTCITE_${role}_TOKEN"
  [[ -n "${!variable:-}" ]] || die "set $variable to a short-lived Clerk staging session token"
done

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
umask 077

fetch() {
  local token="$1" path="$2" output="$3"
  # Ignore curl configuration and never follow redirects with credentials.
  curl --disable --silent --max-time 20 --proto '=https' --request GET \
    -H "authorization: Bearer $token" --output "$output" \
    --write-out '%{http_code}' "$base_url$path" || die "staging request failed"
}

for role in owner technician manager outsider; do
  variable="FAULTCITE_${role^^}_TOKEN"
  [[ "$(fetch "${!variable}" /api/bootstrap "$tmp_dir/$role.json")" == 200 ]] || die "$role bootstrap must return HTTP 200"
  jq -e '.user.id | type == "string" and length > 0' "$tmp_dir/$role.json" >/dev/null || die "$role user identity is missing"
  jq -e '.organization.id | type == "string" and length > 0' "$tmp_dir/$role.json" >/dev/null || die "$role company identity is missing"
done

[[ "$(jq -s '[.[].user.id] | unique | length' "$tmp_dir/owner.json" "$tmp_dir/technician.json" "$tmp_dir/manager.json" "$tmp_dir/outsider.json")" == 4 ]] || die "four distinct user identities are required"

[[ "$(jq -r '.user.role' "$tmp_dir/owner.json")" == "owner" ]] || die "owner account did not receive the owner role"
[[ "$(jq -r '.user.role' "$tmp_dir/technician.json")" == "technician" ]] || die "technician account did not receive the technician role"
[[ "$(jq -r '.user.role' "$tmp_dir/manager.json")" == "manager" ]] || die "manager account did not receive the manager role"

pilot_org="$(jq -r '.organization.id // empty' "$tmp_dir/owner.json")"
[[ -n "$pilot_org" ]] || die "owner bootstrap did not include a company"
[[ "$(jq -r '.organization.id // empty' "$tmp_dir/technician.json")" == "$pilot_org" ]] || die "technician is not in the pilot company"
[[ "$(jq -r '.organization.id // empty' "$tmp_dir/manager.json")" == "$pilot_org" ]] || die "manager is not in the pilot company"
[[ "$(jq -r '.organization.id // empty' "$tmp_dir/outsider.json")" != "$pilot_org" ]] || die "company isolation failed: outsider resolved to the pilot company"

# Optional fixture overrides must identify existing records in the owner bootstrap.
# No data is created, updated, or deleted by this check.
case_id="${FAULTCITE_ACCEPTANCE_CASE_ID:-$(jq -r '.cases[0].id // empty' "$tmp_dir/owner.json")}"
manual_id="${FAULTCITE_ACCEPTANCE_MANUAL_ID:-$(jq -r '.manuals[0].id // empty' "$tmp_dir/owner.json")}"
valid_id() { [[ "$1" =~ ^[A-Za-z0-9_-]{1,128}$ ]]; }
valid_id "$case_id" || die "provide an existing pilot case with saved events (FAULTCITE_ACCEPTANCE_CASE_ID)"
valid_id "$manual_id" || die "provide an existing pilot PDF (FAULTCITE_ACCEPTANCE_MANUAL_ID)"
jq -e --arg id "$case_id" 'any(.cases[]; .id == $id)' "$tmp_dir/owner.json" >/dev/null || die "case fixture is not in the owner bootstrap"
jq -e --arg id "$manual_id" 'any(.manuals[]; .id == $id)' "$tmp_dir/owner.json" >/dev/null || die "manual fixture is not in the owner bootstrap"

[[ "$(fetch "$FAULTCITE_OWNER_TOKEN" "/api/cases/$case_id/evidence" "$tmp_dir/evidence.json")" == 200 ]] || die "owner evidence listing must return HTTP 200"
evidence_id="${FAULTCITE_ACCEPTANCE_EVIDENCE_ID:-$(jq -r '.evidence[0].id // empty' "$tmp_dir/evidence.json")}"
valid_id "$evidence_id" || die "provide existing saved case evidence (FAULTCITE_ACCEPTANCE_EVIDENCE_ID)"
jq -e --arg id "$evidence_id" 'any(.evidence[]; .id == $id)' "$tmp_dir/evidence.json" >/dev/null || die "evidence fixture is not attached to the selected case"

assert_isolated() {
  local label="$1" path="$2" status
  # A denied nonexistent object is not evidence of tenant isolation: prove the
  # same exact object is available to its owner immediately before the denial.
  [[ "$(fetch "$FAULTCITE_OWNER_TOKEN" "$path" "$tmp_dir/fixture")" == 200 ]] || die "$label owner positive control must return HTTP 200"
  [[ -s "$tmp_dir/fixture" ]] || die "$label owner positive control returned an empty body"
  status="$(fetch "$FAULTCITE_OUTSIDER_TOKEN" "$path" "$tmp_dir/denial")"
  [[ "$status" == 403 || "$status" == 404 ]] || die "$label outsider access must return HTTP 403 or 404"
  printf '%s existing-object tenant isolation passed.\n' "$label"
}

assert_isolated 'Case timeline' "/api/cases/$case_id/events"
assert_isolated 'Manual PDF' "/api/manuals/$manual_id"
assert_isolated 'Evidence file' "/api/evidence/$evidence_id"
printf 'Staging distinct-user, role, company, and read-only object-isolation checks passed. Continue the human workflow checklist before cutover.\n'
