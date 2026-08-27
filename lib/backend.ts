import { createClerkClient } from "@clerk/backend";
import { and, desc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../db";
import { auditLogs, invitations, memberships, users } from "../db/schema";
import { apiError, serializeAuditMetadata } from "./backend-safety";
export { apiError, readJsonObject, requireBoundedUpload, serializeAuditMetadata } from "./backend-safety";

export type RequestContext = { userId: string; organizationId: string; role: string; email: string; displayName: string };
export const ACTIVE_ORGANIZATION_COOKIE = "faultcite_organization";

function cookieValue(cookieHeader: string | null, name: string) {
  return cookieHeader?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || null;
}

export async function requireApiContext(): Promise<RequestContext | Response> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const appOrigin = process.env.FAULTCITE_APP_ORIGIN;
  if (!secretKey || !publishableKey || !appOrigin) return apiError("Authentication is not configured", 503);
  const requestHeaders = await headers();
  const request = new Request(new URL("/", appOrigin), { headers: requestHeaders });
  const clerk = createClerkClient({ secretKey, publishableKey });
  const auth = await clerk.authenticateRequest(request, { authorizedParties: [appOrigin] });
  if (!auth.isAuthenticated) return apiError("Authentication required", 401);
  const authData = auth.toAuth();
  if (!authData.userId) return apiError("Authentication required", 401);
  const clerkUser = await clerk.users.getUser(authData.userId);
  const primaryEmailRecord = clerkUser.emailAddresses.find(item => item.id === clerkUser.primaryEmailAddressId);
  const primaryEmail = primaryEmailRecord?.emailAddress;
  if (!primaryEmail || primaryEmailRecord.verification?.status !== "verified") return apiError("Your Clerk account needs a verified primary email", 403);
  const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || primaryEmail;
  const identity = { email: primaryEmail, displayName };
  const db = await getDb();
  const email = identity.email.trim().toLowerCase();
  let [user] = await db.select().from(users).where(eq(users.clerkUserId, authData.userId)).limit(1);
  if (!user) {
    const [emailOwner] = await db.select({ id: users.id, clerkUserId: users.clerkUserId }).from(users).where(eq(users.email, email)).limit(1);
    if (emailOwner) return apiError("This work email requires owner-verified identity reconciliation before access can continue.", 403);
    const userId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const now = new Date();
    const [invite] = await db.select().from(invitations).where(and(eq(invitations.email, email), eq(invitations.status, "pending"), gt(invitations.expiresAt, now))).limit(1);
    if (invite) {
      await db.batch([
        db.insert(users).values({ id: userId, clerkUserId: authData.userId, email, displayName: identity.displayName }),
        db.insert(memberships).values({ id: membershipId, organizationId: invite.organizationId, userId, role: invite.role }),
        db.update(invitations).set({ status: "accepted", acceptedByUserId: userId, acceptedAt: now, updatedAt: now }).where(eq(invitations.id, invite.id)),
      ]);
    } else {
      return apiError("This controlled pilot is invitation-only", 403);
    }
    user = { id: userId, clerkUserId: authData.userId, email, displayName: identity.displayName, createdAt: new Date(), updatedAt: new Date() };
  }
  // Accept a new invitation without disabling memberships at other companies.
  const [pendingInvite] = await db.select().from(invitations).where(and(eq(invitations.email, email), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date()))).orderBy(desc(invitations.updatedAt)).limit(1);
  if (pendingInvite) {
    const [existingMembership] = await db.select().from(memberships).where(and(eq(memberships.organizationId, pendingInvite.organizationId), eq(memberships.userId, user.id))).limit(1);
    const now = new Date();
    await db.batch([
      existingMembership
        ? db.update(memberships).set({ role: pendingInvite.role, active: true, updatedAt: now }).where(eq(memberships.id, existingMembership.id))
        : db.insert(memberships).values({ id: crypto.randomUUID(), organizationId: pendingInvite.organizationId, userId: user.id, role: pendingInvite.role, active: true, updatedAt: now }),
      db.update(invitations).set({ status: "accepted", acceptedByUserId: user.id, acceptedAt: now, updatedAt: now }).where(eq(invitations.id, pendingInvite.id)),
    ]);
  }
  const requestedOrganizationId = cookieValue(requestHeaders.get("cookie"), ACTIVE_ORGANIZATION_COOKIE);
  const activeMemberships = await db.select().from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.active, true))).orderBy(desc(memberships.updatedAt));
  const membership = activeMemberships.find(item => item.organizationId === requestedOrganizationId) || activeMemberships[0];
  if (!membership) return apiError("No active company membership", 403);
  return { userId: user.id, organizationId: membership.organizationId, role: membership.role, email, displayName: user.displayName };
}

export function isErrorResponse(value: RequestContext | Response): value is Response { return value instanceof Response; }

export async function writeAudit(ctx: RequestContext, action: string, entityType: string, entityId: string, metadata?: unknown) {
  await (await getDb()).insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action, entityType, entityId, metadataJson: serializeAuditMetadata(metadata) });
}

export function cleanText(value: unknown, max: number, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new Error("A required field is missing.");
  return text.slice(0, max) || null;
}
