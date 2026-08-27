import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { manuals } from "../../../../db/schema";
import { apiError, isErrorResponse, requireApiContext, writeAudit } from "../../../../lib/backend";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  const { id } = await params;
  const [manual] = await (await getDb()).select().from(manuals).where(and(eq(manuals.id, id), eq(manuals.organizationId, ctx.organizationId))).limit(1);
  if (!manual) return apiError("Manual not found in your company", 404);
  const { env } = await import("cloudflare:workers");
  const object = await env.BUCKET.get(manual.objectKey);
  if (!object) return apiError("Manual file is unavailable", 404);
  await writeAudit(ctx, "manual.viewed", "manual", manual.id);
  const fileName = manual.fileName.replace(/[\r\n\"]+/g, "_");
  return new Response(object.body, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${fileName}"`, "cache-control": "private, no-store", "content-security-policy": "sandbox", "x-content-type-options": "nosniff" } });
}
