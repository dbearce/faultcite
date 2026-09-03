import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../db";
import { manuals, manualSources } from "../../../db/schema";
import { apiError, isErrorResponse, requireApiContext } from "../../../lib/backend";

export async function GET(request: Request) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  const url = new URL(request.url);
  const machineId = url.searchParams.get("machineId")?.trim();
  const alarmCode = url.searchParams.get("alarmCode")?.trim().toLowerCase() || "";
  if (!machineId) return apiError("A registered machine is required");

  const rows = await (await getDb()).select({
    id: manualSources.id, manualId: manualSources.manualId, machineId: manualSources.machineId,
    manufacturer: manualSources.manufacturer, model: manualSources.model, serialNumber: manualSources.serialNumber,
    alarmCode: manualSources.alarmCode, sectionTitle: manualSources.sectionTitle,
    pageStart: manualSources.pageStart, pageEnd: manualSources.pageEnd,
    sourceSummary: manualSources.sourceSummary, safetyNotes: manualSources.safetyNotes,
    approvedAt: manualSources.approvedAt, manualTitle: manuals.title, manualRevision: manuals.revision,
  }).from(manualSources).innerJoin(manuals, eq(manualSources.manualId, manuals.id)).where(and(
    eq(manualSources.organizationId, ctx.organizationId),
    eq(manualSources.machineId, machineId),
    eq(manuals.organizationId, ctx.organizationId),
    eq(manuals.status, "approved"),
    gt(manuals.revalidationDueAt, new Date()),
  ));

  const applicable = rows.filter(row => {
    const requiredAlarm = row.alarmCode?.trim().toLowerCase() || "";
    return !requiredAlarm || Boolean(alarmCode && requiredAlarm === alarmCode);
  });
  return Response.json({ sources: applicable }, { headers: { "cache-control": "private, no-store" } });
}
