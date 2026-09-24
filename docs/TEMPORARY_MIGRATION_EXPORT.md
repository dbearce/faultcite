# Temporary migration export — development only

User authorized development and testing on September 24, 2026. No deployment,
maintenance pause, live export, DNS change, or billing change is authorized by
this feature. No flags have been configured in any environment.

## Implemented

`POST /api/admin/migration-export` streams versioned NDJSON through existing D1
and R2 bindings. Database output includes schema definitions, SQL INSERT records
with exact integer/BLOB/text literals, and AUTOINCREMENT high-water marks. R2
output includes complete file bytes, object metadata, per-file SHA-256, and a
terminal stream checksum. Internal Cloudflare/SQLite schema objects are excluded;
SQLite sequences are explicitly preserved. Virtual tables fail closed.

The route requires an existing active platform-admin mapping for an authenticated
Clerk subject and session. It does not fall back to email or ordinary company
owner privileges, and it does not call initialization/rate-limit/audit writers.
The subject must match a dedicated runtime allowlist value. The export has a
maximum 15-minute activation lease, same-origin POST and custom-header checks.
An expired lease or changed/missing object aborts without a completion record.

It is OFF when flags are absent. The development host allowlist permits only
`https://staging.faultcite.com` and `http://localhost:5173`. Production is hard
blocked even if someone sets the enable flag. No UI control is exposed.

## Configuration (not set)

- `FAULTCITE_MIGRATION_EXPORT_ENABLED`: exact `true`.
- `FAULTCITE_MIGRATION_EXPORT_SUBJECT`: pre-existing Clerk platform-admin subject.
- `FAULTCITE_MIGRATION_EXPORT_EXPIRES_AT`: ISO timestamp at most 15 minutes ahead.
- `FAULTCITE_MIGRATION_SOURCE_FROZEN`: exact `true`.
- `FAULTCITE_MIGRATION_FREEZE_RECEIPT`: operator's verified freeze reference.

The frozen flag is a prerequisite declaration, NOT an implemented freeze. Do not
set it on a mutable source. All GET side effects, webhooks, upload completions,
background writers and admin writes must be stopped/drained before a real snapshot.
Do not activate any pause without asking the owner first.

## Remaining before live use

1. Independent review and deployed staging authentication/streaming tests with
   synthetic data. Current tests exercise actual SQLite but mock R2 and auth gate
   inputs; they do not establish real Clerk or deployed Worker behavior.
2. Implement and test a protected collector/importer: validate all record types,
   file sizes/checksums, terminal checksum/count, schema dependency order, and
   restore into isolated D1/R2. Preserve SQLite sequences after table inserts;
   recreate triggers after loading data. Never execute unverified SQL on live data.
3. Full file/table reconciliation and restore rehearsal. The fixture restore test
   is NOT a complete production restoration proof. Large exports can hit runtime
   limits; interruption must produce a failed backup, never acceptance evidence.
4. Choose a protected encrypted backup destination and access/retention policy.
   NDJSON itself is not encrypted at rest. Never place real exports in GitHub,
   CI logs/artifacts, or chat. No real data has been exported here.
5. Build a verified maintenance/write-freeze mechanism and agree the maintenance
   window with the owner. Full consistency requires the freeze to remain effective
   for the entire export; per-object ETags alone are insufficient.
6. Separately review/approve any production allowlist change and temporary feature
   deployment. Remove the route/configuration after migration and verify denial.

Do not populate production continuity receipts until all real evidence exists.
