import assert from "node:assert/strict";
import test from "node:test";
import { apiError, readJsonObject, requireBoundedUpload, serializeAuditMetadata } from "../lib/backend-safety.ts";

test("JSON request parsing accepts objects and rejects arrays and oversized payloads", async () => {
  const parsed = await readJsonObject(new Request("https://faultcite.test/api", {
    method: "POST",
    body: JSON.stringify({ assetNumber: "MC-101" }),
  }));
  assert.equal(parsed.assetNumber, "MC-101");

  await assert.rejects(
    readJsonObject(new Request("https://faultcite.test/api", { method: "POST", body: "[]" })),
    /JSON object/,
  );
  await assert.rejects(
    readJsonObject(new Request("https://faultcite.test/api", { method: "POST", body: JSON.stringify({ value: "x".repeat(100) }) }), 32),
    /too large/,
  );
});

test("audit metadata is bounded and redacts credentials recursively", () => {
  const metadata = serializeAuditMetadata({
    eventId: "event-1",
    authorization: "Bearer secret",
    nested: { apiKey: "secret", result: "ok" },
  });
  assert.ok(metadata);
  const parsed = JSON.parse(metadata);
  assert.equal(parsed.eventId, "event-1");
  assert.equal(parsed.authorization, "[redacted]");
  assert.equal(parsed.nested.apiKey, "[redacted]");
  assert.equal(parsed.nested.result, "ok");

  const bounded = serializeAuditMetadata({ value: "x".repeat(20_000) });
  assert.ok(bounded);
  assert.ok(new TextEncoder().encode(bounded).byteLength <= 8 * 1024);
  assert.equal(JSON.parse(bounded).value.length, 1_000);
});

test("API errors are never cacheable", () => {
  const response = apiError("Invalid request", 400);
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("multipart uploads require a bounded declared request size before parsing", () => {
  const missing = requireBoundedUpload(new Request("https://faultcite.test/api/upload", { method: "POST" }), 10 * 1024 * 1024);
  assert.equal(missing?.status, 411);

  const oversized = requireBoundedUpload(new Request("https://faultcite.test/api/upload", {
    method: "POST",
    headers: { "content-length": String(12 * 1024 * 1024) },
  }), 10 * 1024 * 1024);
  assert.equal(oversized?.status, 413);

  const accepted = requireBoundedUpload(new Request("https://faultcite.test/api/upload", {
    method: "POST",
    headers: { "content-length": String(10 * 1024 * 1024 + 512) },
  }), 10 * 1024 * 1024);
  assert.equal(accepted, null);
});
