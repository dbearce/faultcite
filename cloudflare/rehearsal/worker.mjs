import { createHash, timingSafeEqual } from 'node:crypto';
import { exportStream } from '../../lib/migration-export.mjs';

import { createPersistentDrain } from '../../lib/persistent-drain.mjs';
import { drainedExportRecords } from '../../lib/drained-export.mjs';

// Trusted copy of drain-schema.sql; parity checked by worker.test.mjs. Applied only
// to the empty synthetic SOURCE_DB, never accepted from a request or customer.
const rehearsalDrainSchema = `-- Rehearsal-only schema. Never applied automatically by the coordinator.
CREATE TABLE _faultcite_drain_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  epoch INTEGER NOT NULL CHECK (epoch >= 1),
  paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
  pause_id TEXT,
  CHECK ((paused = 0 AND pause_id IS NULL) OR (paused = 1 AND length(pause_id) BETWEEN 8 AND 128))
);
INSERT INTO _faultcite_drain_state(singleton, epoch, paused, pause_id) VALUES (1, 1, 0, NULL);
CREATE TABLE _faultcite_drain_tickets (
  id TEXT PRIMARY KEY,
  epoch INTEGER NOT NULL CHECK (epoch >= 1),
  kind TEXT NOT NULL CHECK (kind IN ('writer', 'export'))
);
`;

const digest = value => createHash('sha256').update(value).digest('hex');
const check = condition => { if (!condition) throw new Error('Rehearsal check failed'); };
const mustReject = async operation => {
  let rejected = false;
  try { await operation(); } catch { rejected = true; }
  check(rejected);
};

// No customer inputs, SQL, object keys, source URLs or production bindings accepted.
const rehearsalWorker = {
  async fetch(request, env) {
    const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Rehearsal-Generation': String(env.REHEARSAL_GENERATION || 'unset') } });
    const readiness = request.method === 'GET' && new URL(request.url).pathname === '/ready';
    if (!readiness && (request.method !== 'POST' || new URL(request.url).pathname !== '/rehearse')) return reply({ error: 'Not found' }, 404);
    const supplied = request.headers.get('Authorization') || '';
    if (!env.REHEARSAL_TOKEN || Date.now() >= Number(env.EXPIRES_AT) || !Number.isFinite(Number(env.EXPIRES_AT))) return reply({ error: 'Disabled' }, 403);
    if (!timingSafeEqual(Buffer.from(digest(supplied)), Buffer.from(digest(`Bearer ${env.REHEARSAL_TOKEN}`)))) return reply({ error: 'Unauthorized', authorizationPresent: supplied.length > 0, bearerFormat: supplied.startsWith('Bearer ') }, 401);
    // Authenticated readiness never opens or changes a storage binding.
    if (readiness) return reply({ ready: true, expiresAt: String(env.EXPIRES_AT) });
    try {
      for (const db of [env.SOURCE_DB, env.TARGET_DB]) {
        const row = await db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'").first();
        check(row.n === 0);
      }
      for (const bucket of [env.SOURCE_FILES, env.TARGET_FILES]) check((await bucket.list({ limit: 1 })).objects.length === 0);
      // Atomic CREATE refuses concurrent/repeated invocations before fixture writes.
      await env.SOURCE_DB.prepare('CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT)').run();
      for (const statement of rehearsalDrainSchema.split(';').filter(s => s.trim())) await env.SOURCE_DB.prepare(statement).run();
      const drain = createPersistentDrain(env.SOURCE_DB);
      const writer = await drain.admit();
      await env.SOURCE_DB.prepare('INSERT INTO records(value) VALUES (?)').bind('synthetic fixture only').run();
      const bytes = Uint8Array.from({ length: 150000 }, (_, i) => i % 251);
      await env.SOURCE_FILES.put('fixture/manual.bin', bytes, { customMetadata: { fixture: 'yes' }, httpMetadata: { contentType: 'application/octet-stream' } });
      const pauseId = 'synthetic-rehearsal-pause';
      const lease = () => check(Date.now() < Number(env.EXPIRES_AT));
      const paused = await drain.pause(pauseId);
      check(paused.paused && !paused.drained && paused.pending === 1);
      await mustReject(() => drain.drainReceipt());
      await mustReject(() => drain.admit());
      await mustReject(() => drainedExportRecords(env.SOURCE_DB, env.SOURCE_FILES, drain, pauseId, lease));
      await drain.complete(writer);
      const receipt = await drain.drainReceipt();
      check(receipt.drained && receipt.pending === 0);
      const exporting = await drainedExportRecords(env.SOURCE_DB, env.SOURCE_FILES, drain, pauseId, lease);
      check((await drain.status()).pending === 1);
      await mustReject(() => drain.resume(receipt));
      // Bounded synthetic fixture, never a customer archive ingestion endpoint.
      const archive = await new Response(exportStream(exporting)).text();
      const resumed = await drain.resume(receipt);
      check(!resumed.paused && resumed.pending === 0 && resumed.epoch === receipt.epoch + 1);
      const nextWriter = await drain.admit();
      await drain.complete(nextWriter);
      check(archive.length < 400000);
      const lines = archive.trimEnd().split('\n');
      const records = lines.map(JSON.parse);
      const footer = records.pop();
      check(footer.kind === 'complete' && footer.records === records.length && footer.sha256 === digest(lines.slice(0, -1).join('\n') + '\n'));
      const schemas = records.filter(r => r.kind === 'schema' && r.type === 'table');
      check(schemas.length === 1 && schemas[0].name === 'records');
      for (const item of schemas) await env.TARGET_DB.prepare(item.sql).run();
      for (const item of records.filter(r => r.kind === 'row')) { check(item.table === 'records'); await env.TARGET_DB.prepare(item.sql).run(); }
      check((await env.TARGET_DB.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE name GLOB '_faultcite_drain_*'").first()).n === 0);
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
      return reply({ syntheticHostedRestore: 'passed', productionAcceptance: false, sourceAppAuthenticationVerified: false, fileSha256: digest(bytes), archiveSha256: footer.sha256, targetIsolationVerified: true, persistentCoordinationVerified: true, coordinationSchemaExcluded: true, coordinationScope: 'cooperating-writers-only' });
    } catch { return reply({ error: 'Rehearsal failed; preserve isolated resources for review', productionAcceptance: false }, 500); }
  },
};
export default rehearsalWorker;
