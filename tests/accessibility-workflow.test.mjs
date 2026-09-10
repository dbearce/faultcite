import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [consoleSource, css] = await Promise.all([
  read("app/technician-console.tsx"),
  read("app/globals.css"),
]);

test("diagnostic and closeout validation identify and focus invalid controls", () => {
  assert.match(consoleSource, /id="diagnostic-error"/);
  assert.match(consoleSource, /aria-describedby=\{p\.error && !p\.reading\.trim\(\) \? "diagnostic-error"/);
  assert.match(consoleSource, /closeoutFormRef\.current\?\.querySelector<HTMLElement>\('\[aria-invalid="true"\]'\)/);
  assert.match(consoleSource, /id="closeout-error"/);
  assert.match(consoleSource, /Complete the following before continuing:/);
  assert.match(css, /\.confirm-check:has\(input:focus-visible\)/);
});

test("closeout validation remains discoverable before every item is complete", () => {
  assert.match(consoleSource, /disabled=\{saving \|\| photoUploading\} aria-describedby="closeout-requirements"/);
  assert.match(consoleSource, /id="closeout-requirements" className="fine-print" role="status"/);
  assert.doesNotMatch(consoleSource, /type="submit" disabled=\{!canSubmit\}/);
});

test("mobile machine tools and search result announcements remain available", () => {
  assert.match(css, /\.top-actions \.search\{display:grid;width:42px;height:42px\}/);
  assert.match(consoleSource, /id="search-results-status" className="sr-only" role="status"/);
  assert.match(consoleSource, /type="search" autoComplete="off"/);
});
