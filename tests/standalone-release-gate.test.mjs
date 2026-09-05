import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

async function applyMigrations(db) {
  const directory = new URL("../drizzle/", import.meta.url);
  const names = (await readdir(directory))
    .filter(name => /^\d{4}.*\.sql$/.test(name))
    .sort();
  for (const name of names) {
    const sql = await readFile(new URL(name, directory), "utf8");
    for (const statement of sql
      .split("--> statement-breakpoint")
      .map(value => value.trim())
      .filter(Boolean)) db.exec(statement);
  }
}

test("Clerk identity bindings are unique and immutable in the database", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  await applyMigrations(db);
  const now = Date.now();
  db.prepare("INSERT INTO users (id,email,display_name,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("user-a", "owner@example.test", "Owner", now, now);
  db.prepare("INSERT INTO users (id,email,display_name,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("user-b", "tech@example.test", "Tech", now, now);
  db.prepare("INSERT INTO auth_identities (id,provider,provider_subject,user_id,verified_email,created_at) VALUES (?,?,?,?,?,?)")
    .run("identity-a", "clerk", "clerk-user-a", "user-a", "owner@example.test", now);

  assert.throws(
    () => db.prepare("UPDATE auth_identities SET user_id='user-b' WHERE id='identity-a'").run(),
    /auth identity mappings are immutable/,
  );
  assert.throws(
    () => db.prepare("DELETE FROM auth_identities WHERE id='identity-a'").run(),
    /auth identity mappings are immutable/,
  );
  assert.throws(
    () => db.prepare("INSERT INTO auth_identities (id,provider,provider_subject,user_id,verified_email,created_at) VALUES (?,?,?,?,?,?)")
      .run("identity-b", "clerk", "clerk-user-a", "user-b", "tech@example.test", now),
    /UNIQUE constraint failed/,
  );
});

test("standalone configuration is route-free, fail-closed, and uses fixed Clerk parties", async () => {
  const [auth, staging, production, check] = await Promise.all([
    read("../app/auth.ts"),
    read("../cloudflare/wrangler.staging.toml"),
    read("../cloudflare/wrangler.production.toml"),
    read("../cloudflare/scripts/check.sh"),
  ]);
  for (const config of [staging, production]) {
    assert.match(config, /FAULTCITE_RUNTIME = "standalone"/);
    assert.match(config, /FAULTCITE_AUTH_PROVIDER = "clerk"/);
    assert.doesNotMatch(config, /(^|\n)\s*routes?\s*=/);
    assert.doesNotMatch(config, /CLERK_SECRET_KEY\s*=/);
    assert.doesNotMatch(config, /RESEND_API_KEY\s*=/);
  }
  assert.match(staging, /CLERK_AUTHORIZED_PARTIES = "https:\/\/faultcite-staging\.derekbearce\.workers\.dev"/);
  assert.match(auth, /if \(!secretKey \|\| !publishableKey\) return null/);
  assert.match(auth, /clerk\.authenticateRequest\(request/);
  assert.doesNotMatch(auth, /x-forwarded-host/);
  assert.doesNotMatch(auth, /requestHeaders\.get\("host"\)/);
  assert.match(check, /routes are forbidden|must remain route-free/);
});

test("staging acceptance and artifact packaging gates are executable", async () => {
  const [packageJson, validator, smoke, acceptance] = await Promise.all([
    read("../package.json"),
    read("../scripts/validate-artifact.sh"),
    read("../cloudflare/scripts/smoke.sh"),
    read("../cloudflare/scripts/acceptance.sh"),
  ]);
  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.scripts["cf:acceptance"], "bash cloudflare/scripts/acceptance.sh");
  assert.match(validator, /0025_stripe_webhook_ordering\.sql/);
  assert.match(smoke, /forged ChatGPT identity was rejected/);
  for (const role of ["OWNER", "TECHNICIAN", "MANAGER", "OUTSIDER"]) {
    assert.match(acceptance, new RegExp(`FAULTCITE_${role}_TOKEN`));
  }
  assert.match(acceptance, /company isolation/i);
});
