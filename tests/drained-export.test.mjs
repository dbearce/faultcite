import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createPersistentDrain } from '../lib/persistent-drain.mjs';
import { drainedExportRecords } from '../lib/drained-export.mjs';
import { exportStream } from '../lib/migration-export.mjs';

async function fixture(run) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-01', d1Databases: ['DB'], r2Buckets: ['FILES'], script: 'export default { fetch() { return new Response("fixture"); } };' }));
  try {
    const db = await mf.getD1Database('DB'), bucket = await mf.getR2Bucket('FILES');
    const sql = await readFile(new URL('../cloudflare/rehearsal/drain-schema.sql', import.meta.url), 'utf8');
    for (const part of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(part).run();
    await db.prepare('CREATE TABLE business(id INTEGER PRIMARY KEY, value TEXT)').run();
    await db.prepare("INSERT INTO business VALUES(1, 'synthetic only')").run();
    const drain = createPersistentDrain(db);
    await drain.pause('synthetic_pause');
    await run({ db, bucket, drain });
  } finally { await mf.dispose(); }
}

test('export holds resume lock and omits coordination tables from restored data', { timeout: 60000 }, async () => fixture(async ({ db, bucket, drain }) => {
  const receipt = await drain.drainReceipt();
  const records = await drainedExportRecords(db, bucket, drain, 'synthetic_pause', () => {});
  assert.equal((await drain.status()).pending, 1);
  await assert.rejects(drain.resume(receipt));
  const archive = await new Response(exportStream(records)).text();
  assert.match(archive, /73796E746865746963206F6E6C79/); // SQLite exact text representation.
  assert.doesNotMatch(archive, /_faultcite_drain_/);
  assert.equal((await drain.status()).pending, 0);
  assert.equal((await drain.resume(await drain.drainReceipt())).paused, false);
}));

test('cancelled export leaves durable lock and a mismatched pause never starts export', { timeout: 60000 }, async () => fixture(async ({ db, bucket, drain }) => {
  await assert.rejects(drainedExportRecords(db, bucket, drain, 'wrong_pause', () => {}));
  assert.equal((await drain.status()).pending, 0);
  const records = await drainedExportRecords(db, bucket, drain, 'synthetic_pause', () => {});
  await records.next();
  await records.return();
  assert.equal((await drain.status()).pending, 1);
  await assert.rejects(drain.drainReceipt());
}));
