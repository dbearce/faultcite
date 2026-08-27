import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/technician-console.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("provides keyboard navigation and managed dialogs", () => {
  assert.match(source, /Skip to main content/);
  assert.match(source, /event\.key==="Escape"/);
  assert.match(source, /event\.key!=="Tab"/);
  assert.match(source, /previous\?\.focus\(\)/);
  assert.match(source, /aria-label="Close search"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(styles, /\.skip-link:focus/);
});

test("does not present fabricated pilot performance", () => {
  for (const claim of ["23.5 h", "24%", "$18,400", "78%", "18 sample completed cases", "6 of 8 success checks"]) {
    assert.equal(source.includes(claim), false, `found misleading sample metric: ${claim}`);
  }
  assert.match(source, /No verified pilot results yet/);
  assert.match(source, /MEASUREMENT PLAN/);
});

test("exposes release loading, retry, export, and live status semantics", () => {
  assert.match(source, /WorkspaceLoading/);
  assert.match(source, /Preparing company records/);
  assert.match(source, />Retry</);
  assert.match(source, /Export company records/);
  assert.match(source, /aria-label="Current operations summary"/);
  assert.match(source, /Reconnect before creating the case/);
  assert.match(source, /Reconnect before saving the observation/);
  assert.match(source, /Reconnect before closing the case/);
  assert.match(source, /disabled=\{saving \|\| !online\}/);
});
