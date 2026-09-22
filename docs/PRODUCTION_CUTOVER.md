# Controlled production cutover — operator checklist

Updated September 21, 2026. Status: **blocked pending account access and data/recovery evidence**.

The owner authorized moving only `app.faultcite.com` from ChatGPT Sites to
`faultcite-production`. Paid billing must remain disabled. This is authorization,
not proof that the migration or backup has completed.

## Before dispatch

1. Repair the Cloudflare credential through its protected account/secret interface.
   Never paste keys into chat, source, logs, or screenshots. Validate permissions
   with read-only API calls; do not bypass failed permission checks.
2. Identify the existing Sites database and file bucket and the production Worker
   database and bucket. A healthy endpoint does not establish matching data.
3. Arrange a short maintenance window and verify writes are frozen on the source.
   Record how to lift that freeze on either success or recovery. No freeze has
   been applied by this change.
4. Take protected backups of BOTH database and files. Rehearse restoration into
   isolated resources and compare records and file contents. A D1 Time Travel
   bookmark is an additional time-limited recovery point, not an exported backup.
   Do not upload SQL, customer files, or customer inventories as public GitHub artifacts.
5. Reconcile the source and target dataset. Hash canonical, consistently sorted
   table/record inventories and full file-content inventories with SHA-256. Keep
   detailed inventories private. Investigate every mismatch; do not overwrite
   customer data or assume a fresh empty pilot was authorized.
6. Create the reviewed receipt file described below using actual evidence.
7. Wait for the release gate on the exact selected commit. Dispatch the production
   workflow only after all human-owned pilot approvals are documented.

## Required data receipt

`docs/PRODUCTION_DATA_CONTINUITY.json` is intentionally absent until verified.
The gate fails before Cloudflare changes when it is absent, stale, or incomplete.
Use only non-sensitive receipt identifiers; keep customer content, private URLs,
credentials, backup payloads, and signed links outside the public repository.

Required fields:

- `verifiedAt`: actual reconciliation time in ISO UTC; must be within 24 hours.
- `approvedBy`: named authorized operator or non-sensitive operator identifier.
- `hostname`: `app.faultcite.com`.
- `targetWorker`: `faultcite-production`.
- `sourceDatabaseRef`, `sourceBucketRef`: non-sensitive inventory receipt references
  identifying the currently live source resources.
- `targetDatabaseName`: `faultcite-production-db`.
- `targetBucketName`: `faultcite-production-files`.
- `writesFrozen`: true only after a verified source write freeze.
- `writeFreezeReceipt`: reference to the verified maintenance record.
- `database` and `files`: each contains `sourceDigest`, `targetDigest` (matching
  SHA-256 inventory digests), `reconciliationReceipt`, `protectedBackupReceipt`,
  and `restoreVerified` (true only after a successful isolated restoration).

The automated gate validates receipt structure and consistency; it does not
perform or independently certify the underlying reconciliation or restoration.
Do not enter placeholder or fabricated approvals to get past it.

## Execution and recovery

The workflow verifies the exact legacy DNS-only CNAME, records unrelated DNS,
builds/tests before traffic changes, records a D1 bookmark, applies migrations,
then replaces only the approved app hostname association. Artifact hashes are
checked before cutover. Database/file continuity receipts and a passing release
gate for the exact commit are prerequisites.

Acceptance includes Worker/domain identity, unrelated DNS comparison, billing
disabled, resource bindings, health, sign-in response, and rejection of forged
identity headers. Authenticated two-company tests remain a separate requirement.

If acceptance fails, the final recovery step attempts to detach only the approved
Worker hostname and recreate the original CNAME, then verifies the result. It
refuses unknown/conflicting DNS instead of deleting it. Any recovery error is
reported as requiring immediate operator action. Runner loss or forced termination
can prevent recovery from executing; this is not an atomic or guaranteed rollback.
An operator with dashboard access must remain available during the window.

DNS recovery does not reverse D1 migrations or writes. Keep both protected backup
sets and the write-freeze record available. Do not automatically restore a live
database or release a write freeze without reconciling any intervening writes.

## Company-pilot release decision

The owner's completed internal test and screenshots are valid partial evidence,
not permission to fabricate the remaining test results. Reconcile them with the
existing acceptance checklist; do not ask testers to repeat tests already proven.
Before real company use, record the company approver, licensed machine/manual
scope, independent restart approver, support/safety contact, approved pilot/legal
documents, and live account/isolation/recovery results. Keep billing disabled.
