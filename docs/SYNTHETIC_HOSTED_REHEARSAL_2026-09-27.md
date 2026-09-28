# Synthetic hosted restore rehearsal — September 27, 2026

Status: PASS for the bounded synthetic fixture only. Not production acceptance.

## Verified execution
- Successful workflow: https://github.com/dbearce/faultcite/actions/runs/36338013486
- Successful job: 108672491749
- Launcher commit: 052fb11a60fa1df26119c7dc539207720a22fd75
- Executed source commit: 20efea7fc628c1eabd763d8cee3c39f4f37968ee
- Artifact: synthetic-rehearsal-36338013486-1 (10937608424)
- GitHub artifact ZIP SHA-256: c4036c2c41a460725d264c036eb35a84b375eb6310b851f116f5d96e681c3cb9
- Artifact expiry: October 4, 2026, 17:44 UTC. Manifest preserved below.

Original provisioning run 36337563322 created exactly two D1 databases, two R2 buckets and one Worker, then failed its unauthenticated negative test before authenticated fixture execution. That response status was not recorded; its cause remains unproven. The successful retry verified and reused exactly those five resources; it created no additional resources.

## Checks that passed
- Anonymous POST was rejected with HTTP 401.
- Authenticated, time-limited Worker executed synthetic-only fixture.
- Fresh source/target databases and buckets were checked empty before fixture writes.
- One synthetic database record and a 150,000-byte deterministic file were exported.
- Archive completion digest and file digest verified.
- Restored rows matched; restored file bytes and metadata matched.
- Deleting the synthetic target row left the source row intact, proving the tested database isolation.
- No production bindings, customer inputs, DNS changes, production pause or app billing changes.

## Limitations and next gates
This is not a real source-app backup, real source-app administrator authentication test, full-schema production importer, or hosted maintenance/write-drain proof. Source-app authentication and authorization, pause coverage including in-flight/background/direct writers, real-data backup verification and recovery acceptance remain separate gates. Ask the owner before starting any production maintenance pause. Keep production export disabled until its required testing passes.

## Retained resources
All five temporary resources remain for evidence review; provider usage/storage charges may apply. The Worker rejects access after its configured ten-minute expiry; resources are not automatically deleted. Cleanup requires a separately confirmed exact-target operation. Do not rerun provisioning or the successful fixture against these populated resources.

## Saved result manifest
```json
{
  "prefix": "fc-rehearsal-36337563322-1-a511567a",
  "resumedFromRun": "36337563322",
  "syntheticOnly": true,
  "productionAcceptance": false,
  "resources": [
    {
      "type": "d1",
      "name": "fc-rehearsal-36337563322-1-a511567a-source",
      "id": "20cb9095-3633-40fb-83db-340fc4874460"
    },
    {
      "type": "d1",
      "name": "fc-rehearsal-36337563322-1-a511567a-target",
      "id": "f4e0b375-e9a9-44af-8889-e92b40e53f07"
    },
    {
      "type": "r2",
      "name": "fc-rehearsal-36337563322-1-a511567a-source"
    },
    {
      "type": "r2",
      "name": "fc-rehearsal-36337563322-1-a511567a-target"
    },
    {
      "type": "worker",
      "name": "fc-rehearsal-36337563322-1-a511567a"
    }
  ],
  "status": "synthetic-rehearsal-passed",
  "unauthenticatedStatuses": [
    401
  ],
  "evidence": {
    "syntheticHostedRestore": "passed",
    "productionAcceptance": false,
    "sourceAppAuthenticationVerified": false,
    "fileSha256": "02675bf9284bd74223e98ceea96ebee4c9a469272ead358f462d89753f8c909b",
    "archiveSha256": "735e675b28747813dd4230aa4815b859a2469ae4fadf8e8b892926d74102c950",
    "targetIsolationVerified": true
  }
}
```
