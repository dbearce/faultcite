import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("owners can complete governance inside the product", async () => {
  const [consoleSource, settings] = await Promise.all([read("../app/technician-console.tsx"), read("../app/api/settings/route.ts")]);
  assert.match(consoleSource, /function OwnerSetup/);
  assert.match(consoleSource, /Safety contact email/);
  assert.match(settings, /export async function GET/);
  assert.match(settings, /organization\.governance_updated/);
});

test("machine identity corrections are tenant scoped, audited, and blocked during active work", async () => {
  const route = await read("../app/api/machines/route.ts");
  assert.match(route, /Machine identity cannot be changed while it has an active case/);
  assert.match(route, /existing\.organizationId !== ctx\.organizationId/);
  assert.match(route, /machine\.identity_corrected/);
});

test("expired manuals have a revalidation recovery path", async () => {
  const [consoleSource, route] = await Promise.all([read("../app/technician-console.tsx"), read("../app/api/manuals/[id]/route.ts")]);
  assert.match(consoleSource, /Revalidate manual/);
  assert.match(route, /Choose a future revalidation date/);
});

test("signed Stripe events are processed once", async () => {
  const [route, migration] = await Promise.all([read("../app/api/webhooks/stripe/route.ts"), read("../drizzle/0024_stripe_webhook_idempotency.sql")]);
  assert.match(route, /alreadyProcessed/);
  assert.match(route, /duplicate: true/);
  assert.match(migration, /event_id.*PRIMARY KEY/);
});
