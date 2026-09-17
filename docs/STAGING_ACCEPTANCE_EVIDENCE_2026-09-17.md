# FaultCite 0.3.9 staging acceptance evidence

**Evidence date:** September 17, 2026

**Environment:** Isolated Cloudflare staging only

**Staging origin:** `https://staging.faultcite.com`
**Production, DNS, and billing scope:** No production deployment or DNS change is authorized. Paid billing must remain disabled.

## Authorized package

- GitHub branch: `staging-release-0.3.9-polish`
- GitHub commit: `f2597051c23f017102c4d280ac8daa541457d2c5`
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

Status: **Pending protected workflow dispatch**.

Run `.github/workflows/deploy-cloudflare-staging.yml` from branch `staging-release-0.3.9-polish` with confirmation `DEPLOY-staging`. After it finishes, append:

- GitHub Actions run URL and run ID;
- deployed Worker version/deployment ID;
- pre-migration D1 recovery bookmark;
- migration result and verified migration journal;
- smoke, Clerk-origin, health, binding, billing-disabled, and DNS-unchanged results;
- deployment operator and UTC completion time.

## Approval trail

- September 17, 2026: the product owner authorized packaging the verified changes into a staging deployment and recording formal acceptance evidence.
- Production cutover, production resource creation, DNS changes, and paid billing were not authorized by that approval.

## Current decision

The code package is verified and ready for the protected staging deployment. The staging deployment and formal human-evidence reconciliation must both be recorded before this document can show a final staging acceptance decision.
