import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("release 0.3.8 closes manual, readiness, invitation, and request-size gaps", async () => {
  const [schema, migration, machines, manuals, sources, bootstrap, readiness, backend, team, stripe] = await Promise.all([
    read("../db/schema.ts"),
    read("../drizzle/0026_manual_source_revocation.sql"),
    read("../app/api/machines/route.ts"),
    read("../app/api/manuals/[id]/route.ts"),
    read("../app/api/manual-sources/route.ts"),
    read("../app/api/bootstrap/route.ts"),
    read("../app/api/readiness/route.ts"),
    read("../lib/backend.ts"),
    read("../app/api/team/route.ts"),
    read("../app/api/webhooks/stripe/route.ts"),
  ]);
  assert.match(schema, /revokedAt: integer\("revoked_at"/);
  assert.match(migration, /ADD `revoked_at` integer/);
  assert.match(machines, /manualSourceApprovalsRevoked: true/);
  assert.match(manuals, /invalidatesSources/);
  assert.match(manuals, /revalidationDueAt\.valueOf\(\) <= Date\.now\(\)/);
  assert.match(sources, /isNull\(manualSources\.revokedAt\)/);
  assert.match(bootstrap, /isNull\(manualSources\.revokedAt\)/);
  assert.match(readiness, /ne\(memberships\.userId,ctx\.userId\)/);
  assert.match(backend, /const \[fallback\].*eq\(memberships\.active, true\)/s);
  assert.match(team, /\["pending", "accepting"\]/);
  assert.match(stripe, /readLimitedText\(request, 1024 \* 1024\)/);
});

test("marketing flow preserves mobile navigation, visible focus, and explicit form outcomes", async () => {
  const [styles, received, invalid, busy] = await Promise.all([
    read("../website/styles.css"),
    read("../website/pilot-received.html"),
    read("../website/pilot-invalid.html"),
    read("../website/pilot-busy.html"),
  ]);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media\(max-width:900px\).*\.site-header nav\{display:flex/s);
  for (const page of [received, invalid, busy]) {
    assert.match(page, /Skip to content/);
    assert.match(page, /aria-label="Legal"/);
    assert.match(page, /Release 0\.3\.8/);
  }
});
