# Maintenance review and rehearsal preparation — September 29, 2026

Status: development changes tested, not deployed. No production pause, customer
export, DNS change or billing enablement was performed.

## Fixed

Independent review found that persistent admission occurred before the environment
maintenance gate. A deliberate maintenance 503 then retained an unresolved ticket,
which could prevent draining indefinitely during configuration transitions.

The actual Worker now checks the no-work environment maintenance response before
creating a ticket. The inner gate remains as defense in depth. Only the exact POST
export path without a query reaches its separate authorization and export lock.

Three regression tests bundle the real Worker entry point with framework dispatch
replaced by a denying fixture. They verify GET, HEAD and POST pause responses touch
neither storage nor request-lifetime tracking, and query variants cannot bypass the
gate. These tests do not claim Clerk authentication was exercised.

## Rehearsal prepared

The synthetic rehearsal Worker now installs coordination schema only after all
source/target empty-storage checks. It verifies pending writers block export,
pause blocks admission, completed writers permit export, export blocks resume,
completion permits resume, and coordination tables never enter the restore target.
Its existing bounded database/file restore and hash checks remain in place.

Validation: 21 focused maintenance/export/Worker regression tests passed; six
synthetic rehearsal tests passed using local Miniflare D1/R2. Typecheck and targeted
lint passed. The new hosted rehearsal has not been run.

## Remaining release blockers

- Verify the actual Clerk session and existing active platform-admin mapping through
  a source-compatible authenticated hosted route. Synthetic bearer-token access is
  not evidence of source-app administrator access.
- The export host gate still intentionally excludes production. Do not remove it
  until source-compatible rehearsal and activation review are complete.
- Inventory and fence old deployments, scheduled writers and direct storage clients.
  A cooperating-writer receipt alone is not a global freeze certificate.
- Resolve how to investigate uncertain/cancelled request tickets before production
  activation. They intentionally never expire automatically. Do not delete tickets,
  reset the epoch or claim success simply to unblock a backup.
- Obtain owner approval before any live maintenance pause. Then verify a real source
  backup and isolated full restore before the production cutover.

The prior hosted synthetic restore success predates these changes and must not be
reported as acceptance of this new integrated code. Billing remains disabled.
