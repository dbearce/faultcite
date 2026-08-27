# FaultCite 0.3.1 — Pilot Hardening

Date: August 25, 2026

FaultCite 0.3.1 is the corrected controlled-pilot release candidate for isolated Cloudflare staging.

## Security and privacy

- API response allowlists prevent R2 object keys, organization IDs, and internal actor IDs from leaking through manual, evidence, or invitation responses.
- Clerk account binding now requires an explicitly verified primary email.
- Invitations expire after seven days; expired invitations cannot create or reactivate a membership.
- Provider and database failures use stable user-safe messages instead of returning infrastructure details.

## Reliability and deployment

- Manual metadata is validated before R2 storage, preventing orphaned objects from malformed requests.
- Manual and evidence database records are committed atomically with their audit records; failed database writes remove the uploaded R2 object.
- PDF safety scanning is chunked to avoid creating a second full-size decoded copy in Worker memory.
- Staging and production deployment commands now require a reviewed config, validate environment isolation and required variables, exclude plaintext secrets, and require explicit confirmation.
- Migration and rollback commands validate the same reviewed environment config before touching remote resources.

## Product polish

- New cases and temporary-repair follow-ups use the FaultCite `FC-` identifier instead of the legacy `CM-` prefix.
- Offline case saves, evidence uploads, manager reviews, approvals, invitations, machine registration, and company switching now stop with clear reconnect guidance.
- Managers can see expired invitations and issue a fresh seven-day invitation.

## Release validation

- Production build: PASS
- Cloudflare Worker artifact: PASS
- ESLint: PASS
- Automated tests: 41/41 PASS
- Production dependency audit: 0 vulnerabilities
- Secret scan: PASS
- Release package and six ordered migrations: PASS

Live staging deployment and real Clerk, Resend, D1, R2, mobile, VoiceOver, monitoring, backup-restore, and two-company acceptance remain external gates. Production must not be cut over until those checks pass.
