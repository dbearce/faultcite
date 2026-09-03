import { and, desc, eq, gt, inArray, notInArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { cases, invitations, machines, manuals, manualSources, memberships, organizations, users } from "../../../db/schema";
import { isErrorResponse, requireApiContext } from "../../../lib/backend";

export async function GET() {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  const db = await getDb();
  const canManage = ["owner", "manager"].includes(ctx.role);
  const activeStatuses = ["open", "diagnosing", "review_requested", "cause_confirmed", "closeout_requested", "escalated"];
  const historyPageSize = 100;
  const [[organization], machineRows, activeCaseRows, historyCaseRows, manualRows, sourceRows, teamRows, inviteRows, workspaceRows] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1),
    db.select().from(machines).where(eq(machines.organizationId, ctx.organizationId)),
    db.select().from(cases).where(and(eq(cases.organizationId, ctx.organizationId), inArray(cases.status, activeStatuses))).orderBy(desc(cases.openedAt)),
    db.select().from(cases).where(and(eq(cases.organizationId, ctx.organizationId), notInArray(cases.status, activeStatuses))).orderBy(desc(cases.openedAt)).limit(historyPageSize + 1),
    db.select({ id: manuals.id, title: manuals.title, manufacturer: manuals.manufacturer, model: manuals.model, revision: manuals.revision, serialApplicability: manuals.serialApplicability, documentType: manuals.documentType, publicationDate: manuals.publicationDate, effectiveDate: manuals.effectiveDate, language: manuals.language, revalidationDueAt: manuals.revalidationDueAt, documentOwnerUserId: manuals.documentOwnerUserId, pageCount: manuals.pageCount, fileName: manuals.fileName, contentType: manuals.contentType, sizeBytes: manuals.sizeBytes, status: manuals.status, rightsConfirmed: manuals.rightsConfirmed, reviewNotes: manuals.reviewNotes, reviewedAt: manuals.reviewedAt, createdAt: manuals.createdAt, updatedAt: manuals.updatedAt }).from(manuals).where(eq(manuals.organizationId, ctx.organizationId)),
    db.select({ id: manualSources.id, manualId: manualSources.manualId, machineId: manualSources.machineId, manufacturer: manualSources.manufacturer, model: manualSources.model, serialNumber: manualSources.serialNumber, alarmCode: manualSources.alarmCode, sectionTitle: manualSources.sectionTitle, pageStart: manualSources.pageStart, pageEnd: manualSources.pageEnd, sourceSummary: manualSources.sourceSummary, safetyNotes: manualSources.safetyNotes, approvedAt: manualSources.approvedAt }).from(manualSources).innerJoin(manuals, eq(manualSources.manualId, manuals.id)).where(and(eq(manualSources.organizationId, ctx.organizationId), eq(manuals.organizationId, ctx.organizationId), eq(manuals.status, "approved"), gt(manuals.revalidationDueAt, new Date()))),
    canManage ? db.select({ id: memberships.id, role: memberships.role, active: memberships.active, userId: users.id, email: users.email, displayName: users.displayName }).from(memberships).innerJoin(users, eq(memberships.userId, users.id)).where(eq(memberships.organizationId, ctx.organizationId)) : Promise.resolve([]),
    canManage ? db.select({ id: invitations.id, email: invitations.email, role: invitations.role, status: invitations.status, expiresAt: invitations.expiresAt, deliveredAt: invitations.deliveredAt, createdAt: invitations.createdAt, updatedAt: invitations.updatedAt }).from(invitations).where(eq(invitations.organizationId, ctx.organizationId)) : Promise.resolve([]),
    db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug, status: organizations.status, role: memberships.role, active: memberships.active })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
      .where(and(eq(memberships.userId, ctx.userId), eq(memberships.active, true))),
  ]);
  const casesPage = [...activeCaseRows, ...historyCaseRows.slice(0, historyPageSize)].sort((a, b) => new Date(b.openedAt).valueOf() - new Date(a.openedAt).valueOf());
  return Response.json({ user: { id: ctx.userId, email: ctx.email, displayName: ctx.displayName, role: ctx.role, platformAdmin: ctx.platformAdmin }, organization, organizations: workspaceRows, machines: machineRows, cases: casesPage, hasMoreCases: historyCaseRows.length > historyPageSize, manuals: manualRows, manualSources: sourceRows, team: teamRows, invitations: inviteRows });
}
