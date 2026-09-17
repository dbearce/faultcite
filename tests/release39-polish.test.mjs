import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("owners and managers open in manager mode even after machines exist", async () => {
  const source = await readFile("app/technician-console.tsx", "utf8");
  assert.match(source, /if \(\["owner", "manager"\]\.includes\(payload\.user\.role\)\) \{/);
  assert.match(source, /payload\.user\.role === "owner" && payload\.machines\.length === 0 \? "setup" : "home"/);
});

test("machine identity corrections remain tenant-scoped at update time", async () => {
  const source = await readFile("app/api/machines/route.ts", "utf8");
  assert.match(source, /db\.update\(machines\)\.set\(next\)\.where\(and\(eq\(machines\.id, id\), eq\(machines\.organizationId, ctx\.organizationId\)\)\)/);
});

test("safety feedback visibly locks its priority to urgent", async () => {
  const source = await readFile("app/help/feedback-form.tsx", "utf8");
  assert.match(source, /if\(next==="safety_concern"\)setSeverity\("urgent"\)/);
  assert.match(source, /disabled=\{category==="safety_concern"\}/);
  assert.match(source, /Safety concerns are always saved as urgent/);
});

test("machine registration results are announced to assistive technology", async () => {
  const source = await readFile("app/technician-console.tsx", "utf8");
  assert.match(source, /Machine saved to the company registry/);
  assert.match(source, /className="fine-print" role="status">\{message\}/);
});
