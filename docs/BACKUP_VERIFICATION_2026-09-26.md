# Backup verification checkpoint — 2026-09-26

Not production acceptance. No live backup, maintenance pause, hosted restore,
deployment, DNS modification, or billing configuration change was performed.

## Source access

Read-only Sites management checks confirmed the source project is active at
https://app.faultcite.com, reports latest version 35, and grants the connected
user the owner role. Runtime environment revision 15 selects both standalone
runtime and Clerk authentication. No migration-export activation flags are set.
This narrows the earlier suspected authentication mismatch but does not prove an
authenticated platform-admin export request succeeds. Management ownership is
not equivalent to the application's platform-admin authorization.

The development exporter is hard-blocked on the production origin. Its code is
on the feature branch, not evidence of a production deployment. No customer
records, credentials, or files were exported during these checks.

## Write pause

Repository inspection found no implemented maintenance/write-pause mechanism.
`FAULTCITE_MIGRATION_SOURCE_FROZEN` is an assertion consumed by the export gate,
not a control that stops writes. `worker/index.ts` currently forwards requests
without a maintenance admission gate; the Stripe webhook can also write records.
Testing this assertion cannot establish a consistent source snapshot.

A future implementation must block all write-capable requests (including GET
side effects), account for webhooks/background work and drain in-flight writes.
Do not activate a production pause without the owner's separate approval.

## Local storage rehearsal

`node --test tests/migration-storage.test.mjs` passed using installed Miniflare
and distinct SOURCE/TARGET D1 and R2 bindings. It exercised actual local bindings,
not a mocked bucket: one synthetic database row and a 150,000-byte binary file,
including custom metadata and content type. Export passed the offline checker;
restored rows and file bytes matched, and target mutation did not alter source.
All temporary data was synthetic and cleaned up after the test.

The full `npm run build` also passed lint, type checking, artifact validation and
158 Node tests, including the wrapper running 10 Python restore tests.

This is not hosted Cloudflare storage. It does not prove source identity access,
remote account permissions, write quiescence, large-production-dataset behavior,
or a generic archive importer. No Cloudflare token is configured in the local
execution environment. A hosted rehearsal needs a scoped authenticated runner,
fresh dedicated D1/R2 targets, and a reviewed importer; the existing staging
restore script must not be aimed at occupied staging resources.

## Next required decisions/work

1. Implement and test a default-off admission/drain mechanism in non-production.
2. Exercise the source-compatible admin export flow with synthetic data without
   weakening authorization or enabling production export.
3. Prepare/run a dedicated hosted D1/R2 rehearsal using the GitHub-held token.
4. Request the owner's maintenance-window approval only after these tests pass.

The team-spawn service failed this turn, so these checks were performed by the
primary agent rather than represented as a completed independent team review.
