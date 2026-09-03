import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { getDb } from "../../../db";
import { auditLogs, manuals } from "../../../db/schema";
import { apiError, cleanText, enforceRateLimit, isErrorResponse, requireApiContext } from "../../../lib/backend";
import { releaseStorage, reserveStorage } from "../../../lib/storage-reservations";

const publicManual = { id: manuals.id, title: manuals.title, manufacturer: manuals.manufacturer, model: manuals.model, revision: manuals.revision, serialApplicability: manuals.serialApplicability, documentType: manuals.documentType, publicationDate: manuals.publicationDate, effectiveDate: manuals.effectiveDate, language: manuals.language, revalidationDueAt: manuals.revalidationDueAt, documentOwnerUserId: manuals.documentOwnerUserId, pageCount: manuals.pageCount, fileName: manuals.fileName, contentType: manuals.contentType, sizeBytes: manuals.sizeBytes, status: manuals.status, rightsConfirmed: manuals.rightsConfirmed, reviewNotes: manuals.reviewNotes, reviewedAt: manuals.reviewedAt, createdAt: manuals.createdAt, updatedAt: manuals.updatedAt };

const formDate = (value: FormDataEntryValue | null) => {
  if (!value) return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.valueOf())) throw new Error("Enter valid manual governance dates");
  return date;
};

export async function GET() {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  return Response.json({ manuals: await (await getDb()).select(publicManual).from(manuals).where(eq(manuals.organizationId, ctx.organizationId)) });
}

export async function POST(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!['owner','manager'].includes(ctx.role)) return apiError("Manager permission required", 403);
  const limited = await enforceRateLimit(ctx, "manual-upload", 12, 3600); if (limited) return limited;
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 51 * 1024 * 1024) return apiError("Manual upload request is too large", 413);
  const form = await request.formData(); const file = form.get("file");
  if (!(file instanceof File)) return apiError("A manual file is required");
  if (file.size === 0) return apiError("Manual file is empty");
  if (file.size > 50 * 1024 * 1024) return apiError("Manuals must be 50 MB or smaller", 413);
  const allowed = new Set(["application/pdf"]); if (!allowed.has(file.type)) return apiError("Only PDF manuals are accepted");
  const rightsConfirmed = form.get("rightsConfirmed") === "true"; if (!rightsConfirmed) return apiError("Confirm your company has the right to use this manual");
  let title: string; let manufacturer: string;
  try {
    title = cleanText(form.get("title"), 200, true)!;
    manufacturer = cleanText(form.get("manufacturer"), 120, true)!;
  } catch {
    return apiError("Manual title and manufacturer are required");
  }
  try {
    const publicationDate = formDate(form.get("publicationDate")); const effectiveDate = formDate(form.get("effectiveDate")); const revalidationDueAt = formDate(form.get("revalidationDueAt"));
    if (publicationDate && effectiveDate && effectiveDate < publicationDate) return apiError("The effective date cannot be before the publication date");
    if (!revalidationDueAt) return apiError("A revalidation due date is required for controlled manuals");
    const id = crypto.randomUUID(); const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_"); const objectKey = `${ctx.organizationId}/manuals/${id}/${safeName}`;
    const { env } = await import("cloudflare:workers");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoder = new TextDecoder("latin1");
    if (decoder.decode(bytes.slice(0, 5)) !== "%PDF-") return apiError("File contents are not a valid PDF");
    const trailer = decoder.decode(bytes.slice(Math.max(0, bytes.length - 2048)));
    if (!trailer.includes("%%EOF")) return apiError("The PDF is incomplete or malformed");
    const pdfText = decoder.decode(bytes);
    if (/\/Encrypt\b|\/JavaScript\b|\/JS\b|\/Launch\b|\/EmbeddedFile\b/.test(pdfText)) return apiError("Encrypted, scripted, launched, or embedded-file PDFs are not accepted in the pilot");
    let pageCount: number;
    try {
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
      pageCount = pdf.getPageCount();
    } catch {
      return apiError("The PDF could not be safely parsed. Export a fresh, non-encrypted PDF and try again.");
    }
    if (pageCount < 1 || pageCount > 9999) return apiError("The PDF page count is outside the supported range");
    try {
      await reserveStorage({ id, organizationId: ctx.organizationId, userId: ctx.userId, kind: "manual", bytes: file.size, expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
      await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { organizationId: ctx.organizationId, uploadedBy: ctx.userId, scanStatus: "screened" } });
      const row = { id, organizationId: ctx.organizationId, uploadedByUserId: ctx.userId, title, manufacturer, model: cleanText(form.get("model"), 120), revision: cleanText(form.get("revision"), 80), serialApplicability: cleanText(form.get("serialApplicability"), 240), documentType: cleanText(form.get("documentType"), 80), publicationDate, effectiveDate, language: cleanText(form.get("language"), 40) || "English", revalidationDueAt, documentOwnerUserId: ctx.userId, pageCount, fileName: file.name, objectKey, contentType: file.type, sizeBytes: file.size, status: "pending_review", rightsConfirmed: true };
      try { const db = await getDb(); await db.batch([db.insert(manuals).values(row),db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "manual.uploaded", entityType: "manual", entityId: id, metadataJson: JSON.stringify({ fileName: file.name, sizeBytes: file.size, pageCount, signatureScreened: true }), createdAt: new Date() })]); }
      catch (error) { await env.BUCKET.delete(objectKey); throw error; }
      return Response.json({ manual: { id: row.id, title: row.title, manufacturer: row.manufacturer, model: row.model, revision: row.revision, serialApplicability: row.serialApplicability, documentType: row.documentType, publicationDate: row.publicationDate, effectiveDate: row.effectiveDate, language: row.language, revalidationDueAt: row.revalidationDueAt, documentOwnerUserId: row.documentOwnerUserId, pageCount: row.pageCount, fileName: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes, status: row.status, rightsConfirmed: row.rightsConfirmed } }, { status: 201 });
    } finally {
      await releaseStorage(id, ctx.organizationId).catch(() => undefined);
    }
  } catch (error) { const message = error instanceof Error ? error.message : "Upload failed"; return apiError(message, /quota reached/i.test(message) ? 413 : 500); }
}
