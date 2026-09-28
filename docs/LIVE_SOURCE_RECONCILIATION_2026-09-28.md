# Live source reconciliation — September 28, 2026 UTC

## Resolved inspection blocker
Opened the existing Sites source repository through the supported owner credential/workflow. Recovered exact live version35 source commit f82670bd231bc4a1cbf25e512bd7187b9a84e3e5. No source pushes, version creation or production deployment occurred. This supersedes the earlier unavailable-source inspection limitation.

The deployed Worker strips client-supplied runtime headers and sets its internal standalone header only from FAULTCITE_RUNTIME. Current Sites settings specify standalone runtime, Clerk provider and https://app.faultcite.com origin. Its app/auth.ts then uses Clerk authentication and verified email. This confirms source/runtime compatibility; it does not prove an authenticated administrator session or existing platform-admin database mapping.

The recovered source contains neither the development migration-export/readiness endpoints nor write-pause admission control. A configuration change alone cannot install them. Never equate the GitHub feature branch with the deployed Sites app.

## Current read-only checks
- faultcite.com: HTTP200.
- Pilot, security, privacy, terms and support links: HTTP200 after canonical redirects from .html to extensionless paths.
- app.faultcite.com/api/health: HTTP200, release0.3.9, database/fileStorage ok.
- app.faultcite.com/api/auth/session without credentials: HTTP401, authenticated false.
- These checks do not certify authenticated product journeys or legal approval.

## Development validation and changes
Full existing development build, lint/type/artifact checks and171 tests passed. Separately added an isolated test-only drain model and5 passing behavioral tests for slow upload/finally cleanup, unresolved errors, abandoned tickets, pause races and receipt-bound epoch resume. It is intentionally not connected to any runtime. It is not a distributed drain implementation or evidence of a production freeze.

## Remaining release gates
1. Build and test persistent shared admission/completion coordination on a source-compatible isolated runtime. Track all request, stream and background completion; unresolved tickets block backup. Account for older deployments/direct writers.
2. Verify the authenticated administrator identity through the non-exporting readiness flow. Current development readiness intentionally excludes production.
3. Test source-compatible maintenance and full-schema/file restoration before production activation. Ask owner before a maintenance pause.
4. Obtain real consistent backup evidence and only then perform the already-authorized controlled migration. Billing stays disabled; only separately authorized domain changes may occur during cutover.

No customer data export, production pause, app billing change or DNS change occurred. The public website and live app remain on their existing deployment.
