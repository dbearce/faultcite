import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, caseEvents, cases } from "../../../../../db/schema";
import { apiError, cleanText, isErrorResponse, readJsonObject, requireApiContext } from "../../../../../lib/backend";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required to confirm a cause", 403);
  let body: Record<string, unknown>; try { body = await readJsonObject(request); } catch (error) { return apiError(error instanceof Error ? error.message : "Invalid JSON request"); }
  try {
    const reason = cleanText(body.reason, 2000, true)!; const { id } = await params; const db = await getDb();
    const [record] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
    if (!record) return apiError("Case not found in your company", 404);
    if (!['open','diagnosing','review_requested'].includes(record.status)) return apiError("This case cannot be confirmed in its current state", 409);
    const [supportingCheck] = await db.select().from(caseEvents).where(and(eq(caseEvents.caseId, id), eq(caseEvents.organizationId, ctx.organizationId), eq(caseEvents.eventType, "diagnostic_result"), eq(caseEvents.result, "Supports suspected cause"))).orderBy(desc(caseEvents.createdAt)).limit(1);
    if (!supportingCheck) return apiError("A recorded observation supporting the suspected cause is required", 409);
    const eventId = crypto.randomUUID();
    const now = new Date();
    try { await db.batch([
      db.update(cases).set({ status: "cause_confirmed", confirmedCause: reason, updatedAt: now }).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId), eq(cases.status, record.status))),
      db.insert(caseEvents).values({ id: eventId, organizationId: ctx.organizationId, caseId: id, actorUserId: ctx.userId, eventType: "cause_confirmed", result: "manager_reviewed", notes: reason, payloadJson: JSON.stringify({ humanOverride: true, sourceStatus: "unindexed_pilot" }) }),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "case.cause_confirmed", entityType: "case", entityId: id, metadataJson: JSON.stringify({ eventId, humanOverride: true }), createdAt: now }),
    ]); } catch {
      const [current] = await db.select({ status: cases.status }).from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
      if (current?.status === "cause_confirmed") return Response.json({ status: current.status, idempotentReplay: true });
      return apiError("Case state changed before the cause was confirmed. Refresh and review it again.", 409);
    }
    return Response.json({ status: "cause_confirmed", confirmedBy: ctx.displayName, reason });
  } catch (error) { return apiError(error instanceof Error && error.message === "A required field is missing." ? "A confirmation reason is required" : "The cause could not be confirmed"); }
}
