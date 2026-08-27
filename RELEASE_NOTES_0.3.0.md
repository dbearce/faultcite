# FaultCite 0.3.0 — Release Polish

Date: August 25, 2026

FaultCite 0.3.0 is the polished controlled-pilot release for Cloudflare staging acceptance.

## User experience

- Clearer technician and manager page hierarchy.
- Reduced warning density while retaining every LOTO and source-gating boundary.
- Honest Results measurement plan with no fabricated business metrics.
- Dedicated loading, failure, retry, empty, and offline states.
- More discoverable manager export action.
- Improved mobile and narrow-screen reflow.

## Accessibility

- Skip navigation and focused page changes.
- Managed modal focus, Escape dismissal, focus restoration, and Tab containment.
- Named search input and close control.
- Live announcements for search results, loading, errors, and saved actions.
- Visible keyboard focus and reduced-motion support.

## Reliability and security

- Bounded JSON bodies and bounded pilot list responses.
- Credential-redacted, size-capped audit metadata.
- Safer invitation email escaping, HTTPS origin checks, and delivery timeout.
- Capped and sanitized upload filenames with detected MIME metadata.
- Same-origin request protection, application rate limiting, and hardened headers.
- Production dependency audit reports zero vulnerabilities.

## Release validation

- Production build: PASS
- Cloudflare Worker artifact: PASS
- ESLint: PASS
- Automated tests: 39/39 PASS
- Production dependency audit: 0 vulnerabilities
- Secret scan: PASS
- Release package and migration validation: PASS

Staging deployment and real Clerk, Resend, D1, R2, mobile, VoiceOver, monitoring, backup-restore, and two-company acceptance remain external gates. Production must not be cut over until those checks pass.
