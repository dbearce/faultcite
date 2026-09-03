import { and, desc, eq, lt, notInArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, caseEvents, cases, machines } from "../../../db/schema";
import { apiError, cleanText, isErrorResponse, requireApiContext } from "../../../lib/backend";

export async function GET(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  const url = new URL(request.url);
  const rawBefore = url.searchParams.get("before");
  const beforeValue = rawBefore === null ? Date.now() : Number(rawBefore);
  if (!Number.isFinite(beforeValue) || beforeValue <= 0) return apiError("A valid repair-history cursor is required");
  const pageSize = 100;
  const activeStatuses = ["open", "diagnosing", "review_requested", "cause_confirmed", "closeout_requested", "escalated"];
  const rows = await (await getDb()).select().from(cases).where(and(eq(cases.organizationId, ctx.organizationId), notInArray(cases.status, activeStatuses), lt(cases.openedAt, new Date(beforeValue)))).orderBy(desc(cases.openedAt)).limit(pageSize + 1);
  return Response.json({ cases: rows.slice(0, pageSize), hasMore: rows.length > pageSize });
}

export async function POST(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  try {
    const body = await request.json() as Record<string, unknown>;
    const machineId = cleanText(body.machineId, 80, true)!;
    const db = await getDb();
    const [machine] = await db.select({ id: machines.id }).from(machines).where(and(eq(machines.id, machineId), eq(machines.organizationId, ctx.organizationId))).limit(1);
    if (!machine) return apiError("Machine not found in your company", 404);
    const activeStatuses = ["open", "diagnosing", "review_requested", "cause_confirmed", "closeout_requested", "escalated"];
    const existingCases = await db.select({ id: cases.id, caseNumber: cases.caseNumber, status: cases.status }).from(cases).where(and(eq(cases.machineId, machineId), eq(cases.organizationId, ctx.organizationId)));
    const active = existingCases.find(item => activeStatuses.includes(item.status));
    if (active) return apiError(`Machine already has active case ${active.caseNumber}`, 409);
    const id = crypto.randomUUID();
    const caseNumber = `FC-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
    const row = { id, organizationId: ctx.organizationId, caseNumber, machineId, openedByUserId: ctx.userId, assignedToUserId: ctx.userId, symptom: cleanText(body.symptom, 160, true)!, alarmCode: cleanText(body.alarmCode, 100), precedingChange: cleanText(body.precedingChange, 1000), notes: cleanText(body.notes, 4000), status: "open" };
    const now = new Date();
    try { await db.batch([
      db.insert(cases).values(row),
      db.insert(caseEvents).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, caseId: id, actorUserId: ctx.userId, eventType: "case_opened", notes: "Machine identity confirmed and failure captured." }),
      db.update(machines).set({ status: "down", updatedAt: now }).where(and(eq(machines.id, machineId), eq(machines.organizationId, ctx.organizationId))),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "case.created", entityType: "case", entityId: id, metadataJson: JSON.stringify({ caseNumber, machineId }), createdAt: now }),
    ]); } catch {
      const concurrentCases = await db.select({ id: cases.id, caseNumber: cases.caseNumber, status: cases.status }).from(cases).where(and(eq(cases.machineId, machineId), eq(cases.organizationId, ctx.organizationId)));
      const concurrent = concurrentCases.find(item => activeStatuses.includes(item.status));
      if (concurrent) return apiError(`Machine already has active case ${concurrent.caseNumber}`, 409);
      throw new Error("The case could not be created safely");
    }
    return Response.json({ case: row }, { status: 201 });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Invalid request"); }
}
