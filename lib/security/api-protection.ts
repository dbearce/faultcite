const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function configuredOrigin(): string | null {
  const value = process.env.FAULTCITE_APP_ORIGIN;
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}

export function requestClientKey(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export function rejectCrossSiteMutation(request: Request): Response | null {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return null;
  const allowedOrigin = configuredOrigin();
  if (!allowedOrigin) return Response.json({ error: "Request-origin protection is not configured" }, { status: 503 });

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return Response.json({ error: "Cross-site request blocked" }, { status: 403 });

  const origin = request.headers.get("origin");
  if (!origin) return Response.json({ error: "Request origin is required" }, { status: 403 });
  try {
    if (new URL(origin).origin !== allowedOrigin) return Response.json({ error: "Request origin is not allowed" }, { status: 403 });
  } catch {
    return Response.json({ error: "Request origin is invalid" }, { status: 403 });
  }
  return null;
}

export function enforceRateLimit(request: Request, now = Date.now()): Response | null {
  const limit = MUTATING_METHODS.has(request.method.toUpperCase()) ? 40 : 180;
  const key = `${requestClientKey(request)}:${MUTATING_METHODS.has(request.method.toUpperCase()) ? "write" : "read"}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  if (buckets.size > MAX_BUCKETS) {
    for (const [candidate, value] of buckets) if (value.resetAt <= now) buckets.delete(candidate);
    while (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value!);
  }

  if (bucket.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return Response.json({ error: "Too many requests" }, {
    status: 429,
    headers: { "retry-after": String(retryAfter), "cache-control": "no-store" },
  });
}

export function resetRateLimitsForTests() { buckets.clear(); }
