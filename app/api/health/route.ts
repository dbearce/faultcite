type CheckResult = { status: "ok" | "error"; latencyMs: number };

const CHECK_TIMEOUT_MS = 2_000;

async function timedCheck(check: () => Promise<void>): Promise<CheckResult> {
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) =>
        { timeout = setTimeout(() => reject(new Error("dependency check timed out")), CHECK_TIMEOUT_MS); },
      ),
    ]);
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch {
    // Health is public. Never return provider errors, resource names, or secrets.
    return { status: "error", latencyMs: Date.now() - startedAt };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  const { env } = await import("cloudflare:workers");
  const [database, objectStorage] = await Promise.all([
    timedCheck(async () => {
      const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      if (result?.ok !== 1) throw new Error("unexpected database result");
    }),
    timedCheck(async () => {
      // A one-key listing is read-only and confirms that the Worker can reach the
      // configured bucket without creating probe objects.
      await env.BUCKET.list({ limit: 1 });
    }),
  ]);

  const healthy = database.status === "ok" && objectStorage.status === "ok";
  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "faultcite",
      release: "0.3.3",
      environment: env.FAULTCITE_ENVIRONMENT || "unknown",
      checks: { database, objectStorage },
      time: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}
