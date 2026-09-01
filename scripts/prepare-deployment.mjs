import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const [environment, settingsPath] = process.argv.slice(2);
if (!environment || !settingsPath || !["staging", "production"].includes(environment)) {
  console.error("usage: node scripts/prepare-deployment.mjs <staging|production> <settings.json>");
  process.exit(64);
}

const settings = JSON.parse(await readFile(resolve(settingsPath), "utf8"));
const expected = {
  staging: { origin: "https://staging.faultcite.com", domain: "staging.faultcite.com", suffix: "staging" },
  production: { origin: "https://app.faultcite.com", domain: "app.faultcite.com", suffix: "production" },
}[environment];
const required = ["workerName", "databaseName", "databaseId", "bucketName", "appOrigin", "customDomain", "clerkPublishableKey", "fromEmail"];
for (const key of required) {
  if (!settings[key] || String(settings[key]).includes("REPLACE_")) {
    throw new Error(`Deployment setting ${key} is missing or still a placeholder`);
  }
}
if (settings.environment !== environment) throw new Error("Settings environment does not match requested environment");
if (settings.appOrigin !== expected.origin) throw new Error(`Expected appOrigin ${expected.origin}`);
if (settings.customDomain !== expected.domain) throw new Error(`Expected customDomain ${expected.domain}`);
for (const key of ["workerName", "databaseName", "bucketName"]) {
  if (!settings[key].includes(expected.suffix)) throw new Error(`${key} must identify the ${environment} environment`);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(settings.databaseId)) throw new Error("databaseId does not look like a Cloudflare D1 ID");
if (!/^pk_(test|live)_\S+$/.test(settings.clerkPublishableKey)) throw new Error("clerkPublishableKey does not look like a Clerk publishable key");
if (!/^[^\r\n<>]+<[^\r\n<>\s]+@faultcite\.com>$/.test(settings.fromEmail)) throw new Error("fromEmail must be a faultcite.com mailbox in Name <address> form");

const source = JSON.parse(await readFile(resolve("dist/server/wrangler.json"), "utf8"));
const destination = resolve(".release", environment, "wrangler.json");
const relativePath = (target) => relative(dirname(destination), resolve(target)).replaceAll("\\", "/");
source.name = settings.workerName;
source.main = relativePath("dist/server/index.js");
source.assets = { ...(source.assets || {}), directory: relativePath("dist/client") };
source.vars = {
  ...(source.vars || {}),
  FAULTCITE_APP_ORIGIN: settings.appOrigin,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: settings.clerkPublishableKey,
  FAULTCITE_FROM_EMAIL: settings.fromEmail,
  FAULTCITE_ENVIRONMENT: environment,
};
source.d1_databases = [{ binding: "DB", database_name: settings.databaseName, database_id: settings.databaseId }];
source.r2_buckets = [{ binding: "BUCKET", bucket_name: settings.bucketName }];
source.observability = { enabled: true };
source.routes = [{ pattern: settings.customDomain, custom_domain: true }];

await mkdir(resolve(".release", environment), { recursive: true });
await writeFile(destination, `${JSON.stringify(source, null, 2)}\n`, { mode: 0o600 });
console.log(`Prepared ${environment} deployment config: ${destination}`);
console.log("No deployment was performed. Review the file and run the documented preflight checks.");
