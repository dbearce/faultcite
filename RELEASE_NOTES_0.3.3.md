# FaultCite 0.3.3 — Company-Pilot Safety Patch

Date: August 26, 2026

FaultCite 0.3.3 corrects release-blocking defects found during an independent security, deployment, and product review of 0.3.2.

## Security and data isolation

- Adds database triggers that reject a case when its machine belongs to a different company.
- Adds an explicit case API allowlist so tenant and internal actor identifiers remain server-side.
- Adds regression tests for cross-company case/machine links and minimized case responses.

## Deployment reliability

- Requires and validates the exact custom domain for staging and production.
- Generates the Cloudflare custom-domain route in the reviewed Wrangler configuration.
- Makes post-deployment verification require the expected release and environment.
- Reports release and environment through the health response.

## Technician and manager workflow

- Managers land in the manager workspace after bootstrap.
- Selecting a machine with an active case resumes it instead of attempting a duplicate case.
- Saved unsafe-escalation state is reflected immediately in the client.
- A saved case can no longer be sent back through the new-case form.
- Temporary-repair completion no longer claims the machine was returned to service; it remains marked Attention with follow-up language.

## Release boundary

This is a locally reviewed release candidate. Cloudflare deployment, real Clerk/Resend/D1/R2 testing, global account-level rate limiting, monitoring alerts, recovery drills, legal/safety/trademark review, and buyer acceptance remain external gates.
