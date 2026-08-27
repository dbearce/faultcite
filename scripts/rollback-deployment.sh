#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"
config="${2:-}"
version_id="${3:-}"
if [[ ! "${environment}" =~ ^(staging|production)$ || -z "${config}" || -z "${version_id}" ]]; then
  echo "usage: scripts/rollback-deployment.sh <staging|production> <wrangler-config> <version-id>" >&2
  exit 64
fi
if [[ "${CONFIRM_FAULTCITE_ROLLBACK:-}" != "${environment}:${version_id}" ]]; then
  echo "Refusing rollback without CONFIRM_FAULTCITE_ROLLBACK=${environment}:${version_id}" >&2
  exit 65
fi

node scripts/validate-deployment-config.mjs "${environment}" "${config}"
npx wrangler rollback "${version_id}" --config "${config}" --message "FaultCite ${environment} rollback"
