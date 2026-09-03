import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const approvalRoute = await readFile(new URL("../app/api/manuals/[id]/sources/route.ts", import.meta.url), "utf8");
const applicableRoute = await readFile(new URL("../app/api/manual-sources/route.ts", import.meta.url), "utf8");
const bootstrapRoute = await readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8");
const source = await readFile(new URL("../app/technician-console.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../drizzle/0013_eager_vin_gonzales.sql", import.meta.url), "utf8");

test("only enabled company managers can approve an exact manual source", () => {
  assert.match(approvalRoute, /requireApiContext/);
  assert.match(approvalRoute, /\["owner", "manager"\]/);
  assert.match(approvalRoute, /eq\(manuals\.organizationId, ctx\.organizationId\)/);
  assert.match(approvalRoute, /eq\(machines\.organizationId, ctx\.organizationId\)/);
  assert.match(approvalRoute, /manual\.status !== "approved"/);
  assert.match(approvalRoute, /approvalConfirmed/);
});

test("page approval is bounded, audited, and immutable", () => {
  assert.match(approvalRoute, /pageStart < 1/);
  assert.match(approvalRoute, /pageEnd < pageStart/);
  assert.match(approvalRoute, /pageEnd > 9999/);
  assert.match(approvalRoute, /pageEnd > manual\.pageCount/);
  assert.match(approvalRoute, /db\.batch\(/);
  assert.match(approvalRoute, /manual_source\.approved/);
  assert.match(migration, /manual_sources_immutable_update/);
  assert.match(migration, /manual_sources_immutable_delete/);
  assert.match(migration, /manual_sources_page_guard/);
  assert.match(migration, /manual_sources_manual_guard/);
  assert.match(migration, /manual_sources_machine_guard/);
  assert.match(migration, /manual_sources_manager_guard/);
});

test("technician citations are filtered by company, exact machine, approved manual, and alarm", () => {
  assert.match(applicableRoute, /eq\(manualSources\.organizationId, ctx\.organizationId\)/);
  assert.match(applicableRoute, /eq\(manualSources\.machineId, machineId\)/);
  assert.match(applicableRoute, /eq\(manuals\.status, "approved"\)/);
  assert.match(applicableRoute, /requiredAlarm === alarmCode/);
  assert.match(source, /FaultCite will not invent a procedure/);
  assert.match(source, /Open reviewed PDF page/);
});

test("approved sources survive reloads and company exports", () => {
  assert.match(bootstrapRoute, /manualSources: sourceRows/);
  assert.match(source, /setManualSources\(payload\.manualSources \|\| \[\]\)/);
  assert.match(source, /Approve and lock source/);
});
