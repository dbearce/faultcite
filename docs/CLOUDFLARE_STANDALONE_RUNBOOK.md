# FaultCite standalone Cloudflare runbook

This runbook prepares a separate Clerk-authenticated Cloudflare deployment. It does **not** change `app.faultcite.com`, add a route, or modify GoDaddy DNS.

## Fixed runtime contract

| Setting | Required value |
| --- | --- |
| Deployment target | `FAULTCITE_DEPLOYMENT_TARGET=standalone` |
| Authentication provider | `FAULTCITE_AUTH_PROVIDER=clerk` |
| Runtime safety switch | `FAULTCITE_RUNTIME=standalone` |
| Clerk token audience | `CLERK_AUTHORIZED_PARTIES` matching that environment's HTTPS origin |
| D1 binding | `DB` |
| R2 binding | `BUCKET` |
| Static-assets binding | `ASSETS` |
| Paid billing launch switch | `FAULTCITE_PAID_BILLING_ENABLED=false` until commercial approval and live Stripe acceptance are complete |

Staging resources already created by the owner:

- Worker: `faultcite-staging`
- D1: `faultcite-staging-db`
- R2: `faultcite-staging-files`

## Before any staging deployment

1. Verify that the concrete D1 ID in `cloudflare/wrangler.staging.toml` matches `faultcite-staging-db` in the intended Cloudflare account. Replace it only if the account shows a different ID; never guess or copy an ID from another environment.
2. Add these Worker secrets directly in Cloudflare; never paste their values into chat or commit them:
   - `CLERK_SECRET_KEY`
   - `RESEND_API_KEY`
3. Add the Clerk production publishable key as the runtime variable `CLERK_PUBLISHABLE_KEY`. It is not secret, but it must match the production Clerk instance and the `CLERK_SECRET_KEY` configured for that environment.
4. Configure email sender variables directly in Cloudflare: `FAULTCITE_EMAIL_FROM` and, if required, `FAULTCITE_OWNER_EMAIL` / `FAULTCITE_OWNER_COMPANY`.
5. Run `npm run cf:check`. Placeholder detection is expected to block deployment until step 1 is complete.
6. Create a protected backup before migrations or cutover.

The guarded deploy script uses Wrangler's `--keep-vars` option so these dashboard-managed non-secret values are not erased by a deployment. It also uses `--strict` so an unreviewed remote Worker change blocks the deploy instead of being silently overwritten. Worker secrets are preserved by Wrangler and must remain outside source control.

Workers Logs and sampled traces are enabled in both configs. Query strings are redacted because invitation, authentication, and recovery URLs may contain sensitive values. Before production cutover, confirm telemetry is arriving and that the selected retention and sampling settings satisfy the approved privacy notice and operating budget.

## Paid billing launch switch

Stripe credentials alone do not enable checkout, the customer portal, or webhook processing. `FAULTCITE_PAID_BILLING_ENABLED` defaults off and must remain `false` through staging setup and production deployment. Set it to `true` only after the live product and price, signed webhook, commercial disclosures, counsel approval, and Stripe acceptance evidence have been approved. Turning the switch back to `false` fails billing closed without removing or exposing stored credentials.

## Clerk provider-key rotation

Do not delete or revoke the existing Clerk key until the replacement is proven in production.

1. In the Clerk production instance, create a uniquely labelled replacement secret key. Record only its key ID or redacted fingerprint, creation time and operator; never copy the value into source, chat, screenshots or release evidence.
2. Replace the production runtime `CLERK_SECRET_KEY` and confirm that runtime `CLERK_PUBLISHABLE_KEY` belongs to the same Clerk production instance. Deploy or restart the application and record the resulting deployment ID and secret revision.
3. From a clean browser session, complete a fresh email-code sign-in and verify `/api/auth/session` returns `200`, an authenticated `/api/bootstrap` request returns `200` for the correct company, sign-out succeeds, and the signed-out `/api/bootstrap` request returns `401`. Repeat with a second separately verified user.
4. Prove the replacement key itself handled a post-deployment server API call using the deployment secret audit metadata and Clerk key usage or audit telemetry. Successful sign-in alone is insufficient because an existing session can conceal a stale server key.
5. Confirm no active, staging or rollback deployment still depends on the existing key, and confirm application logs contain no Clerk authentication failures, identity lookup failures, rejected-session loops or related `5xx` responses during the verification window.
6. Only after steps 1–5 have dated evidence, revoke or delete the existing default key in Clerk. Immediately repeat the two-user sign-in, authenticated API, sign-out and signed-out `401` checks, and confirm replacement-key usage continues.

The rotation record must contain redacted old and new key identifiers, Clerk production-instance identity, secret-store revision, deployment ID, test times and request IDs, both testers, post-deletion results and the named approver. Never store key values or session tokens in the record.

The restore script is deliberately limited to staging and refuses to import into a D1 database that already contains application tables. Use a newly created isolated staging D1 for every restore rehearsal.

## Guarded operations

Every state-changing script requires a deliberately typed `FAULTCITE_CONFIRM` value. Read the script and Cloudflare target before setting it.

For R2 backup/restore/reconciliation, `FAULTCITE_R2_RCLONE_REMOTE` must be a full configured rclone bucket path such as `cloudflare:faultcite-staging-files`. R2 credentials stay in rclone's protected configuration and are never committed.

- Staging deploy: `DEPLOY-staging`
- Staging migration: `MIGRATE-staging`
- Staging restore: `RESTORE-staging`
- Backup: `BACKUP-staging`
- Rollback: `ROLLBACK-staging-<deployment-id>`

Production operations use the corresponding `production` confirmation and remain blocked until the production placeholders/resources exist. The production config intentionally contains no route.

## Required acceptance before cutover

1. Apply migrations to the isolated staging D1.
2. Deploy only to the isolated `https://staging.faultcite.com` staging origin.
3. Run smoke checks and confirm forged ChatGPT identity headers are rejected.
4. Test owner, technician, manager, and a user from a second company.
5. Test invitation, email-code sign-in, sign-out, recovery, uploads, and company isolation.
6. Perform a backup/restore rehearsal and reconcile database table counts and R2 checksums.
7. Record the tested deployment ID and rollback result.
8. Obtain explicit owner approval before creating production resources or changing DNS.

`app.faultcite.com` must continue pointing at the existing host until all acceptance checks pass.
