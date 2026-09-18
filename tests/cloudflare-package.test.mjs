import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const configurations = [
  ["staging", "cloudflare/wrangler.staging.toml", "https://staging.faultcite.com"],
  ["production", "cloudflare/wrangler.production.toml", "https://app.faultcite.com"],
];

for (const [environment, path, origin] of configurations) {
  test(`${environment} Cloudflare configuration uses only its approved hostname and Clerk`, async () => {
    const source = await readFile(path, "utf8");
    assert.match(source, /FAULTCITE_DEPLOYMENT_TARGET = "standalone"/);
    assert.match(source, /FAULTCITE_AUTH_PROVIDER = "clerk"/);
    assert.match(source, /FAULTCITE_RUNTIME = "standalone"/);
    assert.match(source, new RegExp(`CLERK_AUTHORIZED_PARTIES = "${origin.replaceAll(".", "\\.")}"`));
    assert.match(source, /binding = "DB"/);
    assert.match(source, /binding = "BUCKET"/);
    assert.match(source, /binding = "ASSETS"/);
    assert.match(source, /^workers_dev = false$/m);
    assert.match(source, /^preview_urls = false$/m);
    if (environment === "staging") {
      assert.match(source, /\[\[routes\]\]\npattern = "staging\.faultcite\.com"\ncustom_domain = true/);
      assert.equal((source.match(/\[\[routes\]\]/g) || []).length, 1);
    } else {
      assert.doesNotMatch(source, /(^|\n)\s*routes?\s*=/);
      assert.doesNotMatch(source, /\[\[routes\]\]/);
    }
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

test("staging deploy uploads through a guarded route-free temporary config", async () => {
  const source = await readFile("cloudflare/scripts/deploy.sh", "utf8");
  assert.match(source, /if \[\[ "\$environment" == "staging" \]\]; then/);
  assert.match(source, /mktemp --suffix=\.toml cloudflare\/\.wrangler\.staging\.deploy\.XXXXXX/);
  assert.match(source, /\^\\\[\\\[routes\\\]\\\]\$/);
  assert.match(source, /pattern\|custom_domain/);
  assert.match(source, /database_id = "0a9b513b-1067-4939-81b4-4fe9c01b8dd9"/);
  assert.match(source, /bucket_name = "faultcite-staging-files"/);
  assert.match(source, /FAULTCITE_PAID_BILLING_ENABLED = "false"/);
  assert.match(source, /FAULTCITE_APP_ORIGIN = "https:\/\/staging\.faultcite\.com"/);
  assert.match(source, /CLERK_AUTHORIZED_PARTIES = "https:\/\/staging\.faultcite\.com"/);
  assert.match(source, /workers_dev = false/);
  assert.match(source, /preview_urls = false/);
  assert.match(source, /wrangler deploy --config "\$deploy_config" --keep-vars --strict/);
  assert.match(source, /optional deploy mode must be --dry-run/);
  assert.equal((source.match(/deploy_config="\$config"/g) || []).length, 1);
});

test("production deployment is backup-first, route-free, billing-disabled, and DNS-preserving", async () => {
  const source = await readFile(".github/workflows/deploy-cloudflare-production.yml", "utf8");
  const backup = source.indexOf("Create production recovery bookmark before changes");
  const migration = source.indexOf("Apply pending production D1 migrations");
  const deploy = source.indexOf("Deploy FaultCite 0.3.9 to production");
  assert.ok(backup > -1 && backup < migration && migration < deploy);
  assert.match(source, /confirmation == 'DEPLOY-production'/);
  assert.match(source, /FAULTCITE_PAID_BILLING_ENABLED.*text == "false"/);
  assert.match(source, /wrangler d1 time-travel info DB/);
  assert.match(source, /cmp "\$RUNNER_TEMP\/production-dns-before\.json" "\$RUNNER_TEMP\/production-dns-after\.json"/);
  assert.match(source, /cmp "\$RUNNER_TEMP\/production-domains-before\.json" "\$RUNNER_TEMP\/production-domains-after\.json"/);
  assert.doesNotMatch(source, /--request\s+(?:POST|PUT|PATCH|DELETE)/);
});
