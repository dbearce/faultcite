import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Clerk is the sole session authority and handshake redirects are document-only", async () => {
  const auth = await read("../app/auth.ts");
  assert.match(auth, /isDocumentRequest/);
  assert.match(auth, /requestState\.status === "handshake" && isDocumentRequest/);
  assert.doesNotMatch(auth, /isExpiredJwt/);
  assert.doesNotMatch(auth, /Buffer\.from/);
});

test("Clerk browser recovery clears false timeouts and retries one expired API token", async () => {
  const signIn = await read("../app/sign-in/clerk-sign-in.tsx");
  const bridge = await read("../app/clerk-session-bridge.tsx");
  assert.match(signIn, /loadingTimeoutRef/);
  assert.match(signIn, /Try sign-in again/);
  assert.match(bridge, /clerkReady = null/);
  assert.match(bridge, /response\.status !== 401/);
  assert.match(bridge, /getToken\(\{ skipCache: true \}\)/);
  assert.match(bridge, /x-faultcite-auth-retry/);
});

test("repair submission supports an authorized owner or manager acting as technician without self-approval", async () => {
  const review = await read("../app/api/cases/[id]/request-review/route.ts");
  const closeout = await read("../app/api/cases/[id]/request-closeout/route.ts");
  const confirm = await read("../app/api/cases/[id]/confirm-cause/route.ts");
  const close = await read("../app/api/cases/[id]/close/route.ts");
  assert.doesNotMatch(review, /ctx\.role !== "technician"/);
  assert.doesNotMatch(closeout, /ctx\.role !== "technician"/);
  assert.match(review, /canModifyCase\(ctx, record\)/);
  assert.match(closeout, /canModifyCase\(ctx, record\)/);
  assert.match(confirm, /latestCheck\.actorUserId === ctx\.userId/);
  assert.match(close, /record\.closeoutSubmittedByUserId === ctx\.userId/);
  assert.match(close, /\["owner", "manager"\]\.includes\(approver\.role\)/);
});

test("production responses carry a release and request correlation id with structured failure logs", async () => {
  const worker = await read("../worker/index.ts");
  const health = await read("../app/api/health/route.ts");
  const packageJson = JSON.parse(await read("../package.json"));
  assert.match(worker, /requestId = request\.headers\.get\("cf-ray"\) \|\| crypto\.randomUUID\(\)/);
  assert.match(worker, /\[faultcite-runtime\] unhandled request failure/);
  assert.match(worker, /x-faultcite-request-id/);
  assert.match(worker, /x-faultcite-release", "0\.3\.5"/);
  assert.match(health, /release: "0\.3\.5"/);
  assert.equal(packageJson.version, "0.3.5");
});

test("billing is owner-only, server-priced, fail-closed, and uses signed raw-body webhooks", async () => {
  const billing = await read("../app/api/billing/route.ts");
  const webhook = await read("../app/api/webhooks/stripe/route.ts");
  const stripe = await read("../lib/stripe-billing.ts");
  const worker = await read("../worker/index.ts");
  const schema = await read("../db/schema.ts");
  const ui = await read("../app/technician-console.tsx");
  assert.match(billing, /ctx\.role !== "owner"/);
  assert.match(billing, /enforceRateLimit\(ctx, "billing-session"/);
  assert.match(billing, /if \(!config\.configured\)/);
  assert.match(billing, /"line_items\[0\]\[price\]": config\.priceId!/);
  assert.doesNotMatch(billing, /body\.price/);
  assert.ok(webhook.indexOf("request.text()") < webhook.indexOf("JSON.parse(rawBody)"));
  assert.ok(webhook.indexOf("verifyStripeSignature") < webhook.indexOf("JSON.parse(rawBody)"));
  assert.match(stripe, /Math\.abs\(Date\.now\(\) \/ 1000 - Number\(timestamp\)\) > 300/);
  assert.match(stripe, /constantTimeEqual/);
  assert.match(worker, /signedWebhook = url\.pathname === "\/api\/webhooks\/stripe"/);
  for (const field of ["stripeCustomerId", "stripeSubscriptionId", "subscriptionUpdatedAt"]) assert.match(schema, new RegExp(field));
  assert.match(ui, /workspaceRole==="owner"&&<BillingPanel/);
  assert.match(ui, /destination\.hostname\.endsWith\("\.stripe\.com"\)/);
});
