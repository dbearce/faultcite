import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationNames = [
  "0000_hard_lethal_legion.sql",
  "0001_parallel_captain_america.sql",
  "0002_same_kabuki.sql",
  "0003_curved_kinsey_walden.sql",
  "0004_faultcite_pilot_invariants.sql",
  "0005_invitation_expiry.sql",
  "0006_clerk_identity_binding.sql",
  "0007_case_machine_tenant_guard.sql",
];

async function createDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const name of migrationNames) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean)) db.exec(statement);
  }
  const now = Date.now();
  db.prepare("INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("org-a", "Alpha", "alpha", "pilot", now, now);
  db.prepare("INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("org-b", "Beta", "beta", "pilot", now, now);
  db.prepare("INSERT INTO users (id,email,display_name,created_at,updated_at) VALUES (?,?,?,?,?)").run("user-a", "owner@example.test", "Owner", now, now);
  db.prepare("INSERT INTO users (id,email,display_name,created_at,updated_at) VALUES (?,?,?,?,?)").run("user-b", "tech@example.test", "Tech", now, now);
  db.prepare("INSERT INTO memberships (id,organization_id,user_id,role,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("member-a", "org-a", "user-a", "owner", 1, now, now);
  db.prepare("INSERT INTO memberships (id,organization_id,user_id,role,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("member-b", "org-a", "user-b", "technician", 1, now, now);
  db.prepare("INSERT INTO machines (id,organization_id,asset_number,manufacturer,model,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run("machine-a", "org-a", "A-1", "Example", "Mill", "down", now, now);
  db.prepare("INSERT INTO cases (id,organization_id,case_number,machine_id,opened_by_user_id,status,symptom,safety_devices_verified,opened_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("case-a", "org-a", "FC-1", "machine-a", "user-b", "open", "No cycle", 0, now, now, now);
  return db;
}

test("database rejects duplicate active cases for one machine", async () => {
  const db = await createDb();
  assert.throws(() => db.prepare("INSERT INTO cases (id,organization_id,case_number,machine_id,opened_by_user_id,status,symptom,safety_devices_verified,opened_at,created_at,updated_at) SELECT 'case-b',organization_id,'FC-2',machine_id,opened_by_user_id,'diagnosing','Alarm',0,opened_at,created_at,updated_at FROM cases WHERE id='case-a'").run(), /UNIQUE constraint failed/);
});

test("database keeps closed cases terminal and immutable", async () => {
  const db = await createDb();
  db.prepare("UPDATE cases SET status='cause_confirmed' WHERE id='case-a'").run();
  db.prepare("UPDATE cases SET status='closed' WHERE id='case-a'").run();
  assert.throws(() => db.prepare("UPDATE cases SET status='cause_confirmed' WHERE id='case-a'").run(), /closed cases are immutable|invalid case status transition/);
  assert.throws(() => db.prepare("UPDATE cases SET notes='changed' WHERE id='case-a'").run(), /closed cases are immutable/);
});

test("database blocks owner promotion and cross-company child rows", async () => {
  const db = await createDb();
  assert.throws(() => db.prepare("UPDATE memberships SET role='owner' WHERE id='member-b'").run(), /owner promotion/);
  assert.throws(() => db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,created_at) VALUES ('event-x','org-b','case-a','user-b','case_opened',?)").run(Date.now()), /tenant mismatch/);
  assert.throws(() => db.prepare("INSERT INTO case_evidence (id,organization_id,case_id,uploaded_by_user_id,kind,file_name,object_key,content_type,size_bytes,created_at) VALUES ('evidence-x','org-b','case-a','user-b','alarm_screen','a.png','x','image\/png',10,?)").run(Date.now()), /tenant or state mismatch/);
});

test("database blocks cases linked to another company's machine", async () => {
  const db = await createDb();
  const now = Date.now();
  db.prepare("INSERT INTO machines (id,organization_id,asset_number,manufacturer,model,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run("machine-b", "org-b", "B-1", "Example", "Lathe", "down", now, now);
  assert.throws(() => db.prepare("INSERT INTO cases (id,organization_id,case_number,machine_id,opened_by_user_id,status,symptom,safety_devices_verified,opened_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("case-cross", "org-a", "FC-X", "machine-b", "user-b", "open", "Alarm", 0, now, now, now), /case machine tenant mismatch/);
  assert.throws(() => db.prepare("UPDATE cases SET machine_id='machine-b' WHERE id='case-a'").run(), /case machine tenant mismatch/);
});

test("database binds at most one internal user to a Clerk identity", async () => {
  const db = await createDb();
  db.prepare("UPDATE users SET clerk_user_id='clerk-1' WHERE id='user-a'").run();
  assert.throws(() => db.prepare("UPDATE users SET clerk_user_id='clerk-1' WHERE id='user-b'").run(), /UNIQUE constraint failed/);
});

test("database permits only one review, confirmation, and close timeline event", async () => {
  const db = await createDb();
  const now = Date.now();
  db.prepare("UPDATE cases SET status='diagnosing' WHERE id='case-a'").run();
  db.prepare("UPDATE cases SET status='review_requested' WHERE id='case-a'").run();
  db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,created_at) VALUES ('review-1','org-a','case-a','user-b','review_requested',?)").run(now);
  assert.throws(() => db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,created_at) VALUES ('review-2','org-a','case-a','user-b','review_requested',?)").run(now), /UNIQUE constraint failed/);
  db.prepare("UPDATE cases SET status='cause_confirmed' WHERE id='case-a'").run();
  db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,created_at) VALUES ('cause-1','org-a','case-a','user-a','cause_confirmed',?)").run(now);
  db.prepare("UPDATE cases SET status='closed' WHERE id='case-a'").run();
  db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,created_at) VALUES ('close-1','org-a','case-a','user-a','case_closed',?)").run(now);
  assert.throws(() => db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,created_at) VALUES ('close-2','org-a','case-a','user-a','case_closed',?)").run(now), /UNIQUE constraint failed/);
});
