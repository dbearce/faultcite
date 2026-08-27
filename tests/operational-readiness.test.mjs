import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const health = await readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
const artifactValidator = await readFile(new URL("../scripts/validate-artifact.sh", import.meta.url), "utf8");
const migrations = await readFile(new URL("../scripts/apply-migrations.sh", import.meta.url), "utf8");
const rollback = await readFile(new URL("../scripts/rollback-deployment.sh", import.meta.url), "utf8");
const deployCheck = await readFile(new URL("../scripts/check-deployment.mjs", import.meta.url), "utf8");
const deploy = await readFile(new URL("../scripts/deploy-environment.sh", import.meta.url), "utf8");
const configValidator = await readFile(new URL("../scripts/validate-deployment-config.mjs", import.meta.url), "utf8");
const prepare = await readFile(new URL("../scripts/prepare-deployment.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const staging = JSON.parse(await readFile(new URL("../deploy/staging.example.json", import.meta.url), "utf8"));
const production = JSON.parse(await readFile(new URL("../deploy/production.example.json", import.meta.url), "utf8"));

test("health checks D1 and R2 without exposing provider errors", () => {
  assert.match(health, /SELECT 1 AS ok/);
  assert.match(health, /BUCKET\.list\(\{ limit: 1 \}\)/);
  assert.match(health, /status: healthy \? "ok" : "degraded"/);
  assert.match(health, /status: healthy \? 200 : 503/);
  assert.match(health, /cache-control": "no-store"/);
  assert.doesNotMatch(health, /error\.message|String\(error\)|stack/);
});

test("staging and production resource templates are isolated", () => {
  assert.equal(staging.environment, "staging");
  assert.equal(staging.appOrigin, "https://staging.faultcite.com");
  assert.equal(staging.customDomain, "staging.faultcite.com");
  assert.match(staging.databaseName, /staging/);
  assert.match(staging.bucketName, /staging/);
  assert.equal(production.environment, "production");
  assert.equal(production.appOrigin, "https://app.faultcite.com");
  assert.equal(production.customDomain, "app.faultcite.com");
  assert.match(production.databaseName, /production/);
  assert.match(production.bucketName, /production/);
  assert.notEqual(staging.databaseName, production.databaseName);
  assert.notEqual(staging.bucketName, production.bucketName);
});

test("remote operational scripts require explicit safety confirmations", () => {
  assert.match(migrations, /CONFIRM_FAULTCITE_MIGRATIONS/);
  assert.match(migrations, /d1 migrations apply DB --remote/);
  assert.match(rollback, /CONFIRM_FAULTCITE_ROLLBACK/);
  assert.match(rollback, /wrangler rollback/);
  assert.match(deploy, /CONFIRM_FAULTCITE_DEPLOY/);
  assert.match(deploy, /validate-deployment-config/);
  assert.doesNotMatch(pkg.scripts["deploy:staging"], /dist\/server\/wrangler\.json/);
  assert.match(pkg.scripts["deploy:staging"], /\.release\/staging\/wrangler\.json/);
});

test("artifact and post-deploy checks reject placeholder releases", () => {
  assert.match(artifactValidator, /Hello World!/);
  assert.match(artifactValidator, /observability/);
  assert.match(artifactValidator, /faultcite-staging/);
  assert.match(deployCheck, /Health response was not JSON/);
  assert.match(deployCheck, /Placeholder Worker is still deployed/);
  assert.match(deployCheck, /checks\?\.database/);
  assert.match(deployCheck, /checks\?\.objectStorage/);
  assert.match(deployCheck, /health\.release !== expectedRelease/);
  assert.match(deployCheck, /health\.environment !== expectedEnvironment/);
  assert.match(configValidator, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  assert.match(configValidator, /FAULTCITE_FROM_EMAIL/);
  assert.match(configValidator, /database_id/);
  assert.match(configValidator, /configDirectory/);
  assert.match(configValidator, /config\.main/);
  assert.match(configValidator, /config\.assets\.directory/);
  assert.match(prepare, /relative\(dirname\(destination\)/);
  assert.match(prepare, /relativePath\("dist\/server\/index\.js"\)/);
  assert.match(prepare, /relativePath\("dist\/client"\)/);
  assert.match(prepare, /custom_domain: true/);
});
