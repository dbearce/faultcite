# FaultCite staging human acceptance

Run this only against the isolated `faultcite-staging` Worker. Do not change the `app.faultcite.com` DNS record during staging acceptance.

## Required people and accounts

- One owner account in the pilot company
- One technician account in the same company
- One manager account in the same company
- One outsider account in a different company

Each account must belong to a different person and use a separately verified email address. Do not share session tokens or passwords in chat, screenshots, tickets, or source control.

## Automated role and isolation check

Use four short-lived Clerk staging session tokens as local environment variables, set `FAULTCITE_ACCEPTANCE_URL` to the `workers.dev` staging URL, and run `npm run cf:acceptance`. Clear the tokens from the terminal session immediately afterward.

## Human workflow checklist

- [ ] Owner signs in with an email verification code and sees the correct company.
- [ ] Owner invites a technician and manager; both messages arrive from the FaultCite sender.
- [ ] Technician and manager accept only their own invitations and receive the correct roles.
- [ ] Technician creates a machine and case, records a diagnostic observation, attaches evidence, requests review, and submits closeout.
- [ ] Manager reviews the evidence, confirms the cause, and completes restart approval using a different account from the submitter.
- [ ] Outsider cannot view, download, change, or infer the pilot company's machines, cases, manuals, files, team, or reports.
- [ ] Each user can sign out; a signed-out session cannot call `/api/bootstrap`.
- [ ] Sign-in recovery works on a second browser/device without ChatGPT.
- [ ] A permitted PDF and image upload succeeds; a disallowed or oversized file is rejected cleanly.
- [ ] iPhone and Android layouts are usable; keyboard-only navigation, visible focus, screen reader labels, and 200% zoom are checked.
- [ ] Backup, restore into a fresh staging database, row-count reconciliation, R2 checksum reconciliation, and rollback rehearsal are recorded.
- [ ] Monitoring and alert delivery are confirmed.

Record the tested Worker deployment ID, date, testers, failures, fixes, and final approval. A DNS cutover remains blocked until every item passes and the owner explicitly approves it.
