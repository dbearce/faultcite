import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { organizations } from "../../../db/schema";
import { apiError, enforceRateLimit, isErrorResponse, requireApiContext } from "../../../lib/backend";
import { stripeBillingConfig, stripePost } from "../../../lib/stripe-billing";
import { getRequestEnv } from "../../../lib/request-env";

export async function GET() {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  if (ctx.role !== "owner") return apiError("Owner permission required", 403);
  const [organization] = await (await getDb()).select({ plan: organizations.plan, subscriptionStatus: organizations.subscriptionStatus, stripeCustomerId: organizations.stripeCustomerId, stripeSubscriptionId: organizations.stripeSubscriptionId }).from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1);
  return Response.json({ configured: stripeBillingConfig().configured, plan: organization?.plan || "pilot", status: organization?.subscriptionStatus || "not_configured", hasCustomer: Boolean(organization?.stripeCustomerId), hasSubscription: Boolean(organization?.stripeSubscriptionId) });
}

export async function POST(request: Request) {
  const ctx = await requireApiContext();
  if (isErrorResponse(ctx)) return ctx;
  if (ctx.role !== "owner") return apiError("Owner permission required", 403);
  const limited = await enforceRateLimit(ctx, "billing-session", 8, 3600);
  if (limited) return limited;
  let body: { action?: string };
  try { body = await request.json() as { action?: string }; } catch { return apiError("Invalid billing request"); }
  const config = stripeBillingConfig();
  if (!config.configured) return apiError("Billing setup is incomplete. Add the Stripe secret, price, and webhook secret before starting a subscription.", 503);
  const env = getRequestEnv();
  const appOrigin = env.FAULTCITE_APP_ORIGIN?.trim();
  if (!appOrigin?.startsWith("https://")) return apiError("Billing return URL is not configured", 503);
  const db = await getDb();
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1);
  if (!organization) return apiError("Company workspace not found", 404);
  try {
    let customerId = organization.stripeCustomerId;
    if (!customerId) {
      const customer = await stripePost("customers", { name: organization.name, email: ctx.email, "metadata[organization_id]": organization.id }, `faultcite-customer-${organization.id}`);
      if (typeof customer.id !== "string") throw new Error("Stripe did not return a customer record");
      customerId = customer.id;
      await db.update(organizations).set({ stripeCustomerId: customerId, subscriptionUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(organizations.id, organization.id));
    }
    if (body.action === "portal") {
      const portal = await stripePost("billing_portal/sessions", { customer: customerId, return_url: `${appOrigin}/` });
      if (typeof portal.url !== "string") throw new Error("Stripe did not return a billing portal link");
      return Response.json({ url: portal.url });
    }
    if (body.action !== "checkout") return apiError("Unknown billing action");
    if (organization.subscriptionStatus === "active" || organization.subscriptionStatus === "trialing") return apiError("This company already has an active subscription", 409);
    const checkout = await stripePost("checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": config.priceId!,
      "line_items[0][quantity]": "1",
      success_url: `${appOrigin}/?billing=success`,
      cancel_url: `${appOrigin}/?billing=cancelled`,
      client_reference_id: organization.id,
      "metadata[organization_id]": organization.id,
      "subscription_data[metadata][organization_id]": organization.id,
    }, `faultcite-checkout-${organization.id}-${new Date().toISOString().slice(0, 13)}`);
    if (typeof checkout.url !== "string") throw new Error("Stripe did not return a checkout link");
    return Response.json({ url: checkout.url });
  } catch (error) {
    console.error("[faultcite-billing] session creation failed", { organizationId: ctx.organizationId, error: error instanceof Error ? error.name : "UnknownError" });
    return apiError("The secure billing provider could not complete this request. Try again or contact support.", 502);
  }
}
