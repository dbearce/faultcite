import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, pilotFeedback } from "../../../db/schema";
import { apiError, cleanText, enforceRateLimit, isErrorResponse, requireApiContext } from "../../../lib/backend";

const categories = new Set(["product_feedback", "support_request", "safety_concern"]);
const severities = new Set(["low", "normal", "high", "urgent"]);

export async function POST(request: Request) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  const limited = await enforceRateLimit(ctx, "pilot-feedback", 10, 3600);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return apiError("Invalid JSON request"); }
  let category: string; let severity: string; let message: string; let caseNumber: string | null;
  try { category = cleanText(body.category, 40, true)!; severity = cleanText(body.severity, 20, true)!; message = cleanText(body.message, 2000, true)!; caseNumber = cleanText(body.caseNumber, 80); }
  catch { return apiError("Type, priority, and a description are required"); }
  if (!categories.has(category)) return apiError("Choose a valid feedback category");
  if (!severities.has(severity)) return apiError("Choose a valid priority");
  if (message.length < 10) return apiError("Describe the issue or feedback in at least 10 characters");
  if (category === "safety_concern" && severity !== "urgent") return apiError("Safety concerns must be marked urgent");
  const id = crypto.randomUUID(); const now = new Date(); const db = await getDb();
  await db.batch([
    db.insert(pilotFeedback).values({ id, organizationId: ctx.organizationId, submittedByUserId: ctx.userId, category, severity, message, caseNumber, contactRequested: body.contactRequested === true, createdAt: now }),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: "pilot.feedback_submitted", entityType: "pilot_feedback", entityId: id, metadataJson: JSON.stringify({ category, severity, caseNumber, contactRequested: body.contactRequested === true }), createdAt: now }),
  ]);
  return Response.json({ feedback: { id, category, severity, status: "open", createdAt: now } }, { status: 201, headers: { "cache-control": "private, no-store" } });
}

export async function GET() {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  const rows = await (await getDb()).select().from(pilotFeedback).where(and(eq(pilotFeedback.organizationId, ctx.organizationId), eq(pilotFeedback.status, "open"))).orderBy(desc(pilotFeedback.createdAt)).limit(100);
  return Response.json({ feedback: rows }, { headers: { "cache-control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  if (!["owner", "manager"].includes(ctx.role)) return apiError("Manager permission required", 403);
  const limited = await enforceRateLimit(ctx, "pilot-feedback-resolution", 60, 3600);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return apiError("Invalid JSON request"); }
  const id = cleanText(body.id, 80); const status = cleanText(body.status, 20); const resolutionNotes = cleanText(body.resolutionNotes, 1000);
  if (!id || !status || !["in_progress", "resolved"].includes(status)) return apiError("Feedback item and a valid status are required");
  if (status === "resolved" && (!resolutionNotes || resolutionNotes.length < 5)) return apiError("Add a short resolution note before resolving feedback");
  const db = await getDb(); const now = new Date();
  const [record] = await db.select({ id: pilotFeedback.id }).from(pilotFeedback).where(and(eq(pilotFeedback.id, id), eq(pilotFeedback.organizationId, ctx.organizationId))).limit(1);
  if (!record) return apiError("Feedback item not found in your company", 404);
  await db.batch([
    db.update(pilotFeedback).set({ status, resolutionNotes, resolvedByUserId: status === "resolved" ? ctx.userId : null, resolvedAt: status === "resolved" ? now : null }).where(and(eq(pilotFeedback.id, id), eq(pilotFeedback.organizationId, ctx.organizationId))),
    db.insert(auditLogs).values({ id: crypto.randomUUID(), organizationId: ctx.organizationId, actorUserId: ctx.userId, action: `pilot.feedback_${status}`, entityType: "pilot_feedback", entityId: id, metadataJson: JSON.stringify({ resolutionNotes }), createdAt: now }),
  ]);
  return Response.json({ feedback: { id, status, resolutionNotes, resolvedAt: status === "resolved" ? now : null } }, { headers: { "cache-control": "private, no-store" } });
}
