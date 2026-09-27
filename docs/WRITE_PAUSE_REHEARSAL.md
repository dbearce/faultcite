# Write-pause rehearsal — not activated

This change implements request admission control, not a distributed storage lock
or automatic drain. Production pause/export remain unactivated. Billing and DNS
must remain unchanged. Ask the owner before starting a production maintenance
window; no time window is approved by this document.

## Controls

- `FAULTCITE_WRITE_PAUSE_ENABLED`: absent or exact `false` means normal service;
  exact `true` requests maintenance. Other values fail closed with HTTP 503.
- `FAULTCITE_WRITE_PAUSE_ID`: required when enabled, 8–128 ASCII letters, digits,
  underscore or hyphen. Use a new ID per planned maintenance event.
- No automatic expiry resumes application writes. Explicitly disable maintenance
  after the operator has completed or abandoned the backup safely.

The gate runs before application routing, including GET requests with side
effects, webhook processing and uploads. All such traffic gets 503/no-store.
Platform-served static files may bypass Worker code but do not write D1/R2.
Only exact `POST /api/admin/migration-export` without query parameters proceeds
to its independent admin/session/origin/lease checks. The export gate also
requires the pause ID to equal its freeze receipt. This matching is configuration
validation, **not evidence of a completed drain**. Production export remains
hard-blocked by its existing host allowlist.

## Synthetic rehearsal sequence

1. Use separate synthetic resources and the reviewed release; never reuse live
   production or occupied staging storage. Confirm binding IDs before testing.
2. Establish the pinned active platform-admin Clerk session before pausing.
   Ordinary sign-in, session and health routes intentionally return 503 during
   maintenance. Management-account ownership does not establish app authorization.
3. With export disabled, verify a synthetic write succeeds with pause off.
4. Enable the pause on the isolated deployment. Verify GET bootstrap, POST
   uploads, webhook requests and ordinary pages all return maintenance without
   changing table counts or object inventories. Client headers must not bypass it.
5. Test an already-running upload separately: admission control does not cancel
   it. Do not assert the source is frozen while that upload or its cleanup runs.
6. Inventory all deployments and external writers. Exclude old deployment URLs,
   direct storage clients, migrations and management jobs. Verify that no
   in-flight work remains; elapsed time or two equal counts alone are not proof.
7. Only after independently establishing quiescence, record the matching pause
   receipt and frozen assertion. Enable a short export lease on the synthetic
   source. Verify unauthorized/ordinary-owner access fails and admin export
   succeeds. Never log session cookies or export customer data to CI artifacts.
8. Validate the completed archive and restore into distinct empty targets. Verify
   database contents, constraints, file bytes and metadata; corrupt/truncated
   archives must fail. Do not populate production continuity evidence from this.
9. Disable export first, then explicitly resume the isolated app. Confirm normal
   writes resume and source/target resources remain separate.

## Evidence and limitations

Local Miniflare tests exercise real isolated local D1/R2 bindings: synthetic GET
and POST writers leave both stores unchanged when paused or misconfigured, and
write successfully with pause off. Unit tests cover header-bypass attempts and
exact export-path restrictions. These are not hosted authentication or drain
tests. Existing requests, older deployments and direct clients can still write.
The application currently has no source scheduled/queue handlers or backend
`waitUntil` jobs identified by review, but hosted configuration still requires
inspection. Do not certify a production snapshot until those gaps are closed.

## Prepared hosted fixture runner

`.github/workflows/rehearse-migration-storage.yml` prepares the manual authenticated
synthetic-only hosted run. See `cloudflare/rehearsal/README.md` for the confirmation,
isolated resource scope and later cleanup inventory. Its ephemeral bearer-token
authentication is separate from the source app's Clerk/platform-admin access.
The runner does not test or activate the application pause on a live source.

Checkpoint 2026-09-27 UTC: full `npm run build` passed lint, type checking, artifact
validation and 167 Node tests, including 10 Python restore tests through a wrapper.
Three of the local runtime tests exercise the prepared hosted fixture handler.
No hosted resources were created, no remote rehearsal ran, and no maintenance
pause, production export, billing configuration or DNS change was activated.
