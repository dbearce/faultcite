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
  "0005_lonely_cassandra_nova.sql",
  "0006_tan_wolverine.sql",
  "0007_silky_donald_blake.sql",
  "0008_chilly_red_wolf.sql",
  "0009_third_penance.sql",
  "0010_faultcite_escalation_resolution.sql",
  "0011_faultcite_terminal_and_edit_guards.sql",
  "0012_damp_swordsman.sql",
  "0013_eager_vin_gonzales.sql",
  "0014_naive_liz_osborn.sql",
  "0015_quiet_starjammers.sql",
  "0016_sharp_starjammers.sql",
  "0017_faultcite_abuse_controls.sql",
  "0018_last_nomad.sql",
  "0019_natural_garia.sql",
  "0020_cynical_black_cat.sql",
  "0021_faultcite_auth_identities.sql",
  "0022_curved_unicorn.sql",
  "0023_public_pilot_interest.sql",
  "0024_stripe_webhook_idempotency.sql",
  "0025_stripe_webhook_ordering.sql",
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
  db.prepare("INSERT INTO user_settings (user_id,selected_organization_id,updated_at) VALUES (?,?,?)").run("user-a", "org-a", now);
  db.prepare("INSERT INTO user_settings (user_id,selected_organization_id,updated_at) VALUES (?,?,?)").run("user-b", "org-a", now);
  db.prepare("INSERT INTO machines (id,organization_id,asset_number,manufacturer,model,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run("machine-a", "org-a", "A-1", "Example", "Mill", "down", now, now);
  db.prepare("INSERT INTO cases (id,organization_id,case_number,machine_id,opened_by_user_id,status,symptom,safety_devices_verified,opened_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("case-a", "org-a", "FC-1", "machine-a", "user-b", "open", "No cycle", 0, now, now, now);
  return db;
}

test("database rejects duplicate active cases for one machine", async () => {
  const db = await createDb();
  assert.throws(() => db.prepare("INSERT INTO cases (id,organization_id,case_number,machine_id,opened_by_user_id,status,symptom,safety_devices_verified,opened_at,created_at,updated_at) SELECT 'case-b',organization_id,'FC-2',machine_id,opened_by_user_id,'diagnosing','Alarm',0,opened_at,created_at,updated_at FROM cases WHERE id='case-a'").run(), /UNIQUE constraint failed/);
});

test("database keeps external authentication mappings immutable", async () => {
  const db = await createDb();
  const now = Date.now();
  db.prepare("INSERT INTO auth_identities (id,provider,provider_subject,user_id,verified_email,created_at) VALUES (?,?,?,?,?,?)").run("identity-a", "clerk", "user_clerk_a", "user-a", "owner@example.test", now);
  assert.throws(() => db.prepare("UPDATE auth_identities SET provider_subject='user_clerk_b' WHERE id='identity-a'").run(), /auth identity mappings are immutable/);
  assert.throws(() => db.prepare("DELETE FROM auth_identities WHERE id='identity-a'").run(), /auth identity mappings are immutable/);
});

test("database keeps closed cases terminal and immutable", async () => {
  const db = await createDb();
  db.prepare("UPDATE cases SET status='cause_confirmed' WHERE id='case-a'").run();
  db.prepare("UPDATE cases SET status='closeout_requested', closeout_submitted_by_user_id='user-b' WHERE id='case-a'").run();
  db.prepare("UPDATE cases SET status='closed', restart_approved_by_user_id='user-a' WHERE id='case-a'").run();
  assert.throws(() => db.prepare("UPDATE cases SET status='cause_confirmed' WHERE id='case-a'").run(), /terminal cases are immutable|invalid case status transition/);
  assert.throws(() => db.prepare("UPDATE cases SET notes='changed' WHERE id='case-a'").run(), /terminal cases are immutable/);
});

test("database blocks owner promotion and cross-company child rows", async () => {
  const db = await createDb();
  assert.throws(() => db.prepare("UPDATE memberships SET role='owner' WHERE id='member-b'").run(), /owner promotion/);
  assert.throws(() => db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,created_at) VALUES ('event-x','org-b','case-a','user-b','case_opened',?)").run(Date.now()), /tenant mismatch/);
  assert.throws(() => db.prepare("INSERT INTO case_evidence (id,organization_id,case_id,uploaded_by_user_id,kind,file_name,object_key,content_type,size_bytes,created_at) VALUES ('evidence-x','org-b','case-a','user-b','alarm_screen','a.png','x','image\/png',10,?)").run(Date.now()), /tenant or state mismatch/);
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
  db.prepare("UPDATE cases SET status='closeout_requested', closeout_submitted_by_user_id='user-b' WHERE id='case-a'").run();
  db.prepare("UPDATE cases SET status='closed', restart_approved_by_user_id='user-a' WHERE id='case-a'").run();
  db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,created_at) VALUES ('close-1','org-a','case-a','user-a','case_closed',?)").run(now);
  assert.throws(() => db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,created_at) VALUES ('close-2','org-a','case-a','user-a','case_closed',?)").run(now), /UNIQUE constraint failed/);
});

