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
const organizationsRoute = await readFile(new URL("../app/api/organizations/route.ts", import.meta.url), "utf8");
const adminMigration = await readFile(new URL("../drizzle/0005_lonely_cassandra_nova.sql", import.meta.url), "utf8");
const selectionMigration = await readFile(new URL("../drizzle/0007_silky_donald_blake.sql", import.meta.url), "utf8");
const invitationAccept = await readFile(new URL("../app/api/invitations/accept/route.ts", import.meta.url), "utf8");
const invitationEmail = await readFile(new URL("../lib/invitation-email.ts", import.meta.url), "utf8");
const joinPage = await readFile(new URL("../app/join/page.tsx", import.meta.url), "utf8");
const joinClient = await readFile(new URL("../app/join/join-invitation.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const caseEditRoute = await readFile(new URL("../app/api/cases/[id]/route.ts", import.meta.url), "utf8");
const escalationRoute = await readFile(new URL("../app/api/cases/[id]/escalation/route.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const closeoutRequestRoute = await readFile(new URL("../app/api/cases/[id]/request-closeout/route.ts", import.meta.url), "utf8");
const migrationJournal = await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");
const artifactValidator = await readFile(new URL("../scripts/validate-artifact.sh", import.meta.url), "utf8");
const requestReviewRoute = await readFile(new URL("../app/api/cases/[id]/request-review/route.ts", import.meta.url), "utf8");
const exportRoute = await readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8");
const helpPage = await readFile(new URL("../app/help/page.tsx", import.meta.url), "utf8");

test("removes fabricated diagnostic sources and approvers", () => {
  for (const forbidden of ["Page 214", "Revision 7", "Maria Santos", "James Cole", "Down 46 min", "All case data synced"]) {
    assert.equal(source.includes(forbidden), false, `found forbidden pilot claim: ${forbidden}`);
  }
  assert.match(source, /FaultCite will not invent a procedure/);
});

test("uses the FaultCite brand without old product claims", () => {
  assert.match(source, /FAULTCITE/);
  assert.match(source, /FaultCite records a manager’s authorization/);
  assert.equal(new RegExp(["CNC", "Medic"].join(" "), "i").test(source), false);
  assert.equal(source.includes("Stethoscope"), false);
});

test("supports shared-company pilot invitations", () => {
  assert.match(invitationMigration, /CREATE TABLE `invitations`/);
  assert.match(invitationAccept, /tokenHash/);
  assert.match(invitationAccept, /expiresAt/);
  assert.match(invitationAccept, /eq\(invitations\.email, email\)/);
  assert.match(invitationAccept, /status: "accepted"/);
  assert.match(source, /Send invitation/);
  assert.match(backend, /FaultCite is invitation-only/);
});

test("delivers invitations honestly and preserves a secure fallback", () => {
  assert.match(teamRoute, /sendInvitationEmail/);
  assert.match(teamRoute, /deliveryStatus/);
  assert.match(teamRoute, /requiresPrivateSiteAccess/);
  assert.match(teamRoute, /publicInvitation/);
  assert.match(invitationEmail, /https:\/\/api\.resend\.com\/emails/);
  assert.match(invitationEmail, /"user-agent": "FaultCite\/1\.0/);
  assert.match(invitationEmail, /response\.status === 403/);
  assert.match(invitationEmail, /Email delivery is not configured/);
  assert.match(source, /Resend/);
  assert.match(source, /Copy link/);
  assert.match(source, /same invited email/);
});

test("keeps invitation tokens through sign-in and clears them after acceptance", () => {
  assert.match(joinPage, /encodeURIComponent\(token\)/);
  assert.match(joinPage, /ProtectedInvitation/);
  assert.match(joinClient, /history\.replaceState/);
  assert.match(invitationAccept, /onConflictDoUpdate/);
  assert.match(invitationAccept, /selectedOrganizationId: invite\.organizationId/);
  assert.match(joinPage, /signedInEmail/);
  assert.match(joinClient, /Use a different account/);
});

test("provides visible sign-out controls and blocks indexing", () => {
  assert.match(page, /signOutPath/);
  assert.match(source, /Sign out/);
  assert.match(source, /mobile-sign-out/);
  assert.match(layout, /index: false/);
  assert.match(layout, /follow: false/);
  assert.match(source, /COMPANY ACCESS REQUIRED/);
  assert.match(source, /signedInEmail/);
});

test("uses the FaultCite contact mailbox without exposing the owner's personal email", () => {
  assert.match(helpPage, /FAULTCITE_CONTACT_EMAIL/);
  assert.match(helpPage, /admin@faultcite\.com/);
  assert.doesNotMatch(helpPage, /derekbearce@outlook\.com/i);
});

test("redirects document visits to the canonical FaultCite domain and prevents stale HTML shells", () => {
  assert.match(worker, /FAULTCITE_APP_ORIGIN/);
  assert.match(worker, /endsWith\("\.chatgpt\.site"\)/);
  assert.match(worker, /isDocumentRequest/);
  assert.match(worker, /Response\.redirect\(destination, 308\)/);
  assert.match(worker, /private, no-store, max-age=0, must-revalidate/);
});

test("distinguishes duplicate team names and gives managers the correct empty action", () => {
  assert.match(source, /Role for \$\{member\.displayName\} \(\$\{member\.email\}\)/);
  assert.match(source, /Use the registration form above to add the first company machine/);
});

test("edits saved intake and resolves unsafe escalations without replacing the case", () => {
  assert.match(caseEditRoute, /export async function PATCH/);
  assert.match(caseEditRoute, /case\.intake_updated/);
  assert.match(caseEditRoute, /inArray\(cases\.status, \["open", "diagnosing"\]\)/);
  assert.match(escalationRoute, /return_to_diagnosis/);
  assert.match(escalationRoute, /cancel_without_restart/);
  assert.match(escalationRoute, /Manager permission required/);
  assert.match(escalationRoute, /idempotencyKey/);
  assert.match(escalationRoute, /replayResolution/);
  assert.match(escalationRoute, /The escalation changed before the manager resolution was saved/);
  assert.match(source, /returnedAfterUnsafeStop/);
  assert.match(source, /Save intake changes/);
  assert.match(source, /Cancel case · no restart/);
});

test("uses authoritative confirmed cause and central security headers", () => {
  assert.equal(source.includes("confirmedCause: cause"), false);
  assert.match(source, /MANAGER-CONFIRMED CAUSE/);
  assert.match(worker, /Cross-site request blocked/);
  assert.match(worker, /content-security-policy/);
  assert.equal(layout.includes("next\/font"), false);
});

test("supports technician closeout submission followed by manager approval", () => {
  assert.match(closeoutRequestRoute, /closeout_requested/);
  assert.match(closeoutRequestRoute, /manager_approval_required/);
  assert.match(closeRoute, /"closeout_requested"/);
  assert.match(source, /Submit for manager authorization/);
  assert.match(source, /Manager authorization pending/);
  assert.match(closeoutRequestRoute, /case: \{ \.\.\.record, \.\.\.casePatch \}/);
  assert.match(closeoutRequestRoute, /idempotencyKey/);
  assert.match(closeRoute, /case: \{ \.\.\.record, \.\.\.casePatch \}/);
});

test("packages the latest terminal-state database guards", () => {
  assert.match(migrationJournal, /0018_last_nomad/);
  assert.match(artifactValidator, /0023_public_pilot_interest\.sql/);
});

test("claims invitations before membership access and limits manager invitations", () => {
  assert.match(invitationAccept, /status: "accepting"/);
  assert.ok(invitationAccept.indexOf("const claimed") < invitationAccept.indexOf("const [member]"));
  assert.match(teamRoute, /Managers may invite technicians only/);
});

test("bootstraps only the configured private owner on an empty replacement site", () => {
  assert.match(backend, /FAULTCITE_OWNER_EMAIL/);
  assert.match(backend, /email !== ownerEmail/);
  assert.match(backend, /platformAdmins/);
  assert.match(backend, /FaultCite Internal Workspace/);
});

test("locks terminal and review states and requires observations", () => {
  for (const status of ["closed", "cause_confirmed", "escalated", "review_requested"]) assert.match(eventsRoute, new RegExp(`.*${status}.*`));
  assert.match(eventsRoute, /actual observation, result, and request key are required/);
  assert.match(closeRoute, /"closeout_requested"/);
  assert.match(closeRoute, /eq\(cases\.status, record\.status\)/);
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
  assert.match(teamRoute, /Ownership transfer is not available in this release/);
  assert.match(teamRoute, /Managers may only activate or deactivate technicians/);
  assert.match(teamRoute, /Manager permission required/);
  assert.match(bootstrapRoute, /canManage \?/);
  assert.match(bootstrapRoute, /Promise\.resolve\(\[\]\)/);
});

test("uses unambiguous diagnostic outcomes", () => {
  assert.match(eventsRoute, /Supports suspected cause/);
  assert.match(eventsRoute, /Does not support suspected cause/);
  assert.match(confirmCauseRoute, /latest recorded observation must support the suspected cause/);
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
  assert.match(evidenceUpload, /sanitizeEvidenceImage/);
  assert.match(evidenceUpload, /private photo metadata can be removed/);
  assert.match(evidenceUpload, /Invalid evidence type/);
  assert.match(evidenceUpload, /BUCKET\.delete\(objectKey\)/);
});

test("keeps the controlled pilot invitation-only", () => {
  assert.match(backend, /FaultCite is invitation-only/);
  assert.match(backend, /if \(!ownerEmail \|\| email !== ownerEmail\).*invitation-only/s);
  assert.match(backend, /selectedOrganizationId/);
  assert.match(backend, /eq\(memberships\.active, true\)/);
  assert.equal(backend.includes("db.update(memberships).set({ active: false"), false);
});

test("separates platform administration from company roles", () => {
  assert.match(adminMigration, /CREATE TABLE `platform_admins`/);
  assert.match(adminMigration, /SELECT DISTINCT `user_id`.*`role` = 'owner'/s);
  assert.match(organizationsRoute, /if \(!ctx\.platformAdmin\)/);
  assert.match(organizationsRoute, /eq\(memberships\.userId, ctx\.userId\)/);
  assert.match(organizationsRoute, /enabled access to that company/);
  assert.match(organizationsRoute, /eq\(memberships\.active, true\)/);
  assert.match(selectionMigration, /CREATE TABLE `user_settings`/);
  assert.match(selectionMigration, /DROP INDEX `memberships_one_active_uq`/);
  assert.match(source, /Company administration/);
  assert.match(source, /Create & open/);
});

test("rejects unsafe or malformed pilot PDFs", () => {
  assert.match(manualsRoute, /%%EOF/);
  assert.match(manualsRoute, /\\\/Encrypt/);
  assert.match(manualsRoute, /\\\/JavaScript/);
  assert.match(manualsRoute, /\\\/EmbeddedFile/);
});

test("limits technician writes to their own or assigned cases", () => {
  assert.match(backend, /canModifyCase/);
  assert.match(eventsRoute, /canModifyCase\(ctx,record\)/);
  assert.match(evidenceUpload, /canModifyCase\(ctx, record\)/);
  assert.match(requestReviewRoute, /canModifyCase\(ctx, record\)/);
  assert.match(closeoutRequestRoute, /canModifyCase\(ctx, record\)/);
});

test("keeps file metadata and audit writes together and hides storage keys", () => {
  assert.match(evidenceUpload, /db\.insert\(auditLogs\)/);
  assert.match(manualsRoute, /db\.batch\(/);
  assert.match(manualsRoute, /db\.insert\(auditLogs\)/);
  assert.match(evidenceUpload, /const publicEvidence/);
  assert.match(manualsRoute, /const publicManual/);
  assert.match(exportRoute, /evidenceMetadata:evidenceRows\.map/);
});

test("makes failure and pending states visible to technicians", () => {
  assert.match(source, /Saving case…/);
  assert.match(source, /historyRequestKey/);
  assert.match(source, /Why guidance is withheld/);
  assert.match(source, /p\.error && <div className="error" role="alert"/);
});

test("polishes plant-floor navigation without creating duplicate machine cases", () => {
  assert.match(source, /function openMachine\(machineIdToOpen/);
  assert.match(source, /record\.machineId === machineIdToOpen && activeCaseStatuses\.has\(record\.status\)/);
  assert.match(source, /aria-label="Refresh workspace"/);
  assert.match(source, /className="skip-link"/);
  assert.match(source, /Safety controls active/);
});

test("manager approval uses the immutable technician closeout", () => {
  assert.match(closeRoute, /record\.status !== "closeout_requested"/);
  assert.match(closeRoute, /const repairSummary = record\.repairSummary/);
  assert.match(closeRoute, /const testCycles = record\.testCycles/);
  assert.match(source, /submitted technician record is read-only/i);
});

test("requires a named cause, structured diagnostic evidence, and a different restart approver", () => {
  assert.match(eventsRoute, /suspectedCause/);
  assert.match(eventsRoute, /testPerformed/);
  assert.match(eventsRoute, /expectedResult/);
  assert.match(confirmCauseRoute, /supportingEventId/);
  assert.match(confirmCauseRoute, /latestCheck/);
  assert.match(closeoutRequestRoute, /closeoutSubmittedByUserId: ctx\.userId/);
  assert.match(closeRoute, /record\.closeoutSubmittedByUserId === ctx\.userId/);
  assert.match(source, /different authenticated users/);
});

test("bounds invitation provider waits and labels provider acceptance honestly", () => {
  assert.match(invitationEmail, /AbortSignal\.timeout\(10_000\)/);
  assert.match(invitationEmail, /submitted to the email provider/);
  assert.match(source, /Accepted by email provider/);
});
