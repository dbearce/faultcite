# Protected backup progress — September 30, 2026

## Verified this session

- Read-only Sites D1 inspection confirms the known owner's existing user record joins an active platform_admins record and a Clerk auth_identities record with matching verified email. No role or identity mutation occurred. Private identifiers are intentionally omitted.
- Added local streaming AES-256-GCM envelope tooling, private key-file handling, authenticated decryption before publication and no-overwrite output publication. Independent review completed; cleanup hardened so temporary-file removal is attempted even if source close fails.
- Added persistent maintenance abort with per-pause generation, stale-receipt rejection, preserved uncertain writer tickets and refusal while any export ticket exists. This is cancellation of an attempted maintenance window, not resolution of uncertain storage operations or backup acceptance.
- Integrated updated schema into synthetic rehearsal Worker; seven local handler tests passed. This revision has NOT been run in hosted storage.
- Hardened legacy scripts: plaintext backup staging-only, R2 required, no destructive R2 sync, empty-target check before restore, immutable copy. Empty target is not proof of isolation or exclusive ownership.
- Full build passed website validation, lint, TypeScript, Worker build and artifact checks plus 213 tests. After final cleanup/test addition, focused checks passed and full suite passed 214 tests. Shell syntax and diff checks passed.

## Usage and limitations

`FAULTCITE_BACKUP_KEY_FILE=/private/key node cloudflare/scripts/protected-backup.mjs encrypt INPUT NEW_OUTPUT`

Use decrypt instead of encrypt for authenticated decryption. The key must be an owned private 32-byte binary file. Never place keys, plaintext or private inventories in GitHub, CI artifacts or chat. This tool does not capture source data or prove source consistency. Decryption uses private temporary plaintext; abrupt termination can leave it behind, so the working disk must itself be encrypted and not shared/synced. Key recovery custody must be established before customer use.

## Remaining gates — NOT COMPLETE

- Protected server-side administration integration and current live-source deployment are still needed. Production export remains hard-blocked in the existing development gate.
- Abort controls must be authenticated and account for the separate environment write-pause gate. Uncertain export tickets remain blocking; no force-clear or TTL recovery was added.
- Source-wide writer coverage and independent fencing remain necessary. Cooperating-writer tests cannot certify old deployments or direct clients.
- User must select the encrypted destination and separate key custodian/retention policy. No customer backup collected or restoration performed.
- Obtain explicit approval immediately before a maintenance pause. No maintenance pause, production deployment, DNS change or billing change was made.
- OWNER_BUSINESS_FACTS.md still contains TBD operating facts and no supplied professional sign-off. No legal or operational approval was fabricated. The owner must provide exact-version approval evidence and the pilot operating facts before release acceptance.

Code is saved on feature/temporary-migration-export. Passing development tests is not production acceptance.
