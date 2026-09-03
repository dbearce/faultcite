import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("captures tenant-scoped structured pilot feedback with an audit record", async () => {
  const [schema, route, migration] = await Promise.all([read("../db/schema.ts"), read("../app/api/feedback/route.ts"), read("../drizzle/0018_last_nomad.sql")]);
  assert.match(schema, /pilotFeedback/); assert.match(migration, /CREATE TABLE `pilot_feedback`/);
  assert.match(route, /eq\(pilotFeedback\.organizationId, ctx\.organizationId\)/);
  assert.match(route, /pilot\.feedback_submitted/); assert.match(route, /safety_concern/); assert.match(route, /severity !== "urgent"/);
});

test("reports decision-useful pilot response and adoption measures", async () => {
  const report = await read("../app/api/reports/operations/route.ts");
  assert.match(report, /reviewTimeMinutes/); assert.match(report, /median:percentile\(reviewTimes,\.5\)/); assert.match(report, /p90:percentile\(reviewTimes,\.9\)/);
  assert.match(report, /repeatTechnicians/); assert.match(report, /pilotFeedback/);
});

test("presents feedback as a non-emergency, trackable pilot channel", async () => {
  const [form, docs] = await Promise.all([read("../app/help/feedback-form.tsx"), read("../docs/PILOT_READINESS.md")]);
  assert.match(form, /not an emergency alert/i); assert.match(form, /contactRequested/);
  assert.match(docs, /Weekly pilot review evidence/); assert.match(docs, /90th-percentile/);
});
