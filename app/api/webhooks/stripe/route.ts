import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { organizations, stripeWebhookEvents } from "../../../../db/schema";
import { stripeBillingConfig, stripeGet, verifyStripeSignature } from "../../../../lib/stripe-billing";

type StripeEvent = { id?: string; type?: string; created?: number; livemode?: boolean; data?: { object?: Record<string, unknown> } };

const ENTITLEMENT_EVENTS = new Set([
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const config = stripeBillingConfig();
  const { webhookSecret } = config;
  if (!signature || !webhookSecret || !config.configured) return Response.json({ error: "Billing webhook is not configured" }, { status: 503 });
  let rawBody: string;
  try { rawBody = await readLimitedText(request, 1024 * 1024); }
  catch { return Response.json({ error: "Stripe event is too large" }, { status: 413 }); }
  if (!(await verifyStripeSignature(rawBody, signature, webhookSecret))) return Response.json({ error: "Invalid Stripe signature" }, { status: 400 });
  let event: StripeEvent;
  try { event = JSON.parse(rawBody) as StripeEvent; } catch { return Response.json({ error: "Invalid Stripe event" }, { status: 400 }); }
  if (!event.id || !event.type || !Number.isInteger(event.created) || Number(event.created) <= 0) {
    return Response.json({ error: "Stripe event identity and creation time are required" }, { status: 400 });
  }
  const identifiedEvent = event as StripeEvent & { id: string; type: string };
  if (event.livemode !== true) return Response.json({ error: "Live Stripe event required" }, { status: 400 });
  const db = await getDb();
  const [alreadyProcessed] = await db.select({ eventId: stripeWebhookEvents.eventId }).from(stripeWebhookEvents).where(eq(stripeWebhookEvents.eventId, event.id)).limit(1);
  if (alreadyProcessed) return Response.json({ received: true, duplicate: true });
  if (!ENTITLEMENT_EVENTS.has(event.type)) return recordIgnoredEvent(db, identifiedEvent, "unsupported_event");

  const object = event.data?.object || {};
  const subscriptionId = subscriptionIdFromEvent(event.type, object);
  if (!subscriptionId) return recordIgnoredEvent(db, identifiedEvent, "missing_subscription");

  let subscription: Record<string, unknown>;
  try { subscription = await stripeGet(`subscriptions/${encodeURIComponent(subscriptionId)}`); }
  catch (error) {
    console.error("[faultcite-billing] subscription reconciliation failed", { eventId: event.id, error: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Stripe subscription could not be reconciled" }, { status: 502 });
  }
  if (subscription.livemode !== true || subscription.id !== subscriptionId) return recordIgnoredEvent(db, identifiedEvent, "invalid_subscription_mode");
  const customerId = objectId(subscription.customer);
  const metadata = recordValue(subscription.metadata);
  const organizationId = typeof metadata.organization_id === "string" ? metadata.organization_id : null;
  const status = typeof subscription.status === "string" ? subscription.status : null;
  const configuredPrice = config.priceId;
  if (!customerId || !organizationId || !status || !configuredPrice || !subscriptionHasPrice(subscription, configuredPrice)) {
    return recordIgnoredEvent(db, identifiedEvent, "subscription_not_entitled");
  }
  const eventCustomerId = objectId(object.customer);
  const eventOrganizationId = typeof object.client_reference_id === "string" ? object.client_reference_id : null;
  if ((eventCustomerId && eventCustomerId !== customerId) || (eventOrganizationId && eventOrganizationId !== organizationId)) {
    return recordIgnoredEvent(db, identifiedEvent, "event_identity_mismatch");
  }
  const [organization] = await db.select({
    id: organizations.id,
    subscriptionStatus: organizations.subscriptionStatus,
    stripeCustomerId: organizations.stripeCustomerId,
    stripeSubscriptionId: organizations.stripeSubscriptionId,
  }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!organization || organization.stripeCustomerId !== customerId) return recordIgnoredEvent(db, identifiedEvent, "customer_not_linked");
  if (organization.stripeSubscriptionId && organization.stripeSubscriptionId !== subscriptionId && ["active", "trialing"].includes(organization.subscriptionStatus)) {
    return recordIgnoredEvent(db, identifiedEvent, "subscription_not_linked");
  }
  const subscriptionStatus = subscription.pause_collection ? "paused" : status;
  await db.update(organizations).set({
    subscriptionStatus,
    plan: ["active", "trialing"].includes(subscriptionStatus) ? "company" : "pilot",
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    subscriptionUpdatedAt: new Date(),
    stripeEventCreatedAt: new Date(Number(event.created) * 1000),
    stripeEventId: event.id,
    updatedAt: new Date(),
  }).where(eq(organizations.id, organization.id));
  await db.insert(stripeWebhookEvents).values({ eventId: event.id, eventType: event.type, processedAt: new Date() }).onConflictDoNothing();
  console.info("[faultcite-billing] webhook processed", { eventId: event.id, eventType: event.type, matched: true });
  return Response.json({ received: true });
}

function subscriptionIdFromEvent(eventType: string, object: Record<string, unknown>) {
  if (eventType.startsWith("customer.subscription.")) return typeof object.id === "string" && /^sub_[A-Za-z0-9]+$/.test(object.id) ? object.id : null;
  const direct = objectId(object.subscription);
  if (direct && /^sub_[A-Za-z0-9]+$/.test(direct)) return direct;
  const parent = recordValue(object.parent);
  const details = recordValue(parent.subscription_details);
  const nested = objectId(details.subscription);
  return nested && /^sub_[A-Za-z0-9]+$/.test(nested) ? nested : null;
}

function subscriptionHasPrice(subscription: Record<string, unknown>, configuredPrice: string) {
  const items = recordValue(subscription.items);
  const rows = Array.isArray(items.data) ? items.data : [];
  return rows.some(item => {
    const row = recordValue(item);
    const legacyPrice = objectId(row.price);
    const priceDetails = recordValue(recordValue(row.pricing).price_details);
    const currentPrice = objectId(priceDetails.price);
    return legacyPrice === configuredPrice || currentPrice === configuredPrice;
  });
}

function objectId(value: unknown) {
  if (typeof value === "string") return value;
  const object = recordValue(value);
  return typeof object.id === "string" ? object.id : null;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

async function recordIgnoredEvent(db: Awaited<ReturnType<typeof getDb>>, event: StripeEvent & { id: string; type: string }, reason: string) {
  await db.insert(stripeWebhookEvents).values({ eventId: event.id, eventType: event.type, processedAt: new Date() }).onConflictDoNothing();
  console.info("[faultcite-billing] webhook ignored", { eventId: event.id, eventType: event.type, reason });
  return Response.json({ received: true, ignored: true });
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
