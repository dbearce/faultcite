#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"
config="${2:-}"
if [[ ! "${environment}" =~ ^(staging|production)$ || -z "${config}" ]]; then
  echo "usage: scripts/apply-migrations.sh <staging|production> <wrangler-config>" >&2
  exit 64
fi
[[ -f "${config}" ]] || { echo "Missing Wrangler config: ${config}" >&2; exit 66; }

if [[ "${CONFIRM_FAULTCITE_MIGRATIONS:-}" != "${environment}" ]]; then
  echo "Refusing remote migration without CONFIRM_FAULTCITE_MIGRATIONS=${environment}" >&2
  exit 65
fi

node scripts/validate-deployment-config.mjs "${environment}" "${config}"
echo "Applying tracked FaultCite migrations to ${environment}..."
npx wrangler d1 migrations apply DB --remote --config "${config}" --migrations-dir drizzle
echo "All pending FaultCite migrations applied to ${environment}."
