import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("manager cause confirmation enforces independent review and evidence governance", async () => {
  const route = await read("../app/api/cases/[id]/confirm-cause/route.ts");
  assert.match(route, /record\.status !== "review_requested"/);
  assert.match(route, /latestCheck\.actorUserId === ctx\.userId/);
  assert.match(route, /alarm_screen/);
  assert.match(route, /diagnostic_observation/);
  assert.match(route, /evidenceExceptionReason\.length < 20/);
  assert.match(route, /body\.reviewConfirmed !== true/);
});

test("manual citations require current approved governance", async () => {
  const sourceRoute = await read("../app/api/manual-sources/route.ts");
  const approvalRoute = await read("../app/api/manuals/[id]/sources/route.ts");
  assert.match(sourceRoute, /gt\(manuals\.revalidationDueAt, new Date\(\)\)/);
  assert.match(approvalRoute, /must be revalidated before exact pages can be approved/);
});

test("owner readiness distinguishes healthy warning and danger states", async () => {
  const consoleSource = await read("../app/technician-console.tsx");
  const css = await read("../app/impact.css");
  assert.match(consoleSource, /data-tone=\{m\.tone\}/);
  assert.match(consoleSource, /closed\.length===1\?"case":"cases"/);
  assert.match(css, /data-tone="danger"/);
  assert.doesNotMatch(consoleSource, /Unsafe-output incidents/);
});
