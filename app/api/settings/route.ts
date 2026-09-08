import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, governanceAcknowledgements, organizations } from "../../../db/schema";
import { apiError, cleanText, isErrorResponse, requireApiContext } from "../../../lib/backend";
export async function GET(){const ctx=await requireApiContext();if(isErrorResponse(ctx))return ctx;if(ctx.role!=="owner")return apiError("Owner permission required",403);const [organization]=await (await getDb()).select().from(organizations).where(eq(organizations.id,ctx.organizationId)).limit(1);if(!organization)return apiError("Company not found",404);return Response.json({organization});}

export const GOVERNANCE_ACKNOWLEDGEMENT = {
  documentId: "owner-safety-responsibility",
  documentVersion: "1.0",
  text: "I acknowledge that qualified people, employer safety procedures, LOTO, and approved OEM information remain authoritative.",
} as const;

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function PATCH(request: Request) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  if (ctx.role !== "owner") return apiError("Owner permission required", 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return apiError("Invalid JSON request"); }
  const reviewSlaMinutes = Number(body.reviewSlaMinutes);
  const dataRetentionDays = Number(body.dataRetentionDays);
  if (!Number.isInteger(reviewSlaMinutes) || reviewSlaMinutes < 15 || reviewSlaMinutes > 10080) return apiError("Review SLA must be between 15 minutes and 7 days");
  if (!Number.isInteger(dataRetentionDays) || dataRetentionDays < 365 || dataRetentionDays > 3650) return apiError("Retention must be between 1 and 10 years");
  const safetyContactEmail = cleanText(body.safetyContactEmail, 254, true)!;
  const supportContactEmail = cleanText(body.supportContactEmail, 254, true)!;
  if (!safetyContactEmail.includes("@") || !supportContactEmail.includes("@")) return apiError("Enter valid safety and support email addresses");
  if (body.termsAccepted !== true) return apiError("Owner responsibility acknowledgement is required");

  const now = new Date();
  const db = await getDb();
  const acknowledgementId = crypto.randomUUID();
  const documentHash = await sha256Hex(GOVERNANCE_ACKNOWLEDGEMENT.text);
  await db.batch([
    db.update(organizations).set({ reviewSlaMinutes, dataRetentionDays, safetyContactEmail, supportContactEmail, termsAcceptedAt: now, updatedAt: now }).where(eq(organizations.id, ctx.organizationId)),
    db.insert(governanceAcknowledgements).values({ id: acknowledgementId, organizationId: ctx.organizationId, actorUserId: ctx.userId, documentId: GOVERNANCE_ACKNOWLEDGEMENT.documentId, documentVersion: GOVERNANCE_ACKNOWLEDGEMENT.documentVersion, documentHash, acknowledgementText: GOVERNANCE_ACKNOWLEDGEMENT.text, acknowledgedAt: now }),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "organization.governance_updated", entityType: "organization", entityId: ctx.organizationId, metadataJson: JSON.stringify({ reviewSlaMinutes, dataRetentionDays, acknowledgementId, documentId: GOVERNANCE_ACKNOWLEDGEMENT.documentId, documentVersion: GOVERNANCE_ACKNOWLEDGEMENT.documentVersion, documentHash }), createdAt: now }),
  ]);
  return Response.json({ reviewSlaMinutes, dataRetentionDays, safetyContactEmail, supportContactEmail, termsAcceptedAt: now });
}
