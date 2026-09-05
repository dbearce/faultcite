import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
};

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(), status: text("status").notNull().default("pilot"), plan: text("plan").notNull().default("pilot"), subscriptionStatus: text("subscription_status").notNull().default("not_configured"), stripeCustomerId: text("stripe_customer_id"), stripeSubscriptionId: text("stripe_subscription_id"), subscriptionUpdatedAt: integer("subscription_updated_at", { mode: "timestamp_ms" }), stripeEventCreatedAt: integer("stripe_event_created_at", { mode: "timestamp_ms" }), stripeEventId: text("stripe_event_id"), reviewSlaMinutes: integer("review_sla_minutes").notNull().default(60), dataRetentionDays: integer("data_retention_days").notNull().default(2555), safetyContactEmail: text("safety_contact_email"), supportContactEmail: text("support_contact_email"), termsAcceptedAt: integer("terms_accepted_at", { mode: "timestamp_ms" }), ...timestamps,
}, (t) => [uniqueIndex("organizations_slug_uq").on(t.slug)]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), email: text("email").notNull(), displayName: text("display_name").notNull(), ...timestamps,
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const authIdentities = sqliteTable("auth_identities", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerSubject: text("provider_subject").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  verifiedEmail: text("verified_email").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex("auth_identities_provider_subject_uq").on(t.provider, t.providerSubject),
  uniqueIndex("auth_identities_provider_user_uq").on(t.provider, t.userId),
  index("auth_identities_user_idx").on(t.userId),
]);

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id").primaryKey().references(() => users.id),
  selectedOrganizationId: text("selected_organization_id").references(() => organizations.id),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
});

export const platformAdmins = sqliteTable("platform_admins", {
  userId: text("user_id").primaryKey().references(() => users.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), userId: text("user_id").notNull().references(() => users.id), role: text("role").notNull().default("technician"), active: integer("active", { mode: "boolean" }).notNull().default(true), ...timestamps,
}, (t) => [
  uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId),
  index("memberships_user_idx").on(t.userId),
]);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  role: text("role").notNull().default("technician"),
  invitedByUserId: text("invited_by_user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  acceptedByUserId: text("accepted_by_user_id").references(() => users.id),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  tokenHash: text("token_hash"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (t) => [uniqueIndex("invitations_org_email_uq").on(t.organizationId, t.email), index("invitations_email_status_idx").on(t.email, t.status)]);

export const machines = sqliteTable("machines", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), assetNumber: text("asset_number").notNull(), manufacturer: text("manufacturer").notNull(), model: text("model").notNull(), serialNumber: text("serial_number"), control: text("control"), location: text("location"), status: text("status").notNull().default("running"), ...timestamps,
}, (t) => [uniqueIndex("machines_org_asset_uq").on(t.organizationId, t.assetNumber), index("machines_org_idx").on(t.organizationId)]);

export const cases = sqliteTable("cases", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), caseNumber: text("case_number").notNull(), machineId: text("machine_id").notNull().references(() => machines.id), openedByUserId: text("opened_by_user_id").notNull().references(() => users.id), assignedToUserId: text("assigned_to_user_id").references(() => users.id), status: text("status").notNull().default("open"), symptom: text("symptom").notNull(), alarmCode: text("alarm_code"), precedingChange: text("preceding_change"), notes: text("notes"), confirmedCause: text("confirmed_cause"), failureCategory: text("failure_category"), laborMinutes: integer("labor_minutes"), partsCostCents: integer("parts_cost_cents"), repairSummary: text("repair_summary"), repairType: text("repair_type"), partsUsed: text("parts_used"), verificationReadings: text("verification_readings"), testCycles: text("test_cycles"), safetyDevicesVerified: integer("safety_devices_verified", { mode: "boolean" }).notNull().default(false), temporaryExpiresAt: integer("temporary_expires_at", { mode: "timestamp_ms" }), operatingRestrictions: text("operating_restrictions"), followupWork: text("followup_work"), closeoutSubmittedByUserId: text("closeout_submitted_by_user_id").references(() => users.id), restartApprovedByUserId: text("restart_approved_by_user_id").references(() => users.id), reviewRequestedAt: integer("review_requested_at", { mode: "timestamp_ms" }), managerActionDueAt: integer("manager_action_due_at", { mode: "timestamp_ms" }), openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()), closedAt: integer("closed_at", { mode: "timestamp_ms" }), ...timestamps,
}, (t) => [uniqueIndex("cases_org_number_uq").on(t.organizationId, t.caseNumber), index("cases_org_status_idx").on(t.organizationId, t.status), index("cases_machine_idx").on(t.machineId)]);

export const caseEvents = sqliteTable("case_events", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), caseId: text("case_id").notNull().references(() => cases.id), actorUserId: text("actor_user_id").notNull().references(() => users.id), eventType: text("event_type").notNull(), result: text("result"), reading: text("reading"), notes: text("notes"), payloadJson: text("payload_json"), idempotencyKey: text("idempotency_key"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("case_events_case_time_idx").on(t.caseId, t.createdAt), index("case_events_org_idx").on(t.organizationId), uniqueIndex("case_events_org_case_idempotency_uq").on(t.organizationId, t.caseId, t.idempotencyKey)]);

