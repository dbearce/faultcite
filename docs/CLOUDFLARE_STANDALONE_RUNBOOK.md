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

Staging resources already created by the owner:

- Worker: `faultcite-staging`
- D1: `faultcite-staging-db`
- R2: `faultcite-staging-files`

## Before any staging deployment

1. Replace only `REPLACE_WITH_STAGING_D1_DATABASE_ID` in `cloudflare/wrangler.staging.toml` with the D1 ID shown in Cloudflare.
2. Add these Worker secrets directly in Cloudflare; never paste their values into chat or commit them:
   - `CLERK_SECRET_KEY`
   - `RESEND_API_KEY`
3. Add the Clerk production publishable key as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in the build environment. It is not secret, but it must match the production Clerk instance.
4. Configure email sender variables directly in Cloudflare: `FAULTCITE_EMAIL_FROM` and, if required, `FAULTCITE_OWNER_EMAIL` / `FAULTCITE_OWNER_COMPANY`.
5. Run `npm run cf:check`. Placeholder detection is expected to block deployment until step 1 is complete.
6. Create a protected backup before migrations or cutover.

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
2. Deploy only to the `workers.dev` staging address.
3. Run smoke checks and confirm forged ChatGPT identity headers are rejected.
4. Test owner, technician, manager, and a user from a second company.
5. Test invitation, email-code sign-in, sign-out, recovery, uploads, and company isolation.
6. Perform a backup/restore rehearsal and reconcile database table counts and R2 checksums.
7. Record the tested deployment ID and rollback result.
8. Obtain explicit owner approval before creating production resources or changing DNS.

`app.faultcite.com` must continue pointing at the existing host until all acceptance checks pass.
