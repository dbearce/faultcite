import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLogs, manuals, manualSources } from "../../../../db/schema";
import { apiError, cleanText, isErrorResponse, requireApiContext } from "../../../../lib/backend";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx; const { id } = await params; const db = await getDb();
  const [manual] = await db.select().from(manuals).where(and(eq(manuals.id, id), eq(manuals.organizationId, ctx.organizationId))).limit(1);
  if (!manual) return apiError("Manual not found in your company", 404);
  if (!["owner", "manager"].includes(ctx.role) && manual.status !== "approved") return apiError("This manual is not approved for technician access", 403);
  const { env } = await import("cloudflare:workers"); const object = await env.BUCKET.get(manual.objectKey); if (!object) return apiError("Manual file is unavailable", 404);
  return new Response(object.body, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${manual.fileName.replace(/[\r\n\"]+/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx; if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  const { id } = await params; let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return apiError("Invalid JSON request"); }
  let status: string;
  try { status = cleanText(body.status, 30, true)!; }
  catch { return apiError("Manual review status is required"); }
  if (!["approved", "rejected", "pending_review"].includes(status)) return apiError("Invalid manual review status");
  const db = await getDb(); const [manual] = await db.select().from(manuals).where(and(eq(manuals.id, id), eq(manuals.organizationId, ctx.organizationId))).limit(1); if (!manual) return apiError("Manual not found", 404);
  if (status === "approved") {
    if (!manual.rightsConfirmed) return apiError("Confirm your company has the right to use this manual before approval", 409);
    if (!manual.pageCount || manual.pageCount < 1) return apiError("The PDF page count must be verified before approval", 409);
    if (!manual.documentOwnerUserId) return apiError("Assign a document owner before approval", 409);
    if (!manual.revalidationDueAt || manual.revalidationDueAt.valueOf() <= Date.now()) return apiError("Set a future revalidation date before approval", 409);
  }
  const now = new Date(); const reviewNotes = cleanText(body.reviewNotes, 1000);
  await db.batch([
    db.update(manuals).set({ status, reviewNotes, reviewedByUserId: ctx.userId, reviewedAt: now, updatedAt: now }).where(and(eq(manuals.id, id), eq(manuals.organizationId, ctx.organizationId))),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: `manual.${status}`, entityType: "manual", entityId: id, metadataJson: JSON.stringify({ reviewNotes }), createdAt: now }),
  ]);
  return Response.json({ manual: { ...manual, status, reviewNotes, reviewedByUserId: ctx.userId, reviewedAt: now, updatedAt: now } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx; if (ctx.role !== "owner") return apiError("Owner permission required", 403);
  const { id } = await params; const db = await getDb(); const [manual] = await db.select().from(manuals).where(and(eq(manuals.id, id), eq(manuals.organizationId, ctx.organizationId))).limit(1); if (!manual) return apiError("Manual not found", 404);
  const [approvedSource] = await db.select({ id: manualSources.id }).from(manualSources).where(and(eq(manualSources.manualId, id), eq(manualSources.organizationId, ctx.organizationId))).limit(1);
  if (approvedSource) return apiError("This manual has permanent approved source records and cannot be deleted. Reject it to remove it from diagnostic use.", 409);
  const now = new Date();
  await db.batch([
    db.update(manuals).set({ status: "deleting", updatedAt: now }).where(and(eq(manuals.id, id), eq(manuals.organizationId, ctx.organizationId))),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "manual.delete_requested", entityType: "manual", entityId: id, metadataJson: JSON.stringify({ fileName: manual.fileName }), createdAt: now }),
  ]);
  const { env } = await import("cloudflare:workers");
  try { await env.BUCKET.delete(manual.objectKey); }
  catch { return apiError("Manual deletion is pending because file storage could not be reached. Retry safely.", 503); }
  await db.batch([
    db.delete(manuals).where(and(eq(manuals.id, id), eq(manuals.organizationId, ctx.organizationId))),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "manual.deleted", entityType: "manual", entityId: id, metadataJson: JSON.stringify({ fileName: manual.fileName }), createdAt: new Date() }),
  ]);
  return Response.json({ id, deleted: true });
}
