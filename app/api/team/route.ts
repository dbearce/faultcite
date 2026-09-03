import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, invitations, memberships, organizations, users } from "../../../db/schema";
import { apiError, cleanText, enforceRateLimit, isErrorResponse, requireApiContext } from "../../../lib/backend";
import { sendInvitationEmail } from "../../../lib/invitation-email";

const roles = new Set(["technician", "manager"]);

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

const publicInvitation = {
  id: invitations.id,
  email: invitations.email,
  role: invitations.role,
  status: invitations.status,
  expiresAt: invitations.expiresAt,
  deliveredAt: invitations.deliveredAt,
  createdAt: invitations.createdAt,
  updatedAt: invitations.updatedAt,
};

export async function GET() {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  const db = await getDb();
  const [team, invites] = await Promise.all([
    db.select({ id: memberships.id, role: memberships.role, active: memberships.active, userId: users.id, email: users.email, displayName: users.displayName }).from(memberships).innerJoin(users, eq(memberships.userId, users.id)).where(eq(memberships.organizationId, ctx.organizationId)),
    db.select(publicInvitation).from(invitations).where(eq(invitations.organizationId, ctx.organizationId)),
  ]);
  return Response.json({ team, invitations: invites });
}

export async function POST(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  const limited = await enforceRateLimit(ctx, "team-invitation", 10, 3600); if (limited) return limited;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return apiError("Invalid JSON request"); }
  const db = await getDb();
  const resendInvitationId = cleanText(body.invitationId, 80);
  let email = "";
  let role = "";
  let id = "";

  if (resendInvitationId) {
    const [pending] = await db.select().from(invitations).where(and(eq(invitations.id, resendInvitationId), eq(invitations.organizationId, ctx.organizationId), eq(invitations.status, "pending"))).limit(1);
    if (!pending) return apiError("Pending invitation not found", 404);
    id = pending.id;
    email = pending.email;
    role = pending.role;
  } else {
    try {
      email = (cleanText(body.email, 320, true) || "").toLowerCase();
      role = cleanText(body.role, 20, true)!;
    } catch {
      return apiError("Email and team role are required");
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) return apiError("Enter a valid technician email");
    if (!roles.has(role)) return apiError("Invalid team role");
    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) {
      const [member] = await db.select().from(memberships).where(and(eq(memberships.organizationId, ctx.organizationId), eq(memberships.userId, existingUser.id))).limit(1);
      if (member) return apiError("This person is already on the team", 409);
    }
    const [existing] = await db.select().from(invitations).where(and(eq(invitations.organizationId, ctx.organizationId), eq(invitations.email, email))).limit(1);
    id = existing?.id || crypto.randomUUID();
  }

  if (!roles.has(role)) return apiError("Invalid team role");
  if (ctx.role === "manager" && role !== "technician") return apiError("Managers may invite technicians only", 403);
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
  const tokenHash = await hashToken(token);
  const now = new Date();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [existingById] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1);
  const audit = db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: resendInvitationId ? "team.invitation_resent" : "team.invited", entityType: "invitation", entityId: id, metadataJson: JSON.stringify({ email, role, stage: "saved" }), createdAt: now });
  if (existingById) {
    await db.batch([
      db.update(invitations).set({ role, status: "pending", invitedByUserId: ctx.userId, acceptedByUserId: null, acceptedAt: null, tokenHash, expiresAt, revokedAt: null, deliveredAt: null, updatedAt: now }).where(and(eq(invitations.id, id), eq(invitations.organizationId, ctx.organizationId))),
      audit,
    ]);
  } else {
    await db.batch([
      db.insert(invitations).values({ id, organizationId: ctx.organizationId, email, role, invitedByUserId: ctx.userId, tokenHash, expiresAt }),
      audit,
    ]);
  }

  const [organization] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1);
  const { env } = await import("cloudflare:workers");
  const configuredOrigin = env.FAULTCITE_APP_ORIGIN?.trim();
  const acceptOrigin = configuredOrigin ? new URL(configuredOrigin).origin : new URL(request.url).origin;
  const acceptUrl = `${acceptOrigin}/join?token=${token}`;
  const delivery = await sendInvitationEmail({ to: email, role, companyName: organization?.name || "Your company", inviterName: ctx.displayName, acceptUrl, expiresAt });
  if (delivery.status === "sent") {
    await db.update(invitations).set({ deliveredAt: new Date(), updatedAt: new Date() }).where(eq(invitations.id, id)).catch(() => undefined);
  }
  return Response.json({
    invitation: { id, email, role, status: "pending", expiresAt, deliveredAt: delivery.status === "sent" ? new Date() : null },
    acceptUrl,
    deliveryStatus: delivery.status,
    deliveryMessage: delivery.message,
    requiresPrivateSiteAccess: false,
  }, { status: resendInvitationId ? 200 : 201 });
}

export async function PATCH(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  const limited = await enforceRateLimit(ctx, "team-administration", 30, 3600); if (limited) return limited;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return apiError("Invalid JSON request"); }
  let membershipId: string; let role: string;
  try {
    membershipId = cleanText(body.membershipId, 80, true)!;
    role = cleanText(body.role, 20, true)!;
  } catch {
    return apiError("Team member, role, and active status are required");
  }
  const active = body.active;
  if (!roles.has(role) && role !== "owner") return apiError("Invalid team role");
  if (typeof active !== "boolean") return apiError("Active status is required");
  const db = await getDb(); const [member] = await db.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.organizationId))).limit(1);
  if (!member) return apiError("Team member not found", 404);
  if (member.userId === ctx.userId && !active) return apiError("You cannot deactivate your own account", 409);
  if (role === "owner" && member.role !== "owner") return apiError("Ownership transfer is not available in this release", 409);
  if (ctx.role === "manager" && (member.role !== "technician" || role !== "technician")) return apiError("Managers may only activate or deactivate technicians", 403);
  if (member.role === "owner" && ctx.role !== "owner") return apiError("Only an owner can change an owner", 403);
  if (member.role === "owner" && (role !== "owner" || !active)) return apiError("Ownership transfer requires a separate verified owner workflow", 409);
  const now = new Date();
  await db.batch([
    db.update(memberships).set({ role, active, updatedAt: now }).where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.organizationId))),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "team.membership_updated", entityType: "membership", entityId: membershipId, metadataJson: JSON.stringify({ role, active }), createdAt: now }),
  ]);
  return Response.json({ membershipId, role, active });
}

export async function DELETE(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  const limited = await enforceRateLimit(ctx, "team-administration", 30, 3600); if (limited) return limited;
  const id = new URL(request.url).searchParams.get("id") || "";
  const db = await getDb(); const [invite] = await db.select().from(invitations).where(and(eq(invitations.id, id), eq(invitations.organizationId, ctx.organizationId), eq(invitations.status, "pending"))).limit(1);
  if (!invite) return apiError("Pending invitation not found", 404);
  const now = new Date();
  await db.batch([
    db.update(invitations).set({ status: "revoked", revokedAt: now, tokenHash: null, updatedAt: now }).where(eq(invitations.id, id)),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "team.invitation_revoked", entityType: "invitation", entityId: id, metadataJson: JSON.stringify({ email: invite.email }), createdAt: now }),
  ]);
  return Response.json({ id, status: "revoked" });
}
