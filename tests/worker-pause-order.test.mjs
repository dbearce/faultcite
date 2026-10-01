import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the actual Worker entry point; replace only framework dispatch and
// presentation helpers. The pause and persistent tracking modules stay real.
const bundle = await build({
  entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
  plugins: [{ name: 'framework-fixture', setup(builder) {
    builder.onResolve({ filter: /^(vinext\/server\/|\.\.\/lib\/(request-env|security-headers)$)/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents:
      args.path.includes('image-optimization') ? 'export const DEFAULT_DEVICE_SIZES=[]; export const DEFAULT_IMAGE_SIZES=[]; export function handleImageOptimization(){ throw new Error("Unexpected image dispatch"); }' :
      args.path.includes('app-router-entry') ? 'export default { fetch(){ return new Response("route reached", {status:403}); } };' :
      args.path.includes('request-env') ? 'export const runWithRequestEnv = (env, fn) => fn();' :
      'export function applyAppSecurityHeaders(headers){ headers.set("x-content-type-options", "nosniff"); }'
    }));
  } }],
});
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

for (const setting of ['true', 'invalid']) {
  test(`environment pause ${setting} rejects before persistent admission`, async () => {
    let storageCalls = 0, lifetimes = 0;
    const env = {
      FAULTCITE_DRAIN_TRACKING_ENABLED: 'true',
      FAULTCITE_WRITE_PAUSE_ENABLED: setting,
      FAULTCITE_WRITE_PAUSE_ID: 'synthetic_pause',
      DB: { prepare() { storageCalls++; throw new Error('Storage must not be touched'); } },
    };
    const ctx = { waitUntil() { lifetimes++; } };
    for (const method of ['GET', 'HEAD', 'POST']) {
      const response = await worker.fetch(new Request('https://staging.faultcite.com/api/manuals', { method }), env, ctx);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('x-faultcite-write-pause'), setting === 'true' ? 'paused' : 'invalid');
      await response.text();
    }
    assert.equal(storageCalls, 0);
    assert.equal(lifetimes, 0);
  });
}

test('paused exact export reaches authorization but query variants stay blocked', async () => {
  const env = { FAULTCITE_DRAIN_TRACKING_ENABLED: 'true', FAULTCITE_WRITE_PAUSE_ENABLED: 'true', FAULTCITE_WRITE_PAUSE_ID: 'synthetic_pause' };
  for (const suffix of ['', '?bypass=1']) {
    const response = await worker.fetch(new Request(`https://staging.faultcite.com/api/admin/migration-export${suffix}`, {
      method: 'POST', headers: { origin: 'https://staging.faultcite.com' },
    }), env, { waitUntil() { throw new Error('No admission for blocked/export requests'); } });
    assert.equal(response.status, suffix ? 503 : 403);
  }
});

test('maintenance recovery dispatch stays reachable but does not bypass authorization', async () => {
  const env = { FAULTCITE_DRAIN_TRACKING_ENABLED: 'true', FAULTCITE_WRITE_PAUSE_ENABLED: 'true', FAULTCITE_WRITE_PAUSE_ID: 'synthetic_pause' };
  for (const suffix of ['', '?bypass=1', '/']) {
    const response = await worker.fetch(new Request(`https://staging.faultcite.com/api/admin/maintenance-control${suffix}`, {
      method: 'POST', headers: { origin: 'https://staging.faultcite.com' },
    }), env, { waitUntil() { throw new Error('Must not admit control requests as writers'); } });
    assert.equal(response.status, suffix ? 503 : 403);
  }
  const crossSite = await worker.fetch(new Request('https://staging.faultcite.com/api/admin/maintenance-control', {
    method: 'POST', headers: { origin: 'https://evil.example' },
  }), env, { waitUntil() {} });
  assert.equal(crossSite.status, 403);
});
