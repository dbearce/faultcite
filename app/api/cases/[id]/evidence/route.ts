import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, caseEvidence, caseEvents, cases } from "../../../../../db/schema";
import { apiError, canModifyCase, cleanText, enforceRateLimit, isErrorResponse, requireApiContext } from "../../../../../lib/backend";
import { sanitizeEvidenceImage } from "../../../../../lib/image-sanitizer";
import { releaseStorage, reserveStorage } from "../../../../../lib/storage-reservations";

const publicEvidence = { id: caseEvidence.id, kind: caseEvidence.kind, fileName: caseEvidence.fileName, contentType: caseEvidence.contentType, sizeBytes: caseEvidence.sizeBytes, createdAt: caseEvidence.createdAt };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  const { id } = await params; const db = await getDb();
  const [record] = await db.select({ id: cases.id }).from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Case not found in your company", 404);
  const evidence = await db.select(publicEvidence).from(caseEvidence).where(and(eq(caseEvidence.caseId, id), eq(caseEvidence.organizationId, ctx.organizationId))).orderBy(desc(caseEvidence.createdAt));
  return Response.json({ evidence });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  const limited = await enforceRateLimit(ctx, "evidence-upload", 30, 3600); if (limited) return limited;
  const { id } = await params; const db = await getDb();
  const [record] = await db.select({ id: cases.id, status: cases.status, openedByUserId: cases.openedByUserId, assignedToUserId: cases.assignedToUserId }).from(cases).where(and(eq(cases.id, id), eq(cases.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Case not found in your company", 404);
  if (!canModifyCase(ctx, record)) return apiError("This case is assigned to another technician", 403);
  if (["closed", "canceled"].includes(record.status)) return apiError("Evidence cannot be added to a terminal case", 409);
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 11 * 1024 * 1024) return apiError("Evidence request is too large", 413);
  const form = await request.formData(); const file = form.get("file");
  if (!(file instanceof File)) return apiError("An evidence file is required");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) return apiError("Evidence accepts JPEG, PNG, or WebP so private photo metadata can be removed");
  if (file.size === 0) return apiError("Evidence file is empty");
  if (file.size > 10 * 1024 * 1024) return apiError("Evidence images must be 10 MB or smaller", 413);
  let sanitized: ReturnType<typeof sanitizeEvidenceImage>;
  try { sanitized = sanitizeEvidenceImage(new Uint8Array(await file.arrayBuffer()), file.type); }
  catch (error) { return apiError(error instanceof Error ? error.message : "Evidence image could not be sanitized"); }
  let kind: string;
  try { kind = cleanText(form.get("kind"), 40, true)!; }
  catch { return apiError("Evidence type is required"); }
  if (!new Set(["alarm_screen", "diagnostic_observation", "repair_evidence"]).has(kind)) return apiError("Invalid evidence type");
  const evidenceId = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_"); const objectKey = `${ctx.organizationId}/cases/${id}/${evidenceId}/${safeName}`; const quarantineKey = `${ctx.organizationId}/quarantine/${evidenceId}`;
  const { env } = await import("cloudflare:workers");
  try {
    await reserveStorage({ id: evidenceId, organizationId: ctx.organizationId, userId: ctx.userId, kind: "evidence", bytes: sanitized.bytes.length, expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
    await env.BUCKET.put(quarantineKey, sanitized.bytes, { httpMetadata: { contentType: "application/octet-stream" }, customMetadata: { organizationId: ctx.organizationId, caseId: id, status: "signature-screened" } });
    await env.BUCKET.put(objectKey, sanitized.bytes, { httpMetadata: { contentType: sanitized.contentType }, customMetadata: { organizationId: ctx.organizationId, caseId: id, kind, metadataStatus: "removed", scanStatus: "signature-screened" } });
    const row = { id: evidenceId, organizationId: ctx.organizationId, caseId: id, uploadedByUserId: ctx.userId, kind, fileName: file.name, objectKey, contentType: sanitized.contentType, sizeBytes: sanitized.bytes.length };
    await db.batch([
      db.insert(caseEvidence).values(row),
      db.insert(caseEvents).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, caseId: id, actorUserId: ctx.userId, eventType: "evidence_added", notes: `${kind}: ${file.name}`, payloadJson: JSON.stringify({ evidenceId, kind, contentType: sanitized.contentType, sizeBytes: sanitized.bytes.length, metadataRemoved: true }) }),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "case.evidence_added", entityType: "case", entityId: id, metadataJson: JSON.stringify({ evidenceId, kind, sizeBytes: sanitized.bytes.length, metadataRemoved: true, signatureScreened: true }), createdAt: new Date() }),
    ]);
    return Response.json({ evidence: { id: row.id, kind: row.kind, fileName: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes, createdAt: new Date() } }, { status: 201 });
  } catch (error) {
    await env.BUCKET.delete(objectKey);
    return apiError(error instanceof Error ? error.message : "Evidence upload failed", /quota reached/i.test(error instanceof Error ? error.message : "") ? 413 : 500);
  } finally {
    await env.BUCKET.delete(quarantineKey).catch(() => undefined);
    await releaseStorage(evidenceId, ctx.organizationId).catch(() => undefined);
  }
}
