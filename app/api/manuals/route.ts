import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, manuals } from "../../../db/schema";
import { apiError, cleanText, isErrorResponse, requireApiContext, requireBoundedUpload } from "../../../lib/backend";
import { manualApiView } from "../../../lib/api-views";

export async function GET() {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  const rows = await (await getDb()).select().from(manuals).where(eq(manuals.organizationId, ctx.organizationId)).limit(500);
  return Response.json({ manuals: rows.map(manualApiView) });
}

export async function POST(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!['owner','manager'].includes(ctx.role)) return apiError("Manager permission required", 403);
  const bounded = requireBoundedUpload(request, 50 * 1024 * 1024); if (bounded) return bounded;
  const form = await request.formData(); const file = form.get("file");
  if (!(file instanceof File)) return apiError("A manual file is required");
  if (file.size === 0) return apiError("Manual file is empty");
  if (file.size > 50 * 1024 * 1024) return apiError("Manuals must be 50 MB or smaller", 413);
  const allowed = new Set(["application/pdf"]); if (!allowed.has(file.type)) return apiError("Only PDF manuals are accepted");
  const rightsConfirmed = form.get("rightsConfirmed") === "true"; if (!rightsConfirmed) return apiError("Confirm your company has the right to use this manual");
  const title = cleanText(form.get("title"), 200);
  const manufacturer = cleanText(form.get("manufacturer"), 120);
  if (!title || !manufacturer) return apiError("Manual title and manufacturer are required");
  const model = cleanText(form.get("model"), 120);
  const revision = cleanText(form.get("revision"), 80);
  const serialApplicability = cleanText(form.get("serialApplicability"), 240);
  try {
    const id = crypto.randomUUID(); const originalName = cleanText(file.name, 240) || "manual.pdf"; const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_") || "manual.pdf"; const objectKey = `${ctx.organizationId}/manuals/${id}/${safeName}`;
    const { env } = await import("cloudflare:workers");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoder = new TextDecoder("latin1");
    if (decoder.decode(bytes.slice(0, 5)) !== "%PDF-") return apiError("File contents are not a valid PDF");
    const trailer = decoder.decode(bytes.slice(Math.max(0, bytes.length - 2048)));
    if (!trailer.includes("%%EOF")) return apiError("The PDF is incomplete or malformed");
    const unsafePdfFeature = /\/Encrypt\b|\/JavaScript\b|\/JS\b|\/Launch\b|\/EmbeddedFile\b/;
    for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
      const chunk = decoder.decode(bytes.slice(Math.max(0, offset - 64), Math.min(bytes.length, offset + 64 * 1024)));
      if (unsafePdfFeature.test(chunk)) return apiError("Encrypted, scripted, launched, or embedded-file PDFs are not accepted in the pilot");
    }
    await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { organizationId: ctx.organizationId, uploadedBy: ctx.userId } });
    const row = { id, organizationId: ctx.organizationId, uploadedByUserId: ctx.userId, title, manufacturer, model, revision, serialApplicability, fileName: originalName, objectKey, contentType: "application/pdf", sizeBytes: file.size, status: "pending_review", rightsConfirmed: true };
    try {
      const db = await getDb();
      await db.batch([
        db.insert(manuals).values(row),
        db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "manual.uploaded", entityType: "manual", entityId: id, metadataJson: JSON.stringify({ fileName: originalName, sizeBytes: file.size }) }),
      ]);
    } catch (error) {
      await env.BUCKET.delete(objectKey);
      throw error;
    }
    return Response.json({ manual: manualApiView(row) }, { status: 201 });
  } catch { return apiError("The manual could not be stored safely. Try again.", 500); }
}
