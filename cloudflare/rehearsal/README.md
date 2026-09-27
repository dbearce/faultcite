# Authenticated synthetic hosted restore rehearsal

Prepared, not executed remotely. This is not a live source-app backup or production acceptance.

The manual `Synthetic hosted restore rehearsal` workflow requires the exact confirmation
`REHEARSE-synthetic-only`. Configure the `restore-rehearsal` GitHub environment with
required reviewers before allowing runs. It uses the existing `CLOUDFARE_API_TOKEN`
and `CLOUDFARE_ACCOUNT_ID` secrets; do not paste credentials into workflow inputs.

When separately approved and run, it creates two fresh D1 databases, two fresh R2
buckets and one temporary Worker with random run-specific `fc-rehearsal-*` names.
It never reads customer databases or files and does not bind to production, staging
or public Workers. No DNS/custom domains, billing configuration or maintenance pause
is touched. Cloudflare test resources may incur normal provider usage costs.

The Worker requires a random ephemeral bearer secret and expires after ten minutes.
No request-supplied SQL, source URLs, object names, archive or target IDs are accepted.
It rejects nonempty resources and repeated runs. It exports its fixed synthetic
fixture using the application exporter, verifies archive/footer and object checksums,
restores to the separate target bindings, compares content/metadata, and proves target
deletion does not remove source records. This is a narrow fixture restore, not the
general-purpose production importer. Logs and artifact contain only synthetic results
and resource names/IDs; no bearer secret, customer data, or archive is uploaded.

`node --test cloudflare/rehearsal/worker.test.mjs` tests the same handler locally.
Local success is not hosted success. A hosted run must produce
`synthetic-rehearsal-passed`; failures preserve resources and never certify acceptance.
No automatic destructive cleanup runs. Use the artifact inventory to review and
approve deletion of these exact disposable resources after evidence review. If a
creation/deployment response is lost, inspect the unique prefix before cleanup; do
not delete by broad wildcard. Expiry blocks endpoint use but does not delete resources.

Remaining separate gates: Clerk/platform-admin authorization on the actual source app,
write-pause/drain verification, approved real-data maintenance window and protected
full backup, general restore/migration verification and production continuity evidence.
