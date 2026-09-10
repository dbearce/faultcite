import fs from "node:fs";
import path from "node:path";

const root = path.resolve("website");
const pages = ["index.html", "pilot.html", "security.html", "privacy.html", "terms.html", "support.html", "404.html", "pilot-received.html", "pilot-invalid.html", "pilot-busy.html"];
const required = [...pages, "styles.css", "forms.css", "favicon.svg", "robots.txt", "sitemap.xml", "site.webmanifest", "_headers", "_redirects", ".well-known/security.txt"];
for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) throw new Error(`Missing public website file: ${file}`);
}
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  for (const token of ["<!doctype html>", "<meta name=\"viewport\"", "http-equiv=\"Content-Security-Policy\"", "<meta name=\"referrer\""]) if (!html.toLowerCase().includes(token.toLowerCase())) throw new Error(`${file} is missing ${token}`);
  if (/CNC Medic|derekbearce\.chatgpt\.site|\/workspace\/|0\.3\.3 · local/i.test(html)) throw new Error(`${file} contains retired, local, or placeholder content`);
  if (!file.startsWith("pilot-") && file !== "404.html" && !html.includes("rel=\"canonical\"")) throw new Error(`${file} needs a canonical URL`);
  if (!["404.html", "pilot-received.html", "pilot-invalid.html", "pilot-busy.html"].includes(file) && (!html.includes("og:title") || !html.includes("twitter:card"))) throw new Error(`${file} needs social metadata`);
  if (!html.includes('rel="icon" href="/favicon.svg"') || !html.includes('rel="manifest" href="/site.webmanifest"')) throw new Error(`${file} needs branded icon and manifest metadata`);
  if (!html.includes('<main id="main" tabindex="-1">')) throw new Error(`${file} needs a focusable main skip-link target`);
  if (/href="(?:\/)?(?:index|pilot|security|privacy|terms|support)\.html(?:[#"])/.test(html)) throw new Error(`${file} contains a non-canonical .html link`);
  if (/https:\/\/faultcite\.com\/(?:index|pilot|security|privacy|terms|support)\.html/.test(html)) throw new Error(`${file} contains a non-canonical .html URL`);
  if (html.includes("admin@faultcite.com")) throw new Error(`${file} contains the retired customer-support address`);
}
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const token of ["og:title", "og:image", "twitter:card", "twitter:image", "application/ld+json", 'href="/privacy"', 'href="/terms"', 'href="/support"']) if (!index.includes(token)) throw new Error(`Homepage is missing ${token}`);
const pilot = fs.readFileSync(path.join(root, "pilot.html"), "utf8");
for (const token of ["<form", "https://app.faultcite.com/api/pilot-interest", "name=\"website\""]) if (!pilot.includes(token)) throw new Error(`Pilot page is missing ${token}`);
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
for (const page of ["pilot", "security", "privacy", "terms", "support"]) if (!sitemap.includes(`<loc>https://faultcite.com/${page}</loc>`)) throw new Error(`Sitemap is missing ${page}`);
if (/\.html<\/loc>/.test(sitemap)) throw new Error("Sitemap contains a non-canonical .html URL");
const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
for (const header of ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) if (!headers.includes(header)) throw new Error(`_headers is missing ${header}`);
const redirects = fs.readFileSync(path.join(root, "_redirects"), "utf8");
for (const page of ["index", "pilot", "security", "privacy", "terms", "support"]) if (!redirects.includes(`/${page}.html`)) throw new Error(`_redirects is missing the legacy ${page}.html route`);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "site.webmanifest"), "utf8"));
if (!manifest.icons?.some((icon) => icon.src === "/favicon.svg")) throw new Error("Manifest is missing the branded favicon");
console.log("FaultCite public website validation passed.");
