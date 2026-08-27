# FaultCite Operations Runbook

This runbook deliberately separates staging and production. It does not authorize a domain cutover.

## 1. Build and preflight

Use Node 22.13 or newer from the project root:

```bash
npm ci
bash scripts/release-gate.sh
```

The gate validates the handoff package, scans tracked release inputs for credential-shaped values, lints, builds, runs automated semantic/accessibility and security tests, audits production dependencies, and validates the Worker artifact. A passing local gate does **not** approve staging or production.

Copy the appropriate file in `deploy/` to an ignored local JSON file. Replace the D1 database ID and Clerk publishable-key placeholders. The publishable key is intentionally public; the Clerk secret key must never be placed in this file. Resource names, sender address, and origins must remain environment-specific. Then prepare a deployable configuration:

```bash
node scripts/prepare-deployment.mjs staging deploy/staging.local.json
```

The generated `.release/staging/wrangler.json` is ignored and contains no application secrets. Review it before proceeding. For production, substitute `production` and use a separately reviewed production settings file.

## 2. Back up before database changes

From an authenticated Cloudflare workstation, create and retain a D1 export and record the current Worker version. For staging:

```bash
mkdir -p release-evidence
npx wrangler d1 export DB --remote --config .release/staging/wrangler.json --output release-evidence/faultcite-staging-pre-migration.sql
test -s release-evidence/faultcite-staging-pre-migration.sql
sha256sum release-evidence/faultcite-staging-pre-migration.sql
```

Store the export and hash in the approved release-evidence location. R2 object versioning or a separate bucket-copy policy must be enabled and tested through the Cloudflare account; the application cannot establish account-level retention itself.

## 3. Configure values

Store `CLERK_SECRET_KEY` and `RESEND_API_KEY` with `wrangler secret put`; never place them in JSON or shell history. The preparation script adds the non-secret Clerk publishable key, verified FaultCite sender, and locked `FAULTCITE_APP_ORIGIN` to the reviewed Wrangler configuration.

## 4. Apply tracked migrations

Staging example:

```bash
export CONFIRM_FAULTCITE_MIGRATIONS=staging
bash scripts/apply-migrations.sh staging .release/staging/wrangler.json
unset CONFIRM_FAULTCITE_MIGRATIONS
```

Cloudflare records applied migrations, so a repeat run applies only pending files. Production requires its own explicit `production` confirmation and a fresh backup.

Migration `0006_clerk_identity_binding.sql` adds immutable Clerk identity binding. New invited users bind automatically on first accepted sign-in. A pre-existing user row with a null `clerk_user_id` intentionally fails closed rather than trusting a matching email. Reissuing an invitation alone does not bypass that protection. Before deploying to a nonempty database, query every active user and stop if any active identity has a null Clerk ID. For a disposable synthetic-data staging environment, an owner may reset the approved test database and issue fresh invitations. For retained data, an owner must export the database, verify each Clerk user ID against the intended person in Clerk, prepare a reviewed one-to-one mapping, update the affected rows under a change record, and confirm there are no duplicate or null active identities. Never infer this mapping from email alone.

## 5. Deploy and verify

Deploy only after reviewing the generated configuration. The guarded command validates the Worker name, origin, Clerk public key, sender, D1 ID, R2 bucket, observability, and absence of plaintext secrets before publishing:

```bash
export CONFIRM_FAULTCITE_DEPLOY=staging
npm run deploy:staging
unset CONFIRM_FAULTCITE_DEPLOY
node scripts/check-deployment.mjs https://staging.faultcite.com
```

The automated check rejects non-JSON health output and the old `Hello World!` placeholder. It requires the application shell plus healthy D1 and R2 checks. Then complete the manual acceptance matrix in `PILOT_ACCEPTANCE.md` using separate manager and technician browser profiles.

## 6. Roll back the Worker

Database migrations are forward-only and are not automatically reversed. If application verification fails, preserve evidence, find the prior healthy Worker version, and roll back only the Worker:

```bash
export CONFIRM_FAULTCITE_ROLLBACK="staging:VERSION_ID"
bash scripts/rollback-deployment.sh staging .release/staging/wrangler.json VERSION_ID
unset CONFIRM_FAULTCITE_ROLLBACK
node scripts/check-deployment.mjs https://staging.faultcite.com
```

Do not restore D1 over a live database without a reviewed incident plan. If a migration caused data damage, stop writes and use the verified pre-migration export under Cloudflare support/owner supervision.

## 7. Monitoring and incident minimums

- Monitor `/api/health` from outside Cloudflare at least every five minutes and alert on two consecutive failures.
- Alert on elevated Worker exceptions, 5xx rate, D1 errors, R2 errors, and authentication failures.
- Do not log authorization headers, Clerk tokens, invitation tokens, evidence, manuals, or email contents.
- Record deployment version, operator, migration list, acceptance result, and rollback version for every release.
- Keep production cutover blocked until staging acceptance, backup restoration, accessibility, mobile, and company-isolation tests pass.
- Configure account-level Cloudflare rate limiting/WAF controls; the Worker’s in-memory limiter is only a defense-in-depth control and is not a global quota.

## 8. Evidence handling and release record

- Save terminal output from the release gate, deployment version ID, migration result, health check, and the completed `PILOT_ACCEPTANCE.md` outside the source package in the approved company evidence location.
- Redact authorization headers, cookies, Clerk/Resend values, invitation URLs, customer email addresses, uploaded evidence, and Cloudflare account identifiers before sharing logs.
- Record SHA-256 hashes for the release archive and pre-migration D1 export. Verify each hash before use or restore.
- Do not package `.env`, `.dev.vars`, local deployment JSON, Wrangler state/logs, `.release`, `node_modules`, or customer data.

## 9. External-access blockers

The following cannot be proven by local source checks and require an authenticated staging account and real browser/device access: Clerk sign-in/sign-out, Resend delivery, D1 migration state, R2 persistence/recovery, Cloudflare rate-limit rules, monitoring alerts, two-company isolation, mobile Safari, screen-reader behavior, and backup restoration. Any missing evidence keeps the external-company pilot at **NO-GO**.
