import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { organizations } from "../../../../db/schema";
import { stripeBillingConfig, verifyStripeSignature } from "../../../../lib/stripe-billing";

type StripeEvent = { id?: string; type?: string; data?: { object?: Record<string, unknown> } };

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const { webhookSecret } = stripeBillingConfig();
  if (!signature || !webhookSecret) return Response.json({ error: "Billing webhook is not configured" }, { status: 503 });
  const rawBody = await request.text();
  if (!(await verifyStripeSignature(rawBody, signature, webhookSecret))) return Response.json({ error: "Invalid Stripe signature" }, { status: 400 });
  let event: StripeEvent;
  try { event = JSON.parse(rawBody) as StripeEvent; } catch { return Response.json({ error: "Invalid Stripe event" }, { status: 400 }); }
  const object = event.data?.object || {};
  const metadata = typeof object.metadata === "object" && object.metadata ? object.metadata as Record<string, unknown> : {};
  const organizationId = typeof metadata.organization_id === "string" ? metadata.organization_id : typeof object.client_reference_id === "string" ? object.client_reference_id : null;
  const customerId = typeof object.customer === "string" ? object.customer : null;
  const subscriptionId = typeof object.subscription === "string" ? object.subscription : event.type?.startsWith("customer.subscription.") && typeof object.id === "string" ? object.id : null;
  const db = await getDb();
  const where = organizationId ? eq(organizations.id, organizationId) : customerId ? eq(organizations.stripeCustomerId, customerId) : null;
  if (where) {
    let subscriptionStatus: string | undefined;
    if (event.type === "checkout.session.completed") subscriptionStatus = "pending";
    if (event.type === "invoice.payment_succeeded") subscriptionStatus = "active";
    if (event.type === "invoice.payment_failed") subscriptionStatus = "past_due";
    if (event.type === "customer.subscription.deleted") subscriptionStatus = "canceled";
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") subscriptionStatus = typeof object.status === "string" ? object.status : undefined;
    if (subscriptionStatus) await db.update(organizations).set({ subscriptionStatus, plan: ["active", "trialing"].includes(subscriptionStatus) ? "company" : "pilot", ...(customerId ? { stripeCustomerId: customerId } : {}), ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}), subscriptionUpdatedAt: new Date(), updatedAt: new Date() }).where(where);
  }
  console.info("[faultcite-billing] webhook processed", { eventId: event.id || "unknown", eventType: event.type || "unknown", matched: Boolean(where) });
  return Response.json({ received: true });
}
