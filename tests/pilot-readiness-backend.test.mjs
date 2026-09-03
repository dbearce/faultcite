import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("timeline endpoint reports missing persisted history instead of a false empty state", async () => {
  const route = await read("../app/api/cases/[id]/events/route.ts");
  assert.match(route, /if \(!events\.length\) return apiError/);
  assert.match(route, /saved case timeline is unavailable/i);
  assert.match(route, /eventCount:events\.length/);
  assert.match(route, /private, no-store/);
});

test("technician submission and manager approval duties stay separate", async () => {
  const review = await read("../app/api/cases/[id]/request-review/route.ts");
  const closeout = await read("../app/api/cases/[id]/request-closeout/route.ts");
  const confirm = await read("../app/api/cases/[id]/confirm-cause/route.ts");
  const close = await read("../app/api/cases/[id]/close/route.ts");
  assert.doesNotMatch(review, /ctx\.role !== "technician"/);
  assert.doesNotMatch(closeout, /ctx\.role !== "technician"/);
  assert.match(review, /canModifyCase\(ctx, record\)/);
  assert.match(closeout, /canModifyCase\(ctx, record\)/);
  assert.match(confirm, /\["owner", "manager"\]\.includes\(ctx\.role\)/);
  assert.match(confirm, /latestCheck\.actorUserId === ctx\.userId/);
  assert.match(close, /\["owner", "manager"\]\.includes\(approver\.role\)/);
  assert.match(close, /record\.closeoutSubmittedByUserId === ctx\.userId/);
});

test("manager review requires a complete supporting observation and governed evidence", async () => {
  const review = await read("../app/api/cases/[id]/request-review/route.ts");
  const confirm = await read("../app/api/cases/[id]/confirm-cause/route.ts");
  assert.match(review, /observation\.result !== "Supports suspected cause"/);
  for (const field of ["suspectedCause", "testPerformed", "expectedResult"]) assert.match(review, new RegExp(`structured\\.${field}`));
  assert.match(confirm, /inArray\(caseEvidence\.kind, \["alarm_screen", "diagnostic_observation"\]\)/);
  assert.match(confirm, /evidenceExceptionReason\.length < 20/);
});

test("manual approval blocks incomplete or expired governance", async () => {
  const route = await read("../app/api/manuals/[id]/route.ts");
  assert.match(route, /status === "approved"/);
  assert.match(route, /!manual\.rightsConfirmed/);
  assert.match(route, /!manual\.pageCount/);
  assert.match(route, /!manual\.documentOwnerUserId/);
  assert.match(route, /manual\.revalidationDueAt\.valueOf\(\) <= Date\.now\(\)/);
});

test("closeout uses the company SLA and overdue manager alerts are deduplicated", async () => {
  const closeout = await read("../app/api/cases/[id]/request-closeout/route.ts");
  const close = await read("../app/api/cases/[id]/close/route.ts");
  const notifications = await read("../app/api/notifications/route.ts");
  assert.match(closeout, /organizations\.reviewSlaMinutes/);
  assert.match(closeout, /managerActionDueAt/);
  assert.match(close, /managerActionDueAt: null/);
  assert.match(notifications, /manager_action_overdue/);
  assert.match(notifications, /manager-action-overdue:/);
  assert.match(notifications, /onConflictDoNothing\(\)/);
});
