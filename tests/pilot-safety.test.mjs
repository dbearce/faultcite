import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/technician-console.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../drizzle/0002_same_kabuki.sql", import.meta.url), "utf8");
const invitationMigration = await readFile(new URL("../drizzle/0003_curved_kinsey_walden.sql", import.meta.url), "utf8");
const backend = await readFile(new URL("../lib/backend.ts", import.meta.url), "utf8");
const eventsRoute = await readFile(new URL("../app/api/cases/[id]/events/route.ts", import.meta.url), "utf8");
const closeRoute = await readFile(new URL("../app/api/cases/[id]/close/route.ts", import.meta.url), "utf8");
const evidenceDownload = await readFile(new URL("../app/api/evidence/[id]/route.ts", import.meta.url), "utf8");
const evidenceUpload = await readFile(new URL("../app/api/cases/[id]/evidence/route.ts", import.meta.url), "utf8");
const teamRoute = await readFile(new URL("../app/api/team/route.ts", import.meta.url), "utf8");
const bootstrapRoute = await readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8");
const confirmCauseRoute = await readFile(new URL("../app/api/cases/[id]/confirm-cause/route.ts", import.meta.url), "utf8");
const invariants = await readFile(new URL("../drizzle/0004_faultcite_pilot_invariants.sql", import.meta.url), "utf8");
const manualsRoute = await readFile(new URL("../app/api/manuals/route.ts", import.meta.url), "utf8");
const manualDownload = await readFile(new URL("../app/api/manuals/[id]/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const authShell = await readFile(new URL("../app/auth-shell.tsx", import.meta.url), "utf8");
const casesRoute = await readFile(new URL("../app/api/cases/route.ts", import.meta.url), "utf8");
const invitationExpiryMigration = await readFile(new URL("../drizzle/0005_invitation_expiry.sql", import.meta.url), "utf8");
const identityMigration = await readFile(new URL("../drizzle/0006_clerk_identity_binding.sql", import.meta.url), "utf8");

test("removes fabricated diagnostic sources and approvers", () => {
  for (const forbidden of ["Page 214", "Revision 7", "Maria Santos", "James Cole", "Down 46 min", "All case data synced"]) {
    assert.equal(source.includes(forbidden), false, `found forbidden pilot claim: ${forbidden}`);
  }
  assert.match(source, /FaultCite will not invent a procedure/);
});

test("uses the FaultCite brand without old product claims", () => {
  assert.match(source, /FAULTCITE/);
  assert.match(source, /FaultCite records authorization/);
  assert.equal(/CNC Medic/i.test(source), false);
  assert.equal(source.includes("Stethoscope"), false);
  assert.equal(casesRoute.includes("`CM-"), false);
  assert.equal(closeRoute.includes("`CM-"), false);
  assert.match(casesRoute, /`FC-/);
  assert.match(closeRoute, /`FC-/);
});

test("supports shared-company pilot invitations", () => {
  assert.match(invitationMigration, /CREATE TABLE `invitations`/);
  assert.match(backend, /invite\.organizationId/);
  assert.match(backend, /status: "accepted"/);
  assert.match(backend, /pendingInvite/);
  assert.match(backend, /orderBy\(desc\(memberships\.updatedAt\)\)/);
  assert.match(source, /Invite to pilot/);
  assert.match(backend, /controlled pilot is invitation-only/);
  assert.match(backend, /verification\?\.status !== "verified"/);
  assert.match(backend, /gt\(invitations\.expiresAt/);
  assert.match(invitationExpiryMigration, /expires_at/);
  assert.match(invitationExpiryMigration, /604800000/);
  assert.match(backend, /eq\(users\.clerkUserId, authData\.userId\)/);
  assert.match(backend, /owner-verified identity reconciliation/);
  assert.match(identityMigration, /users_clerk_user_uq/);
});

test("locks terminal and review states and requires observations", () => {
  for (const status of ["closed", "cause_confirmed", "escalated", "review_requested"]) assert.match(eventsRoute, new RegExp(`.*${status}.*`));
  assert.match(eventsRoute, /observation, and request key are required/);
  assert.match(closeRoute, /eq\(cases\.status, "cause_confirmed"\)/);
  assert.match(closeRoute, /Case state changed before closeout/);
});

test("serves evidence only through authenticated tenant-scoped route", () => {
  assert.match(evidenceDownload, /requireApiContext/);
  assert.match(evidenceDownload, /eq\(caseEvidence\.organizationId, ctx\.organizationId\)/);
  assert.match(evidenceDownload, /cache-control.*private, no-store/);
  assert.match(source, /Add or retry photo/);
});

test("adds durable evidence and replay protection schema", () => {
  assert.match(migration, /CREATE TABLE `case_evidence`/);
  assert.match(migration, /idempotency_key/);
  assert.match(migration, /case_events_org_case_idempotency_uq/);
});

test("prevents manager ownership escalation and technician admin-data access", () => {
  assert.match(teamRoute, /Ownership transfer is not enabled in this controlled pilot/);
  assert.match(teamRoute, /Managers may only activate or deactivate technicians/);
  assert.match(teamRoute, /Manager permission required/);
  assert.match(bootstrapRoute, /canManage \?/);
  assert.match(bootstrapRoute, /Promise\.resolve\(\[\]\)/);
});

test("uses unambiguous diagnostic outcomes", () => {
  assert.match(eventsRoute, /Supports suspected cause/);
  assert.match(eventsRoute, /Does not support suspected cause/);
  assert.match(confirmCauseRoute, /supporting the suspected cause/);
  assert.equal(eventsRoute.includes('"Pass"'), false);
  assert.equal(source.includes('p.result === "Pass"'), false);
  assert.match(source, /p\.result === "Supports suspected cause"/);
});

test("enforces pilot invariants in the database", () => {
  assert.match(invariants, /cases_one_active_per_machine_uq/);
  assert.match(invariants, /cases_closed_immutable_guard/);
  assert.match(invariants, /case_events_tenant_guard/);
  assert.match(invariants, /memberships_owner_promotion_guard/);
});

test("validates evidence bytes and cleans up failed object saves", () => {
  assert.match(evidenceUpload, /image\/jpeg/);
  assert.match(evidenceUpload, /File contents do not match an allowed image format/);
  assert.match(evidenceUpload, /Declared image type does not match the file contents/);
  assert.match(evidenceUpload, /Invalid evidence type/);
  assert.match(evidenceUpload, /BUCKET\.delete\(objectKey\)/);
  assert.match(evidenceUpload, /db\.batch\(\[/);
  assert.match(evidenceUpload, /case\.evidence_added/);
});

test("keeps the controlled pilot invitation-only", () => {
  assert.match(backend, /This controlled pilot is invitation-only/);
  assert.equal(backend.includes("role: \"owner\""), false);
  assert.equal(backend.includes('role: "owner"'), false);
});

test("supports explicitly selected active company workspaces", () => {
  assert.match(backend, /faultcite_organization/);
  assert.match(backend, /activeMemberships\.find/);
  assert.equal(backend.includes("set({ active: false"), false);
  assert.match(bootstrapRoute, /eq\(memberships\.active, true\)/);
  assert.match(bootstrapRoute, /That company workspace is not available/);
  assert.match(bootstrapRoute, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(source, /Company workspace/);
});

test("serves manuals only through authenticated tenant-scoped route", () => {
  assert.match(manualDownload, /requireApiContext/);
  assert.match(manualDownload, /eq\(manuals\.organizationId, ctx\.organizationId\)/);
  assert.match(manualDownload, /BUCKET\.get\(manual\.objectKey\)/);
  assert.match(manualDownload, /cache-control.*private, no-store/);
  assert.match(manualDownload, /content-security-policy.*sandbox/);
  assert.match(source, /\/api\/manuals\/\$\{manual\.id\}/);
});

test("uses standalone Clerk authentication and supports sign-out", () => {
  assert.equal(backend.includes("oai-authenticated-user"), false);
  assert.equal(page.includes("ChatGPT"), false);
  assert.match(backend, /authenticateRequest/);
  assert.match(backend, /authorizedParties/);
  assert.match(authShell, /ClerkProvider/);
  assert.match(authShell, /useAuth/);
  assert.match(authShell, /UserButton/);
  assert.match(authShell, /afterSignOutUrl/);
});

test("sends and audits pilot invitation email delivery", () => {
  assert.match(teamRoute, /api\.resend\.com\/emails/);
  assert.match(teamRoute, /team\.invitation_email_sent/);
  assert.match(teamRoute, /team\.invitation_email_failed/);
});

test("rejects unsafe or malformed pilot PDFs", () => {
  assert.match(manualsRoute, /%%EOF/);
  assert.match(manualsRoute, /\\\/Encrypt/);
  assert.match(manualsRoute, /\\\/JavaScript/);
  assert.match(manualsRoute, /\\\/EmbeddedFile/);
  assert.ok(manualsRoute.indexOf("Manual title and manufacturer are required") < manualsRoute.indexOf("BUCKET.put"));
  assert.match(manualsRoute, /db\.batch\(\[/);
  assert.match(manualsRoute, /manual\.uploaded/);
});
