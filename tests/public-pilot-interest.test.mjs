import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("public pilot interest is origin-limited, rate-limited, stored, and spam guarded", async () => {
  const [route, worker, migration, pilot] = await Promise.all([
    read("../app/api/pilot-interest/route.ts"), read("../worker/index.ts"),
    read("../drizzle/0023_public_pilot_interest.sql"), read("../website/pilot.html"),
  ]);
  assert.match(route, /origin !== MARKETING_ORIGIN/);
  assert.match(route, /rate_limit_buckets/);
  assert.match(route, /bucket\.count > 5/);
  assert.match(route, /form\.get\("website"\)/);
  assert.match(route, /INSERT INTO pilot_interest/);
  assert.match(route, /AbortSignal\.timeout\(10_000\)/);
  assert.match(worker, /publicPilotInterest/);
  assert.match(migration, /CREATE TABLE `pilot_interest`/);
  assert.match(pilot, /method="post"/);
  assert.match(pilot, /api\/pilot-interest/);
});
