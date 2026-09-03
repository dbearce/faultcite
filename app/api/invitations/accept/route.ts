import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getAuthUser } from "../../../auth";
import { getDb } from "../../../../db";
import { auditLogs, invitations, memberships, userSettings, users } from "../../../../db/schema";
import { apiError, bindIdentity, resolveIdentityUser } from "../../../../lib/backend";

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const identity = await getAuthUser(); if (!identity) return apiError("Sign in before accepting this invitation", 401);
  let body: { token?: string }; try { body = await request.json() as { token?: string }; } catch { return apiError("Invalid invitation request"); }
  const token = String(body.token || ""); if (token.length < 40 || token.length > 256) return apiError("Invitation link is invalid", 400);
  const db = await getDb(); const tokenHash = await hashToken(token); const email = identity.email.trim().toLowerCase(); const now = new Date();
  const [invite] = await db.select().from(invitations).where(and(eq(invitations.tokenHash, tokenHash), eq(invitations.email, email), or(eq(invitations.status, "pending"), eq(invitations.status, "accepting")), isNull(invitations.revokedAt), gt(invitations.expiresAt, now))).limit(1);
  if (!invite) return apiError("This invitation is invalid, expired, revoked, or belongs to another email", 403);
  if (invite.status === "pending") {
    const claimed = await db.update(invitations).set({ status: "accepting", updatedAt: now }).where(and(eq(invitations.id, invite.id), eq(invitations.organizationId, invite.organizationId), eq(invitations.email, email), eq(invitations.tokenHash, tokenHash), eq(invitations.status, "pending"), isNull(invitations.revokedAt), gt(invitations.expiresAt, now))).returning({ id: invitations.id });
    if (!claimed.length) return apiError("This invitation changed before it could be accepted", 409);
  }
  let user = await resolveIdentityUser(identity); const userId = user?.id || crypto.randomUUID();
  if (!user) { await db.insert(users).values({ id: userId, email, displayName: identity.displayName }); user = { id: userId, email, displayName: identity.displayName, createdAt: now, updatedAt: now }; }
  await bindIdentity(identity, userId);
  const [member] = await db.select().from(memberships).where(and(eq(memberships.organizationId, invite.organizationId), eq(memberships.userId, userId))).limit(1);
  if (member) await db.update(memberships).set({ role: invite.role, active: true, updatedAt: now }).where(eq(memberships.id, member.id));
  else await db.insert(memberships).values({ id: crypto.randomUUID(), organizationId: invite.organizationId, userId, role: invite.role, active: true });
  await db.insert(userSettings).values({ userId, selectedOrganizationId: invite.organizationId, updatedAt: now }).onConflictDoUpdate({
    target: userSettings.userId,
    set: { selectedOrganizationId: invite.organizationId, updatedAt: now },
  });
  const accepted = await db.update(invitations).set({ status: "accepted", acceptedByUserId: userId, acceptedAt: now, tokenHash: null, updatedAt: now }).where(and(eq(invitations.id, invite.id), eq(invitations.status, "accepting"))).returning({ id: invitations.id });
  if (!accepted.length) return apiError("This invitation was already used", 409);
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: invite.organizationId, actorUserId: userId, action: "team.invitation_accepted", entityType: "invitation", entityId: invite.id, metadataJson: JSON.stringify({ role: invite.role }), createdAt: now });
  return Response.json({ organizationId: invite.organizationId, accepted: true });
}
