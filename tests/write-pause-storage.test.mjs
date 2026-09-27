import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('pause stops synthetic GET and POST writers before local D1/R2 access', { timeout: 60000 }, async () => {
  const gate = await readFile(new URL('../lib/write-pause.mjs', import.meta.url), 'utf8');
  for (const enabled of ['true', 'invalid', 'false']) {
    const mf = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-09-01',
      bindings: { PAUSED: enabled },
      d1Databases: ['DB'], r2Buckets: ['FILES'],
      script: gate + `
export default { async fetch(request, env) {
  const blocked = writePauseResponse(request, { enabled: env.PAUSED, id: 'synthetic-pause' });
  if (blocked) return blocked;
  await env.DB.prepare('INSERT INTO writes(value) VALUES (?)').bind(request.method).run();
  await env.FILES.put(request.method, 'synthetic');
  return new Response('written');
} };
`,
    }));
    try {
      const db = await mf.getD1Database('DB');
      const files = await mf.getR2Bucket('FILES');
      await db.prepare('CREATE TABLE writes(value TEXT)').run();
      for (const method of ['GET', 'POST']) {
        const response = await mf.dispatchFetch('https://fixture.invalid/api/bootstrap', { method });
        assert.equal(response.status, enabled === 'false' ? 200 : 503);
      }
      assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM writes').first()).n, enabled === 'false' ? 2 : 0);
      assert.equal((await files.list()).objects.length, enabled === 'false' ? 2 : 0);
    } finally { await mf.dispose(); }
  }
});
