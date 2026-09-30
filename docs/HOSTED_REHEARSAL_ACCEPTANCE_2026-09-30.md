# Hosted synthetic restore acceptance — September 30, 2026 UTC

Run: https://github.com/dbearce/faultcite/actions/runs/36666198467
Tested commit: 78b85a51fbd8c3a4b612fe8a2e25113789cfacd0
Artifact: 11075849660
Artifact ZIP SHA-256: 8593c8e8a999b7086d829a4faee8653270e95a26f98cc6a5469799f50b150aa2
Raw result: evidence/synthetic-rehearsal-36666198467.json

## Passed
- Seven local synthetic Worker tests.
- Reused exactly the two D1 databases, two R2 buckets and one Worker created by run 36651610765.
- Current generation and credential verified through storage-free GET and POST readiness checks.
- Anonymous fixture request rejected with 401; authenticated fixture request returned 200.
- Database rows and a 150,000-byte file restored with matching hashes and file metadata.
- Target mutation did not change the source fixture.
- Pending writer blocked drain/export; pause blocked new writers.
- Export lock blocked resume; completed export allowed resume and a new writer.
- Coordinator tables excluded from the archive and restore.

Initial readiness responses were 403, 403, then 200. Bounded read-only readiness waits preserved authorization. Earlier runs failed on 403 or authenticated 401; their underlying cause is not conclusively established. No authorization bypass was introduced.

## Boundaries and remaining work
This is synthetic acceptance only. It does not establish source-app administrator access, a production-wide write freeze, or recovery of real customer data. Production acceptance remains false.

The resources now contain fixtures: do not rerun a writing rehearsal or overwrite them. They remain inventoried for later explicit cleanup. The test credential expires after its ten-minute lease.

No production pause, customer export, production deployment, DNS change, or billing enablement occurred.

Remaining gates: verify real source administrator access with a read-only probe; finish maintenance recovery and coverage review; obtain owner approval before maintenance pause; create and validate real backup and isolated restore before controlled cutover.
