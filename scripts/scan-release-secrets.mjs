import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const ignoredDirectories = new Set([".git", ".next", ".release", ".sites-runtime", ".wrangler", "dist", "node_modules", "outputs"]);
const scannedExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".sh", ".sql", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const allowedExampleFiles = new Set([".env.example"]);
const findings = [];

const patterns = [
  ["Clerk secret key", /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
  ["Clerk publishable key", /\bpk_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
  ["Resend API key", /\bre_[A-Za-z0-9_-]{16,}\b/g],
  ["Cloudflare API token assignment", /(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN)\s*[:=]\s*["']?(?!replace|example|<)[A-Za-z0-9_-]{20,}/gi],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["generic assigned secret", /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'](?!replace|example|test|local|<)[^"'\s]{12,}["']/gi],
];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute);
      continue;
    }
    if (!entry.isFile() || (!scannedExtensions.has(extname(entry.name)) && !allowedExampleFiles.has(entry.name))) continue;
    const path = relative(root, absolute);
    const source = await readFile(absolute, "utf8");
    if (allowedExampleFiles.has(path)) continue;
    for (const [label, pattern] of patterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split("\n").length;
        findings.push(`${path}:${line}: possible ${label}`);
      }
    }
  }
}

await walk(root);
if (findings.length) {
  console.error("Release secret scan failed:\n" + findings.join("\n"));
  process.exit(1);
}
console.log("Release secret scan passed: no credential-shaped values found in tracked release inputs.");
