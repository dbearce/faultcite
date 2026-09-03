import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [backend, team, chunk, finalize, evidence, exportRoute, schema, migration, worker] = await Promise.all([
  read("../lib/backend.ts"), read("../app/api/team/route.ts"), read("../app/api/manuals/upload-chunk/route.ts"),
  read("../app/api/manuals/finalize-upload/route.ts"), read("../app/api/cases/[id]/evidence/route.ts"),
  read("../app/api/export/route.ts"), read("../db/schema.ts"), read("../drizzle/0017_faultcite_abuse_controls.sql"), read("../worker/index.ts"),
]);

test("persists distributed application rate limits for sensitive operations", () => {
  assert.match(schema, /rateLimitBuckets/);
  assert.match(migration, /CREATE TABLE `rate_limit_buckets`/);
  assert.match(backend, /Too many requests/);
  assert.match(backend, /"retry-after"/);
  assert.match(backend, /const nowMs = now\.getTime\(\)/);
  assert.match(backend, /const resetAtMs = resetAt\.getTime\(\)/);
  assert.doesNotMatch(backend, /resetAt} <= \$\{now}/);
  assert.match(team, /enforceRateLimit\(ctx, "team-invitation"/);
  assert.match(exportRoute, /enforceRateLimit\(ctx,"organization-export"/);
  assert.match(evidence, /enforceRateLimit\(ctx, "evidence-upload"/);
});

test("binds chunked manual uploads to expiring user sessions and company quotas", () => {
  assert.match(schema, /manualUploadSessions/);
  assert.match(migration, /CREATE TABLE `manual_upload_sessions`/);
  assert.match(chunk, /eq\(manualUploadSessions\.userId, ctx\.userId\)/);
  assert.match(chunk, /reserveStorage/);
  assert.match(chunk, /2 \* 60 \* 60 \* 1000/);
  assert.match(chunk, /BUCKET\.list/);
  assert.match(finalize, /session\.expiresAt <= new Date\(\)/);
  assert.match(finalize, /session\.totalChunks !== totalChunks/);
});

test("removes eval from CSP and adds cross-origin isolation headers", () => {
  assert.doesNotMatch(worker, /script-src[^;]*unsafe-eval/);
  assert.match(worker, /cross-origin-opener-policy/);
  assert.match(worker, /cross-origin-resource-policy/);
});
