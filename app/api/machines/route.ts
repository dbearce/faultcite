import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, cases, machines } from "../../../db/schema";
import { apiError, cleanText, isErrorResponse, requireApiContext } from "../../../lib/backend";

export async function GET() {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  return Response.json({ machines: await (await getDb()).select().from(machines).where(eq(machines.organizationId, ctx.organizationId)) });
}

export async function POST(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!['owner','manager'].includes(ctx.role)) return apiError("Manager permission required", 403);
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = crypto.randomUUID();
    const row = { id, organizationId: ctx.organizationId, assetNumber: cleanText(body.assetNumber, 80, true)!, manufacturer: cleanText(body.manufacturer, 100, true)!, model: cleanText(body.model, 120, true)!, serialNumber: cleanText(body.serialNumber, 120), control: cleanText(body.control, 120), location: cleanText(body.location, 160), status: "running" };
    const db = await getDb(); const now = new Date();
    await db.batch([
      db.insert(machines).values(row),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "machine.created", entityType: "machine", entityId: id, metadataJson: JSON.stringify({ assetNumber: row.assetNumber }), createdAt: now }),
    ]);
    return Response.json({ machine: row }, { status: 201 });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Invalid request"); }
}

export async function PATCH(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return apiError("Invalid JSON request"); }
  const id = cleanText(body.id, 80, true)!;
  const db = await getDb();
  const [existing] = await db.select().from(machines).where(eq(machines.id, id)).limit(1);
  if (!existing || existing.organizationId !== ctx.organizationId) return apiError("Machine not found", 404);
  const next = {
    assetNumber: cleanText(body.assetNumber, 80, true)!, manufacturer: cleanText(body.manufacturer, 100, true)!,
    model: cleanText(body.model, 120, true)!, serialNumber: cleanText(body.serialNumber, 120),
    control: cleanText(body.control, 120), location: cleanText(body.location, 160), updatedAt: new Date(),
  };
  const changed = Object.entries(next).some(([key, value]) => key !== "updatedAt" && value !== existing[key as keyof typeof existing]);
  if (!changed) return Response.json({ machine: existing });
  const [activeCase] = await db.select({ id: cases.id }).from(cases).where(and(eq(cases.organizationId, ctx.organizationId), eq(cases.machineId, id), inArray(cases.status, ["open", "diagnosing", "review_requested", "cause_confirmed", "closeout_requested", "escalated"]))).limit(1);
  if (activeCase) return apiError("Machine identity cannot be changed while it has an active case", 409);
  await db.batch([
    db.update(machines).set(next).where(eq(machines.id, id)),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "machine.identity_corrected", entityType: "machine", entityId: id, metadataJson: JSON.stringify({ before: { assetNumber: existing.assetNumber, manufacturer: existing.manufacturer, model: existing.model, serialNumber: existing.serialNumber, control: existing.control, location: existing.location }, after: next }), createdAt: new Date() }),
  ]);
  return Response.json({ machine: { ...existing, ...next } });
}
