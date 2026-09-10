import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [policy, nextConfig, worker, billingStatus, stripe, requestEnv, billing, readiness, stagingConfig, productionConfig] = await Promise.all([
  read("../lib/security-headers.ts"),
  read("../next.config.ts"),
  read("../worker/index.ts"),
  read("../app/api/billing/status/route.ts"),
  read("../lib/stripe-billing.ts"),
  read("../lib/request-env.ts"),
  read("../app/api/billing/route.ts"),
  read("../app/api/readiness/route.ts"),
  read("../cloudflare/wrangler.staging.toml"),
  read("../cloudflare/wrangler.production.toml"),
]);

test("uses one complete application security policy at the framework and edge layers", () => {
  assert.match(nextConfig, /APP_SECURITY_HEADERS/);
  assert.match(nextConfig, /source: "\/:path\*"/);
  assert.match(worker, /applyAppSecurityHeaders\(secured\.headers\)/);
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ]) assert.match(policy, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const header of [
    "Content-Security-Policy",
    "Origin-Agent-Cluster",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Permitted-Cross-Domain-Policies",
  ]) assert.match(policy, new RegExp(header));
  assert.doesNotMatch(policy, /unsafe-eval/);
});

test("documents the temporary inline-script exception required by vinext", () => {
  assert.match(policy, /vinext currently emits inline bootstrap scripts/);
  assert.match(policy, /script-src 'self' 'unsafe-inline'/);
});

test("exposes an owner-authorized billing status compatibility route", () => {
  assert.match(billingStatus, /export \{ GET \} from "\.\.\/route"/);
});

test("keeps paid billing disabled until an explicit launch switch and all credentials are present", () => {
  assert.match(requestEnv, /FAULTCITE_PAID_BILLING_ENABLED\?: string/);
  assert.match(worker, /FAULTCITE_PAID_BILLING_ENABLED\?: string/);
  assert.match(stripe, /FAULTCITE_PAID_BILLING_ENABLED/);
  assert.match(stripe, /=== "true"/);
  assert.match(stripe, /Boolean\(enabled && secretKey && priceId && webhookSecret\)/);
  assert.match(billing, /if \(!config\.configured\)/);
  assert.match(readiness, /paidBillingConfigured=stripeBillingConfig\(\)\.configured/);
  assert.match(readiness, /complete:paidBillingConfigured&&org\?\.subscriptionStatus==="active"/);
  assert.match(stagingConfig, /FAULTCITE_PAID_BILLING_ENABLED = "false"/);
  assert.match(productionConfig, /FAULTCITE_PAID_BILLING_ENABLED = "false"/);
});
