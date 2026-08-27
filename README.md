# FaultCite

FaultCite is an invitation-only CNC maintenance workflow for recording failures, evidence, diagnostic observations, manager review, and verified repair closeout.

## Production architecture

- React 19 + vinext application on Cloudflare Workers
- Clerk authentication with server-side session verification
- Cloudflare D1 company and maintenance records
- Cloudflare R2 evidence and manual files
- Resend invitation email delivery
- Tenant-scoped authorization and application-maintained audit history

## Local setup

1. Copy `.env.example` to `.env.local` and enter development credentials.
2. Install dependencies with `npm install`.
3. Apply the D1 migrations in `drizzle/` to the local database.
4. Run `npm run dev`.

Never commit `.env*`, secret keys, production data, or Wrangler login files.

## Verification

```bash
npm run build
npm run lint
node --test tests/*.test.mjs
npm run validate:artifact
```

The release gate verifies the Worker artifact, D1/R2 bindings, tenant controls, database invariants, evidence validation, Clerk authentication, sign-out support, and invitation-email auditing.

Operational deployment, migration, rollback, monitoring, and acceptance procedures are in [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) and [`PILOT_ACCEPTANCE.md`](PILOT_ACCEPTANCE.md). Environment templates live in `deploy/`; staging and production must never share D1 or R2 resources.

## Staging deployment

The build output contains the deployable Worker configuration at `dist/server/wrangler.json`. The staging Worker name is `faultcite-staging`; its D1 database is `faultcite-staging-db`, and its R2 bucket is `faultcite-staging-files`.

Required Worker secrets/variables:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `FAULTCITE_APP_ORIGIN=https://staging.faultcite.com`
- `RESEND_API_KEY`
- `FAULTCITE_FROM_EMAIL=FaultCite <invites@faultcite.com>`

After the release gate passes, prepare the reviewed staging configuration as documented in `OPERATIONS_RUNBOOK.md`. Deployment requires `CONFIRM_FAULTCITE_DEPLOY=staging` and uses `.release/staging/wrangler.json`; the command refuses to publish the incomplete raw build configuration. Do not point `app.faultcite.com` at this Worker until manager and technician staging acceptance tests pass.

`/api/health` performs bounded, read-only D1 and R2 checks. It returns HTTP 503 when either dependency is unavailable and never returns provider error details.

## Safety boundary

FaultCite records evidence and authorization. It does not authorize machine restart, replace lockout/tagout, or substitute for qualified maintenance judgment and OEM procedures.
