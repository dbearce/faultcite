import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { caseEvidence } from "../../../../db/schema";
import { apiError, isErrorResponse, requireApiContext } from "../../../../lib/backend";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  const { id } = await params; const db = await getDb();
  const [record] = await db.select().from(caseEvidence).where(and(eq(caseEvidence.id, id), eq(caseEvidence.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Evidence not found in your company", 404);
  const { env } = await import("cloudflare:workers"); const object = await env.BUCKET.get(record.objectKey);
  if (!object) return apiError("Evidence file is unavailable", 404);
  return new Response(object.body, { headers: { "content-type": record.contentType, "content-disposition": `inline; filename="${record.fileName.replace(/[\r\n\"]+/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
