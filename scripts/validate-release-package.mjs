import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const required = [
  "package.json", "package-lock.json", ".env.example", "README.md",
  "FAULTCITE_RELEASE_STATUS.md", "RELEASE_NOTES_0.3.3.md", "TOMORROW_SALE_READINESS.md", "OPERATIONS_RUNBOOK.md", "PILOT_ACCEPTANCE.md",
  "app/legal-links.tsx", "app/privacy/page.tsx", "app/terms/page.tsx", "app/support/page.tsx", "lib/release.ts",
  "deploy/staging.example.json", "deploy/production.example.json",
  "scripts/apply-migrations.sh", "scripts/rollback-deployment.sh",
  "scripts/deploy-environment.sh", "scripts/check-deployment.mjs",
  "scripts/validate-deployment-config.mjs", "scripts/validate-artifact.sh",
];
for (const path of required) await access(join(root, path));

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
assert.equal(pkg.name, "faultcite");
assert.equal(lock.packages?.[""]?.version, pkg.version, "package-lock root version must match package version");
assert.equal(lock.packages?.[""]?.name, pkg.name, "package-lock root name must match package name");
assert.match(pkg.engines?.node || "", /22/, "release must pin the supported Node major");
assert.equal(pkg.version, "0.3.3", "release package must be version 0.3.3");
for (const dependency of ["react", "react-dom", "react-server-dom-webpack"]) {
  const declared = pkg.dependencies?.[dependency] || pkg.devDependencies?.[dependency];
  assert.equal(declared, "19.2.8", `${dependency} must be pinned to the reviewed security release`);
  assert.equal(lock.packages?.[`node_modules/${dependency}`]?.version, "19.2.8", `${dependency} lock entry must match`);
}

const migrations = (await readdir(join(root, "drizzle"))).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
assert.deepEqual(migrations, [
  "0000_hard_lethal_legion.sql",
  "0001_parallel_captain_america.sql",
  "0002_same_kabuki.sql",
  "0003_curved_kinsey_walden.sql",
  "0004_faultcite_pilot_invariants.sql",
  "0005_invitation_expiry.sql",
  "0006_clerk_identity_binding.sql",
  "0007_case_machine_tenant_guard.sql",
]);

for (const environment of ["staging", "production"]) {
  const config = JSON.parse(await readFile(join(root, `deploy/${environment}.example.json`), "utf8"));
  assert.equal(config.environment, environment);
  assert.ok(config.workerName.includes(environment));
  assert.ok(config.databaseName.includes(environment));
  assert.ok(config.bucketName.includes(environment));
  assert.ok(config.databaseId.startsWith("REPLACE_"), `${environment} template must not contain a real database ID`);
  assert.ok(config.clerkPublishableKey.startsWith("REPLACE_"), `${environment} template must not contain a real Clerk key`);
  assert.equal(config.fromEmail, "FaultCite <invites@faultcite.com>");
  assert.equal(config.customDomain, environment === "staging" ? "staging.faultcite.com" : "app.faultcite.com");
}

const forbiddenNames = [".env", ".dev.vars", "wrangler.toml", "id_rsa", "id_ed25519"];
for (const name of forbiddenNames) {
  try {
    await access(join(root, name));
    throw new Error(`release root contains forbidden local credential/config file: ${name}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
console.log(`Release package validation passed: ${required.length} handoff files and ${migrations.length} ordered migrations verified.`);
