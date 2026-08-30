import fs from "node:fs";
import path from "node:path";

const root = path.resolve("website");
const required = ["index.html", "pilot.html", "security.html", "styles.css", "robots.txt", "sitemap.xml"];
for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) throw new Error(`Missing public website file: ${file}`);
}

const pages = Object.fromEntries(["index.html", "pilot.html", "security.html"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
for (const [file, html] of Object.entries(pages)) {
  for (const token of ["<!doctype html>", "<meta name=\"viewport\"", "Skip to content", "FAULTCITE", "https://app.faultcite.com"]) {
    if (!html.toLowerCase().includes(token.toLowerCase())) throw new Error(`${file} is missing required token: ${token}`);
  }
  if (/CNC Medic|derekbearce\.chatgpt\.site|Hello World!/i.test(html)) throw new Error(`${file} contains retired or placeholder content`);
}

for (const href of ["pilot.html", "security.html"]) {
  if (!pages["index.html"].includes(`href=\"${href}\"`)) throw new Error(`Homepage does not link to ${href}`);
}

const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
if (!robots.includes("https://faultcite.com/sitemap.xml")) throw new Error("robots.txt does not advertise the FaultCite sitemap");
for (const url of ["https://faultcite.com/", "https://faultcite.com/pilot.html", "https://faultcite.com/security.html"]) {
  if (!sitemap.includes(url)) throw new Error(`sitemap.xml is missing ${url}`);
}

console.log("FaultCite public website validation passed.");
