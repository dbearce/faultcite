import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const consoleSource = await readFile(new URL("../app/technician-console.tsx", import.meta.url), "utf8");
const authSource = await readFile(new URL("../app/auth-shell.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const legalLinks = await readFile(new URL("../app/legal-links.tsx", import.meta.url), "utf8");
const privacy = await readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8");
const terms = await readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8");
const support = await readFile(new URL("../app/support/page.tsx", import.meta.url), "utf8");

test("application has landmarks and named navigation regions", () => {
  assert.match(consoleSource, /<main\b/);
  assert.match(consoleSource, /<nav aria-label="Primary navigation">/);
  assert.match(consoleSource, /<nav className="mobile-nav" aria-label="Mobile technician navigation">/);
  assert.match(authSource, /<main/);
});

test("interactive controls expose keyboard focus and motion preferences", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*3px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("status and error changes have assistive-technology announcements", () => {
  assert.match(consoleSource, /aria-live="polite"/);
  assert.match(consoleSource, /role="status"/);
  assert.match(consoleSource, /role="alert"/);
});

test("modal and disclosure controls expose essential semantics", () => {
  assert.match(consoleSource, /role="dialog" aria-modal="true"/);
  assert.match(consoleSource, /aria-expanded=/);
  assert.match(consoleSource, /aria-label="Close source"/);
  assert.match(consoleSource, /aria-label="Close navigation"/);
});

test("forms use explicit labels for release-critical fields", () => {
  for (const id of ["machine", "alarm", "changed", "notes", "cause", "work", "cycles", "authorized", "invite-email", "asset-number"]) {
    assert.match(consoleSource, new RegExp(`htmlFor=["']${id}["']`), `missing explicit label for ${id}`);
    assert.match(consoleSource, new RegExp(`id=["']${id}["']`), `missing labeled field ${id}`);
  }
});

test("document metadata declares language and responsive viewport", () => {
  assert.match(layout, /<html lang="en"/);
  assert.match(layout, /viewport/i);
});

test("public trust pages expose policy links and the release identity", () => {
  for (const href of ["/privacy", "/terms", "/support"]) assert.match(legalLinks, new RegExp(`href=["']${href}["']`));
  assert.match(legalLinks, /version/);
  assert.match(legalLinks, /environment/);
  assert.match(privacy, /controlled pilot/i);
  assert.match(terms, /does not authorize a machine restart/i);
  assert.match(support, /not an emergency channel/i);
  assert.match(css, /\.policy-page/);
  assert.match(css, /\.trust-footer/);
});
