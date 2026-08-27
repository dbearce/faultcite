import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, caseEvents, cases, machines, organizations } from "../../../db/schema";
import { apiError, isErrorResponse, requireApiContext, writeAudit } from "../../../lib/backend";

function asIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function GET() {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);

  const db = await getDb();
  const [[organization], machineRows, caseRows, eventRows, auditRows] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1),
    db.select().from(machines).where(eq(machines.organizationId, ctx.organizationId)).orderBy(asc(machines.assetNumber)),
    db.select().from(cases).where(eq(cases.organizationId, ctx.organizationId)).orderBy(asc(cases.openedAt)),
    db.select().from(caseEvents).where(eq(caseEvents.organizationId, ctx.organizationId)).orderBy(asc(caseEvents.createdAt)),
    db.select().from(auditLogs).where(eq(auditLogs.organizationId, ctx.organizationId)).orderBy(asc(auditLogs.createdAt)),
  ]);

  if (!organization) return apiError("Company not found", 404);

  const generatedAt = new Date();
  const payload = {
    exportVersion: 1,
    generatedAt: generatedAt.toISOString(),
    organization: { id: organization.id, name: organization.name, slug: organization.slug, status: organization.status },
    machines: machineRows.map((row) => ({ ...row, createdAt: asIso(row.createdAt), updatedAt: asIso(row.updatedAt) })),
    cases: caseRows.map((row) => ({
      ...row,
      openedAt: asIso(row.openedAt),
      closedAt: asIso(row.closedAt),
      temporaryExpiresAt: asIso(row.temporaryExpiresAt),
      createdAt: asIso(row.createdAt),
      updatedAt: asIso(row.updatedAt),
    })),
    caseEvents: eventRows.map((row) => ({ ...row, createdAt: asIso(row.createdAt) })),
    auditLog: auditRows.map((row) => ({ ...row, createdAt: asIso(row.createdAt) })),
  };

  await writeAudit(ctx, "organization.exported", "organization", ctx.organizationId, {
    machineCount: machineRows.length,
    caseCount: caseRows.length,
    eventCount: eventRows.length,
  });

  const safeSlug = organization.slug.replace(/[^a-zA-Z0-9_-]/g, "_");
  return Response.json(payload, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="faultcite-${safeSlug}-${generatedAt.toISOString().slice(0, 10)}.json"`,
      "x-content-type-options": "nosniff",
    },
  });
}