test("database separates enabled memberships from the selected company", async () => {
  const db = await createDb();
  db.prepare("INSERT INTO memberships (id,organization_id,user_id,role,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("member-a-b", "org-b", "user-a", "owner", 1, Date.now(), Date.now());
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM memberships WHERE user_id='user-a' AND active=1").get().count, 2);
  db.prepare("UPDATE user_settings SET selected_organization_id='org-b' WHERE user_id='user-a'").run();
  assert.equal(db.prepare("SELECT selected_organization_id FROM user_settings WHERE user_id='user-a'").get().selected_organization_id, "org-b");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM memberships WHERE user_id='user-a' AND active=1").get().count, 2);
});

test("disabled company membership cannot become enabled by changing selection", async () => {
  const db = await createDb();
  db.prepare("INSERT INTO memberships (id,organization_id,user_id,role,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("member-disabled", "org-b", "user-b", "technician", 0, Date.now(), Date.now());
  db.prepare("UPDATE user_settings SET selected_organization_id='org-b' WHERE user_id='user-b'").run();
  assert.equal(db.prepare("SELECT active FROM memberships WHERE id='member-disabled'").get().active, 0);
});

test("unsafe observation and manager escalation resolution commit in valid states", async () => {
  const db = await createDb();
  const now = Date.now();
  db.exec("BEGIN");
  db.prepare("UPDATE cases SET status='escalated' WHERE id='case-a' AND status='open'").run();
  db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,result,reading,created_at) VALUES (?,?,?,?,?,?,?,?)").run("unsafe-1", "org-a", "case-a", "user-b", "diagnostic_result", "Unsafe — escalate", "Energy state uncertain", now);
  db.exec("COMMIT");
  assert.equal(db.prepare("SELECT status FROM cases WHERE id='case-a'").get().status, "escalated");
  db.prepare("UPDATE cases SET status='diagnosing' WHERE id='case-a' AND status='escalated'").run();
  assert.equal(db.prepare("SELECT status FROM cases WHERE id='case-a'").get().status, "diagnosing");
});

test("manager cancellation releases the machine while preserving a terminal case", async () => {
  const db = await createDb();
  db.prepare("UPDATE cases SET status='escalated' WHERE id='case-a'").run();
  db.prepare("UPDATE cases SET status='canceled' WHERE id='case-a'").run();
  assert.throws(() => db.prepare("UPDATE cases SET notes='changed' WHERE id='case-a'").run(), /terminal cases are immutable/);
  db.prepare("INSERT INTO cases (id,organization_id,case_number,machine_id,opened_by_user_id,status,symptom,safety_devices_verified,opened_at,created_at,updated_at) SELECT 'case-b',organization_id,'FC-2',machine_id,opened_by_user_id,'open','New failure',0,opened_at,created_at,updated_at FROM cases WHERE id='case-a'").run();
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cases WHERE machine_id='machine-a' AND status='open'").get().count, 1);
});

test("database rejects evidence on canceled terminal cases", async () => {
  const db = await createDb();
  db.prepare("UPDATE cases SET status='escalated' WHERE id='case-a'").run();
  db.prepare("UPDATE cases SET status='canceled' WHERE id='case-a'").run();
  assert.throws(() => db.prepare("INSERT INTO case_evidence (id,organization_id,case_id,uploaded_by_user_id,kind,file_name,object_key,content_type,size_bytes,created_at) VALUES ('late-evidence','org-a','case-a','user-b','repair_evidence','late.png','late','image/png',10,?)").run(Date.now()), /case evidence tenant or state mismatch/);
});

test("database rolls back a stale intake edit event after the case leaves diagnosis", async () => {
  const db = await createDb();
  db.prepare("UPDATE cases SET status='diagnosing' WHERE id='case-a'").run();
  db.prepare("UPDATE cases SET status='review_requested' WHERE id='case-a'").run();
  assert.throws(() => db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,notes,created_at) VALUES ('stale-intake','org-a','case-a','user-b','intake_updated','stale',?)").run(Date.now()), /case event does not match case state/);
});

test("intake edits remain valid across an open to diagnosing race", async () => {
  const db = await createDb();
  const now = Date.now();
  db.prepare("UPDATE cases SET status='diagnosing' WHERE id='case-a'").run();
  db.exec("BEGIN");
  db.prepare("UPDATE cases SET symptom='Corrected symptom' WHERE id='case-a' AND status IN ('open','diagnosing')").run();
  db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,notes,created_at) VALUES ('valid-intake','org-a','case-a','user-b','intake_updated','corrected',?)").run(now);
  db.exec("COMMIT");
  assert.equal(db.prepare("SELECT symptom FROM cases WHERE id='case-a'").get().symptom, "Corrected symptom");
});

