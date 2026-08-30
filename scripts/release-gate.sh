#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
cd "${project_root}"

echo "[1/8] Validating release package"
node scripts/validate-release-package.mjs
echo "[2/8] Scanning release inputs for secrets"
node scripts/scan-release-secrets.mjs
echo "[3/8] Validating public website"
node scripts/validate-website.mjs
echo "[4/8] Linting"
npm run lint
echo "[5/8] Building and validating the Worker artifact"
npm run build
echo "[6/8] Running automated tests"
node --experimental-strip-types --test tests/*.test.mjs
echo "[7/8] Validating bundled runtime dependencies and auditing production dependencies"
npm run validate:runtime-dependencies
npm audit --omit=dev --audit-level=high
echo "[8/8] Rechecking artifact after the full gate"
npm run validate:artifact
echo "FaultCite release gate passed. Live staging/browser/account acceptance remains a separate manual gate."
