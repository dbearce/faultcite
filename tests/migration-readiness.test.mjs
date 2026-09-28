import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationReadiness } from '../lib/migration-readiness.mjs';

const now = Date.parse('2026-09-28T00:00:00Z');
const config = { enabled: 'true', expiresAt: new Date(now + 60000).toISOString(), subject: 'test_admin' };
const identity = { provider: 'clerk', subject: 'test_admin', sessionId: 'session' };
const request = (origin = 'https://staging.faultcite.com') => new Request(`${origin}/api/admin/migration-readiness`, { method: 'POST', headers: { origin, 'x-faultcite-readiness': 'check' } });
const forbiddenCall = () => { throw new Error('Must not be called'); };

test('disabled, production and expired readiness never perform identity or database lookup', async () => {
  for (const [req, cfg, status] of [[request(), {}, 404], [request('https://app.faultcite.com'), config, 404], [request(), { ...config, expiresAt: new Date(now).toISOString() }, 403]]) {
    assert.equal((await migrationReadiness(req, cfg, forbiddenCall, forbiddenCall, () => now)).status, status);
  }
});
test('anonymous, wrong provider, missing session and unpinned identity denied before database lookup', async () => {
  for (const id of [null, { ...identity, provider: 'chatgpt' }, { ...identity, sessionId: null }, { ...identity, subject: 'other' }]) {
    assert.equal((await migrationReadiness(request(), config, async () => id, forbiddenCall, () => now)).status, 403);
  }
});
test('only active platform administrator passes; successful response contains no customer or identity data', async () => {
  for (const admin of [null, { active: false }, { role: 'owner' }]) assert.equal((await migrationReadiness(request(), config, async () => identity, async () => admin, () => now)).status, 403);
  const result = await migrationReadiness(request(), config, async () => identity, async subject => { assert.equal(subject, identity.subject); return { active: true }; }, () => now);
  assert.equal(result.status, 200);
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await result.json(), { administratorIdentityVerified: true, exportPerformed: false, maintenanceVerified: false, productionAcceptance: false });
});
test('cross-origin, lookup failure, and lease expiry during authentication fail closed', async () => {
  const req = request(); req.headers.set('origin', 'https://evil.invalid');
  assert.equal((await migrationReadiness(req, config, forbiddenCall, forbiddenCall, () => now)).status, 403);
  assert.equal((await migrationReadiness(request(), config, async () => identity, async () => { throw new Error('sensitive'); }, () => now)).status, 503);
  let clock = now;
  assert.equal((await migrationReadiness(request(), config, async () => identity, async () => { clock += 60000; return { active: true }; }, () => clock)).status, 403);
});
