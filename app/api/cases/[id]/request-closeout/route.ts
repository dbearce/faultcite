import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, caseEvents, cases, organizations } from "../../../../../db/schema";
import { apiError, canModifyCase, cleanText, isErrorResponse, requireApiContext } from "../../../../../lib/backend";
import { notifyManagers } from "../../../../../lib/notifications";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return apiError("Invalid JSON request"); }
  const { id } = await params;
  const db = await getDb();
  let idempotencyKey: string; try { idempotencyKey = cleanText(body.idempotencyKey, 100, true)!; } catch { return apiError("A closeout request key is required"); }
  const [record] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Case not found in your company", 404);
  if (!canModifyCase(ctx, record)) return apiError("This case is assigned to another technician", 403);
  const [existing] = await db.select().from(caseEvents).where(and(eq(caseEvents.organizationId, ctx.organizationId), eq(caseEvents.caseId, id), eq(caseEvents.eventType, "closeout_requested"), eq(caseEvents.idempotencyKey, idempotencyKey))).limit(1);
  if (existing) return Response.json({ caseId: id, status: record.status, case: record, idempotentReplay: true });
  if (record.status === "closeout_requested") return Response.json({ caseId: id, status: record.status, case: record, idempotentReplay: true });
  if (record.status !== "cause_confirmed") return apiError("A manager-confirmed cause is required before closeout review", 409);

  try {
    const repairSummary = cleanText(body.repairSummary, 4000, true)!;
    const testCycles = cleanText(body.testCycles, 1000, true)!;
    const verificationReadings = cleanText(body.verificationReadings, 2000, true)!;
    const repairType = cleanText(body.repairType, 20, true)!;
    if (!["Permanent", "Temporary"].includes(repairType)) return apiError("Invalid repair status");
    if (body.safetyDevicesVerified !== true) return apiError("Safety-device verification is required before manager review");
    const followupWork = cleanText(body.followupWork, 3000);
    const restrictions = cleanText(body.operatingRestrictions, 2000);
    const expires = typeof body.temporaryExpiresAt === "string" && body.temporaryExpiresAt ? new Date(body.temporaryExpiresAt) : null;
    if (repairType === "Temporary" && (!followupWork || !restrictions || !expires || Number.isNaN(expires.valueOf()) || expires <= new Date())) return apiError("Temporary repairs require a future expiration, restrictions, and follow-up work");
    const failureCategory=cleanText(body.failureCategory,100);const laborMinutes=body.laborMinutes==null||body.laborMinutes===""?null:Number(body.laborMinutes);const partsCostCents=body.partsCostCents==null||body.partsCostCents===""?null:Number(body.partsCostCents);if(laborMinutes!==null&&(!Number.isInteger(laborMinutes)||laborMinutes<0||laborMinutes>1_000_000))return apiError("Labor minutes must be a nonnegative whole number");if(partsCostCents!==null&&(!Number.isInteger(partsCostCents)||partsCostCents<0||partsCostCents>100_000_000))return apiError("Parts cost must be a nonnegative amount in cents");
    const now = new Date();
    const [organization] = await db.select({ reviewSlaMinutes: organizations.reviewSlaMinutes }).from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1);
    const managerActionDueAt = new Date(now.getTime() + (organization?.reviewSlaMinutes || 60) * 60 * 1000);
    const casePatch = { status: "closeout_requested", failureCategory, laborMinutes, partsCostCents, repairSummary, repairType, partsUsed: cleanText(body.partsUsed, 1000), verificationReadings, testCycles, safetyDevicesVerified: true, temporaryExpiresAt: expires, operatingRestrictions: restrictions, followupWork, closeoutSubmittedByUserId: ctx.userId, managerActionDueAt, updatedAt: now };
    try {
      await db.batch([
        db.update(cases).set(casePatch).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId), eq(cases.status, "cause_confirmed"))),
        db.insert(caseEvents).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, caseId: id, actorUserId: ctx.userId, eventType: "closeout_requested", result: "manager_approval_required", notes: repairSummary, idempotencyKey }),
        db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "case.closeout_requested", entityType: "case", entityId: id, metadataJson: JSON.stringify({ repairType, closeoutSubmittedByUserId: ctx.userId, managerActionDueAt }), createdAt: now }),
      ]);
    } catch {
      const [replay] = await db.select().from(caseEvents).where(and(eq(caseEvents.organizationId, ctx.organizationId), eq(caseEvents.caseId, id), eq(caseEvents.eventType, "closeout_requested"), eq(caseEvents.idempotencyKey, idempotencyKey))).limit(1);
      if (replay) { const [current] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1); return Response.json({ caseId: id, status: current?.status || "closeout_requested", case: current || { ...record, ...casePatch }, idempotentReplay: true }); }
      return apiError("Case state changed before closeout review was saved. Refresh and review it again.", 409);
    }
    try{await notifyManagers({organizationId:ctx.organizationId,caseId:id,type:"closeout_requested",title:`${record.caseNumber} needs restart approval`,message:"Repair verification was submitted for manager closeout review.",dedupeKey:`closeout-requested:${idempotencyKey}`})}catch{}
    return Response.json({ caseId: id, status: "closeout_requested", case: { ...record, ...casePatch } });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Closeout review could not be requested"); }
}
