# Production reconciliation — September 23, 2026

Status: inventory reconciled; production provisioning, backup, and cutover are NOT complete.

## Verified evidence

- GitHub commit `901743cd2746e80eb60a0de7f23ec2594d7de639` updates only the read-only inventory workflow.
- Inventory run https://github.com/dbearce/faultcite/actions/runs/35896649825 succeeded.
- Cloudflare authentication and D1, R2, Workers, custom-domain read, DNS read, and zone route read checks passed.
- Account inventory lists `faultcite-public` and `faultcite-staging`. `faultcite-production` is absent.
- `faultcite-public` exposes two plain-text bindings and no D1/R2 bindings. It is not a substitute for the application backend.
- Named storage found: `faultcite-staging-db` and `faultcite-staging-files`. The expected production database and bucket are absent from inventory.
- `app.faultcite.com` remains a DNS-only CNAME to `custom-domains.chatgpt.site`; no matching account Worker custom-domain association exists.
- The zone Worker route is `staging.faultcite.com/*` to `faultcite-staging`.
- Sites confirms FaultCite is active at `https://app.faultcite.com`, latest version 35, with an active custom domain and DB binding. The database overview exposes 23 application tables; this is not a backup or a row inventory.
- Staging health passed and its migration journal includes `0028_manual_source_revocation_guard.sql`.
- A staging schema-only diagnostic export succeeded. It contains no customer rows and is NOT a customer-data backup.

## Reconciled target and sequence

Keep the live Sites application and staging resources intact. Keep the intended target names `faultcite-production`, `faultcite-production-db`, and `faultcite-production-files`; do not rename existing Workers or reuse staging storage.

The existing production workflow is a cutover workflow, not initial provisioning. Its assumption that the target Worker already exists does not match this account. Before running it:

1. Obtain a supported, protected full export of the live Sites database and uploaded files, plus a verified source write-freeze mechanism. The available Sites connector can inspect tables but offers no full database/file export operation. No credentials should be extracted from unrelated services or placed in chat/source/logs.
2. Prepare a separate no-domain production provisioning path with isolated storage, billing disabled, and no public route. Configure target credentials through protected secret interfaces.
3. Back up and migrate the identified live source, rehearse isolated restoration, and verify record and complete file-content equality. Do not silently substitute staging data or a fresh empty pilot.
4. Record actual continuity and restore evidence required by `PRODUCTION_CUTOVER.md`, then validate the exact release commit and execute the authorized controlled cutover.

No production resources, DNS associations, billing values, source records, or live application deployments were changed by this reconciliation. Production billing status has not been verified because the intended Worker does not yet exist. Deployment configuration continues to require billing disabled.

## Backup tooling review

The existing backup helper does not itself encrypt exports and permits an omitted R2 backup. The restore helper is staging-only; the reconciliation helper compares database counts and performs a one-way file check. These helpers alone do not prove the full protected-backup, isolated-restore, and matching-content requirements. Do not fabricate receipts or weaken the cutover gate to work around these gaps.
