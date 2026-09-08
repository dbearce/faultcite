import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { organizations, stripeWebhookEvents } from "../../../../db/schema";
import { stripeBillingConfig, verifyStripeSignature } from "../../../../lib/stripe-billing";

type StripeEvent = { id?: string; type?: string; created?: number; data?: { object?: Record<string, unknown> } };

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const { webhookSecret } = stripeBillingConfig();
  if (!signature || !webhookSecret) return Response.json({ error: "Billing webhook is not configured" }, { status: 503 });
  let rawBody: string;
  try { rawBody = await readLimitedText(request, 1024 * 1024); }
  catch { return Response.json({ error: "Stripe event is too large" }, { status: 413 }); }
  if (!(await verifyStripeSignature(rawBody, signature, webhookSecret))) return Response.json({ error: "Invalid Stripe signature" }, { status: 400 });
  let event: StripeEvent;
  try { event = JSON.parse(rawBody) as StripeEvent; } catch { return Response.json({ error: "Invalid Stripe event" }, { status: 400 }); }
  if (!event.id || !event.type || !Number.isInteger(event.created) || Number(event.created) <= 0) {
    return Response.json({ error: "Stripe event identity and creation time are required" }, { status: 400 });
  }
  const object = event.data?.object || {};
  const metadata = typeof object.metadata === "object" && object.metadata ? object.metadata as Record<string, unknown> : {};
  const organizationId = typeof metadata.organization_id === "string" ? metadata.organization_id : typeof object.client_reference_id === "string" ? object.client_reference_id : null;
  const customerId = typeof object.customer === "string" ? object.customer : null;
  const subscriptionId = typeof object.subscription === "string" ? object.subscription : event.type?.startsWith("customer.subscription.") && typeof object.id === "string" ? object.id : null;
  const db = await getDb();
  const [alreadyProcessed] = await db.select({ eventId: stripeWebhookEvents.eventId }).from(stripeWebhookEvents).where(eq(stripeWebhookEvents.eventId, event.id)).limit(1);
  if (alreadyProcessed) return Response.json({ received: true, duplicate: true });
  const identityWhere = organizationId ? eq(organizations.id, organizationId) : customerId ? eq(organizations.stripeCustomerId, customerId) : null;
  if (identityWhere) {
    let subscriptionStatus: string | undefined;
    if (event.type === "checkout.session.completed") subscriptionStatus = "pending";
    if (event.type === "invoice.payment_succeeded") subscriptionStatus = "active";
    if (event.type === "invoice.payment_failed") subscriptionStatus = "past_due";
    if (event.type === "customer.subscription.deleted") subscriptionStatus = "canceled";
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") subscriptionStatus = typeof object.status === "string" ? object.status : undefined;
    if (subscriptionStatus) {
      const eventCreatedAt = new Date(Number(event.created) * 1000);
      const newerEvent = or(
        isNull(organizations.stripeEventCreatedAt),
        lt(organizations.stripeEventCreatedAt, eventCreatedAt),
        and(eq(organizations.stripeEventCreatedAt, eventCreatedAt), lt(organizations.stripeEventId, event.id)),
      );
      await db.update(organizations).set({
        subscriptionStatus,
        plan: ["active", "trialing"].includes(subscriptionStatus) ? "company" : "pilot",
        ...(customerId ? { stripeCustomerId: customerId } : {}),
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        subscriptionUpdatedAt: new Date(),
        stripeEventCreatedAt: eventCreatedAt,
        stripeEventId: event.id,
        updatedAt: new Date(),
      }).where(and(identityWhere, newerEvent));
    }
  }
  await db.insert(stripeWebhookEvents).values({ eventId: event.id, eventType: event.type, processedAt: new Date() }).onConflictDoNothing();
  console.info("[faultcite-billing] webhook processed", { eventId: event.id || "unknown", eventType: event.type || "unknown", matched: Boolean(identityWhere) });
  return Response.json({ received: true });
}

async function readLimitedText(request: Request, maximumBytes: number) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declaredLength) || declaredLength > maximumBytes) throw new Error("Request body is too large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) throw new Error("Request body is too large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
