#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
hosting="${SITES_PROJECT_ROOT}/dist/.openai/hosting.json"
governance_migration="${SITES_PROJECT_ROOT}/dist/.openai/drizzle/0027_governance_acknowledgement_evidence.sql"
latest_migration="${SITES_PROJECT_ROOT}/dist/.openai/drizzle/0028_manual_source_revocation_guard.sql"

[[ -f "${worker}" ]] || {
  echo "Missing Sites Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${hosting}" ]] || {
  echo "Missing packaged Sites manifest: dist/.openai/hosting.json" >&2
  exit 66
}
[[ -f "${governance_migration}" ]] || {
  echo "Missing packaged FaultCite governance migration" >&2
  exit 66
}
[[ -f "${latest_migration}" ]] || {
  echo "Missing packaged latest FaultCite schema migration" >&2
  exit 66
}

node --input-type=module - "${SITES_PROJECT_ROOT}/dist" <<'NODE'
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.argv[2];
const forbidden = /cnc[ -]?medic|\/workspace\/|\bCM-[0-9]/i;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(path);
    } else if (forbidden.test(await readFile(path, "utf8"))) {
      throw new Error(`Packaged release contains retired content: ${path}`);
    }
  }
}
await scan(root);
NODE

node --input-type=module - "${worker}" "${hosting}" <<'NODE'
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [workerPath, hostingPath] = process.argv.slice(2);
JSON.parse(await readFile(hostingPath, "utf8"));

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
}
NODE

echo "Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present."
