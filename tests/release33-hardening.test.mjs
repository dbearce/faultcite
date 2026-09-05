import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Stripe webhook state is ordered and duplicate-safe", async () => {
  const [route, schema, migration] = await Promise.all([
    read("../app/api/webhooks/stripe/route.ts"),
    read("../db/schema.ts"),
    read("../drizzle/0025_stripe_webhook_ordering.sql"),
  ]);
  assert.match(route, /event\.created/);
  assert.match(route, /stripeEventCreatedAt/);
  assert.match(route, /onConflictDoNothing/);
  assert.match(schema, /stripeEventCreatedAt/);
  assert.match(schema, /stripeEventId/);
  assert.match(migration, /stripe_event_created_at/);
  assert.match(migration, /stripe_event_id/);
});

test("standalone sign-in provides recovery paths without an open sign-up action", async () => {
  const [page, widget, css] = await Promise.all([
    read("../app/sign-in/page.tsx"),
    read("../app/sign-in/clerk-sign-in.tsx"),
    read("../app/globals.css"),
  ]);
  for (const text of ["Back to FaultCite", "Request access", "Get help"]) assert.match(page, new RegExp(text));
  assert.match(widget, /footerAction: "faultcite-clerk-hidden"/);
  assert.match(widget, /headerTitle: "faultcite-clerk-hidden"/);
  assert.match(css, /\.faultcite-clerk-hidden\{display:none!important\}/);
});

test("public surfaces publish crawler and security-contact policies", async () => {
  const [appRobots, appSecurity, siteSecurity] = await Promise.all([
    read("../public/robots.txt"),
    read("../public/.well-known/security.txt"),
    read("../website/.well-known/security.txt"),
  ]);
  assert.match(appRobots, /Disallow: \//);
  assert.match(appSecurity, /Canonical: https:\/\/app\.faultcite\.com/);
  assert.match(siteSecurity, /Canonical: https:\/\/faultcite\.com/);
});
