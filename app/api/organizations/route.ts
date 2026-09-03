import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, memberships, organizations, userSettings } from "../../../db/schema";
import { apiError, cleanText, isErrorResponse, requireApiContext } from "../../../lib/backend";

function companySlug(name: string) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "company";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function GET() {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  const rows = await (await getDb()).select({ id: organizations.id, name: organizations.name, slug: organizations.slug, status: organizations.status, role: memberships.role, active: memberships.active })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, ctx.userId), eq(memberships.active, true)));
  return Response.json({ organizations: rows, activeOrganizationId: ctx.organizationId });
}

export async function POST(request: Request) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  if (!ctx.platformAdmin) return apiError("Platform administrator permission required", 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return apiError("Invalid JSON request"); }
  let name: string;
  try { name = cleanText(body.name, 120, true)!; }
  catch { return apiError("Company name is required"); }
  if (name.length < 2) return apiError("Company name must contain at least 2 characters");
  const db = await getDb();
  const organizationId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const now = new Date();
  await db.batch([
    db.insert(organizations).values({ id: organizationId, name, slug: companySlug(name), status: "pilot" }),
    db.insert(memberships).values({ id: membershipId, organizationId, userId: ctx.userId, role: "owner", active: true }),
    db.insert(userSettings).values({ userId: ctx.userId, selectedOrganizationId: organizationId }).onConflictDoUpdate({ target: userSettings.userId, set: { selectedOrganizationId: organizationId, updatedAt: now } }),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId, actorUserId: ctx.userId, action: "organization.created", entityType: "organization", entityId: organizationId, metadataJson: JSON.stringify({ name }), createdAt: now }),
  ]);
  return Response.json({ organization: { id: organizationId, name, role: "owner", active: true } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return apiError("Invalid JSON request"); }
  if (body.action === "rename") {
    if (ctx.role !== "owner") return apiError("Owner permission required", 403);
    let name: string;
    try { name = cleanText(body.name, 120, true)!; }
    catch { return apiError("Company name is required"); }
    if (name.length < 2) return apiError("Company name must contain at least 2 characters");
    const db = await getDb(); const now = new Date();
    await db.batch([
      db.update(organizations).set({ name, updatedAt: now }).where(eq(organizations.id, ctx.organizationId)),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "organization.renamed", entityType: "organization", entityId: ctx.organizationId, metadataJson: JSON.stringify({ name }), createdAt: now }),
    ]);
    return Response.json({ organizationId: ctx.organizationId, name });
  }
  let organizationId: string;
  try { organizationId = cleanText(body.organizationId, 80, true)!; }
  catch { return apiError("Company selection is required"); }
  const db = await getDb();
  const [target] = await db.select().from(memberships).where(and(eq(memberships.userId, ctx.userId), eq(memberships.organizationId, organizationId), eq(memberships.active, true))).limit(1);
  if (!target) return apiError("You do not have enabled access to that company", 403);
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!organization || ["suspended", "archived"].includes(organization.status)) return apiError("That company workspace is not active", 403);
  const now = new Date();
  await db.batch([
    db.insert(userSettings).values({ userId: ctx.userId, selectedOrganizationId: organizationId }).onConflictDoUpdate({ target: userSettings.userId, set: { selectedOrganizationId: organizationId, updatedAt: now } }),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId, actorUserId: ctx.userId, action: "organization.switched", entityType: "organization", entityId: organizationId, metadataJson: JSON.stringify({ previousOrganizationId: ctx.organizationId }), createdAt: now }),
  ]);
  return Response.json({ activeOrganizationId: organizationId });
}
