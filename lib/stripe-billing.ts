import { getRequestEnv } from "./request-env";

type StripeObject = Record<string, unknown> & { id?: string };

const STRIPE_API_VERSION = "2026-02-25.clover";
const STRIPE_REQUEST_TIMEOUT_MS = 10_000;

export function stripeBillingConfig() {
  const env = getRequestEnv();
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const priceId = env.STRIPE_PRICE_ID?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  const enabled = env.FAULTCITE_PAID_BILLING_ENABLED?.trim().toLowerCase() === "true";
  return { secretKey, priceId, webhookSecret, enabled, configured: Boolean(enabled && secretKey && priceId && webhookSecret) };
}

export async function stripePost(path: string, fields: Record<string, string>, idempotencyKey?: string): Promise<StripeObject> {
  const body = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => body.set(key, value));
  return stripeRequest(path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
    body,
  });
}

export async function stripeGet(path: string): Promise<StripeObject> {
  return stripeRequest(path, { method: "GET" });
}

async function stripeRequest(path: string, init: RequestInit): Promise<StripeObject> {
  const { secretKey } = stripeBillingConfig();
  if (!secretKey) throw new Error("Billing is not configured");
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      authorization: `Bearer ${secretKey}`,
      "stripe-version": STRIPE_API_VERSION,
      ...init.headers,
    },
    signal: AbortSignal.timeout(STRIPE_REQUEST_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null) as (StripeObject & { error?: { message?: string } }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error?.message || "Stripe did not accept the billing request");
  return payload;
}

export async function verifyStripeSignature(body: string, signatureHeader: string, secret: string): Promise<boolean> {
  const parts = signatureHeader.split(",").map(part => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some(signature => constantTimeEqual(signature, expected));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
