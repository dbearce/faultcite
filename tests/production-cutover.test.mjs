import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { recoverProductionDomain } from '../cloudflare/scripts/recover-production-domain.mjs';
import { validateCutoverEvidence } from '../cloudflare/scripts/check-cutover-evidence.mjs';

const original = { type: 'CNAME', name: 'app.faultcite.com', content: 'custom-domains.chatgpt.site', proxied: false, ttl: 300 };
const account = 'a'.repeat(32), zone = 'b'.repeat(32);
function mock({ failDelete = false, failCreate = false, conflict = false, wrongService = false, alreadyRestored = false } = {}) {
  let attached = !alreadyRestored, records = alreadyRestored ? [original] : [];
  const calls = [];
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, method: options.method });
    let success = true, result;
    if (url.includes('/workers/domains?')) result = attached ? [{ hostname: original.name, service: wrongService ? 'another-worker' : 'faultcite-production', zone_id: zone, id: 'domain1' }] : [];
    else if (options.method === 'DELETE') { success = !failDelete; if (success) attached = false; }
    else if (options.method === 'POST') { success = !failCreate; if (success) records = [JSON.parse(options.body)]; }
    else result = conflict ? [{ ...original, content: 'unrelated.example' }] : records;
    return { ok: true, status: 200, json: async () => ({ success, result }) };
  }};
}
async function recover(client) { return recoverProductionDomain({ account, zone, token: 'test-only', original, fetcher: client.fetcher, pause: async () => {} }); }
test('hostname recovery detaches only approved Worker and verifies recreated legacy DNS', async () => {
  const client = mock(); await recover(client);
  assert.equal(client.calls.filter(c => c.method === 'DELETE').length, 1);
  assert.equal(client.calls.filter(c => c.method === 'POST').length, 1);
  assert.ok(client.calls.every(c => c.url.includes('/workers/domains') || c.url.includes(`/zones/${zone}/dns_records`)));
});
test('hostname recovery is idempotent when legacy DNS is already restored', async () => {
  const client = mock({ alreadyRestored: true }); await recover(client);
  assert.ok(client.calls.every(c => c.method === 'GET'));
});
for (const [name, flags] of Object.entries({ 'detach rejected': { failDelete: true }, 'restore rejected': { failCreate: true }, 'unrecognized DNS': { conflict: true }, 'different Worker': { wrongService: true } })) {
  test(`hostname recovery fails loudly on ${name}`, async () => { await assert.rejects(recover(mock(flags))); });
}
test('hostname recovery refuses other DNS targets before any request', async () => {
  const client = mock();
  await assert.rejects(recoverProductionDomain({ account, zone, token: 'test-only', original: { ...original, name: 'faultcite.com' }, fetcher: client.fetcher }));
  assert.equal(client.calls.length, 0);
});
const receipt = { sourceDigest: 'c'.repeat(64), targetDigest: 'c'.repeat(64), reconciliationReceipt: 'private-reconciliation-reference', protectedBackupReceipt: 'private-backup-reference', restoreVerified: true };
const evidence = () => ({ verifiedAt: new Date().toISOString(), approvedBy: 'test approver', hostname: original.name, targetWorker: 'faultcite-production', sourceDatabaseRef: 'sites-db-reference', sourceBucketRef: 'sites-files-reference', targetDatabaseName: 'faultcite-production-db', targetBucketName: 'faultcite-production-files', database: { ...receipt }, files: { ...receipt }, writesFrozen: true, writeFreezeReceipt: 'freeze-reference' });
test('continuity gate requires current matching database AND file evidence and protected recovery', () => {
  assert.equal(validateCutoverEvidence(evidence()), true);
  for (const change of [e => { e.files.targetDigest = 'd'.repeat(64); }, e => { e.database.restoreVerified = false; }, e => { e.files.protectedBackupReceipt = ''; }, e => { e.verifiedAt = '2020-01-01'; }, e => { e.writesFrozen = false; }]) {
    const value = evidence(); change(value); assert.throws(() => validateCutoverEvidence(value));
  }
});
test('package check permits template but actual production deploy still rejects unresolved binding', t => {
  const checked = spawnSync('bash', ['cloudflare/scripts/check.sh'], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
  // A deployment runner has already resolved the real config. Never invoke its
  // deploy script here: that would recursively rebuild this test suite.
  const fixture = mkdtempSync(join(tmpdir(), 'faultcite-placeholder-test-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(join(fixture, 'cloudflare/scripts'), { recursive: true });
  for (const file of ['common.sh', 'deploy.sh']) writeFileSync(join(fixture, 'cloudflare/scripts', file), readFileSync(`cloudflare/scripts/${file}`));
  writeFileSync(join(fixture, 'cloudflare/wrangler.production.toml'), readFileSync('cloudflare/wrangler.production.toml', 'utf8').replace(/^database_id = .*$/m, 'database_id = "REPLACE_WITH_PRODUCTION_D1_DATABASE_ID"'));
  const deployed = spawnSync('bash', ['cloudflare/scripts/deploy.sh', 'production', '--dry-run'], { cwd: fixture, encoding: 'utf8', timeout: 5000, env: { ...process.env, FAULTCITE_CONFIRM: 'DEPLOY-production' } });
  assert.notEqual(deployed.status, 0);
  assert.match(deployed.stderr, /placeholder/);
});
test('workflow keeps recovery armed until health, auth and billing verification pass', () => {
  const source = readFileSync('.github/workflows/deploy-cloudflare-production.yml', 'utf8');
  assert.ok(source.indexOf('check-cutover-evidence.mjs') < source.indexOf('Create production recovery'));
  assert.ok(source.indexOf('Run production smoke checks') < source.indexOf('Mark production acceptance complete'));
  assert.ok(source.indexOf('Mark production acceptance complete') < source.indexOf('Restore legacy hostname'));
  assert.match(source, /if: \$\{\{ always\(\) \}\}/);
  assert.match(source, /! -f "\$RUNNER_TEMP\/production-cutover-accepted"/);
  assert.match(source, /head_sha=\$GITHUB_SHA/);
  assert.doesNotMatch(source.slice(source.indexOf('legacy_record_id=')), /npm run (?:build|cf:deploy:production)/);
});
