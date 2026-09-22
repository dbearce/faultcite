import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mockCurl = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const role = value('-H').replace('authorization: Bearer ', '').replace('-secret', '');
const path = new URL(args.at(-1)).pathname;
const scenario = process.env.ACCEPTANCE_SCENARIO;
fs.appendFileSync(process.env.ACCEPTANCE_REQUEST_LOG, JSON.stringify({role, path, method:value('--request'), redirects:args.includes('--location')})+'\\n');
let status = 200, body;
if (path === '/api/bootstrap') {
  body = {user:{id:role,role},organization:{id:role==='outsider'?'other-company':'pilot-company'},cases:[{id:'case-1'}],manuals:[{id:'manual-1'}]};
  if (scenario === 'duplicate' && role === 'manager') body.user.id = 'owner';
  if (scenario === 'empty-outsider' && role === 'outsider') body.organization.id = '';
  if (scenario === 'same-outsider' && role === 'outsider') body.organization.id = 'pilot-company';
  if (scenario === 'wrong-role' && role === 'technician') body.user.role = 'owner';
  if (scenario === 'wrong-company' && role === 'manager') body.organization.id = 'other-company';
  if (scenario === 'no-fixtures') body.cases = [];
} else if (path === '/api/cases/case-1/evidence') {
  body = {evidence:scenario === 'no-evidence'?[]:[{id:'evidence-1'}]};
} else {
  body = path.includes('/events') ? {events:[{id:'event-1'}]} : 'existing file bytes';
  if (role === 'outsider') { status = scenario === 'forbidden' ? 403 : 404; body = {error:'not found'}; }
  if (role === 'outsider' && scenario === 'leak') {status=200; body='leaked file bytes';}
  if (role === 'outsider' && scenario === 'unauthenticated') status=401;
  if (role === 'outsider' && scenario === 'server-error') status=500;
  if (role === 'owner' && scenario === 'missing-object') status=404;
  if (role === 'owner' && scenario === 'empty-object') body='';
  if (role === 'owner' && scenario === 'redirect') status=302;
}
fs.writeFileSync(value('--output'), typeof body === 'string' ? body : JSON.stringify(body));
process.stdout.write(String(status));
`;

async function run(scenario = "success", overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "faultcite-acceptance-test-"));
  try {
    const bin = join(directory, "bin");
    await mkdir(bin);
    // TMPDIR may be inside this type:module repository during the release build.
    await writeFile(join(bin, "package.json"), JSON.stringify({ type: "commonjs" }));
    await writeFile(join(bin, "curl"), mockCurl, { mode: 0o700 });
    const log = join(directory, "requests.jsonl");
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, ACCEPTANCE_REQUEST_LOG: log, ACCEPTANCE_SCENARIO: scenario,
      FAULTCITE_ACCEPTANCE_URL: "https://staging.faultcite.com",
      FAULTCITE_OWNER_TOKEN: "owner-secret", FAULTCITE_TECHNICIAN_TOKEN: "technician-secret",
      FAULTCITE_MANAGER_TOKEN: "manager-secret", FAULTCITE_OUTSIDER_TOKEN: "outsider-secret",
      FAULTCITE_ACCEPTANCE_CASE_ID: "", FAULTCITE_ACCEPTANCE_MANUAL_ID: "", FAULTCITE_ACCEPTANCE_EVIDENCE_ID: "", ...overrides };
    const result = spawnSync("bash", ["-x", "cloudflare/scripts/acceptance.sh"], { cwd: root, env, encoding: "utf8" });
    const requests = (await readFile(log, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
    assert.doesNotMatch(result.stdout + result.stderr, /(?:owner|technician|manager|outsider)-secret/);
    for (const request of requests) { assert.equal(request.method, "GET"); assert.equal(request.redirects, false); }
    return { ...result, requests };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("staging acceptance verifies owner access before denying the same three existing objects", async () => {
  for (const scenario of ["success", "forbidden"]) {
    const result = await run(scenario);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /read-only object-isolation checks passed/);
    for (const path of ["/api/cases/case-1/events", "/api/manuals/manual-1", "/api/evidence/evidence-1"]) {
      assert.deepEqual(result.requests.filter(request => request.path === path).map(request => request.role), ["owner", "outsider"]);
    }
  }
});

test("staging acceptance requires distinct authenticated identities, correct roles and companies", async () => {
  for (const scenario of ["duplicate", "empty-outsider", "same-outsider", "wrong-role", "wrong-company"]) {
    const result = await run(scenario);
    assert.notEqual(result.status, 0, scenario);
    assert.ok(result.requests.every(request => request.path === "/api/bootstrap"), scenario);
  }
});

test("staging acceptance cannot pass on missing fixtures, inaccessible objects or empty positive controls", async () => {
  for (const scenario of ["no-fixtures", "no-evidence", "missing-object", "empty-object", "redirect"]) {
    const result = await run(scenario);
    assert.notEqual(result.status, 0, scenario);
    assert.ok(!result.requests.some(request => request.role === "outsider" && request.path !== "/api/bootstrap"), scenario);
  }
});

test("staging acceptance rejects cross-company success, unauthenticated and server-error responses", async () => {
  for (const scenario of ["leak", "unauthenticated", "server-error"]) {
    const result = await run(scenario);
    assert.notEqual(result.status, 0, scenario);
    assert.match(result.stderr, /must return HTTP 403 or 404/);
  }
});

test("staging acceptance refuses production and unsafe or unowned fixture identifiers", async () => {
  const production = await run("success", { FAULTCITE_ACCEPTANCE_URL: "https://app.faultcite.com" });
  assert.notEqual(production.status, 0);
  assert.equal(production.requests.length, 0);
  for (const overrides of [
    { FAULTCITE_ACCEPTANCE_CASE_ID: "../../api/settings" },
    { FAULTCITE_ACCEPTANCE_MANUAL_ID: "missing-manual" },
    { FAULTCITE_ACCEPTANCE_EVIDENCE_ID: "missing-evidence" },
  ]) {
    const result = await run("success", overrides);
    assert.notEqual(result.status, 0);
    assert.ok(!result.requests.some(request => request.role === "outsider" && request.path !== "/api/bootstrap"));
  }
});
