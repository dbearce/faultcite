import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8");

test("company export is authenticated, manager-only, tenant-scoped, and non-cacheable", () => {
  assert.match(route, /requireApiContext/);
  assert.match(route, /owner.*manager/);
  assert.match(route, /Manager permission required/);
  for (const table of ["machines", "cases", "caseEvents", "auditLogs"]) {
    assert.match(route, new RegExp(`eq\\(${table}\\.organizationId, ctx\\.organizationId\\)`));
  }
  assert.match(route, /private, no-store/);
  assert.match(route, /organization\.exported/);
});
