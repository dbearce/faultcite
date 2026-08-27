import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, caseEvents, cases, machines, memberships } from "../../../../../db/schema";
import { apiError, cleanText, isErrorResponse, readJsonObject, requireApiContext } from "../../../../../lib/backend";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Invalid JSON request");
  }

  const db = await getDb();
  const [record] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Case not found in your company", 404);
  let idempotencyKey: string; try { idempotencyKey = cleanText(body.idempotencyKey, 100, true)!; } catch { return apiError("A closeout request key is required"); }
  const [existingClose] = await db.select().from(caseEvents).where(and(eq(caseEvents.organizationId, ctx.organizationId), eq(caseEvents.caseId, id), eq(caseEvents.eventType, "case_closed"), eq(caseEvents.idempotencyKey, idempotencyKey))).limit(1);
  if (existingClose) return Response.json({ caseId: id, status: "closed", closedAt: record.closedAt, approvedBy: ctx.displayName, idempotentReplay: true });
  if (record.status !== "cause_confirmed") return apiError("A supported cause must be confirmed before closeout", 409);

  const [approver] = await db.select().from(memberships).where(and(eq(memberships.organizationId, ctx.organizationId), eq(memberships.userId, ctx.userId), eq(memberships.active, true))).limit(1);
  if (!approver || !["owner", "manager"].includes(approver.role)) return apiError("A signed-in manager or owner must approve restart", 403);

  try {
    const confirmedCause = record.confirmedCause;
    if (!confirmedCause) return apiError("The confirmed cause record is missing", 409);
    const repairSummary = cleanText(body.repairSummary, 4000, true)!;
    const testCycles = cleanText(body.testCycles, 1000, true)!;
    const repairType = cleanText(body.repairType, 20, true)!;
    if (!new Set(["Permanent", "Temporary"]).has(repairType)) return apiError("Invalid repair status");
    if (body.safetyDevicesVerified !== true || body.approvalConfirmed !== true) return apiError("Safety verification and authenticated approval are required");

    const followupWork = cleanText(body.followupWork, 3000);
    const restrictions = cleanText(body.operatingRestrictions, 2000);
    const expires = typeof body.temporaryExpiresAt === "string" ? new Date(body.temporaryExpiresAt) : null;
    if (repairType === "Temporary" && (!followupWork || !restrictions || !expires || Number.isNaN(expires.valueOf()) || expires <= new Date())) {
      return apiError("Temporary repairs require a future expiration, restrictions, and follow-up work");
    }

    const now = new Date();
    const followupId = repairType === "Temporary" ? crypto.randomUUID() : null;
    const followupNumber = followupId ? `FC-${now.getUTCFullYear()}-${followupId.slice(0, 8).toUpperCase()}` : null;
    const closeEventId = crypto.randomUUID();
    try { await db.batch([
      db.update(cases).set({ status: "closed", confirmedCause, repairSummary, repairType, partsUsed: cleanText(body.partsUsed, 1000), verificationReadings: cleanText(body.verificationReadings, 2000), testCycles, safetyDevicesVerified: true, temporaryExpiresAt: expires, operatingRestrictions: restrictions, followupWork, restartApprovedByUserId: ctx.userId, closedAt: now, updatedAt: now }).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId), eq(cases.status, "cause_confirmed"))),
      db.update(machines).set({ status: repairType === "Temporary" ? "attention" : "running", updatedAt: now }).where(and(eq(machines.id, record.machineId), eq(machines.organizationId, ctx.organizationId))),
      db.insert(caseEvents).values({ id: closeEventId, organizationId: ctx.organizationId, caseId: id, actorUserId: ctx.userId, eventType: "case_closed", result: "verified", notes: repairSummary, idempotencyKey, payloadJson: JSON.stringify({ repairType, approvedByRole: approver.role }) }),
      ...(followupId ? [
        db.insert(cases).values({ id: followupId, organizationId: ctx.organizationId, caseNumber: followupNumber!, machineId: record.machineId, openedByUserId: ctx.userId, assignedToUserId: ctx.userId, status: "open", symptom: "Permanent repair follow-up", alarmCode: null, precedingChange: `Temporary repair from ${record.caseNumber}`, notes: `Due ${expires!.toISOString()}. Restrictions: ${restrictions}. Required work: ${followupWork}` }),
        db.insert(caseEvents).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, caseId: followupId, actorUserId: ctx.userId, eventType: "followup_created", notes: followupWork, payloadJson: JSON.stringify({ sourceCaseId: id, expiresAt: expires!.toISOString(), restrictions }) }),
      ] : []),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "case.closed", entityType: "case", entityId: id, metadataJson: JSON.stringify({ repairType, restartApprovedByUserId: ctx.userId, followupCaseId: followupId, closeEventId }), createdAt: now }),
    ]); } catch {
      const [current] = await db.select({ status: cases.status, closedAt: cases.closedAt }).from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
      if (current?.status === "closed") return Response.json({ caseId: id, status: "closed", closedAt: current.closedAt, idempotentReplay: true });
      return apiError("Case state changed before closeout. Refresh and review it again.", 409);
    }
    return Response.json({ caseId: id, status: "closed", closedAt: now.toISOString(), approvedBy: ctx.displayName, followupCase: followupId ? { id: followupId, caseNumber: followupNumber } : null });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Invalid closeout request");
  }
}
