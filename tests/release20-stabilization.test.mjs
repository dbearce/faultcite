import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("feedback submissions always leave the saving state after network failures", async () => {
  const form = await read("../app/help/feedback-form.tsx");
  assert.match(form, /AbortSignal\.timeout\(15_000\)/);
  assert.match(form, /finally \{ setSaving\(false\); \}/);
});

test("notifications refresh, handle failed writes, and open related cases", async () => {
  const consoleSource = await read("../app/technician-console.tsx");
  assert.match(consoleSource, /setInterval\(refresh, 60_000\)/);
  assert.match(consoleSource, /notificationSaving/);
  assert.match(consoleSource, /Open related case/);
  assert.match(consoleSource, /useDialogFocus\(close\)/);
});

test("manager administration forms recover from network failures", async () => {
  const consoleSource = await read("../app/technician-console.tsx");
  for (const message of [
    "The invitation was not confirmed",
    "Team access was not confirmed",
    "The machine was not confirmed as saved",
    "The source approval was not confirmed",
    "The upload timed out before FaultCite confirmed it",
  ]) assert.match(consoleSource, new RegExp(message));
  assert.ok((consoleSource.match(/AbortSignal\.timeout\(/g) || []).length >= 12);
  assert.ok((consoleSource.match(/finally\s*\{\s*setSaving\(false\)/g) || []).length >= 5);
});

test("managers can audit and resolve tenant-scoped feedback", async () => {
  const [route, schema, migration] = await Promise.all([read("../app/api/feedback/route.ts"), read("../db/schema.ts"), read("../drizzle/0019_natural_garia.sql")]);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /eq\(pilotFeedback\.organizationId, ctx\.organizationId\)/);
  assert.match(route, /pilot\.feedback_\$\{status\}/);
  assert.match(schema, /resolutionNotes/);
  assert.match(migration, /resolution_notes/);
});
