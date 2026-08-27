import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [environment, configPath] = process.argv.slice(2);
if (!environment || !configPath || !["staging", "production"].includes(environment)) {
  console.error("usage: node scripts/validate-deployment-config.mjs <staging|production> <wrangler-config>");
  process.exit(64);
}

const expected = {
  staging: { origin: "https://staging.faultcite.com", domain: "staging.faultcite.com", worker: "faultcite-staging" },
  production: { origin: "https://app.faultcite.com", domain: "app.faultcite.com", worker: "faultcite-production" },
}[environment];
const config = JSON.parse(await readFile(resolve(configPath), "utf8"));

assert.equal(config.name, expected.worker, `expected Worker ${expected.worker}`);
assert.equal(config.vars?.FAULTCITE_APP_ORIGIN, expected.origin, `expected origin ${expected.origin}`);
assert.equal(config.vars?.FAULTCITE_ENVIRONMENT, environment, `expected environment ${environment}`);
assert.match(config.vars?.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "", /^pk_(test|live)_\S+$/, "missing Clerk publishable key");
assert.match(config.vars?.FAULTCITE_FROM_EMAIL || "", /^[^\r\n<>]+<[^\r\n<>\s]+@faultcite\.com>$/, "from-address must use faultcite.com");

const database = (config.d1_databases || []).find(item => item.binding === "DB");
const bucket = (config.r2_buckets || []).find(item => item.binding === "BUCKET");
assert.ok(database, "DB binding is missing");
assert.match(database.database_name || "", new RegExp(environment), "D1 database is not environment-isolated");
assert.match(database.database_id || "", /^[0-9a-f]{32}$/i, "D1 database ID is missing or invalid");
assert.ok(bucket, "BUCKET binding is missing");
assert.match(bucket.bucket_name || "", new RegExp(environment), "R2 bucket is not environment-isolated");
assert.equal(config.observability?.enabled, true, "Worker observability must be enabled");
assert.deepEqual(config.routes, [{ pattern: expected.domain, custom_domain: true }], `expected custom domain ${expected.domain}`);

const configDirectory = dirname(resolve(configPath));
assert.equal(typeof config.main, "string", "Worker main entry is missing");
assert.equal(typeof config.assets?.directory, "string", "Worker assets directory is missing");
await access(resolve(configDirectory, config.main));
await access(resolve(configDirectory, config.assets.directory));

for (const secretName of ["CLERK_SECRET_KEY", "RESEND_API_KEY"]) {
  assert.equal(Object.hasOwn(config.vars || {}, secretName), false, `${secretName} must be stored as a Worker secret`);
}

console.log(`Validated reviewed ${environment} deployment config: ${resolve(configPath)}`);
