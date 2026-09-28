# Source backup access and maintenance review

Checked September 28, 2026 UTC (September 27 Chicago). Result: NOT VERIFIED for production backup acceptance.

## Live read-only evidence
Sites reports FaultCite active at https://app.faultcite.com, latest saved version 35, connected management user role owner. Version 35 source commit is f82670bd231bc4a1cbf25e512bd7187b9a84e3e5; its publish deployment succeeded September 8, 2026 with environment revision 15. Management ownership is not application platform-admin authorization.

Current Sites environment entries contain no FAULTCITE_WRITE_PAUSE_* or FAULTCITE_MIGRATION_EXPORT_ENABLED keys. An anonymous HEAD to /api/admin/migration-export returned HTTP 404. This does not prove authenticated POST behavior or the existence/absence of that route. No authenticated export or customer-data read was attempted.

The saved source archive file could not be authorized/resolved by download_file, and the deployed commit is absent from the local git object store. Exact deployed-source inspection was therefore not completed.

## Development checks
15 targeted exporter/pause/storage tests passed. The development exporter permits only staging.faultcite.com and localhost:5173, explicitly excludes production, requires a valid session with a pinned Clerk subject and existing active platform-admin mapping, matching pause/freeze identifiers, and a bounded lease.

The development Worker denies new requests before application dispatch while paused, including GET side effects and webhook routes; only the exact export POST proceeds to separate authorization. It does not drain requests admitted earlier, waitUntil work, older deployments, or direct storage writers. Local tests do not establish hosted production enforcement.

## Remaining gates
1. Inspect exact deployed source and establish the source-compatible authentication/runtime path.
2. Exercise real platform-admin identity authorization through a non-exporting readiness check, plus ordinary-user/anonymous denial, without granting new roles or bypassing authentication.
3. Verify admission and in-flight/background/direct-writer drainage on an isolated source-compatible deployment.
4. Keep production export disabled; obtain owner approval before any live maintenance pause. Only then perform separately controlled real backup and full restore verification.

No deployments, runtime settings, DNS, billing, maintenance state, account roles, or customer data were changed during this review.
