import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, caseEvents, cases, machines } from "../../../../../db/schema";
import { apiError, cleanText, isErrorResponse, requireApiContext } from "../../../../../lib/backend";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required to resolve an escalation", 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return apiError("Invalid JSON request"); }

  let action: string; let notes: string; let idempotencyKey: string;
  try {
    action = cleanText(body.action, 30, true)!;
    notes = cleanText(body.notes, 2000, true)!;
    idempotencyKey = cleanText(body.idempotencyKey, 100, true)!;
  } catch { return apiError("Resolution action, manager notes, and request key are required"); }
  if (!["return_to_diagnosis", "cancel_without_restart"].includes(action)) return apiError("Invalid escalation resolution");
  const { id } = await params;
  const db = await getDb();
  const organizationId = ctx.organizationId;
  async function replayResolution(eventType: string) {
    const [currentCase] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, organizationId))).limit(1);
    if (!currentCase) return apiError("Case not found in your company", 404);
    const [currentMachine] = await db.select({ status: machines.status }).from(machines).where(and(eq(machines.id, currentCase.machineId), eq(machines.organizationId, organizationId))).limit(1);
    const historicalStatus = eventType === "escalation_returned" ? "diagnosing" : "canceled";
    return Response.json({ caseId: id, status: currentCase.status || historicalStatus, machineStatus: currentMachine?.status || (historicalStatus === "diagnosing" ? "down" : "attention"), idempotentReplay: true });
  }
  const [existing] = await db.select().from(caseEvents).where(and(eq(caseEvents.organizationId, ctx.organizationId), eq(caseEvents.caseId, id), eq(caseEvents.idempotencyKey, idempotencyKey))).limit(1);
  if (existing && ["escalation_returned", "case_canceled"].includes(existing.eventType)) {
    return replayResolution(existing.eventType);
  }
  const [record] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Case not found in your company", 404);
  if (record.status !== "escalated") return apiError("Only an escalated case can use this manager resolution", 409);

  const status = action === "return_to_diagnosis" ? "diagnosing" : "canceled";
  const eventType = action === "return_to_diagnosis" ? "escalation_returned" : "case_canceled";
  const now = new Date();
  try {
    await db.batch([
      db.update(cases).set({ status, updatedAt: now }).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId), eq(cases.status, "escalated"))),
      db.update(machines).set({ status: action === "return_to_diagnosis" ? "down" : "attention", updatedAt: now }).where(and(eq(machines.id, record.machineId), eq(machines.organizationId, ctx.organizationId))),
      db.insert(caseEvents).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, caseId: id, actorUserId: ctx.userId, eventType, result: action, notes, idempotencyKey }),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: `case.${eventType}`, entityType: "case", entityId: id, metadataJson: JSON.stringify({ notes }), createdAt: now }),
    ]);
  } catch {
    const [replay] = await db.select().from(caseEvents).where(and(eq(caseEvents.organizationId, ctx.organizationId), eq(caseEvents.caseId, id), eq(caseEvents.idempotencyKey, idempotencyKey))).limit(1);
    if (replay && ["escalation_returned", "case_canceled"].includes(replay.eventType)) return replayResolution(replay.eventType);
    return apiError("The escalation changed before the manager resolution was saved. Refresh and review it again.", 409);
  }
  return Response.json({ caseId: id, status, machineStatus: action === "return_to_diagnosis" ? "down" : "attention" });
}
