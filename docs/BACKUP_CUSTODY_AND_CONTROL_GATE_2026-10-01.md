# Protected backup custody and control gate — 2026-10-01

Status: development only. No production pause, export, restoration, DNS change,
or billing enablement performed by this change.

## Selected custody architecture (not provisioned)

- Ciphertext destination: a dedicated private Cloudflare R2 backup bucket,
  distinct from source and restore buckets. No public hostname or public access.
  Use a unique object name per capture and verify uploaded/downloaded ciphertext
  hashes. Restrict credentials to this bucket and the minimum required operations.
- Recovery key: a cryptographically random 32-byte key held by the owner in a
  password manager outside Cloudflare, GitHub, CI artifacts, and this repository.
  Confirm owner retrieval before capture. A second owner-controlled recovery copy
  and a named alternate custodian must be agreed before reliance on this backup.
- Restore destination: newly provisioned, separately identified D1 database and
  private R2 bucket, with no production routes, emails, payments, or webhooks.
- No customer plaintext in chat, repository, workflow artifacts, or ordinary
  scratch storage. A private encrypted-disk runner is required for temporary
  plaintext; record cleanup and do not claim secure erasure merely from deletion.
- Backup retention and authorized recovery operators require owner confirmation;
  do not configure automatic deletion until retention/legal hold is decided.

## Controls

The exact POST maintenance-control endpoint is admitted through the Worker pause
and ticket gate solely for its own independent authorization. Altered paths,
query strings, methods, and cross-origin requests cannot use that exception.
The handler must remain default-off and staging-only until hosted verification.
It must pin the existing Clerk platform administrator and a short-lived lease.

Implemented interface: POST `/api/admin/maintenance-control`, exact same origin,
`x-faultcite-maintenance: control`, JSON body bounded to 4096 bytes. An existing
active platform administrator with the pinned Clerk session is required.
`FAULTCITE_MAINTENANCE_CONTROL_ENABLED`, `_EXPIRES_AT`, and `_SUBJECT` configure
the temporary gate (each suffix extends `FAULTCITE_MAINTENANCE_CONTROL`).
The lease must expire within 15 minutes and persistent tracking must be enabled.
Operations: status, pause, abort, resume. Mutations require exact staging
confirmation strings; recovery uses epoch and pause-generation receipts.
Pause refuses invalid environment settings or conflicting pause identities.

Independent code review found no blocking authorization or unsafe lock-clearing
defect. The focused control suite passes 17 tests; the Worker routing suite
passes 4 tests. These are local tests, not authenticated hosted acceptance.

Recovery must distinguish the persistent pause from the environment pause.
Aborting a persistent pause does not disable the environment gate. Neither abort
nor resume proves a backup or restoration succeeded. Unresolved writer/export
tickets must never be force-cleared to manufacture a drained assertion.

## Remaining gates before real capture

1. Review and test the control handler, Worker routing, schema, and source-compatible
   deployment together in an authenticated hosted staging rehearsal.
2. Verify existing administrator authorization without bootstrap or role creation.
3. Inventory all source writers, including old deployments and out-of-band clients.
   Persistent draining alone covers only cooperating writers.
4. Confirm the owner's password-manager custody and recovery retrieval, private
   runner, backup destination, retention, and isolated target identities.
5. Ask the owner explicitly before beginning the production maintenance pause.
6. Capture only under a verified fence and drain. Encrypt, upload, re-download,
   verify ciphertext, decrypt in isolation, and restore using a reviewed importer.
7. Compare complete schema/rows/sequences and object inventory/bytes/metadata;
   retain non-sensitive evidence tied to source version and target identities.
8. Verify source recovery and disable temporary access; keep billing disabled.

The existing successful synthetic hosted rehearsal does not prove real-source
backup acceptance. The new control changes require their own hosted validation.
Interrupted export tickets still require independently verified fencing and a
reviewed recovery procedure; the API intentionally offers no force-clear action.
