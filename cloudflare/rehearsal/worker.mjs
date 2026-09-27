import { createHash, timingSafeEqual } from 'node:crypto';
import { exportRecords, exportStream } from '../../lib/migration-export.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const check = condition => { if (!condition) throw new Error('Rehearsal check failed'); };

// No customer inputs, SQL, object keys, source URLs or production bindings accepted.
const rehearsalWorker = {
  async fetch(request, env) {
    const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/rehearse') return reply({ error: 'Not found' }, 404);
    const supplied = request.headers.get('Authorization') || '';
    if (!env.REHEARSAL_TOKEN || Date.now() >= Number(env.EXPIRES_AT) || !Number.isFinite(Number(env.EXPIRES_AT))) return reply({ error: 'Disabled' }, 403);
    if (!timingSafeEqual(Buffer.from(digest(supplied)), Buffer.from(digest(`Bearer ${env.REHEARSAL_TOKEN}`)))) return reply({ error: 'Unauthorized' }, 401);
    try {
      for (const db of [env.SOURCE_DB, env.TARGET_DB]) {
        const row = await db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'").first();
        check(row.n === 0);
      }
      for (const bucket of [env.SOURCE_FILES, env.TARGET_FILES]) check((await bucket.list({ limit: 1 })).objects.length === 0);
      // Atomic CREATE refuses concurrent/repeated invocations before fixture writes.
      await env.SOURCE_DB.prepare('CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT)').run();
      await env.SOURCE_DB.prepare('INSERT INTO records(value) VALUES (?)').bind('synthetic fixture only').run();
      const bytes = Uint8Array.from({ length: 150000 }, (_, i) => i % 251);
      await env.SOURCE_FILES.put('fixture/manual.bin', bytes, { customMetadata: { fixture: 'yes' }, httpMetadata: { contentType: 'application/octet-stream' } });
      // Bounded synthetic fixture, never a customer archive ingestion endpoint.
      const archive = await new Response(exportStream(exportRecords(env.SOURCE_DB, env.SOURCE_FILES, () => check(Date.now() < Number(env.EXPIRES_AT))))).text();
      check(archive.length < 400000);
      const lines = archive.trimEnd().split('\n');
      const records = lines.map(JSON.parse);
      const footer = records.pop();
      check(footer.kind === 'complete' && footer.records === records.length && footer.sha256 === digest(lines.slice(0, -1).join('\n') + '\n'));
      const schemas = records.filter(r => r.kind === 'schema' && r.type === 'table');
      check(schemas.length === 1 && schemas[0].name === 'records');
      for (const item of schemas) await env.TARGET_DB.prepare(item.sql).run();
      for (const item of records.filter(r => r.kind === 'row')) { check(item.table === 'records'); await env.TARGET_DB.prepare(item.sql).run(); }
      const files = records.filter(r => r.kind === 'file');
      check(files.length === 1 && files[0].key === 'fixture/manual.bin');
      const file = files[0];
      const restoredBytes = Buffer.concat(records.filter(r => r.kind === 'file-chunk').map(r => Buffer.from(r.data, 'base64')));
      const end = records.find(r => r.kind === 'file-end');
      check(end.bytes === bytes.length && end.sha256 === digest(restoredBytes) && digest(bytes) === digest(restoredBytes));
      await env.TARGET_FILES.put(file.key, restoredBytes, { customMetadata: file.customMetadata, httpMetadata: file.httpMetadata });
      const sourceRows = (await env.SOURCE_DB.prepare('SELECT * FROM records').all()).results;
      const targetRows = (await env.TARGET_DB.prepare('SELECT * FROM records').all()).results;
      check(JSON.stringify(sourceRows) === JSON.stringify(targetRows));
      const restored = await env.TARGET_FILES.get(file.key);
      check(restored && digest(Buffer.from(await restored.arrayBuffer())) === digest(bytes));
      check(restored.customMetadata.fixture === 'yes' && restored.httpMetadata.contentType === 'application/octet-stream');
      await env.TARGET_DB.prepare('DELETE FROM records').run();
      check((await env.SOURCE_DB.prepare('SELECT COUNT(*) AS n FROM records').first()).n === 1);
      return reply({ syntheticHostedRestore: 'passed', productionAcceptance: false, sourceAppAuthenticationVerified: false, fileSha256: digest(bytes), archiveSha256: footer.sha256, targetIsolationVerified: true });
    } catch { return reply({ error: 'Rehearsal failed; preserve isolated resources for review', productionAcceptance: false }, 500); }
  },
};
export default rehearsalWorker;
