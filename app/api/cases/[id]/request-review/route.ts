import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, caseEvents, cases } from "../../../../../db/schema";
import { apiError, isErrorResponse, requireApiContext } from "../../../../../lib/backend";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  const { id } = await params; const db = await getDb();
  const [record] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Case not found in your company", 404);
  if (record.status === "review_requested") return Response.json({ status: record.status, idempotentReplay: true });
  if (record.status !== "diagnosing") return apiError("This case is not ready for manager review", 409);
  const [observation] = await db.select().from(caseEvents).where(and(eq(caseEvents.caseId, id), eq(caseEvents.organizationId, ctx.organizationId), eq(caseEvents.eventType, "diagnostic_result"))).orderBy(desc(caseEvents.createdAt)).limit(1);
  if (!observation?.reading) return apiError("A recorded observation is required before manager review", 409);
  const eventId = crypto.randomUUID();
  const now = new Date();
  try { await db.batch([
    db.update(cases).set({ status: "review_requested", updatedAt: now }).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId), eq(cases.status, "diagnosing"))),
    db.insert(caseEvents).values({ id: eventId, organizationId: ctx.organizationId, caseId: id, actorUserId: ctx.userId, eventType: "review_requested", notes: "Manager cause review requested." }),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "case.review_requested", entityType: "case", entityId: id, metadataJson: JSON.stringify({ eventId }), createdAt: now }),
  ]); } catch {
    const [current] = await db.select({ status: cases.status }).from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
    if (current?.status === "review_requested") return Response.json({ status: current.status, idempotentReplay: true });
    return apiError("Case state changed before review was requested. Refresh and try again.", 409);
  }
  return Response.json({ status: "review_requested" });
}