test("database protects tenant relationships and immutable history", async () => {
  const db = await createDb();
  const now = Date.now();
  assert.throws(() => db.prepare("INSERT INTO cases (id,organization_id,case_number,machine_id,opened_by_user_id,status,symptom,safety_devices_verified,opened_at,created_at,updated_at) VALUES ('cross-case','org-b','FC-X','machine-a','user-a','open','Bad tenant',0,?,?,?)").run(now, now, now), /case machine tenant mismatch/);
  db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,notes,created_at) VALUES ('event-immutable','org-a','case-a','user-b','case_opened','Original',?)").run(now);
  assert.throws(() => db.prepare("UPDATE case_events SET notes='changed' WHERE id='event-immutable'").run(), /case timeline is immutable/);
  db.prepare("INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,created_at) VALUES ('audit-immutable','org-a','user-a','test','case','case-a',?)").run(now);
  assert.throws(() => db.prepare("DELETE FROM audit_logs WHERE id='audit-immutable'").run(), /audit history is immutable/);
});

test("technician closeout request stays active until manager closure", async () => {
  const db = await createDb();
  const now = Date.now();
  db.prepare("UPDATE cases SET status='cause_confirmed', confirmed_cause='Verified cause' WHERE id='case-a'").run();
  db.exec("BEGIN");
  db.prepare("UPDATE cases SET status='closeout_requested', repair_summary='Repair recorded', verification_readings='Within OEM limits', test_cycles='Five cycles', safety_devices_verified=1, closeout_submitted_by_user_id='user-b' WHERE id='case-a'").run();
  db.prepare("INSERT INTO case_events (id,organization_id,case_id,actor_user_id,event_type,result,notes,created_at) VALUES ('closeout-review','org-a','case-a','user-b','closeout_requested','manager_approval_required','Repair recorded',?)").run(now);
  db.exec("COMMIT");
  assert.throws(() => db.prepare("INSERT INTO cases (id,organization_id,case_number,machine_id,opened_by_user_id,status,symptom,safety_devices_verified,opened_at,created_at,updated_at) SELECT 'case-c',organization_id,'FC-3',machine_id,opened_by_user_id,'open','Duplicate',0,opened_at,created_at,updated_at FROM cases WHERE id='case-a'").run(), /UNIQUE constraint failed/);
  db.prepare("UPDATE cases SET status='closed', restart_approved_by_user_id='user-a' WHERE id='case-a'").run();
  assert.equal(db.prepare("SELECT status FROM cases WHERE id='case-a'").get().status, "closed");
});

test("database blocks restart self-approval", async () => {
  const db = await createDb();
  db.prepare("UPDATE cases SET status='cause_confirmed', confirmed_cause='Verified cause' WHERE id='case-a'").run();
  db.prepare("UPDATE cases SET status='closeout_requested', repair_summary='Repair recorded', verification_readings='Within limits', test_cycles='Five cycles', safety_devices_verified=1, closeout_submitted_by_user_id='user-a' WHERE id='case-a'").run();
  assert.throws(() => db.prepare("UPDATE cases SET status='closed', restart_approved_by_user_id='user-a' WHERE id='case-a'").run(), /restart approval requires a different authenticated manager/);
});

test("approved manual sources are tenant-bound, page-bounded, manager-approved, and immutable", async () => {
  const db = await createDb();
  const now = Date.now();
  db.prepare("INSERT INTO manuals (id,organization_id,uploaded_by_user_id,title,manufacturer,file_name,object_key,content_type,size_bytes,status,rights_confirmed,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run("manual-a", "org-a", "user-a", "Example service manual", "Example", "manual.pdf", "org-a/manuals/manual-a/manual.pdf", "application/pdf", 100, "approved", 1, now, now);
  db.prepare("INSERT INTO manual_sources (id,organization_id,manual_id,machine_id,approved_by_user_id,manufacturer,model,serial_number,alarm_code,section_title,page_start,page_end,source_summary,safety_notes,approved_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("source-a", "org-a", "manual-a", "machine-a", "user-a", "Example", "Mill", null, "401", "Servo alarm", 42, 44, "Reviewed cause table.", "Apply the employer lockout procedure.", now, now);
  assert.throws(() => db.prepare("UPDATE manual_sources SET source_summary='Changed' WHERE id='source-a'").run(), /approved manual sources are immutable/);
  assert.throws(() => db.prepare("DELETE FROM manual_sources WHERE id='source-a'").run(), /approved manual sources are immutable/);
  assert.throws(() => db.prepare("INSERT INTO manual_sources (id,organization_id,manual_id,machine_id,approved_by_user_id,manufacturer,model,section_title,page_start,page_end,source_summary,safety_notes,approved_at,created_at) VALUES ('bad-pages','org-a','manual-a','machine-a','user-a','Example','Mill','Bad',0,2,'x','x',?,?)").run(now, now), /page range is invalid/);
  assert.throws(() => db.prepare("INSERT INTO manual_sources (id,organization_id,manual_id,machine_id,approved_by_user_id,manufacturer,model,section_title,page_start,page_end,source_summary,safety_notes,approved_at,created_at) VALUES ('bad-tenant','org-b','manual-a','machine-a','user-a','Example','Mill','Bad',1,2,'x','x',?,?)").run(now, now), /tenant or approval mismatch|approval requires an enabled manager/);
});
