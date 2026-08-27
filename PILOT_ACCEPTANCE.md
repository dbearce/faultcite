# FaultCite Pilot Acceptance

Record date, tester, browser/device, Worker version, and pass/fail evidence for every row. Never place passwords, tokens, invitation links, or customer evidence in the release record.

## Release record

| Field | Value |
| --- | --- |
| Release/version | |
| Worker version ID | |
| D1 migration status | |
| R2 recovery policy verified | |
| Tester(s) | |
| Test date/time and time zone | |
| Staging origin | `https://staging.faultcite.com` |
| Evidence location | |

| Area | Required evidence |
| --- | --- |
| Health | `/api/health` returns 200, `service=faultcite`, and both dependency checks are `ok` |
| Authentication | Manager and technician can sign in and sign out in separate browser profiles |
| Invitations | Invitation arrives at the intended address and cannot grant another company access |
| Company isolation | Two test companies cannot view or mutate each other's machines, cases, team, manuals, or evidence |
| Machine/case | Technician creates a machine and opens one active case; duplicate active case is rejected |
| Evidence | Valid JPEG/PNG uploads and downloads; invalid and mismatched files are rejected |
| Workflow | Observation, review request, manager confirmation, repair closeout, and immutable history succeed |
| Roles | Technician cannot perform manager actions or view restricted administration data |
| Mobile | Core workflow passes on current iPhone Safari at narrow width |
| Accessibility | Keyboard-only navigation, visible focus, labels, errors, and screen-reader smoke test pass |
| Resilience | Retried action does not create duplicates; interrupted upload fails safely |
| Recovery | D1 export restoration and R2 recovery procedure are demonstrated in non-production resources |

## Accessibility and browser detail

- Complete keyboard-only navigation without a trap; confirm focus is visible after every action and returns to the trigger after closing each modal.
- At 200% browser zoom and 320 CSS pixels wide, confirm there is no loss of content or required action.
- With VoiceOver on current iPhone Safari, confirm the sign-in, company picker, primary navigation, machine-down form, errors, evidence upload, manager review, and sign-out controls have understandable names and state.
- Confirm status is never communicated by color alone and reduced-motion mode does not obscure state changes.
- Run an automated browser accessibility scan after authentication; archive the tool/version and results. Automated scanning does not replace the manual checks above.

## Security and negative-path detail

- Confirm cross-origin mutations return 403, excessive requests return 429 with `Retry-After`, and responses do not disclose stack traces, tokens, database identifiers, or object keys.
- Attempt direct IDs from Company A while signed into Company B for machines, cases, evidence, manuals, team, and export endpoints; all must fail without revealing whether the record exists.
- Confirm an inactive member, expired invitation, reused invitation, and technician attempting manager actions are rejected.
- Confirm evidence/manual responses are private and non-cacheable and that uploaded content cannot execute in the application origin.

## Sign-off

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Release QA | | GO / NO-GO | |
| Security reviewer | | GO / NO-GO | |
| Pilot company owner | | GO / NO-GO | |
| FaultCite product owner | | GO / NO-GO | |

Any company-isolation, authorization, data-loss, closed-case mutation, or backup-restore failure is an automatic pilot **NO-GO**. Production remains blocked until every row passes and the product owner signs the release record.
