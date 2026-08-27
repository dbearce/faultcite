#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
wrangler_config="${SITES_PROJECT_ROOT}/dist/server/wrangler.json"

[[ -f "${worker}" ]] || {
  echo "Missing Cloudflare Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${wrangler_config}" ]] || {
  echo "Missing packaged Cloudflare config: dist/server/wrangler.json" >&2
  exit 66
}

node --input-type=module - "${worker}" "${wrangler_config}" <<'NODE'
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [workerPath, configPath] = process.argv.slice(2);
const config = JSON.parse(await readFile(configPath, "utf8"));
if (config.name !== "faultcite-staging") {
  throw new Error("Packaged build must default to the isolated faultcite-staging Worker");
}
const d1Bindings = (config.d1_databases || []).map(item => item.binding);
const r2Bindings = (config.r2_buckets || []).map(item => item.binding);
if (!d1Bindings.includes("DB") || !r2Bindings.includes("BUCKET")) {
  throw new Error("Packaged Cloudflare config must include DB and BUCKET bindings");
}
if (config.observability?.enabled !== true) {
  throw new Error("Cloudflare Worker observability must be enabled");
}
for (const secretName of ["CLERK_SECRET_KEY", "RESEND_API_KEY"]) {
  if (Object.hasOwn(config.vars || {}, secretName)) throw new Error(`${secretName} must be a Worker secret, not a plain variable`);
}

const workerSource = await readFile(workerPath, "utf8");
if (/Hello World!/.test(workerSource)) throw new Error("Placeholder Worker content detected in release artifact");

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("cloudflare-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
}
NODE

echo "Validated Cloudflare artifact: app Worker, staging isolation, observability, and DB/BUCKET bindings are present."
