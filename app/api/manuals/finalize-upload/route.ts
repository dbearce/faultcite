import { PDFDocument } from "pdf-lib";
import { getDb } from "../../../../db";
import { and, eq } from "drizzle-orm";
import { auditLogs, manualUploadSessions, manuals } from "../../../../db/schema";
import { apiError, cleanText, enforceRateLimit, isErrorResponse, requireApiContext } from "../../../../lib/backend";
import { releaseStorage } from "../../../../lib/storage-reservations";

const dateValue = (value: unknown) => { if (!value) return null; const date = new Date(String(value)); if (!Number.isFinite(date.valueOf())) throw new Error("Enter valid manual governance dates"); return date; };

export async function POST(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  const limited = await enforceRateLimit(ctx, "manual-upload-finalize", 12, 3600); if (limited) return limited;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError("Upload details are required");
  const uploadId = String(body.uploadId || ""); const totalChunks = Number(body.totalChunks); const expectedSize = Number(body.sizeBytes);
  if (!/^[a-f0-9-]{36}$/i.test(uploadId) || !Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 100 || !Number.isInteger(expectedSize) || expectedSize < 1 || expectedSize > 50 * 1024 * 1024) return apiError("Invalid manual upload session");
  if (body.rightsConfirmed !== true) return apiError("Confirm your company has the right to use this manual");
  let title: string; let manufacturer: string;
  try { title = cleanText(body.title, 200, true)!; manufacturer = cleanText(body.manufacturer, 120, true)!; } catch { return apiError("Manual title and manufacturer are required"); }
  const db = await getDb(); const [session] = await db.select().from(manualUploadSessions).where(and(eq(manualUploadSessions.id, uploadId), eq(manualUploadSessions.organizationId, ctx.organizationId), eq(manualUploadSessions.userId, ctx.userId), eq(manualUploadSessions.status, "uploading"))).limit(1);
  if (!session || session.expiresAt <= new Date() || session.totalChunks !== totalChunks || expectedSize > session.reservedBytes) return apiError("Manual upload session is expired or invalid", 409);
  const { env } = await import("cloudflare:workers"); const prefix = `${ctx.organizationId}/manual-uploads/${uploadId}/`; const temporaryKeys: string[] = [];
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    for (let index = 0; index < totalChunks; index++) {
      const key = `${prefix}${index}`; temporaryKeys.push(key); const object = await env.BUCKET.get(key);
      if (!object || object.customMetadata?.organizationId !== ctx.organizationId || object.customMetadata?.uploadedBy !== ctx.userId || object.customMetadata?.total !== String(totalChunks)) return apiError("A manual upload chunk is missing or invalid", 409);
      const chunk = new Uint8Array(await new Response(object.body).arrayBuffer()); chunks.push(chunk); size += chunk.length;
    }
    if (size !== expectedSize) return apiError("The completed manual size did not match the upload", 409);
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const decoder = new TextDecoder("latin1");
    if (decoder.decode(bytes.slice(0, 5)) !== "%PDF-") return apiError("File contents are not a valid PDF");
    if (!decoder.decode(bytes.slice(Math.max(0, bytes.length - 2048))).includes("%%EOF")) return apiError("The PDF is incomplete or malformed");
    if (/\/Encrypt\b|\/JavaScript\b|\/JS\b|\/Launch\b|\/EmbeddedFile\b/.test(decoder.decode(bytes))) return apiError("Encrypted, scripted, launched, or embedded-file PDFs are not accepted in the pilot");
    let pageCount: number; try { pageCount = (await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false })).getPageCount(); } catch { return apiError("The PDF could not be safely parsed. Export a fresh, non-encrypted PDF and try again."); }
    if (pageCount < 1 || pageCount > 9999) return apiError("The PDF page count is outside the supported range");
    const publicationDate = dateValue(body.publicationDate); const effectiveDate = dateValue(body.effectiveDate); const revalidationDueAt = dateValue(body.revalidationDueAt);
    if (publicationDate && effectiveDate && effectiveDate < publicationDate) return apiError("The effective date cannot be before the publication date");
    if (!revalidationDueAt) return apiError("A revalidation due date is required for controlled manuals");
    const id = crypto.randomUUID(); const fileName = cleanText(body.fileName, 240, true)!; const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_"); const objectKey = `${ctx.organizationId}/manuals/${id}/${safeName}`;
    await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { organizationId: ctx.organizationId, uploadedBy: ctx.userId } });
    const row = { id, organizationId: ctx.organizationId, uploadedByUserId: ctx.userId, title, manufacturer, model: cleanText(body.model, 120), revision: cleanText(body.revision, 80), serialApplicability: cleanText(body.serialApplicability, 240), documentType: cleanText(body.documentType, 80), publicationDate, effectiveDate, language: cleanText(body.language, 40) || "English", revalidationDueAt, documentOwnerUserId: ctx.userId, pageCount, fileName, objectKey, contentType: "application/pdf", sizeBytes: size, status: "pending_review", rightsConfirmed: true };
    try { await db.batch([db.insert(manuals).values(row), db.update(manualUploadSessions).set({status:"completed",updatedAt:new Date()}).where(and(eq(manualUploadSessions.id,uploadId),eq(manualUploadSessions.status,"uploading"))), db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "manual.uploaded", entityType: "manual", entityId: id, metadataJson: JSON.stringify({ fileName, sizeBytes: size, pageCount, chunked: true }), createdAt: new Date() })]); }
    catch (error) { await env.BUCKET.delete(objectKey); throw error; }
    return Response.json({ manual: { id: row.id, title: row.title, manufacturer: row.manufacturer, model: row.model, revision: row.revision, serialApplicability: row.serialApplicability, documentType: row.documentType, publicationDate: row.publicationDate, effectiveDate: row.effectiveDate, language: row.language, revalidationDueAt: row.revalidationDueAt, documentOwnerUserId: row.documentOwnerUserId, pageCount: row.pageCount, fileName: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes, status: row.status, rightsConfirmed: row.rightsConfirmed } }, { status: 201 });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Upload failed", 500); }
  finally { await Promise.all(temporaryKeys.map(key => env.BUCKET.delete(key).catch(() => undefined))); await db.delete(manualUploadSessions).where(and(eq(manualUploadSessions.id,uploadId),eq(manualUploadSessions.organizationId,ctx.organizationId))).catch(()=>undefined); await releaseStorage(uploadId,ctx.organizationId).catch(()=>undefined); }
}
