import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("the release workflow enforces the reproducible test and audit gates", async () => {
  const workflow = await read("../.github/workflows/release-gate.yml");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow, /node-version: 22\.13\.0/);
  assert.match(workflow, /run: npm run install:ci/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm audit --audit-level=high/);

  const installIndex = workflow.indexOf("run: npm run install:ci");
  const testIndex = workflow.indexOf("run: npm test");
  const auditIndex = workflow.indexOf("run: npm audit --audit-level=high");
  assert.ok(installIndex < testIndex && testIndex < auditIndex, "release gates must run install, test, then audit");
});
