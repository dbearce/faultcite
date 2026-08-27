import assert from "node:assert/strict";
import test from "node:test";
import { caseApiView, evidenceApiView, invitationApiView, manualApiView } from "../lib/api-views.ts";

test("manual and evidence API views do not disclose storage or tenant internals", () => {
  const manual = manualApiView({
    id: "manual-1", organizationId: "org-secret", uploadedByUserId: "user-secret",
    title: "Manual", manufacturer: "Maker", fileName: "manual.pdf",
    objectKey: "org-secret/manuals/manual-1/manual.pdf", contentType: "application/pdf",
    sizeBytes: 42, status: "pending_review", rightsConfirmed: true,
  });
  const evidence = evidenceApiView({
    id: "evidence-1", organizationId: "org-secret", uploadedByUserId: "user-secret",
    caseId: "case-1", kind: "alarm_screen", fileName: "alarm.jpg",
    objectKey: "org-secret/cases/case-1/evidence-1/alarm.jpg", contentType: "image/jpeg",
    sizeBytes: 42,
  });

  assert.equal("objectKey" in manual, false);
  assert.equal("organizationId" in manual, false);
  assert.equal("uploadedByUserId" in manual, false);
  assert.equal("objectKey" in evidence, false);
  assert.equal("organizationId" in evidence, false);
  assert.equal("uploadedByUserId" in evidence, false);
});

test("invitation API views expose workflow state without internal actor or tenant IDs", () => {
  const invitation = invitationApiView({
    id: "invite-1", organizationId: "org-secret", invitedByUserId: "owner-secret",
    acceptedByUserId: "user-secret", email: "tech@example.com", role: "technician",
    status: "accepted", acceptedAt: new Date("2026-08-25T00:00:00Z"),
  });

  assert.equal(invitation.email, "tech@example.com");
  assert.equal("organizationId" in invitation, false);
  assert.equal("invitedByUserId" in invitation, false);
  assert.equal("acceptedByUserId" in invitation, false);
});

test("case API views expose workflow fields without tenant or actor IDs", () => {
  const record = caseApiView({
    id: "case-1", organizationId: "org-secret", caseNumber: "FC-2026-1",
    machineId: "machine-1", openedByUserId: "user-secret",
    assignedToUserId: "assignee-secret", restartApprovedByUserId: "manager-secret",
    status: "open", symptom: "Will not cycle",
  });
  assert.equal(record.caseNumber, "FC-2026-1");
  for (const key of ["organizationId", "openedByUserId", "assignedToUserId", "restartApprovedByUserId"]) {
    assert.equal(key in record, false);
  }
});
