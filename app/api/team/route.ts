import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { invitations, memberships, users } from "../../../db/schema";
import { apiError, cleanText, isErrorResponse, readJsonObject, requireApiContext, writeAudit } from "../../../lib/backend";
import { invitationApiView } from "../../../lib/api-views";

const roles = new Set(["technician", "manager"]);

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

async function sendInvitationEmail(email: string, role: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FAULTCITE_FROM_EMAIL;
  const appOrigin = process.env.FAULTCITE_APP_ORIGIN;
  if (!apiKey || !appOrigin || !from) return { sent: false, reason: "Email delivery is not configured" };
  if (!/^[^\r\n<>]+<[^\r\n<>\s]+@faultcite\.com>$/.test(from)) return { sent: false, reason: "Email sender is not configured safely" };
  let safeOrigin: string;
  try {
    const url = new URL(appOrigin);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    safeOrigin = url.origin;
  } catch { return { sent: false, reason: "Email delivery origin is invalid" }; }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      from,
      to: [email],
      subject: "You are invited to FaultCite",
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px"><p style="color:#147d70;font-weight:800;letter-spacing:.12em">FAULTCITE</p><h1>Your maintenance workspace is ready</h1><p>You were invited as a ${role === "manager" ? "manager" : "maintenance technician"}. Sign in using <strong>${escapeHtml(email)}</strong> within seven days.</p><p><a href="${escapeHtml(safeOrigin)}" style="display:inline-block;background:#0b2436;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open FaultCite</a></p><p style="color:#667085;font-size:13px">If you were not expecting this invitation, you can ignore this email.</p></div>`,
    }),
  });
  await response.body?.cancel();
  return response.ok ? { sent: true } : { sent: false, reason: `Email provider returned ${response.status}` };
}

export async function GET() {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  const db = await getDb();
  const [team, invites] = await Promise.all([
    db.select({ id: memberships.id, role: memberships.role, active: memberships.active, userId: users.id, email: users.email, displayName: users.displayName }).from(memberships).innerJoin(users, eq(memberships.userId, users.id)).where(eq(memberships.organizationId, ctx.organizationId)).limit(500),
    db.select().from(invitations).where(eq(invitations.organizationId, ctx.organizationId)).limit(500),
  ]);
  return Response.json({ team, invitations: invites.map(invitationApiView) });
}

export async function POST(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  let body: Record<string, unknown>; try { body = await readJsonObject(request); } catch (error) { return apiError(error instanceof Error ? error.message : "Invalid JSON request"); }
  const email = (cleanText(body.email, 320) || "").toLowerCase(); const role = cleanText(body.role, 20) || "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return apiError("Enter a valid technician email");
  if (!roles.has(role)) return apiError("Invalid team role");
  const db = await getDb();
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    const [member] = await db.select().from(memberships).where(and(eq(memberships.organizationId, ctx.organizationId), eq(memberships.userId, existingUser.id))).limit(1);
    if (member) return apiError("This person is already on the team", 409);
  }
  const [existing] = await db.select().from(invitations).where(and(eq(invitations.organizationId, ctx.organizationId), eq(invitations.email, email))).limit(1);
  const id = existing?.id || crypto.randomUUID(); const now = new Date(); const expiresAt = new Date(now.valueOf() + 7 * 24 * 60 * 60 * 1000);
  if (existing) await db.update(invitations).set({ role, status: "pending", invitedByUserId: ctx.userId, acceptedByUserId: null, acceptedAt: null, expiresAt, updatedAt: now }).where(eq(invitations.id, id));
  else await db.insert(invitations).values({ id, organizationId: ctx.organizationId, email, role, invitedByUserId: ctx.userId, expiresAt });
  await writeAudit(ctx, "team.invited", "invitation", id, { email, role });
  const delivery = await sendInvitationEmail(email, role).catch(() => ({ sent: false, reason: "Email delivery could not be reached" }));
  await writeAudit(ctx, delivery.sent ? "team.invitation_email_sent" : "team.invitation_email_failed", "invitation", id, { email, reason: delivery.sent ? undefined : delivery.reason });
  return Response.json({ invitation: { id, email, role, status: "pending", expiresAt }, emailSent: delivery.sent, emailError: delivery.sent ? null : delivery.reason }, { status: 201 });
}

export async function PATCH(request: Request) {
  const ctx = await requireApiContext(); if (isErrorResponse(ctx)) return ctx;
  if (!['owner','manager'].includes(ctx.role)) return apiError("Manager permission required", 403);
  let body: Record<string, unknown>; try { body = await readJsonObject(request); } catch (error) { return apiError(error instanceof Error ? error.message : "Invalid JSON request"); }
  const membershipId = cleanText(body.membershipId, 80) || ""; const role = cleanText(body.role, 20) || ""; const active = body.active;
  if (!membershipId) return apiError("Team member is required");
  if (!roles.has(role) && role !== "owner") return apiError("Invalid team role");
  if (typeof active !== "boolean") return apiError("Active status is required");
  const db = await getDb(); const [member] = await db.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.organizationId))).limit(1);
  if (!member) return apiError("Team member not found", 404);
  if (member.userId === ctx.userId && !active) return apiError("You cannot deactivate your own account", 409);
  if (role === "owner" && member.role !== "owner") return apiError("Ownership transfer is not enabled in this controlled pilot", 409);
  if (ctx.role === "manager" && (member.role !== "technician" || role !== "technician")) return apiError("Managers may only activate or deactivate technicians", 403);
  if (member.role === "owner" && ctx.role !== "owner") return apiError("Only an owner can change an owner", 403);
  if (member.role === "owner" && (role !== "owner" || !active)) return apiError("Ownership transfer requires a separate verified owner workflow", 409);
  await db.update(memberships).set({ role, active, updatedAt: new Date() }).where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.organizationId)));
  await writeAudit(ctx, "team.membership_updated", "membership", membershipId, { role, active });
  return Response.json({ membershipId, role, active });
}
