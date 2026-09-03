import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { auditLogs, authIdentities, memberships, organizations, platformAdmins, rateLimitBuckets, users, userSettings } from "../db/schema";
import { getAuthUser, type AuthUser } from "../app/auth";

export type RequestContext = { userId: string; organizationId: string; role: string; email: string; displayName: string; platformAdmin: boolean };
export type CaseActorRecord = { openedByUserId: string; assignedToUserId: string | null };

export function apiError(message: string, status = 400) {
  return Response.json(
    { error: message },
    { status, headers: { "cache-control": "private, no-store" } },
  );
}

export async function requireApiContext(): Promise<RequestContext | Response> {
  const identity = await getAuthUser();
  if (!identity) return apiError("Authentication required", 401);
  const db = await getDb();
  const email = identity.email.trim().toLowerCase();
  let user = await resolveIdentityUser(identity);
  if (!user) {
    const { env } = await import("cloudflare:workers");
    const ownerEmail = env.FAULTCITE_OWNER_EMAIL?.trim().toLowerCase();
    if (!ownerEmail || email !== ownerEmail) return apiError("FaultCite is invitation-only. Open your company invitation link to join.", 403);
    const now = new Date();
    const userId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();
    const companyName = env.FAULTCITE_OWNER_COMPANY?.trim() || "FaultCite Internal Workspace";
    await db.batch([
      db.insert(users).values({ id: userId, email, displayName: identity.displayName }),
      db.insert(organizations).values({ id: organizationId, name: companyName, slug: `faultcite-internal-${organizationId.slice(0, 8)}`, status: "pilot" }),
      db.insert(memberships).values({ id: crypto.randomUUID(), organizationId, userId, role: "owner", active: true }),
      db.insert(userSettings).values({ userId, selectedOrganizationId: organizationId, updatedAt: now }),
      db.insert(platformAdmins).values({ userId, active: true, createdAt: now }),
    ]);
    [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (identity.provider === "clerk") await bindIdentity(identity, userId);
  }
  let [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1);
  if (!settings) {
    const [firstEnabled] = await db.select().from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.active, true))).orderBy(desc(memberships.updatedAt)).limit(1);
    if (!firstEnabled) return apiError("No enabled company membership", 403);
    await db.insert(userSettings).values({ userId: user.id, selectedOrganizationId: firstEnabled.organizationId });
    settings = { userId: user.id, selectedOrganizationId: firstEnabled.organizationId, updatedAt: new Date() };
  }
  const [membership] = await db.select().from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, settings.selectedOrganizationId || ""), eq(memberships.active, true))).limit(1);
  if (!membership) return apiError("Your access to the selected company is disabled. Ask a company owner to restore it.", 403);
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, membership.organizationId)).limit(1);
  if (!organization || organization.status === "suspended" || organization.status === "archived") return apiError("This company workspace is not active", 403);
  const [admin] = await db.select().from(platformAdmins).where(and(eq(platformAdmins.userId, user.id), eq(platformAdmins.active, true))).limit(1);
  return { userId: user.id, organizationId: membership.organizationId, role: membership.role, email, displayName: user.displayName, platformAdmin: Boolean(admin) };
}

export async function resolveIdentityUser(identity: AuthUser) {
  const db = await getDb();
  if (identity.provider === "clerk") {
    const [mapped] = await db.select({ user: users }).from(authIdentities)
      .innerJoin(users, eq(users.id, authIdentities.userId))
      .where(and(eq(authIdentities.provider, "clerk"), eq(authIdentities.providerSubject, identity.subject))).limit(1);
    if (mapped) return mapped.user;
  }
  const email = identity.email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing && identity.provider === "clerk") await bindIdentity(identity, existing.id);
  return existing;
}

export async function bindIdentity(identity: AuthUser, userId: string) {
  if (identity.provider !== "clerk") return;
  const db = await getDb();
  const [subjectMapping] = await db.select().from(authIdentities).where(and(eq(authIdentities.provider, "clerk"), eq(authIdentities.providerSubject, identity.subject))).limit(1);
  if (subjectMapping && subjectMapping.userId !== userId) throw new Error("This sign-in identity is already linked to another FaultCite user.");
  const [userMapping] = await db.select().from(authIdentities).where(and(eq(authIdentities.provider, "clerk"), eq(authIdentities.userId, userId))).limit(1);
  if (userMapping && userMapping.providerSubject !== identity.subject) throw new Error("This FaultCite user is already linked to another sign-in identity.");
  if (!subjectMapping) await db.insert(authIdentities).values({ id: crypto.randomUUID(), provider: "clerk", providerSubject: identity.subject, userId, verifiedEmail: identity.email.trim().toLowerCase() });
}

export function isErrorResponse(value: RequestContext | Response): value is Response { return value instanceof Response; }

export function canModifyCase(ctx: RequestContext, record: CaseActorRecord) {
  return ["owner", "manager"].includes(ctx.role) || record.openedByUserId === ctx.userId || record.assignedToUserId === ctx.userId;
}

export async function writeAudit(ctx: RequestContext, action: string, entityType: string, entityId: string, metadata?: unknown) {
  await (await getDb()).insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action, entityType, entityId, metadataJson: metadata ? JSON.stringify(metadata) : null });
}

export function cleanText(value: unknown, max: number, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new Error("A required field is missing.");
  if (text.length > max) throw new Error(`Text exceeds the ${max}-character limit.`);
  return text || null;
}

export async function enforceRateLimit(ctx: RequestContext, action: string, limit: number, windowSeconds: number): Promise<Response | null> {
  const db = await getDb();
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const nowMs = now.getTime();
  const resetAtMs = resetAt.getTime();
  const key = `${ctx.organizationId}:${ctx.userId}:${action}`;
  await db.insert(rateLimitBuckets).values({ key, count: 1, resetAt, updatedAt: now }).onConflictDoUpdate({
    target: rateLimitBuckets.key,
    set: {
      // Raw SQL parameters bypass the column timestamp encoder. D1 accepts
      // millisecond integers here, but rejects JavaScript Date objects.
      count: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${nowMs} THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
      resetAt: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${nowMs} THEN ${resetAtMs} ELSE ${rateLimitBuckets.resetAt} END`,
      updatedAt: now,
    },
  });
  const [bucket] = await db.select().from(rateLimitBuckets).where(eq(rateLimitBuckets.key, key)).limit(1);
  if (!bucket || bucket.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt.valueOf() - now.valueOf()) / 1000));
  return Response.json({ error: "Too many requests. Wait and try again." }, { status: 429, headers: { "cache-control": "private, no-store", "retry-after": String(retryAfter) } });
}
