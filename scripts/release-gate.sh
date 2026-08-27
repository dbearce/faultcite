#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
cd "${project_root}"

echo "[1/7] Validating release package"
node scripts/validate-release-package.mjs
echo "[2/7] Scanning release inputs for secrets"
node scripts/scan-release-secrets.mjs
echo "[3/7] Linting"
npm run lint
echo "[4/7] Building and validating the Worker artifact"
npm run build
echo "[5/7] Running automated tests"
node --test tests/*.test.mjs
echo "[6/7] Validating bundled runtime dependencies and auditing production dependencies"
npm run validate:runtime-dependencies
npm audit --omit=dev --audit-level=high
echo "[7/7] Rechecking artifact after the full gate"
npm run validate:artifact
echo "FaultCite release gate passed. Live staging/browser/account acceptance remains a separate manual gate."
