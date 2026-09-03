import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [consoleSource, uploadRoute, approvalRoute, deleteRoute, bootstrapRoute, casesRoute, healthRoute, schema] = await Promise.all([
  read("app/technician-console.tsx"),
  read("app/api/manuals/route.ts"),
  read("app/api/manuals/[id]/sources/route.ts"),
  read("app/api/manuals/[id]/route.ts"),
  read("app/api/bootstrap/route.ts"),
  read("app/api/cases/route.ts"),
  read("app/api/health/route.ts"),
  read("db/schema.ts"),
]);

test("diagnostic guidance reflects approved sources applicable to the current case", () => {
  assert.match(consoleSource, /const applicableSources = useMemo/);
  assert.match(consoleSource, /source\.machineId !== machineId/);
  assert.match(consoleSource, /manual\.id === source\.manualId && manual\.status === "approved"/);
  assert.match(consoleSource, /sources=\{applicableSources\}/);
  assert.match(consoleSource, /APPROVED SOURCE AVAILABLE/);
  assert.match(consoleSource, /View approved sources/);
});

test("uploaded PDFs receive a parsed page count used to bound approvals", () => {
  assert.match(uploadRoute, /PDFDocument\.load/);
  assert.match(uploadRoute, /pdf\.getPageCount\(\)/);
  assert.match(schema, /pageCount: integer\("page_count"\)/);
  assert.match(approvalRoute, /pageEnd > manual\.pageCount/);
  assert.match(consoleSource, /PDF pages verified/);
});

test("source approval enforces exact registered machine applicability", () => {
  assert.match(approvalRoute, /manual\.manufacturer/);
  assert.match(approvalRoute, /machine\.manufacturer/);
  assert.match(approvalRoute, /manual\.model/);
  assert.match(approvalRoute, /machine\.model/);
  assert.match(approvalRoute, /manual\.serialApplicability/);
  assert.match(approvalRoute, /machine\.serialNumber/);
  assert.match(approvalRoute, /These exact pages are already approved for this machine/);
});

test("manual deletion checks immutable approved sources before file deletion", () => {
  const guardIndex = deleteRoute.indexOf("if (approvedSource)");
  const deleteIndex = deleteRoute.indexOf("env.BUCKET.delete");
  assert.ok(guardIndex >= 0 && deleteIndex > guardIndex);
});

test("manager invitations and case history stay bounded", () => {
  assert.match(consoleSource, /workspaceRole === "owner" && <option value="manager">Manager \/ approver<\/option>/);
  assert.match(bootstrapRoute, /limit\(historyPageSize \+ 1\)/);
  assert.match(casesRoute, /lt\(cases\.openedAt, new Date\(beforeValue\)\)/);
  assert.match(consoleSource, /Load older repair history/);
});

test("health reports database and file storage independently", () => {
  assert.match(healthRoute, /Promise\.allSettled/);
  assert.match(healthRoute, /database\.status === "fulfilled"/);
  assert.match(healthRoute, /fileStorage\.status === "fulfilled"/);
});
