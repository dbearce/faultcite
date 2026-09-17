# FaultCite 0.3.9 staging acceptance evidence

**Evidence date:** September 17, 2026

**Environment:** Isolated Cloudflare staging only

**Staging origin:** `https://staging.faultcite.com`
**Production, DNS, and billing scope:** No production deployment or DNS change is authorized. Paid billing must remain disabled.

## Authorized package

- GitHub branch: `staging-release-0.3.9-polish`
- GitHub commit: `f2597051c23f017102c4d280ac8daa541457d2c5`
- Deployed workflow commit: `d29033c8a80e9e2960c8400d8483d1a588d40ed8`
- Base commit: `9f44a41e12876737d6d9bcac5230f89bb4dd8e2b`
- Release version: `0.3.9`
- Change set: manager-mode landing correction, visible urgent safety-feedback behavior, organization-scoped machine correction, accessible machine-save status, and production Worker preview/subdomain safeguards.

## Automated release evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Reproducible release build | Passed | vinext production build completed and the ESM Worker/static-assets artifact validated |
| Application and safety tests | Passed | 130 passed, 0 failed, 0 skipped |
| New release-polish regressions | Passed | Manager landing, tenant update scope, urgent safety feedback, and assistive status announcement |
| Cloudflare package check | Passed | Staging remains the only configured Custom Domain; production remains route-free |
| Production dependency audit | Passed | 0 vulnerabilities with development dependencies omitted |
| High/critical dependency gate | Passed | 0 high and 0 critical advisories |
| Remaining dependency findings | Accepted for staging | 4 moderate development-only findings through the Drizzle/esbuild toolchain; none ship in production dependencies |
| Billing state | Passed | `FAULTCITE_PAID_BILLING_ENABLED = "false"` remains enforced |
| Source integrity | Passed | `git diff --check` clean before package creation |

## Human-test evidence received

The product owner stated in the project conversation that human testing was complete. That statement is retained as an owner attestation, but it does not by itself identify each tester, device, role, test date, failure, or supporting record required by `docs/STAGING_HUMAN_ACCEPTANCE.md`.

The formal human gate remains **pending evidence reconciliation** until the release record identifies:

- the four distinct owner, technician, manager, and outsider testers or an approved written exception;
- the tested iPhone, Android, keyboard-only, screen-reader, and 200% zoom combinations;
- successful outsider isolation and signed-out API rejection;
- backup/restore, row-count, R2 checksum, rollback, monitoring, and alert evidence;
- failures found, fixes applied, retest outcome, and the final named approver.

Do not insert passwords, session tokens, API keys, private machine data, or customer files in this record.

## Deployment evidence

Status: **Protected staging deployment passed**.

| Deployment item | Result | Evidence |
| --- | --- | --- |
| Protected workflow | Passed | [GitHub Actions run 35177722921](https://github.com/dbearce/faultcite/actions/runs/35177722921), run number 10 |
| Source revision | Passed | Workflow checked out `d29033c8a80e9e2960c8400d8483d1a588d40ed8` from `staging-release-0.3.9-polish` |
| Pre-migration recovery point | Recorded | D1 bookmark `00000033-00000000-000050e9-f9a14e1eb9ef009350e61dcae2fd086d` |
| Migration 0028 and journal | Passed | History through 0028 and the revocation guard were verified; both guarded migration passes reported no remaining migrations |
| Worker deployment | Passed | `faultcite-staging` version `659b4c36-b285-4dfe-8ad6-a275273ce15a`, created September 17, 2026 at 03:21:22 UTC |
| Runtime bindings | Passed | Staging D1, R2, Clerk, Resend, origin, and authorized-party bindings verified without exposing secret values |
| Billing | Passed | `FAULTCITE_PAID_BILLING_ENABLED` verified as `false` after deployment |
| Network exposure | Passed | Staging DNS record remained byte-for-byte unchanged; Custom Domain remained attached to `faultcite-staging`; `workers.dev` and preview URLs remained disabled |
| Smoke and identity checks | Passed | Staging smoke suite passed and a forged ChatGPT identity was rejected |
| Sign-in origin | Passed with browser follow-up | The sign-in page rendered and Clerk accepted `https://staging.faultcite.com`; interactive browser sign-in remains part of human evidence reconciliation |
| Operator and completion | Recorded | Manually dispatched by `dbearce`; job completed September 17, 2026 at approximately 03:21:29 UTC |

Every workflow step completed successfully. No production resource, production deployment, paid-billing setting, or DNS record was changed by this run.

## Approval trail

- September 17, 2026: the product owner authorized packaging the verified changes into a staging deployment and recording formal acceptance evidence.
- September 17, 2026: `dbearce` dispatched protected staging workflow run 35177722921; all build, migration, deployment, isolation, smoke, and configuration checks passed.
- Production cutover, production resource creation, DNS changes, and paid billing were not authorized by that approval.

## Current decision

The code package and protected staging deployment are verified. The release remains **pending formal human-evidence reconciliation** before this document can show a final staging acceptance decision or support production cutover.
