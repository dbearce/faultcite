import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, machines, manuals, manualSources } from "../../../../../db/schema";
import { apiError, cleanText, isErrorResponse, requireApiContext } from "../../../../../lib/backend";

const normalizeIdentity = (value: string | null) => (value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const serialScopeIncludes = (scope: string, serial: string | null) => {
  const normalizedSerial = normalizeIdentity(serial);
  return Boolean(normalizedSerial) && scope.split(/[,;\n]+/).some(value => normalizeIdentity(value) === normalizedSerial);
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);

  try {
    const { id: manualId } = await params;
    const body = await request.json() as Record<string, unknown>;
    const machineId = cleanText(body.machineId, 120, true)!;
    const sectionTitle = cleanText(body.sectionTitle, 180, true)!;
    const alarmCode = cleanText(body.alarmCode, 80);
    const sourceSummary = cleanText(body.sourceSummary, 1600, true)!;
    const safetyNotes = cleanText(body.safetyNotes, 1200, true)!;
    const pageStart = Number(body.pageStart);
    const pageEnd = Number(body.pageEnd);
    const approvalConfirmed = body.approvalConfirmed === true;

    if (!approvalConfirmed) return apiError("Confirm that you reviewed the exact pages and applicability before approval");
    if (!Number.isInteger(pageStart) || !Number.isInteger(pageEnd) || pageStart < 1 || pageEnd < pageStart || pageEnd > 9999) {
      return apiError("Enter a valid page range from 1 to 9999");
    }

    const db = await getDb();
    const [[manual], [machine]] = await Promise.all([
      db.select().from(manuals).where(and(eq(manuals.id, manualId), eq(manuals.organizationId, ctx.organizationId))).limit(1),
      db.select().from(machines).where(and(eq(machines.id, machineId), eq(machines.organizationId, ctx.organizationId))).limit(1),
    ]);
    if (!manual) return apiError("Manual not found in your company", 404);
    if (manual.status !== "approved") return apiError("Approve the manual metadata before approving exact pages", 409);
    if (!machine) return apiError("Machine not found in your company", 404);
    if (!manual.pageCount) return apiError("This older manual has no verified PDF page count. Re-upload it before approving exact pages.", 409);
    if (!manual.revalidationDueAt || manual.revalidationDueAt.valueOf() <= Date.now()) return apiError("This manual must be revalidated before exact pages can be approved", 409);
    if (pageEnd > manual.pageCount) return apiError(`This PDF has ${manual.pageCount} pages. Correct the reviewed page range.`, 409);
    if (normalizeIdentity(manual.manufacturer) !== normalizeIdentity(machine.manufacturer)) {
      return apiError("The manual manufacturer does not match the registered machine", 409);
    }
    if (manual.model && normalizeIdentity(manual.model) !== normalizeIdentity(machine.model)) {
      return apiError("The manual model does not match the registered machine", 409);
    }
    if (manual.serialApplicability) {
      if (!serialScopeIncludes(manual.serialApplicability, machine.serialNumber)) {
        return apiError("The registered machine serial number is not included in this manual's recorded applicability", 409);
      }
    }
    const duplicate = await db.select({ id: manualSources.id }).from(manualSources).where(and(
      eq(manualSources.organizationId, ctx.organizationId), eq(manualSources.manualId, manualId),
      eq(manualSources.machineId, machineId), eq(manualSources.sectionTitle, sectionTitle),
      eq(manualSources.pageStart, pageStart), eq(manualSources.pageEnd, pageEnd),
    )).limit(1);
    if (duplicate.length) return apiError("These exact pages are already approved for this machine", 409);

    const now = new Date();
    const source = {
      id: crypto.randomUUID(), organizationId: ctx.organizationId, manualId, machineId,
      approvedByUserId: ctx.userId, manufacturer: machine.manufacturer, model: machine.model,
      serialNumber: machine.serialNumber, alarmCode, sectionTitle, pageStart, pageEnd,
      sourceSummary, safetyNotes, approvedAt: now, createdAt: now,
    };
    await db.batch([
      db.insert(manualSources).values(source),
      db.insert(auditLogs).values({
        id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId,
        action: "manual_source.approved", entityType: "manual_source", entityId: source.id,
        metadataJson: JSON.stringify({ manualId, machineId, sectionTitle, pageStart, pageEnd, alarmCode }), createdAt: now,
      }),
    ]);
    return Response.json({ source: { ...source, approvedByUserId: undefined, organizationId: undefined } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("A required field") ? error.message : "The reviewed source could not be approved";
    return apiError(message);
  }
}
