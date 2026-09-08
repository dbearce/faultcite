import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("governance acknowledgement evidence is append-only and versioned", async () => {
  const [schema, migration, route] = await Promise.all([
    read("../db/schema.ts"),
    read("../drizzle/0027_governance_acknowledgement_evidence.sql"),
    read("../app/api/settings/route.ts"),
  ]);
  for (const token of ["documentId", "documentVersion", "documentHash", "acknowledgementText", "actorUserId", "acknowledgedAt"]) assert.match(schema, new RegExp(token));
  assert.match(migration, /CREATE TABLE `governance_acknowledgements`/);
  assert.match(route, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(route, /db\.insert\(governanceAcknowledgements\)/);
  assert.doesNotMatch(route, /db\.update\(governanceAcknowledgements\)/);
  assert.match(route, /acknowledgementId/);
  assert.match(route, /documentVersion/);
  assert.match(route, /documentHash/);
});

test("database prevents governance acknowledgement mutation and deletion", async () => {
  const migration = await read("../drizzle/0027_governance_acknowledgement_evidence.sql");
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE organizations (id text PRIMARY KEY); CREATE TABLE users (id text PRIMARY KEY);");
  for (const statement of migration.split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean)) db.exec(statement);
  db.exec("INSERT INTO organizations VALUES ('org-a'); INSERT INTO users VALUES ('user-a');");
  db.prepare("INSERT INTO governance_acknowledgements VALUES (?,?,?,?,?,?,?,?)").run("ack-a", "org-a", "user-a", "owner-safety-responsibility", "1.0", "hash", "text", Date.now());
  assert.throws(() => db.exec("UPDATE governance_acknowledgements SET document_hash='changed' WHERE id='ack-a'"), /governance acknowledgements are immutable/);
  assert.throws(() => db.exec("DELETE FROM governance_acknowledgements WHERE id='ack-a'"), /governance acknowledgements are immutable/);
});

test("counsel packet is versioned and does not assert approval", async () => {
  const packet = await read("../docs/COUNSEL_READINESS_PACKET.md");
  assert.match(packet, /\*\*Packet version:\*\* 1\.0/);
  assert.match(packet, /not legal advice, legal approval, or a compliance certification/i);
  assert.match(packet, /legal review pending/);
  assert.match(packet, /Full legal name of service operator and contracting entity \| \*\*TBD\*\*/);
});
