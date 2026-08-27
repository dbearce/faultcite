# FaultCite Commercial Pilot Release Candidate 0.3.3

Date: August 26, 2026

## Completed in this release

- Replaced ChatGPT identity headers and redirects with standalone Clerk authentication.
- Added server-side Clerk session verification with an authorized-origin allowlist.
- Preserved invitation-only access, exact work-email matching, tenant-scoped membership, role checks, and company switching.
- Added a visible Clerk account menu and verified sign-out path.
- Added Resend invitation delivery with success/failure audit records and honest UI feedback.
- Replaced Sites-specific build configuration with a Cloudflare Worker build named `faultcite-staging`.
- Bound staging resources as `DB` → `faultcite-staging-db` and `BUCKET` → `faultcite-staging-files`.
- Preserved D1 database invariants, R2 evidence validation, application-enforced closed-record controls, and pilot safety language.
- Removed active ChatGPT/OpenAI, old-brand, placeholder, and legacy hosting references from runtime source.
- Patched the Nano ID dependency chain; the production dependency audit now reports zero vulnerabilities.
- Added same-origin protection, bounded application-level API rate limiting, and hardened response headers.
- Added secure, server-validated switching between active company memberships.
- Added authenticated tenant-scoped PDF manual viewing with audit history and safe browser headers.
- Added a manager-only, tenant-scoped company-record export with export auditing.
- Added dependency-aware D1/R2 health checks that return HTTP 503 when a required service is unavailable.
- Added isolated staging and production deployment templates plus guarded migration, rollback, and post-deployment checks.
- Added an operations runbook and a manager/technician pilot acceptance matrix.
- Replaced fabricated sample performance metrics with a truthful pilot measurement plan.
- Improved technician and manager hierarchy, responsive reflow, loading and retry states, and export discoverability.
- Added managed accessible dialogs with initial focus, focus trapping, Escape handling, and trigger focus restoration.
- Added skip navigation, focus-on-view behavior, labeled search, and assistive-technology announcements.
- Added bounded JSON parsing, response limits, credential-redacted audit metadata, safer email delivery, and upload filename limits.
- Added a one-command seven-stage release gate, static accessibility tests, secret scanning, and release-package validation.
- Removed internal R2 object keys and tenant/actor identifiers from manual, evidence, and invitation API responses.
- Replaced the remaining legacy `CM-` case-number prefix with the FaultCite `FC-` prefix for all new records.
- Added seven-day invitation expiry and verified-primary-email enforcement at the Clerk identity boundary.
- Made manual/evidence storage and audit writes atomic, validated manual metadata before R2 writes, and bounded PDF scanning memory.
- Replaced the incomplete raw-config deploy command with reviewed-config validation and explicit deployment confirmation.
- Added reconnect guards so offline forms cannot imply that a save or approval can complete.
- Pinned React, React DOM, and React Server Components to the reviewed 19.2.8 security release and added a release-gate version check.
- Bound application users to immutable Clerk user IDs; an email address alone can no longer take over an existing account record.
- Rejected missing, invalid, and oversized upload lengths before multipart parsing to reduce Worker memory-exhaustion risk.
- Corrected prepared Wrangler entry and asset paths so `.release/<environment>/wrangler.json` points to the real built Worker and client assets.
- Added public privacy, pilot-terms, and support pages plus a visible release/environment label.
- Reworded saved history and status claims to describe application-enforced behavior without implying legal immutability or independently proven live status.

## Verification results

- Production build: PASS
- ESLint: PASS
- Automated tests: 44/44 PASS
- Production dependency audit: 0 vulnerabilities
- Cloudflare artifact validation: PASS
- D1/R2 binding validation: PASS
- Clerk authentication/sign-out tests: PASS
- Resend delivery/audit tests: PASS

## Remaining external deployment work

The code is ready for staging, but the current build environment is not authenticated to the owner's Cloudflare account. No live domain was changed.

1. Follow `OPERATIONS_RUNBOOK.md` from an authenticated Cloudflare computer to prepare, migrate, deploy, and verify staging.
2. Confirm the two Worker secrets and three reviewed public variables listed in `.env.example` are configured, using `https://staging.faultcite.com` for `FAULTCITE_APP_ORIGIN`.
3. Back up staging and apply tracked migrations using `scripts/apply-migrations.sh`.
4. Test one invited manager and one invited technician in separate browser profiles.
5. Verify sign-in, sign-out, invite email delivery, company isolation, machine creation, evidence upload/download, case workflow, manager approval, and closeout history.
6. Complete the accessibility, mobile, backup-restore, monitoring, and two-company isolation checks in `PILOT_ACCEPTANCE.md`.
7. Only after staging acceptance, prepare the isolated production configuration and cut `app.faultcite.com` over from the old host.

## Release decision

Code gate: PASS for the local 0.3.3 source and Worker artifact (46 automated tests, TypeScript, ESLint, production build, secret scan, dependency audit, and artifact validation).

Staging deployment gate: BLOCKED only by external Cloudflare account authentication and live acceptance testing.

Production cutover gate: NOT YET APPROVED; staging must pass first.
