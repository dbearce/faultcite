# FaultCite Tomorrow-Sale Readiness

Date: August 26, 2026

## Defensible offer tomorrow

FaultCite may be presented as a **controlled-pilot release candidate** or transferred as a **software asset with disclosed deployment and acceptance conditions**. Do not represent it as a production-proven SaaS service until the external acceptance evidence below is complete.

## Accurate current capabilities

- Invitation-only Clerk authentication with manager and technician roles.
- Company-scoped machines, cases, manuals, evidence, reviews, approvals, exports, and audit history.
- Cloudflare Worker application with D1 records, R2 files, Resend invitations, health checks, and isolated staging/production templates.
- Maintenance evidence and cited manual-page workflow with explicit human review and safety boundaries.

## Claims to avoid

- Do not claim AI diagnosis, autonomous repair, QR scanning, voice capture, predictive maintenance, telemetry, CMMS/ERP integration, billing, guaranteed uptime, regulatory compliance, or a support SLA.
- Do not claim proven downtime reduction, ROI, data immutability, disaster recovery, or production security without the buyer-specific evidence.
- Do not say the live domains are ready while staging serves a placeholder or production remains on the former host.

## Required before a paid live pilot

- [ ] Buyer and seller sign scope, price, IP/asset transfer or license, data ownership, privacy, retention/deletion, support hours, acceptance, warranty, liability, termination, and incident responsibilities.
- [ ] Counsel reviews the transaction and product terms; the seller confirms appropriate business and cyber/general liability insurance.
- [ ] An authenticated Cloudflare operator supplies real environment IDs/keys, creates the D1 export and R2 recovery evidence, applies all eight migrations, deploys staging, and records the Worker version.
- [ ] Any nonempty database passes the owner-reviewed Clerk-ID reconciliation described in `OPERATIONS_RUNBOOK.md`; reissuing invitations alone is not a migration.
- [ ] Clerk and Resend production/staging configuration is verified with one manager and one technician using real invitation, sign-in, sign-out, expiry, and rejected-identity scenarios.
- [ ] Two separate companies pass cross-tenant isolation tests for UI, APIs, exports, manuals, evidence, and company switching.
- [ ] Desktop and mobile acceptance, keyboard and screen-reader checks, upload/download, approval/closeout, health monitoring, alerting, rollback, and restore are witnessed and recorded.
- [ ] Only after staging acceptance is signed may `app.faultcite.com` move from the former host to the production Worker.

## Demo rules for tomorrow

Use synthetic company, machine, manual, and evidence data. Label the environment and release. Keep a recorded local or staging fallback. Never expose Clerk, Resend, Cloudflare, invitation, session, customer, or uploaded-file secrets. Demonstrate that FaultCite supports a human-controlled maintenance record workflow; do not imply that it authorizes energization, restart, or a repair decision.

## Go/no-go statement

**GO** for a disclosed controlled-pilot/software-asset sale after the written transaction documents are signed.

**NO-GO** for an unconditional production-SaaS sale until the live external gates are completed and evidenced.

## Disclosed engineering risk

The deployable production dependency audit and pinned bundled React/RSC check must pass. The broader development/build toolchain currently includes upstream advisories, some without an available fix. Build only in an isolated trusted environment, never publish a development server, retain gate output, and schedule dependency replacement/upgrades as upstream fixes become available.
