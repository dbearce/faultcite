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

### Offline restore rehearsal

The local checker `cloudflare/scripts/verify-migration-export.py` validates a
download and attempts restoration only in a new private temporary directory:

```sh
python3 cloudflare/scripts/verify-migration-export.py /protected/path/faultcite-migration.ndjson
```

Use only synthetic archives until the live-use requirements below are satisfied.
The checker deletes its temporary restored copy when finished. It does not import
into Cloudflare, retain a recoverable backup, encrypt the input, or establish that
the source was frozen. Its `productionAcceptance` result remains `false`.
Regression tests run through the normal `npm test` release checks and require
Python 3.11 or later. A checksum detects damage, not a maliciously replaced archive.
Source provenance must be independently verified before accepting a live backup.

Validation checkpoint (2026-09-25 UTC): full `npm run build` passed lint, type
checks, artifact validation and 157 Node tests, including a wrapper that ran 10
Python restore tests. A real SQLite fixture passed exporter-to-checker roundtrip;
R2 was mocked. Additional fixtures cover corruption, truncation, SQL attacks,
file-key traversal, foreign-key failures, sequences and generated columns.
These are development results, not production acceptance or a live backup.
The checker limits each record to 8 MiB and restoration to a SQLite instruction
budget; unsupported schema functions or larger records fail closed.

### Live-use requirements

1. Independent review and deployed staging authentication/streaming tests with
   synthetic data. Current tests exercise actual SQLite but mock R2 and auth gate
   inputs; they do not establish real Clerk or deployed Worker behavior.
2. Finish the protected collection and isolated D1/R2 import path. The offline
   SQLite checker is not a deployed D1/R2 restore rehearsal. Preserve SQLite
   sequences after table inserts; recreate triggers after loading data. Never
   execute unverified SQL on live data.
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

The current route accepts only Clerk identities. `app/auth.ts` selects Clerk only
on the standalone runtime path; the Sites source authentication path must be
proven end-to-end before any production activation. Do not bypass this with an
email match, client-supplied runtime header, or ordinary company-owner role.
The current archive header does not bind the archive to a release, source origin,
or freeze receipt. Add reviewed provenance before production continuity use.
