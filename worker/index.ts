/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runWithRequestEnv } from "../lib/request-env";
import { applyAppSecurityHeaders } from "../lib/security-headers";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  FAULTCITE_APP_ORIGIN?: string;
  FAULTCITE_RUNTIME?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  FAULTCITE_PAID_BILLING_ENABLED?: string;
  RESEND_API_KEY?: string;
  FAULTCITE_CONTACT_EMAIL?: string;
  FAULTCITE_EMAIL_FROM?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requestId = request.headers.get("cf-ray") || crypto.randomUUID();

    const canonicalOrigin = canonicalAppOrigin(env.FAULTCITE_APP_ORIGIN);
    const isLegacySitesHost = url.hostname.endsWith(".chatgpt.site");
    const isDocumentRequest = ["GET", "HEAD"].includes(request.method) &&
      (request.headers.get("sec-fetch-dest") === "document" || request.headers.get("accept")?.includes("text/html"));
    if (canonicalOrigin && isLegacySitesHost && isDocumentRequest && url.origin !== canonicalOrigin) {
      const destination = new URL(`${url.pathname}${url.search}`, canonicalOrigin);
      return secure(Response.redirect(destination, 308), url.pathname);
    }

    const signedWebhook = url.pathname === "/api/webhooks/stripe";
    const publicPilotInterest = url.pathname === "/api/pilot-interest" && request.method === "POST" && ["https://faultcite.com", "https://www.faultcite.com"].includes(request.headers.get("origin") || "");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !signedWebhook && !publicPilotInterest) {
      const origin = request.headers.get("origin");
      const fetchSite = request.headers.get("sec-fetch-site");
      if (origin !== url.origin || (fetchSite && fetchSite !== "same-origin")) {
        return new Response(JSON.stringify({ error: "Cross-site request blocked" }), {
          status: 403,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const declaredLength = Number(request.headers.get('content-length') || 0);
      const maximumBodyBytes = url.pathname === '/api/manuals' ? 51 * 1024 * 1024 : url.pathname.endsWith('/evidence') ? 11 * 1024 * 1024 : 1024 * 1024;
      if (declaredLength > maximumBodyBytes) return secure(new Response(JSON.stringify({ error: 'Request body is too large' }), { status: 413, headers: { 'content-type': 'application/json; charset=utf-8' } }), url.pathname);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return secure(await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths), url.pathname);
    }

    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.delete("x-faultcite-runtime");
    forwardedHeaders.delete("x-faultcite-request-url");
    forwardedHeaders.delete("x-faultcite-request-method");
    if (env.FAULTCITE_RUNTIME?.trim().toLowerCase() === "standalone") forwardedHeaders.set("x-faultcite-runtime", "standalone");
    forwardedHeaders.set("x-faultcite-request-url", url.toString());
    forwardedHeaders.set("x-faultcite-request-method", request.method);
    forwardedHeaders.set("x-faultcite-request-id", requestId);
    const applicationRequest = new Request(request, { headers: forwardedHeaders });
    try {
      const response = await runWithRequestEnv(env, async () => handler.fetch(applicationRequest, env, ctx));
      if (response.status >= 500) console.error("[faultcite-runtime] request failed", { requestId, method: request.method, path: url.pathname, status: response.status });
      return secure(response, url.pathname, requestId);
    } catch (error) {
      console.error("[faultcite-runtime] unhandled request failure", { requestId, method: request.method, path: url.pathname, error: error instanceof Error ? error.name : "UnknownError" });
      return secure(Response.json({ error: "FaultCite could not complete this request", requestId }, { status: 500 }), url.pathname, requestId);
    }
  },
};

function secure(response: Response, pathname = "", requestId?: string) {
  const secured = new Response(response.body, response);
  applyAppSecurityHeaders(secured.headers);
  secured.headers.set("x-faultcite-release", "0.3.9");
  if (requestId) secured.headers.set("x-faultcite-request-id", requestId);
  if (pathname.startsWith("/api/")) secured.headers.set("cache-control", "private, no-store");
  if (secured.headers.get("content-type")?.includes("text/html")) {
    secured.headers.set("cache-control", "private, no-store, max-age=0, must-revalidate");
  }
  return secured;
}

function canonicalAppOrigin(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export default worker;
