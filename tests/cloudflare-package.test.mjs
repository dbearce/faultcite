import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const configurations = [
  ["staging", "cloudflare/wrangler.staging.toml", "https://faultcite-staging.derekbearce.workers.dev"],
  ["production", "cloudflare/wrangler.production.toml", "https://app.faultcite.com"],
];

for (const [environment, path, origin] of configurations) {
  test(`${environment} Cloudflare configuration is route-free and Clerk-only`, async () => {
    const source = await readFile(path, "utf8");
    assert.match(source, /FAULTCITE_DEPLOYMENT_TARGET = "standalone"/);
    assert.match(source, /FAULTCITE_AUTH_PROVIDER = "clerk"/);
    assert.match(source, /FAULTCITE_RUNTIME = "standalone"/);
    assert.match(source, new RegExp(`CLERK_AUTHORIZED_PARTIES = "${origin.replaceAll(".", "\\.")}"`));
    assert.match(source, /binding = "DB"/);
    assert.match(source, /binding = "BUCKET"/);
    assert.match(source, /binding = "ASSETS"/);
    assert.doesNotMatch(source, /(^|\n)\s*routes?\s*=/);
    assert.doesNotMatch(source, /CLERK_SECRET_KEY|RESEND_API_KEY\s*=/);
  });
}

test("state-changing Cloudflare scripts require explicit confirmations", async () => {
  const expectations = new Map([
    ["cloudflare/scripts/deploy.sh", /DEPLOY-/],
    ["cloudflare/scripts/migrate.sh", /MIGRATE-/],
    ["cloudflare/scripts/backup.sh", /BACKUP-/],
    ["cloudflare/scripts/restore.sh", /RESTORE-staging/],
    ["cloudflare/scripts/rollback.sh", /ROLLBACK-/],
  ]);
  for (const [path, pattern] of expectations) {
    assert.match(await readFile(path, "utf8"), pattern, path);
  }
});

