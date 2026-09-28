# Administrator readiness check

Development only; not deployed or enabled. Production remains hard-blocked.

POST /api/admin/migration-readiness performs only the existing authentication flow and a read-only lookup joining auth_identities to platform_admins. It does not create mappings, grant roles, export customer records, or access R2. No email-based fallback is accepted.

Requirements: staging.faultcite.com or localhost:5173; FAULTCITE_MIGRATION_READINESS_ENABLED=true; FAULTCITE_MIGRATION_READINESS_EXPIRES_AT within the next 15 minutes; FAULTCITE_MIGRATION_EXPORT_SUBJECT set to the existing approved Clerk subject; same-origin POST with x-faultcite-readiness: check; authenticated Clerk session and active platform-admin mapping. Do not place subject/session credentials into logs or URLs. Configure only on a separately verified synthetic deployment before production compatibility work.

Success returns administratorIdentityVerified=true, exportPerformed=false, maintenanceVerified=false and productionAcceptance=false. No user identifiers or customer data are returned. The lease is rechecked after identity lookup. This check must run before a pause; the pause deliberately does not exempt this route.

Validation: four behavioral tests passed for default-off/production/expiry, anonymous/wrong-provider/unpinned identities, active-admin-only acceptance, no-store/minimal response, cross-origin denial, lookup errors and mid-request lease expiry. TypeScript and targeted ESLint passed.

## Remaining live verification
Exact Sites version35 source must be retrieved and its runtime/authentication wiring inspected. The existing saved archive could not be retrieved during the prior review. Do not treat this feature-branch endpoint as deployed or source-app authentication evidence.

## Drain design requirement
The current admission gate does not wait for admitted requests, streaming work, waitUntil tasks, old deployment instances or direct storage writers. A local in-memory counter cannot prove cross-instance quiescence. Before approving any freeze, inventory every writer and implement a shared coordination protocol covering admission and completion, including failure/timeout handling that blocks backup rather than assumes completion. Old releases and direct writers must be fenced or independently stopped. Exercise a deliberately slow admitted write, pause admission, verify export remains blocked until completion, verify webhook/GET/upload/background coverage, then prove writes resume. Run this on isolated source-compatible resources first. Do not activate a live pause without owner approval.
