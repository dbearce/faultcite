import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writePauseResponse, writePauseState } from '../lib/write-pause.mjs';

const paused = { enabled: 'true', id: 'rehearsal_20260927' };
const request = (path = '/', method = 'GET', headers = {}) => new Request(`https://staging.faultcite.com${path}`, { method, headers });

test('write pause is default off and explicit false restores admission', () => {
  for (const config of [{}, { enabled: 'false' }, { enabled: 'false', id: 'previous_pause' }]) {
    assert.equal(writePauseState(config), 'off');
    assert.equal(writePauseResponse(request(), config), null);
  }
});

test('invalid pause settings fail closed including the export exception', () => {
  for (const config of [{ enabled: '' }, { enabled: 'TRUE' }, { enabled: 'true' }, { enabled: true }, { enabled: 'true', id: 'bad id' }, { enabled: 'true', id: 'x'.repeat(129) }]) {
    assert.equal(writePauseState(config), 'invalid');
    assert.equal(writePauseResponse(request(), config).status, 503);
    assert.equal(writePauseResponse(request('/api/admin/migration-export', 'POST'), config).status, 503);
  }
});

test('pause blocks every method and application surface reaching Worker including GET side effects', async () => {
  for (const path of ['/', '/sign-in', '/api/health', '/api/webhooks/stripe', '/api/pilot-interest', '/api/manuals', '/api/cases', '/_vinext/image', '/assets/app.js']) {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = writePauseResponse(request(path, method, { 'x-faultcite-write-pause': 'off', 'x-faultcite-export': 'download', authorization: 'Bearer fake-admin' }), paused);
      assert.equal(response.status, 503);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(response.headers.get('retry-after'), '60');
      if (method === 'HEAD') assert.equal(await response.text(), '');
    }
  }
});

test('only exact export POST is admitted for its separate authorization checks', () => {
  assert.equal(writePauseResponse(request('/api/admin/migration-export', 'POST'), paused), null);
  for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']) assert.equal(writePauseResponse(request('/api/admin/migration-export', method), paused).status, 503);
  for (const path of ['/api/admin/migration-export/', '/api/admin/migration-export?bypass=1', '/api/admin/migration-export/other', '/api/admin/%6digration-export']) assert.equal(writePauseResponse(request(path, 'POST'), paused).status, 503);
});

test('Worker gate precedes every application and asset dispatch and uses only env flags', () => {
  const source = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
  const gate = source.indexOf('const paused = writePauseResponse(');
  assert.ok(gate > 0);
  for (const marker of ['const canonicalOrigin =', 'const signedWebhook =', 'await handleImageOptimization(', 'handler.fetch(']) assert.ok(gate < source.indexOf(marker));
  assert.match(source, /enabled: env\.FAULTCITE_WRITE_PAUSE_ENABLED/);
  assert.match(source, /if \(paused\) return secure\(paused/);
});
