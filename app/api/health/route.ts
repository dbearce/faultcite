export async function GET() {
  const startedAt = Date.now();
  const { env } = await import("cloudflare:workers");
  const [database, fileStorage] = await Promise.allSettled([
    env.DB.prepare("SELECT 1 AS healthy").first(),
    env.BUCKET.list({ limit: 1 }),
  ]);
  const dependencies = {
    database: database.status === "fulfilled" ? "ok" : "unavailable",
    fileStorage: fileStorage.status === "fulfilled" ? "ok" : "unavailable",
  };
  const healthy = database.status === "fulfilled" && fileStorage.status === "fulfilled";
  return Response.json(
    { status: healthy ? "ok" : "degraded", service: "faultcite", release: "0.3.7", dependencies, responseTimeMs: Date.now() - startedAt, time: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store", ...(healthy ? {} : { "retry-after": "30" }) } },
  );
}
