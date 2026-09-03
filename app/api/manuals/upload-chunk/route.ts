import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { manualUploadSessions } from "../../../../db/schema";
import { apiError, enforceRateLimit, isErrorResponse, requireApiContext } from "../../../../lib/backend";
import { releaseStorage, reserveStorage } from "../../../../lib/storage-reservations";

const MAX_CHUNK_BYTES = 512 * 1024;

export async function POST(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  const limited = await enforceRateLimit(ctx, "manual-upload-chunk", 240, 3600); if (limited) return limited;
  const url = new URL(request.url);
  const uploadId = url.searchParams.get("uploadId") || "";
  const index = Number(url.searchParams.get("index"));
  const total = Number(url.searchParams.get("total"));
  if (!/^[a-f0-9-]{36}$/i.test(uploadId) || !Number.isInteger(index) || index < 0 || !Number.isInteger(total) || total < 1 || total > 100 || index >= total) return apiError("Invalid manual upload session");
  const db = await getDb(); const now = new Date();
  const [session] = await db.select().from(manualUploadSessions).where(and(eq(manualUploadSessions.id, uploadId), eq(manualUploadSessions.organizationId, ctx.organizationId), eq(manualUploadSessions.userId, ctx.userId))).limit(1);
  if (!session) {
    if (index !== 0) return apiError("Start a new manual upload session", 409);
    const reservation = total * MAX_CHUNK_BYTES;
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    try { await reserveStorage({ id: uploadId, organizationId: ctx.organizationId, userId: ctx.userId, kind: "manual", bytes: reservation, expiresAt }); }
    catch (error) { return apiError(error instanceof Error ? error.message : "Company manual storage quota reached", 413); }
    try { await db.insert(manualUploadSessions).values({ id: uploadId, organizationId: ctx.organizationId, userId: ctx.userId, totalChunks: total, reservedBytes: reservation, status: "uploading", expiresAt, createdAt: now, updatedAt: now }); }
    catch (error) { await releaseStorage(uploadId, ctx.organizationId); throw error; }
  } else if (session.status !== "uploading" || session.expiresAt <= now || session.totalChunks !== total) return apiError("Manual upload session is expired or invalid", 409);
  const { env } = await import("cloudflare:workers");
  const expired = await db.select().from(manualUploadSessions).where(lt(manualUploadSessions.expiresAt, now)).limit(10);
  for (const stale of expired) {
    const listed = await env.BUCKET.list({ prefix: `${stale.organizationId}/manual-uploads/${stale.id}/`, limit: 100 });
    for (const object of listed.objects as Array<{ key: string }>) await env.BUCKET.delete(object.key);
    await db.delete(manualUploadSessions).where(eq(manualUploadSessions.id, stale.id));
    await releaseStorage(stale.id, stale.organizationId);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_CHUNK_BYTES) return apiError("Manual upload chunk is invalid", 413);
  await env.BUCKET.put(`${ctx.organizationId}/manual-uploads/${uploadId}/${index}`, bytes, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { organizationId: ctx.organizationId, uploadedBy: ctx.userId, uploadId, index: String(index), total: String(total) },
  });
  return Response.json({ received: index });
}
