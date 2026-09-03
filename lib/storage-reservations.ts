import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../db";
import { storageReservations } from "../db/schema";

export type StorageKind = "manual" | "evidence";

export async function reserveStorage(input: { id: string; organizationId: string; userId: string; kind: StorageKind; bytes: number; expiresAt: Date }) {
  const db = await getDb(); const now = new Date();
  await db.delete(storageReservations).where(lt(storageReservations.expiresAt, now));
  if (!Number.isInteger(input.bytes) || input.bytes <= 0) throw new Error("Invalid storage reservation");
  const limit = input.kind === "manual" ? 500 * 1024 * 1024 : 1024 * 1024 * 1024;
  const storedTable = input.kind === "manual" ? "manuals" : "case_evidence";
  const { env } = await import("cloudflare:workers");
  const result = await env.DB.prepare(`INSERT INTO storage_reservations (id,organization_id,user_id,upload_kind,reserved_bytes,expires_at,created_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7
    WHERE COALESCE((SELECT SUM(size_bytes) FROM ${storedTable} WHERE organization_id=?2),0)
      + COALESCE((SELECT SUM(reserved_bytes) FROM storage_reservations WHERE organization_id=?2 AND upload_kind=?4),0)
      + ?5 <= ?8`)
    .bind(input.id,input.organizationId,input.userId,input.kind,input.bytes,input.expiresAt.valueOf(),now.valueOf(),limit).run();
  if (!result.meta.changes) throw new Error(`Company ${input.kind} storage quota reached`);
}

export async function releaseStorage(id: string, organizationId: string) {
  await (await getDb()).delete(storageReservations).where(and(eq(storageReservations.id, id), eq(storageReservations.organizationId, organizationId)));
}
