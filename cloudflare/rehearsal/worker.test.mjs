import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

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
