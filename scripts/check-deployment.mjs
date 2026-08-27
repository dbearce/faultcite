const [origin, expectedEnvironment, expectedRelease] = process.argv.slice(2);
if (!origin || !/^https:\/\//.test(origin) || !["staging", "production"].includes(expectedEnvironment) || !expectedRelease) {
  console.error("usage: node scripts/check-deployment.mjs https://expected-origin.example <staging|production> <release>");
  process.exit(64);
}

const expectedOrigin = new URL(origin).origin;
const healthResponse = await fetch(`${expectedOrigin}/api/health`, { signal: AbortSignal.timeout(10_000), redirect: "error" });
const contentType = healthResponse.headers.get("content-type") || "";
if (!contentType.includes("application/json")) throw new Error("Health response was not JSON (possible placeholder deployment)");
const health = await healthResponse.json();
if (!healthResponse.ok || health.status !== "ok") throw new Error(`Health check failed with HTTP ${healthResponse.status}`);
if (health.service !== "faultcite") throw new Error("Unexpected service identity");
if (health.release !== expectedRelease) throw new Error(`Expected release ${expectedRelease}, received ${health.release || "unknown"}`);
if (health.environment !== expectedEnvironment) throw new Error(`Expected environment ${expectedEnvironment}, received ${health.environment || "unknown"}`);
if (health.checks?.database?.status !== "ok" || health.checks?.objectStorage?.status !== "ok") {
  throw new Error("A required dependency is unhealthy");
}
if (healthResponse.headers.get("cache-control") !== "no-store") throw new Error("Health response must not be cached");

const pageResponse = await fetch(expectedOrigin, { signal: AbortSignal.timeout(10_000), redirect: "follow" });
const page = await pageResponse.text();
if (!pageResponse.ok || !/FaultCite/i.test(page)) throw new Error("FaultCite application shell was not detected");
if (/Hello World!/i.test(page)) throw new Error("Placeholder Worker is still deployed");
console.log(`Deployment check passed for ${expectedOrigin}: app shell, D1, and R2 are healthy.`);
