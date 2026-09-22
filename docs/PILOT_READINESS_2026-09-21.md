# FaultCite company-pilot readiness — September 21, 2026

Decision: **not yet cleared for company-pilot production cutover**.

## Verified this session

- The complete local production build, lint, type checking, artifact validation,
  and all 147 automated tests passed (zero failures or skipped tests), including
  five acceptance-harness tests covering 19 mocked scenarios.
- Production workflow YAML parsed and every inline shell step passed syntax checks.
- Both app and staging health endpoints returned HTTP 200, release 0.3.9, and
  healthy database/file-storage dependencies. This does not establish which
  platform serves the app hostname or that the standalone target contains its data.
- The app sign-in page rendered the email field and Continue button in a browser.
  No authenticated customer workflow was performed in this session.
- The marketing home, pilot, security, privacy, terms, and support pages returned
  HTTP 200. Page availability is not legal approval or proof of support delivery.
- No production deployment, migration, DNS change, or billing enablement was
  performed in this session.

## Repairs prepared

- Keep hostname recovery armed through all post-cutover acceptance checks; report
  recovery failures truthfully and verify the restored legacy CNAME.
- Require reviewed data continuity, protected backup/restore receipts, and a
  passing release gate for the exact commit before production changes.
- Build before hostname removal and verify artifact hashes before deployment.
- Check exact production database/file bindings and disabled paid billing.
- Permit the production database template during static package checks, while
  still rejecting unresolved templates for an actual deployment.
- Strengthen staging acceptance with distinct account identities and owner-positive
  controls before outsider access checks against existing cases, PDFs, and evidence.

## Existing human evidence

The owner reported completion of internal testing. A supplied staging screenshot
shows four green setup checks: one machine, two active owner/manager accounts,
one approved exact-page source record, and one closed read-only case. Retain this
as partial evidence; it does not by itself prove isolation or backup restoration.

Clarification of the September 17 acceptance record: the security test needs four
distinct **account identities**, not necessarily four different human testers.
Two friends can operate separate role accounts during an internal staging test.
An independent approval must still be performed by someone other than the person
whose action they are approving. Real company use needs its designated qualified
operators and approvers. Do not require repetition of tests already evidenced.

## Remaining blockers and ownership

1. **Account owner:** restore usable Cloudflare authorization. The prior production
   run failed permission preflight; the browser currently stops at Cloudflare
   security verification. Do not send tokens in chat or put them in source.
2. **Deployment operator:** identify the live source resources, protect database
   and file backups, verify restoration and reconciliation, then record the
   controlled cutover evidence in `PRODUCTION_CUTOVER.md`. No backup or data match
   was established by this session's health checks.
3. **Release tester/operator:** run the strengthened authenticated staging checks
   with short-lived sessions and existing fixtures; reconcile the human test
   record with actual deployment, roles, results, and approver evidence.
4. **Owner and company approver:** complete the relevant business facts, pilot
   scope, support/safety contacts, manual permissions, and approval of the exact
   pilot/legal document versions. `OWNER_BUSINESS_FACTS.md` still contains TBDs.

The existing owner authorization permits only the required app-hostname cutover
after backup; it does not authorize unrelated DNS changes or enabling billing.
Keep `FAULTCITE_PAID_BILLING_ENABLED=false`.
