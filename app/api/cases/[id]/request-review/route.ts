import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, caseEvents, cases, organizations } from "../../../../../db/schema";
import { apiError, canModifyCase, isErrorResponse, requireApiContext } from "../../../../../lib/backend";
import { notifyManagers } from "../../../../../lib/notifications";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  const { id } = await params; const db = await getDb();
  const [record] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Case not found in your company", 404);
  if (!canModifyCase(ctx, record)) return apiError("This case is assigned to another technician", 403);
  if (record.status === "review_requested") return Response.json({ status: record.status, idempotentReplay: true });
  if (record.status !== "diagnosing") return apiError("This case is not ready for manager review", 409);
  const [observation] = await db.select().from(caseEvents).where(and(eq(caseEvents.caseId, id), eq(caseEvents.organizationId, ctx.organizationId), eq(caseEvents.eventType, "diagnostic_result"))).orderBy(desc(caseEvents.createdAt)).limit(1);
  if (!observation?.reading) return apiError("A recorded observation is required before manager review", 409);
  if (observation.result !== "Supports suspected cause") return apiError("The latest observation must support a named suspected cause before manager review", 409);
  let structured: { suspectedCause?: unknown; testPerformed?: unknown; expectedResult?: unknown };
  try { structured = JSON.parse(observation.payloadJson || "{}") as typeof structured; }
  catch { return apiError("The latest observation is missing its structured diagnostic record", 409); }
  if (![structured.suspectedCause, structured.testPerformed, structured.expectedResult].every(value => typeof value === "string" && value.trim())) return apiError("The latest observation must include the suspected cause, test performed, and expected result", 409);
  const eventId = crypto.randomUUID();
  const now = new Date();
  const [organization] = await db.select({ reviewSlaMinutes: organizations.reviewSlaMinutes }).from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1);
  const managerActionDueAt = new Date(now.getTime() + (organization?.reviewSlaMinutes || 60) * 60 * 1000);
  try { await db.batch([
    db.update(cases).set({ status: "review_requested", reviewRequestedAt: now, managerActionDueAt, updatedAt: now }).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId), eq(cases.status, "diagnosing"))),
    db.insert(caseEvents).values({ id: eventId, organizationId: ctx.organizationId, caseId: id, actorUserId: ctx.userId, eventType: "review_requested", notes: "Manager cause review requested." }),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "case.review_requested", entityType: "case", entityId: id, metadataJson: JSON.stringify({ eventId, managerActionDueAt }), createdAt: now }),
  ]); } catch {
    const [current] = await db.select({ status: cases.status }).from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
    if (current?.status === "review_requested") return Response.json({ status: current.status, idempotentReplay: true });
    return apiError("Case state changed before review was requested. Refresh and try again.", 409);
  }
  try { await notifyManagers({organizationId:ctx.organizationId,caseId:id,type:"review_requested",title:`${record.caseNumber} needs review`,message:"A technician submitted a supported observation for independent manager review.",dedupeKey:`review-requested:${eventId}`}); } catch {}
  return Response.json({ status: "review_requested", managerActionDueAt });
}
