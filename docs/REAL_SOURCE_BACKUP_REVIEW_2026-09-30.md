# Real-source backup and recovery review — September 30, 2026

## Result

Production backup and restoration are NOT verified. No production pause, customer export, restore, DNS change or billing change occurred in this review.

## Verification performed

- Real app opened at https://app.faultcite.com and redirected to its Clerk email sign-in screen. No authenticated administrator session was available. Secure sign-in returned submission_failed; the visible screen remained at email entry and showed no specific app error. Do not infer rejected credentials or administrator privileges.
- Maintenance specialist ran 21 focused tests covering persistent drain, response lifetimes, export locking and Worker admission ordering: all passed.
- Backup specialist ran 13 Node tests covering export and restoration: all passed. The wrapper includes 10 passing Python restore regressions; these are not 10 additional independent acceptance checks.
- Previously completed hosted synthetic run 36666198467 remains fixture-only evidence.

## Blocking findings

1. Readiness/export routes currently allow staging and localhost only, and are absent from source version 35. A source-compatible reviewed deployment is required before production verification. Do not enable exports merely by changing flags.
2. An existing active Clerk-to-platform-admin mapping must be verified. Sites management ownership and company-owner status are not equivalent authority. No role grants or account bootstrap are permitted as a substitute.
3. Current drain tickets contain id/epoch/kind only. Failed or cancelled work retains tickets, and resume requires zero tickets. There is no verified recovery or maintenance-abort path. Add provenance and audited, independently fenced recovery before production activation; never clear uncertain work by TTL or forced deletion.
4. All source writers must be identified and fenced, including old deployments, background work, uploads, webhooks, schedules and direct storage clients. Cooperating-writer tests do not prove a source-wide freeze.
5. Export output is plaintext NDJSON. An encrypted backup destination, restricted access, recoverable key custody and retention policy must be selected and verified before collecting customer data. Do not upload exports to GitHub, CI artifacts or chat.
6. Legacy backup.sh permits omission of R2; legacy restore.sh uses rclone sync without proving target R2 isolation/emptiness. These scripts must not be used as a complete real-data migration path without repair and verification.

## Acceptance sequence

Verify administrator identity; implement/test production-compatible inspection and recovery; verify protected destination and source provenance; obtain owner approval immediately before maintenance; fence/drain writers; capture complete protected backup; restore into verified isolated empty storage; reconcile all tables, files and metadata; record actual continuity evidence. Cutover remains blocked until these pass.

## Follow-up: authenticated session observed, September 30

After the owner completed manual sign-in, the live app rendered the maintenance workspace at https://app.faultcite.com/. Company setup was available with owner controls, and Add company was visible. Sites still reports live version 35. In its source commit f82670bd231bc4a1cbf25e512bd7187b9a84e3e5, Add company is conditional on the backend-provided platformAdmin flag and manager display mode. This supports platform-admin UI recognition, not a tested full-backup endpoint or independently pinned Clerk subject.

The source's existing /api/export is an organization-scoped JSON report. It excludes object keys, does not collect R2 object bytes, and does not include the entire database. It is not a full-restoration backup. No export was invoked. Full-backup access, encrypted collection, maintenance recovery and production restore remain unverified. No accounts, settings, DNS or maintenance state were changed during this follow-up.
