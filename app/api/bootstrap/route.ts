import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { cases, invitations, machines, manuals, memberships, organizations, users } from "../../../db/schema";
import { ACTIVE_ORGANIZATION_COOKIE, apiError, isErrorResponse, readJsonObject, requireApiContext } from "../../../lib/backend";
import { caseApiView, invitationApiView, manualApiView } from "../../../lib/api-views";

export async function GET() {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  const db = await getDb();
  const canManage = ["owner", "manager"].includes(ctx.role);
  const [[organization], workspaceRows, machineRows, caseRows, manualRows, teamRows, inviteRows] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1),
    db.select({ id: organizations.id, name: organizations.name, role: memberships.role })
      .from(memberships).innerJoin(organizations, eq(memberships.organizationId, organizations.id))
      .where(and(eq(memberships.userId, ctx.userId), eq(memberships.active, true))),
    db.select().from(machines).where(eq(machines.organizationId, ctx.organizationId)).limit(500),
    db.select().from(cases).where(eq(cases.organizationId, ctx.organizationId)).limit(500),
    db.select().from(manuals).where(eq(manuals.organizationId, ctx.organizationId)).limit(500),
    canManage ? db.select({ id: memberships.id, role: memberships.role, active: memberships.active, userId: users.id, email: users.email, displayName: users.displayName }).from(memberships).innerJoin(users, eq(memberships.userId, users.id)).where(eq(memberships.organizationId, ctx.organizationId)) : Promise.resolve([]),
    canManage ? db.select().from(invitations).where(eq(invitations.organizationId, ctx.organizationId)).limit(500) : Promise.resolve([]),
  ]);
  return Response.json({ user: { id: ctx.userId, email: ctx.email, displayName: ctx.displayName, role: ctx.role }, organization, workspaces: workspaceRows, machines: machineRows, cases: caseRows.map(caseApiView), manuals: manualRows.map(manualApiView), team: teamRows, invitations: inviteRows.map(invitationApiView) });
}

export async function POST(request: Request) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  let body: Record<string, unknown>;
  try { body = await readJsonObject(request); }
  catch (error) { return apiError(error instanceof Error ? error.message : "Invalid JSON request"); }
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : "";
  if (!organizationId) return apiError("Choose a company workspace");
  const [membership] = await (await getDb()).select().from(memberships).where(and(eq(memberships.userId, ctx.userId), eq(memberships.organizationId, organizationId), eq(memberships.active, true))).limit(1);
  if (!membership) return apiError("That company workspace is not available to your account", 403);
  return Response.json({ organizationId }, { headers: { "set-cookie": `${ACTIVE_ORGANIZATION_COOKIE}=${organizationId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`, "cache-control": "private, no-store" } });
}
