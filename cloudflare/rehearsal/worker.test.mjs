import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('synthetic schema matches the reviewed rehearsal-only schema', async () => {
  const worker = await readFile('cloudflare/rehearsal/worker.mjs', 'utf8');
  const schema = worker.match(/const rehearsalDrainSchema = `([\s\S]*?)`;/)[1];
  assert.equal(schema, await readFile('cloudflare/rehearsal/drain-schema.sql', 'utf8'));
});

test('synthetic hosted handler denies unauthenticated use and restores isolated fixtures', { timeout: 60000 }, async () => {
  const bundled = await build({ entryPoints: ['cloudflare/rehearsal/worker.mjs'], bundle: true, format: 'esm', platform: 'node', write: false, external: ['node:*'] });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-09-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['SOURCE_DB', 'TARGET_DB'], r2Buckets: ['SOURCE_FILES', 'TARGET_FILES'], bindings: { REHEARSAL_TOKEN: 'synthetic-test-key', EXPIRES_AT: String(Date.now() + 60000) } }));
  try {
    assert.equal((await mf.dispatchFetch('https://fixture/rehearse', { method: 'POST' })).status, 401);
    assert.equal((await mf.dispatchFetch('https://fixture/rehearse', { method: 'POST', headers: { Authorization: 'Bearer wrong-token' } })).status, 401);
    const options = { method: 'POST', headers: { Authorization: 'Bearer synthetic-test-key' } };
    const result = await mf.dispatchFetch('https://fixture/rehearse', options);
    assert.equal(result.status, 200, await result.clone().text());
    const body = await result.json();
    assert.equal(body.syntheticHostedRestore, 'passed');
    assert.equal(body.productionAcceptance, false);
    assert.equal(body.sourceAppAuthenticationVerified, false);
    assert.equal(body.persistentCoordinationVerified, true);
    assert.equal(body.coordinationSchemaExcluded, true);
    assert.equal(body.coordinationScope, 'cooperating-writers-only');
    const source = await mf.getD1Database('SOURCE_DB');
    const target = await mf.getD1Database('TARGET_DB');
    assert.deepEqual(await source.prepare('SELECT epoch, paused, pause_id FROM _faultcite_drain_state').first(), { epoch: 2, paused: 0, pause_id: null });
    assert.equal((await source.prepare('SELECT COUNT(*) AS n FROM _faultcite_drain_tickets').first()).n, 0);
    assert.equal((await target.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE name GLOB '_faultcite_drain_*'").first()).n, 0);
    assert.equal((await mf.dispatchFetch('https://fixture/rehearse', options)).status, 500, 'existing fixtures cannot be overwritten');
  } finally { await mf.dispose(); }
});

for (const [label, bindings] of [
  ['missing token', { EXPIRES_AT: String(Date.now() + 60000) }],
  ['expired token', { REHEARSAL_TOKEN: 'synthetic-test-key', EXPIRES_AT: '1' }],
]) {
  test(`synthetic handler denies ${label} before touching bindings`, async () => {
    const bundled = await build({ entryPoints: ['cloudflare/rehearsal/worker.mjs'], bundle: true, format: 'esm', platform: 'node', write: false, external: ['node:*'] });
    // Deliberately no storage bindings: any storage access would cause 500, not 403.
    const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-09-15', compatibilityFlags: ['nodejs_compat'], bindings }));
    try {
      assert.equal((await mf.dispatchFetch('https://fixture/rehearse', { method: 'POST', headers: { Authorization: 'Bearer synthetic-test-key' } })).status, 403);
    } finally { await mf.dispose(); }
  });
}

for (const existing of ['TARGET_DB', 'TARGET_FILES']) {
  test(`existing ${existing} prevents schema installation or fixture writes`, { timeout: 60000 }, async () => {
    const bundled = await build({ entryPoints: ['cloudflare/rehearsal/worker.mjs'], bundle: true, format: 'esm', platform: 'node', write: false, external: ['node:*'] });
    const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-09-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['SOURCE_DB', 'TARGET_DB'], r2Buckets: ['SOURCE_FILES', 'TARGET_FILES'], bindings: { REHEARSAL_TOKEN: 'synthetic-test-key', EXPIRES_AT: String(Date.now() + 60000) } }));
    try {
      if (existing === 'TARGET_DB') await (await mf.getD1Database(existing)).prepare('CREATE TABLE existing(id INTEGER)').run();
      else await (await mf.getR2Bucket(existing)).put('existing', 'preserve');
      const result = await mf.dispatchFetch('https://fixture/rehearse', { method: 'POST', headers: { Authorization: 'Bearer synthetic-test-key' } });
      assert.equal(result.status, 500);
      const source = await mf.getD1Database('SOURCE_DB');
      assert.equal((await source.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'").first()).n, 0);
      assert.equal((await (await mf.getR2Bucket('SOURCE_FILES')).list()).objects.length, 0);
    } finally { await mf.dispose(); }
  });
}
