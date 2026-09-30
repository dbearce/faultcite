import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['app/api/pilot-interest/route.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
  plugins: [{ name: 'env-fixture', setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const env = globalThis.__pilotTestEnv;' }));
  } }],
});

test('saved requests survive notification failures without leaking submitted details', async () => {
  const originalFetch = globalThis.fetch, originalWarn = console.warn;
  const env = {};
  globalThis.__pilotTestEnv = env;
  try {
    const { POST } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    for (const scenario of [202, 401, 429, 500, 'network', 'missing-key', 'missing-contact']) {
      let inserts = 0, sends = 0;
      const warnings = [];
      Object.assign(env, {
        RESEND_API_KEY: scenario === 'missing-key' ? '' : 'private-api-key',
        FAULTCITE_CONTACT_EMAIL: scenario === 'missing-contact' ? '' : 'owner@example.test',
        DB: { prepare(sql) { return { bind() { return {
          first: async () => ({ count: 1, reset_at: Date.now() + 60000 }),
          run: async () => { assert.match(sql, /INSERT INTO pilot_interest/); inserts++; },
        }; } }; } },
      });
      console.warn = (...args) => warnings.push(args);
      globalThis.fetch = async () => {
        sends++;
        if (scenario === 'network') throw new Error('private-provider-error');
        return new Response('private-provider-body', { status: scenario });
      };
      const form = new FormData();
      for (const [key, value] of Object.entries({ name: 'Private Tester', email: 'tester@example.test', company: 'Private Company', message: 'Private details' })) form.set(key, value);
      const response = await POST(new Request('https://app.faultcite.com/api/pilot-interest', { method: 'POST', headers: { origin: 'https://faultcite.com' }, body: form }));
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), 'https://faultcite.com/pilot-received.html');
      assert.equal(inserts, 1);
      assert.equal(sends, String(scenario).startsWith('missing-') ? 0 : 1);
      assert.equal(warnings.length, scenario === 202 ? 0 : 1);
      assert.doesNotMatch(JSON.stringify(warnings), /private|tester@example|owner@example/i);
      if ([401, 429, 500].includes(scenario)) assert.equal(warnings[0][1].status, scenario);
    }
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    delete globalThis.__pilotTestEnv;
  }
});
