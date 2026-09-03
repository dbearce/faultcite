import fs from "node:fs";
import path from "node:path";

const root = path.resolve("website");
const pages = ["index.html", "pilot.html", "security.html", "privacy.html", "terms.html", "support.html", "404.html", "pilot-received.html", "pilot-invalid.html", "pilot-busy.html"];
const required = [...pages, "styles.css", "forms.css", "robots.txt", "sitemap.xml", "site.webmanifest", "_headers"];
for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) throw new Error(`Missing public website file: ${file}`);
}
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  for (const token of ["<!doctype html>", "<meta name=\"viewport\""]) if (!html.toLowerCase().includes(token.toLowerCase())) throw new Error(`${file} is missing ${token}`);
  if (/CNC Medic|derekbearce\.chatgpt\.site|\/workspace\/|0\.3\.3 · local/i.test(html)) throw new Error(`${file} contains retired, local, or placeholder content`);
  if (!file.startsWith("pilot-") && file !== "404.html" && !html.includes("rel=\"canonical\"")) throw new Error(`${file} needs a canonical URL`);
  if (!["404.html", "pilot-received.html", "pilot-invalid.html", "pilot-busy.html"].includes(file) && (!html.includes("og:title") || !html.includes("twitter:card"))) throw new Error(`${file} needs social metadata`);
}
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const token of ["og:title", "twitter:card", "application/ld+json", "privacy.html", "terms.html", "support.html"]) if (!index.includes(token)) throw new Error(`Homepage is missing ${token}`);
const pilot = fs.readFileSync(path.join(root, "pilot.html"), "utf8");
for (const token of ["<form", "https://app.faultcite.com/api/pilot-interest", "name=\"website\""]) if (!pilot.includes(token)) throw new Error(`Pilot page is missing ${token}`);
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
for (const page of ["pilot.html", "security.html", "privacy.html", "terms.html", "support.html"]) if (!sitemap.includes(`https://faultcite.com/${page}`)) throw new Error(`Sitemap is missing ${page}`);
const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
for (const header of ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) if (!headers.includes(header)) throw new Error(`_headers is missing ${header}`);
console.log("FaultCite public website validation passed.");