export const caseEvidence = sqliteTable("case_evidence", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), caseId: text("case_id").notNull().references(() => cases.id), uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => users.id), kind: text("kind").notNull(), fileName: text("file_name").notNull(), objectKey: text("object_key").notNull(), contentType: text("content_type").notNull(), sizeBytes: integer("size_bytes").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("case_evidence_case_time_idx").on(t.caseId, t.createdAt), index("case_evidence_org_idx").on(t.organizationId), uniqueIndex("case_evidence_object_key_uq").on(t.objectKey)]);

export const manuals = sqliteTable("manuals", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => users.id), title: text("title").notNull(), manufacturer: text("manufacturer").notNull(), model: text("model"), revision: text("revision"), serialApplicability: text("serial_applicability"), documentType: text("document_type"), publicationDate: integer("publication_date", { mode: "timestamp_ms" }), effectiveDate: integer("effective_date", { mode: "timestamp_ms" }), language: text("language"), revalidationDueAt: integer("revalidation_due_at", { mode: "timestamp_ms" }), documentOwnerUserId: text("document_owner_user_id").references(() => users.id), pageCount: integer("page_count"), fileName: text("file_name").notNull(), objectKey: text("object_key").notNull(), contentType: text("content_type").notNull(), sizeBytes: integer("size_bytes").notNull(), status: text("status").notNull().default("pending_review"), rightsConfirmed: integer("rights_confirmed", { mode: "boolean" }).notNull().default(false), reviewedByUserId: text("reviewed_by_user_id").references(() => users.id), reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }), reviewNotes: text("review_notes"), ...timestamps,
}, (t) => [index("manuals_org_idx").on(t.organizationId), uniqueIndex("manuals_object_key_uq").on(t.objectKey)]);

export const manualSources = sqliteTable("manual_sources", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  manualId: text("manual_id").notNull().references(() => manuals.id),
  machineId: text("machine_id").notNull().references(() => machines.id),
  approvedByUserId: text("approved_by_user_id").notNull().references(() => users.id),
  manufacturer: text("manufacturer").notNull(),
  model: text("model").notNull(),
  serialNumber: text("serial_number"),
  alarmCode: text("alarm_code"),
  sectionTitle: text("section_title").notNull(),
  pageStart: integer("page_start").notNull(),
  pageEnd: integer("page_end").notNull(),
  sourceSummary: text("source_summary").notNull(),
  safetyNotes: text("safety_notes").notNull(),
  approvedAt: integer("approved_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index("manual_sources_org_machine_idx").on(t.organizationId, t.machineId),
  index("manual_sources_manual_idx").on(t.manualId),
]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), actorUserId: text("actor_user_id").notNull().references(() => users.id), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), metadataJson: text("metadata_json"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("audit_org_time_idx").on(t.organizationId, t.createdAt)]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id), recipientUserId: text("recipient_user_id").notNull().references(() => users.id), type: text("type").notNull(), caseId: text("case_id").references(() => cases.id), title: text("title").notNull(), message: text("message").notNull(), readAt: integer("read_at", { mode: "timestamp_ms" }), dedupeKey: text("dedupe_key").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [uniqueIndex("notifications_recipient_dedupe_uq").on(t.recipientUserId, t.dedupeKey), index("notifications_recipient_read_time_idx").on(t.recipientUserId, t.readAt, t.createdAt), index("notifications_org_idx").on(t.organizationId)]);

export const rateLimitBuckets = sqliteTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: integer("reset_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("rate_limit_reset_idx").on(t.resetAt)]);

export const stripeWebhookEvents = sqliteTable("stripe_webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const pilotInterest = sqliteTable("pilot_interest", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  workEmail: text("work_email").notNull(),
  company: text("company").notNull(),
  message: text("message"),
  source: text("source").notNull().default("faultcite.com"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("pilot_interest_created_idx").on(t.createdAt)]);

export const manualUploadSessions = sqliteTable("manual_upload_sessions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull().references(() => users.id),
  totalChunks: integer("total_chunks").notNull(),
  reservedBytes: integer("reserved_bytes").notNull(),
  status: text("status").notNull().default("uploading"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
}, (t) => [index("manual_upload_org_status_idx").on(t.organizationId, t.status), index("manual_upload_expiry_idx").on(t.expiresAt)]);

export const storageReservations = sqliteTable("storage_reservations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull().references(() => users.id),
  uploadKind: text("upload_kind").notNull(),
  reservedBytes: integer("reserved_bytes").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("storage_reservation_org_kind_idx").on(t.organizationId, t.uploadKind), index("storage_reservation_expiry_idx").on(t.expiresAt)]);

export const pilotFeedback = sqliteTable("pilot_feedback", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  submittedByUserId: text("submitted_by_user_id").notNull().references(() => users.id),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  caseNumber: text("case_number"),
  contactRequested: integer("contact_requested", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("open"),
  resolutionNotes: text("resolution_notes"),
  resolvedByUserId: text("resolved_by_user_id").references(() => users.id),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("pilot_feedback_org_time_idx").on(t.organizationId, t.createdAt), index("pilot_feedback_org_status_idx").on(t.organizationId, t.status)]);
