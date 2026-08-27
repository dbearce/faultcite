# FaultCite 0.3.2 — Commercial Pilot Release Candidate

Date: August 26, 2026

FaultCite 0.3.2 is the security and sale-readiness update to the controlled-pilot candidate. It is not evidence that the public production service has been deployed or accepted.

## Security and identity

- Pins React, React DOM, and React Server Components to 19.2.8 and makes those exact bundled versions a release-gate requirement.
- Stores the immutable Clerk user ID on each user record. Existing email-only records fail closed until an owner-approved identity mapping is completed.
- Rejects missing, malformed, and oversized upload lengths before multipart parsing, then retains file-type and post-parse size checks.
- Requires an explicitly configured verified `@faultcite.com` invitation sender; no silent fallback sender remains.

## Deployment reliability

- Rewrites prepared Wrangler `main` and asset paths relative to `.release/<environment>/wrangler.json`, preventing the reviewed config from pointing at nonexistent files.
- Validates that the prepared Worker entry and client asset directory exist before any guarded deployment.
- Adds an exact D1 export, non-empty-file check, and SHA-256 evidence step to the operations runbook.
- Documents the migration path for pre-existing email-only users and the limitation of isolate-local rate limiting.

## Buyer and user trust

- Adds public privacy, pilot-terms, and support pages.
- Shows FaultCite version and environment in the sign-in and authenticated interfaces.
- Replaces claims that could imply independently proven live, permanent, or immutable operation with precise application-behavior language.
- Adds a tomorrow-sale checklist that distinguishes a controlled pilot/software-asset transaction from a production SaaS claim.

## Release boundary

The source, tests, and Worker artifact can pass locally. Cloudflare deployment, D1/R2 recovery, real Clerk and Resend flows, multi-company browser testing, monitoring, domain cutover, legal review, insurance, and buyer acceptance remain external gates. Until those gates have evidence, sell only as a controlled pilot or software asset subject to a written agreement—not as a production-proven SaaS service.

The deployed production dependency audit is clean at the high-severity gate, and the bundled React/RSC versions are explicitly pinned. The full development/build dependency tree still reports upstream advisories, including high-severity findings with no currently available fix in parts of the build toolchain. Keep builds isolated, do not expose development servers publicly, review upstream releases, and rerun the full audit before each release.
