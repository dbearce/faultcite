import assert from "node:assert/strict";
import test from "node:test";
import {
  enforceRateLimit,
  rejectCrossSiteMutation,
  resetRateLimitsForTests,
} from "../lib/security/api-protection.ts";

test("mutating API requests require the configured same origin", async () => {
  process.env.FAULTCITE_APP_ORIGIN = "https://staging.faultcite.com";
  assert.equal(rejectCrossSiteMutation(new Request("https://staging.faultcite.com/api/cases", { method: "GET" })), null);
  assert.equal(rejectCrossSiteMutation(new Request("https://staging.faultcite.com/api/cases", { method: "POST", headers: { origin: "https://staging.faultcite.com", "sec-fetch-site": "same-origin" } })), null);
  assert.equal(rejectCrossSiteMutation(new Request("https://staging.faultcite.com/api/cases", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }))?.status, 403);
  assert.equal(rejectCrossSiteMutation(new Request("https://staging.faultcite.com/api/cases", { method: "POST" }))?.status, 403);
});

test("API rate limiter separates reads and writes and returns Retry-After", () => {
  resetRateLimitsForTests();
  const request = new Request("https://staging.faultcite.com/api/cases", { method: "POST", headers: { "cf-connecting-ip": "192.0.2.1" } });
  for (let index = 0; index < 40; index += 1) assert.equal(enforceRateLimit(request, 1_000), null);
  const blocked = enforceRateLimit(request, 1_000);
  assert.equal(blocked?.status, 429);
  assert.equal(blocked?.headers.get("retry-after"), "60");
});
