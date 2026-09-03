import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLogs, caseEvents, cases } from "../../../../db/schema";
import { apiError, cleanText, isErrorResponse, requireApiContext } from "../../../../lib/backend";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return apiError("Invalid JSON request"); }

  const { id } = await params;
  const db = await getDb();
  const [record] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Case not found in your company", 404);
  if (!["open", "diagnosing"].includes(record.status)) return apiError("Intake can only be edited while a case is open or diagnosing", 409);
  if (ctx.role === "technician" && record.openedByUserId !== ctx.userId && record.assignedToUserId !== ctx.userId) return apiError("This case is assigned to another technician", 403);

  try {
    const symptom = cleanText(body.symptom, 160, true)!;
    const alarmCode = cleanText(body.alarmCode, 100, true)!;
    const precedingChange = cleanText(body.precedingChange, 1000);
    const notes = cleanText(body.notes, 4000);
    const now = new Date();
    const eventId = crypto.randomUUID();
    await db.batch([
      db.update(cases).set({ symptom, alarmCode, precedingChange, notes, updatedAt: now }).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId), inArray(cases.status, ["open", "diagnosing"]))),
      db.insert(caseEvents).values({ id: eventId, organizationId: ctx.organizationId, caseId: id, actorUserId: ctx.userId, eventType: "intake_updated", notes: "Failure intake corrected without replacing the saved case." }),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "case.intake_updated", entityType: "case", entityId: id, metadataJson: JSON.stringify({ eventId }), createdAt: now }),
    ]);
    const [saved] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
    if (!saved) return apiError("Case changed before the saved intake could be confirmed", 409);
    return Response.json({ case: saved });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Case intake could not be updated");
  }
}
