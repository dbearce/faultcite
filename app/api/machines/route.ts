import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, machines } from "../../../db/schema";
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
