import test from 'node:test';
import assert from 'node:assert/strict';
import { maintenanceControl } from '../lib/maintenance-controls.mjs';

const time = Date.parse('2026-10-01T00:00:00Z');
const config = { enabled: 'true', expiresAt: new Date(time + 60000).toISOString(), subject: 'admin_test', trackingEnabled: 'true' };
const identity = { provider: 'clerk', subject: 'admin_test', sessionId: 'session' };
const receipt = { epoch: 1, pauseGeneration: 1, pauseId: 'pause-test', paused: true, pending: 0 };
const forbidden = () => { assert.fail('Unexpected privileged access'); };
const req = (body = { operation: 'status' }, url = 'https://staging.faultcite.com/api/admin/maintenance-control', headers = {}) => new Request(url, {
  method: 'POST', headers: { origin: new URL(url).origin, 'x-faultcite-maintenance': 'control', 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const run = (request = req(), cfg = config, drain = forbidden, getIdentity = async () => identity, admin = async () => ({ active: true }), now = () => time) =>
  maintenanceControl(request, cfg, getIdentity, admin, drain, now);
const paused = { ...receipt, drained: true };

test('controls are default off and hard blocked for production, wrong paths and query strings', async () => {
  for (const [request, cfg] of [[req(), {}], [req(), { ...config, enabled: 'TRUE' }],
    ...['https://app.faultcite.com/api/admin/maintenance-control', 'https://staging.faultcite.com/api/admin/maintenance-control?x=1',
      'https://staging.faultcite.com/api/admin/maintenance-control/'].map(url => [req(undefined, url), config])]) {
    assert.equal((await run(request, cfg, forbidden, forbidden, forbidden)).status, 404);
  }
});
test('method, origin and action header protections run before identity lookup', async () => {
  const get = new Request('https://staging.faultcite.com/api/admin/maintenance-control');
  for (const request of [get, req(undefined, undefined, { origin: 'https://evil.invalid' }), req(undefined, undefined, { 'x-faultcite-maintenance': 'other' }),
    ...['cross-site', 'same-site', 'none', ''].map(value => req(undefined, undefined, { 'sec-fetch-site': value }))]) {
    assert.equal((await run(request, config, forbidden, forbidden, forbidden)).status, 403);
  }
});
test('missing, expired, overly long lease and unpinned subject fail closed', async () => {
  for (const cfg of [{ ...config, subject: '' }, { ...config, expiresAt: undefined }, { ...config, expiresAt: 'invalid' },
    ...[0, -1, 900001].map(delta => ({ ...config, expiresAt: new Date(time + delta).toISOString() }))]) {
    assert.equal((await run(req(), cfg, forbidden, forbidden, forbidden)).status, 403);
  }
});
test('anonymous, other providers, sessionless and unpinned identities cannot look up admin', async () => {
  for (const id of [null, { ...identity, provider: 'chatgpt' }, { ...identity, sessionId: null }, { ...identity, subject: 'other' }]) {
    assert.equal((await run(req(), config, forbidden, async () => id, forbidden)).status, 403);
  }
});
test('company owner is insufficient; only active platform administrator is authorized', async () => {
  for (const admin of [null, { active: false }, { active: 1 }, { role: 'owner' }]) {
    assert.equal((await run(req(), config, forbidden, undefined, async () => admin)).status, 403);
  }
});
test('authentication errors are generic and reveal no identity or internal details', async () => {
  const response = await run(req(), config, forbidden, async () => { throw new Error('secret@example.com'); });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret@example/);
});
test('lease is rechecked after administrator lookup', async () => {
  let clock = time;
  const response = await run(req(), config, forbidden, undefined, async () => { clock += 60000; return { active: true }; }, () => clock);
  assert.equal(response.status, 403);
});
test('bounded streaming rejects oversized bodies without relying on content length', async () => {
  for (const request of [req(' '.repeat(4097)), req('{}', undefined, { 'content-length': '9000' }), req('{}', undefined, { 'content-length': 'n/a' })]) {
    assert.equal((await run(request)).status, 400);
  }
});
test('non JSON, malformed JSON, compressed and unexpected body fields cannot mutate', async () => {
  for (const request of [req('{'), req(null), req([]), req({ operation: 'force-resume' }), req({ operation: 'status', extra: true }),
    req({}, undefined, { 'content-type': 'text/plain' }), req({}, undefined, { 'content-encoding': 'gzip' })]) {
    assert.equal((await run(request)).status, 400);
  }
});
test('lease expiry while body streams prevents any drain access', async () => {
  let clock = time;
  const request = req();
  const getReader = request.body.getReader.bind(request.body);
  request.body.getReader = () => {
    const reader = getReader();
    return { read: async () => { const chunk = await reader.read(); clock = time + 60000; return chunk; },
      releaseLock: () => reader.releaseLock(), cancel: () => reader.cancel() };
  };
  assert.equal((await run(request, config, forbidden, undefined, undefined, () => clock)).status, 403);
});
test('disabled persistent tracking blocks even authenticated status', async () => {
  assert.equal((await run(req(), { ...config, trackingEnabled: undefined })).status, 409);
});
test('status returns only operational receipt and never claims backup or production acceptance', async () => {
  const response = await run(req(), config, () => ({ status: async () => ({ ...paused, unrelatedSecret: 'hidden' }) }));
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  const result = await response.json();
  assert.deepEqual(result.receipt, receipt); assert.equal(result.productionAcceptance, false);
  assert.equal(result.backupVerified, false); assert.equal(result.restorationVerified, false);
  assert.equal(result.applicationWritesResumed, false); assert.equal(result.unrelatedSecret, undefined);
});
test('pause requires explicit confirmation and a bounded identifier', async () => {
  for (const body of [{ operation: 'pause', pauseId: 'pause-test' }, { operation: 'pause', pauseId: 'x', confirmation: 'PAUSE-staging' },
    { operation: 'pause', pauseId: 'pause-test', confirmation: 'PAUSE-production' }]) assert.equal((await run(req(body))).status, 400);
  let calls = 0;
  const response = await run(req({ operation: 'pause', pauseId: 'pause-test', confirmation: 'PAUSE-staging' }), config,
    () => ({ pause: async id => { calls++; assert.equal(id, 'pause-test'); return paused; } }));
  assert.equal(response.status, 200); assert.equal(calls, 1);
});
test('pause rejects invalid or mismatched environment pause configuration before storage mutation', async () => {
  for (const cfg of [{ ...config, pauseEnabled: 'invalid' }, { ...config, pauseEnabled: 'true', pauseId: 'different-id' },
    { ...config, pauseEnabled: 'true', pauseId: 'x' }]) {
    assert.equal((await run(req({ operation: 'pause', pauseId: 'pause-test', confirmation: 'PAUSE-staging' }), cfg)).status, 409);
  }
  const response = await run(req(), { ...config, pauseEnabled: 'invalid' }, () => ({ status: async () => paused }));
  assert.equal(response.status, 200); assert.equal((await response.json()).environmentWritePause, 'invalid');
});
test('abort and resume pass exact generation receipts to persistent storage and never claim writes reopened', async () => {
  for (const operation of ['abort', 'resume']) {
    const response = await run(req({ operation, receipt, confirmation: `${operation.toUpperCase()}-staging` }),
      { ...config, pauseEnabled: 'true', pauseId: 'pause-test' }, () => ({
        [operation === 'abort' ? 'abortPause' : 'resume']: async value => { assert.deepEqual(value, receipt); return { ...receipt, paused: false, pauseId: null, drained: false }; },
      }));
    assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.environmentWritePauseMustBeDisabled, true);
    assert.equal(result.applicationWritesResumed, false); assert.equal(result.cooperatingAdmissionsOpen, true);
    assert.equal(result.unresolvedTicketsRetained, operation === 'abort');
  }
});
test('malformed, stale-schema and impossible resume receipts fail before storage access', async () => {
  for (const bad of [null, { ...receipt, pauseGeneration: undefined }, { ...receipt, pauseGeneration: 0 }, { ...receipt, epoch: 0 },
    { ...receipt, epoch: Number.MAX_SAFE_INTEGER + 1 }, { ...receipt, paused: false }, { ...receipt, pending: 1 }, { ...receipt, extra: true }]) {
    assert.equal((await run(req({ operation: 'resume', receipt: bad, confirmation: 'RESUME-staging' }))).status, 400);
  }
});
test('abort preserves pending-writer receipt and storage/export conflicts are not bypassed', async () => {
  const pending = { ...receipt, pending: 2 };
  const response = await run(req({ operation: 'abort', receipt: pending, confirmation: 'ABORT-staging' }), config,
    () => ({ abortPause: async value => { assert.deepEqual(value, pending); throw new Error('Current pause receipt without export lock required'); } }));
  assert.equal(response.status, 503); assert.equal((await response.json()).outcomeUnknown, true);
});
