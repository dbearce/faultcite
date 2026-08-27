import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, caseEvidence, caseEvents, cases } from "../../../../../db/schema";
import { apiError, cleanText, isErrorResponse, requireApiContext, requireBoundedUpload } from "../../../../../lib/backend";
import { evidenceApiView } from "../../../../../lib/api-views";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  const { id } = await params; const db = await getDb();
  const [record] = await db.select({ id: cases.id }).from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Case not found in your company", 404);
  const evidence = await db.select().from(caseEvidence).where(and(eq(caseEvidence.caseId, id), eq(caseEvidence.organizationId, ctx.organizationId))).orderBy(desc(caseEvidence.createdAt)).limit(250);
  return Response.json({ evidence: evidence.map(evidenceApiView) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  const { id } = await params; const db = await getDb();
  const [record] = await db.select({ id: cases.id, status: cases.status }).from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Case not found in your company", 404);
  if (record.status === "closed") return apiError("Evidence cannot be added to a closed case", 409);
  const bounded = requireBoundedUpload(request, 10 * 1024 * 1024); if (bounded) return bounded;
  const form = await request.formData(); const file = form.get("file");
  if (!(file instanceof File)) return apiError("An evidence file is required");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
  if (!allowed.has(file.type)) return apiError("Pilot evidence accepts JPEG, PNG, WebP, or HEIC only");
  if (file.size === 0) return apiError("Evidence file is empty");
  if (file.size > 10 * 1024 * 1024) return apiError("Evidence images must be 10 MB or smaller", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const box = bytes.length > 12 ? String.fromCharCode(...bytes.slice(4, 12)) : "";
  const isHeic = box.startsWith("ftyp") && /heic|heix|hevc|hevx|mif1/.test(String.fromCharCode(...bytes.slice(8, 24)));
  if (!(isJpeg || isPng || isWebp || isHeic)) return apiError("File contents do not match an allowed image format");
  const detectedType = isJpeg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : "image/heic";
  const declaredType = file.type === "image/heif" ? "image/heic" : file.type;
  if (declaredType !== detectedType) return apiError("Declared image type does not match the file contents");
  const kind = cleanText(form.get("kind"), 40) || "";
  if (!new Set(["alarm_screen", "diagnostic_observation", "repair_evidence"]).has(kind)) return apiError("Invalid evidence type");
  const evidenceId = crypto.randomUUID();
  const originalName = cleanText(file.name, 240) || "evidence";
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_") || "evidence"; const objectKey = `${ctx.organizationId}/cases/${id}/${evidenceId}/${safeName}`;
  const { env } = await import("cloudflare:workers");
  await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: detectedType }, customMetadata: { organizationId: ctx.organizationId, caseId: id, kind } });
  const row = { id: evidenceId, organizationId: ctx.organizationId, caseId: id, uploadedByUserId: ctx.userId, kind, fileName: originalName, objectKey, contentType: detectedType, sizeBytes: file.size };
  try {
    await db.batch([
      db.insert(caseEvidence).values(row),
      db.insert(caseEvents).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, caseId: id, actorUserId: ctx.userId, eventType: "evidence_added", notes: `${kind}: ${originalName}`, payloadJson: JSON.stringify({ evidenceId, kind, contentType: detectedType, sizeBytes: file.size }) }),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "case.evidence_added", entityType: "case", entityId: id, metadataJson: JSON.stringify({ evidenceId, kind, sizeBytes: file.size }) }),
    ]);
  } catch (error) {
    await env.BUCKET.delete(objectKey);
    throw error;
  }
  return Response.json({ evidence: evidenceApiView(row) }, { status: 201 });
}
