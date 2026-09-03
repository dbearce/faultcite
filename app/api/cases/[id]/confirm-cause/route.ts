import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, caseEvents, caseEvidence, cases } from "../../../../../db/schema";
import { apiError, cleanText, isErrorResponse, requireApiContext } from "../../../../../lib/backend";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required to confirm a cause", 403);
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return apiError("Invalid JSON request"); }
  try {
    const supportingEventId = cleanText(body.supportingEventId, 80, true)!; const { id } = await params; const db = await getDb();
    const [record] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
    if (!record) return apiError("Case not found in your company", 404);
    if (record.status !== "review_requested") return apiError("A technician must request manager review before the cause can be confirmed", 409);
    const [latestCheck] = await db.select().from(caseEvents).where(and(eq(caseEvents.caseId, id), eq(caseEvents.organizationId, ctx.organizationId), eq(caseEvents.eventType, "diagnostic_result"))).orderBy(desc(caseEvents.createdAt)).limit(1);
    if (!latestCheck || latestCheck.id !== supportingEventId || latestCheck.result !== "Supports suspected cause") return apiError("The latest recorded observation must support the suspected cause", 409);
    if (latestCheck.actorUserId === ctx.userId) return apiError("A different authenticated manager must review the technician's observation", 409);
    const evidenceRows = await db.select({ id: caseEvidence.id }).from(caseEvidence).where(and(eq(caseEvidence.caseId, id), eq(caseEvidence.organizationId, ctx.organizationId), inArray(caseEvidence.kind, ["alarm_screen", "diagnostic_observation"])));
    const evidenceExceptionReason = cleanText(body.evidenceExceptionReason, 500);
    if (!evidenceRows.length && (!evidenceExceptionReason || evidenceExceptionReason.length < 20)) return apiError("Attach case evidence or record why file evidence is not applicable", 409);
    if (body.reviewConfirmed !== true) return apiError("Confirm that you reviewed the observation and supporting evidence or exception");
    let suspectedCause = "";
    try { suspectedCause = cleanText((JSON.parse(latestCheck.payloadJson || "{}") as { suspectedCause?: unknown }).suspectedCause, 500, true)!; }
    catch { return apiError("The supporting observation does not contain a named suspected cause", 409); }
    const eventId = crypto.randomUUID();
    const now = new Date();
    try { await db.batch([
      db.update(cases).set({ status: "cause_confirmed", confirmedCause: suspectedCause, managerActionDueAt: null, updatedAt: now }).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId), eq(cases.status, record.status))),
      db.insert(caseEvents).values({ id: eventId, organizationId: ctx.organizationId, caseId: id, actorUserId: ctx.userId, eventType: "cause_confirmed", result: "manager_reviewed", notes: suspectedCause, payloadJson: JSON.stringify({ supportingEventId, evidenceIds: evidenceRows.map(item => item.id), evidenceExceptionReason: evidenceExceptionReason || null, reviewerUserId: ctx.userId }) }),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "case.cause_confirmed", entityType: "case", entityId: id, metadataJson: JSON.stringify({ eventId, supportingEventId, suspectedCause, evidenceIds: evidenceRows.map(item => item.id), evidenceExceptionReason: evidenceExceptionReason || null }), createdAt: now }),
    ]); } catch {
      const [current] = await db.select({ status: cases.status }).from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
      if (current?.status === "cause_confirmed") return Response.json({ status: current.status, idempotentReplay: true });
      return apiError("Case state changed before the cause was confirmed. Refresh and review it again.", 409);
    }
    return Response.json({ status: "cause_confirmed", confirmedBy: ctx.displayName, confirmedCause: suspectedCause, supportingEventId });
  } catch (error) { return apiError(error instanceof Error && error.message === "A required field is missing." ? "A supporting observation is required" : "The cause could not be confirmed"); }
}
