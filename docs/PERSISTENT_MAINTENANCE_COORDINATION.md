# Persistent maintenance coordination — prepared, not activated

September 29, 2026 UTC. Development implementation only. No live schema,
configuration, backup, billing or DNS changes were made.

## Implemented

- D1-backed conditional admission and completion, with persistent request tickets.
- Atomic pause, current-epoch receipts, and guarded resume.
- An exclusive export ticket prevents simultaneous exports or resume during export.
- Request lifetime includes awaited handler cleanup, response streaming, nested
  waitUntil tasks, and cancellation cleanup. Errors and uncertain outcomes retain
  their tickets. There is no timeout-to-success, forced-clear API or auto-repair.
- Export route now requires enabled tracking and an independently checked drained
  database state after administrator authorization. Matching configuration strings
  alone are insufficient. Operational coordination tables are excluded from export.
- Worker integration is default-off using FAULTCITE_DRAIN_TRACKING_ENABLED. Invalid
  settings or missing coordination schema fail closed when tracking is enabled.

The schema is intentionally in cloudflare/rehearsal/drain-schema.sql, not in the
automatic application migration list. It must first be applied only to verified
isolated resources. No schema is created automatically during a request.

## Validation

Full development build passed 194 tests, including D1 admission/pause races,
runtime restart persistence, stale receipts, missing schema, export/resume races,
stream cancellation and slow cleanup. Targeted lint passed after naming the final
Worker export. Tests use installed Miniflare/Workers bindings and Node tests;
these are not hosted production acceptance.

## Activation gates still open

1. Rehearse the integrated Worker on isolated hosted resources with the real
   runtime/authentication path. Verify administrator, ordinary user and anonymous
   outcomes separately. The current readiness endpoint excludes production.
2. Inventory old deployments, platform schedules and direct storage clients.
   Every writer must participate or be independently fenced. Detached tasks cannot
   be counted by this wrapper. Platform timeouts deliberately leave tickets pending.
3. Review the operational cost of per-request D1 admission/completion and a recovery
   procedure for unresolved tickets. Never delete a pending ticket just to pass a gate.
4. Before production enablement, confirm the source deployment, schema installation
   and all writer coverage. Do not present a cooperating-writer receipt as proof of
   a global production freeze.
5. Ask the owner before a live maintenance pause. Then obtain a real backup and
   full-schema/file restore verification before cutover. Billing remains disabled.

The coordinator exposes trusted server-side methods only; no public pause/resume
endpoint was added. The existing environment admission pause remains an independent
safety gate. Enabling tracking is NOT equivalent to pausing the app.
