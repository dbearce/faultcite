#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"
config="${2:-}"
if [[ ! "${environment}" =~ ^(staging|production)$ || -z "${config}" ]]; then
  echo "usage: scripts/deploy-environment.sh <staging|production> <wrangler-config>" >&2
  exit 64
fi
[[ -f "${config}" ]] || { echo "Missing reviewed Wrangler config: ${config}" >&2; exit 66; }

if [[ "${CONFIRM_FAULTCITE_DEPLOY:-}" != "${environment}" ]]; then
  echo "Refusing deployment without CONFIRM_FAULTCITE_DEPLOY=${environment}" >&2
  exit 65
fi

node scripts/validate-deployment-config.mjs "${environment}" "${config}"
npx wrangler deploy --config "${config}"
node scripts/check-deployment.mjs "$(node -p "JSON.parse(require('fs').readFileSync('${config}','utf8')).vars.FAULTCITE_APP_ORIGIN")" "${environment}" "$(node -p "require('./package.json').version")"
