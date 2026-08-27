import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
};

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(), status: text("status").notNull().default("pilot"), ...timestamps,
}, (t) => [uniqueIndex("organizations_slug_uq").on(t.slug)]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), clerkUserId: text("clerk_user_id"), email: text("email").notNull(), displayName: text("display_name").notNull(), ...timestamps,
}, (t) => [uniqueIndex("users_email_uq").on(t.email), uniqueIndex("users_clerk_user_uq").on(t.clerkUserId)]);

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), userId: text("user_id").notNull().references(() => users.id), role: text("role").notNull().default("technician"), active: integer("active", { mode: "boolean" }).notNull().default(true), ...timestamps,
}, (t) => [uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId), index("memberships_user_idx").on(t.userId)]);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  role: text("role").notNull().default("technician"),
  invitedByUserId: text("invited_by_user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  acceptedByUserId: text("accepted_by_user_id").references(() => users.id),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (t) => [uniqueIndex("invitations_org_email_uq").on(t.organizationId, t.email), index("invitations_email_status_idx").on(t.email, t.status)]);

export const machines = sqliteTable("machines", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), assetNumber: text("asset_number").notNull(), manufacturer: text("manufacturer").notNull(), model: text("model").notNull(), serialNumber: text("serial_number"), control: text("control"), location: text("location"), status: text("status").notNull().default("running"), ...timestamps,
}, (t) => [uniqueIndex("machines_org_asset_uq").on(t.organizationId, t.assetNumber), index("machines_org_idx").on(t.organizationId)]);

export const cases = sqliteTable("cases", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), caseNumber: text("case_number").notNull(), machineId: text("machine_id").notNull().references(() => machines.id), openedByUserId: text("opened_by_user_id").notNull().references(() => users.id), assignedToUserId: text("assigned_to_user_id").references(() => users.id), status: text("status").notNull().default("open"), symptom: text("symptom").notNull(), alarmCode: text("alarm_code"), precedingChange: text("preceding_change"), notes: text("notes"), confirmedCause: text("confirmed_cause"), repairSummary: text("repair_summary"), repairType: text("repair_type"), partsUsed: text("parts_used"), verificationReadings: text("verification_readings"), testCycles: text("test_cycles"), safetyDevicesVerified: integer("safety_devices_verified", { mode: "boolean" }).notNull().default(false), temporaryExpiresAt: integer("temporary_expires_at", { mode: "timestamp_ms" }), operatingRestrictions: text("operating_restrictions"), followupWork: text("followup_work"), restartApprovedByUserId: text("restart_approved_by_user_id").references(() => users.id), openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()), closedAt: integer("closed_at", { mode: "timestamp_ms" }), ...timestamps,
}, (t) => [uniqueIndex("cases_org_number_uq").on(t.organizationId, t.caseNumber), index("cases_org_status_idx").on(t.organizationId, t.status), index("cases_machine_idx").on(t.machineId)]);

export const caseEvents = sqliteTable("case_events", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), caseId: text("case_id").notNull().references(() => cases.id), actorUserId: text("actor_user_id").notNull().references(() => users.id), eventType: text("event_type").notNull(), result: text("result"), reading: text("reading"), notes: text("notes"), payloadJson: text("payload_json"), idempotencyKey: text("idempotency_key"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("case_events_case_time_idx").on(t.caseId, t.createdAt), index("case_events_org_idx").on(t.organizationId), uniqueIndex("case_events_org_case_idempotency_uq").on(t.organizationId, t.caseId, t.idempotencyKey)]);

export const caseEvidence = sqliteTable("case_evidence", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), caseId: text("case_id").notNull().references(() => cases.id), uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => users.id), kind: text("kind").notNull(), fileName: text("file_name").notNull(), objectKey: text("object_key").notNull(), contentType: text("content_type").notNull(), sizeBytes: integer("size_bytes").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("case_evidence_case_time_idx").on(t.caseId, t.createdAt), index("case_evidence_org_idx").on(t.organizationId), uniqueIndex("case_evidence_object_key_uq").on(t.objectKey)]);

export const manuals = sqliteTable("manuals", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => users.id), title: text("title").notNull(), manufacturer: text("manufacturer").notNull(), model: text("model"), revision: text("revision"), serialApplicability: text("serial_applicability"), fileName: text("file_name").notNull(), objectKey: text("object_key").notNull(), contentType: text("content_type").notNull(), sizeBytes: integer("size_bytes").notNull(), status: text("status").notNull().default("pending_review"), rightsConfirmed: integer("rights_confirmed", { mode: "boolean" }).notNull().default(false), ...timestamps,
}, (t) => [index("manuals_org_idx").on(t.organizationId), uniqueIndex("manuals_object_key_uq").on(t.objectKey)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), actorUserId: text("actor_user_id").notNull().references(() => users.id), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), metadataJson: text("metadata_json"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("audit_org_time_idx").on(t.organizationId, t.createdAt)]);
