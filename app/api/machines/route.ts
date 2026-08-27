import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, machines } from "../../../db/schema";
import { apiError, cleanText, isErrorResponse, readJsonObject, requireApiContext } from "../../../lib/backend";

export async function GET() {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  return Response.json({ machines: await (await getDb()).select().from(machines).where(eq(machines.organizationId, ctx.organizationId)).limit(500) });
}

export async function POST(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!['owner','manager'].includes(ctx.role)) return apiError("Manager permission required", 403);
  try {
    const body = await readJsonObject(request);
    const assetNumber = cleanText(body.assetNumber, 80);
    const manufacturer = cleanText(body.manufacturer, 100);
    const model = cleanText(body.model, 120);
    if (!assetNumber || !manufacturer || !model) return apiError("Asset number, manufacturer, and model are required");
    const db = await getDb();
    const [existing] = await db.select({ id: machines.id }).from(machines).where(and(eq(machines.organizationId, ctx.organizationId), eq(machines.assetNumber, assetNumber))).limit(1);
    if (existing) return apiError("That asset number is already registered in this company.", 409);
    const id = crypto.randomUUID();
    const row = { id, organizationId: ctx.organizationId, assetNumber, manufacturer, model, serialNumber: cleanText(body.serialNumber, 120), control: cleanText(body.control, 120), location: cleanText(body.location, 160), status: "running" };
    await db.batch([
      db.insert(machines).values(row),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "machine.created", entityType: "machine", entityId: id, metadataJson: JSON.stringify({ assetNumber: row.assetNumber }) }),
    ]);
    return Response.json({ machine: row }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && /JSON|too large/i.test(error.message))) return apiError(error.message);
    return apiError("The machine could not be saved safely. Try again.", 500);
  }
}
