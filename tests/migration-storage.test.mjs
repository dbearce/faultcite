import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportRecords, exportStream } from '../lib/migration-export.mjs';

// Local binding rehearsal with synthetic data only. No Cloudflare account,
// production binding, network resource, or reusable archive importer is used.
test('local D1/R2 export restores into separate local bindings', { timeout: 60000 }, async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: 'export default { fetch() { return new Response("fixture"); } };',
    compatibilityDate: '2026-09-01',
    d1Databases: ['SOURCE_DB', 'TARGET_DB'],
    r2Buckets: ['SOURCE_FILES', 'TARGET_FILES'],
  }));
  const folder = await mkdtemp(join(tmpdir(), 'faultcite-binding-test-'));
  try {
    const source = await mf.getD1Database('SOURCE_DB');
    const target = await mf.getD1Database('TARGET_DB');
    const sourceFiles = await mf.getR2Bucket('SOURCE_FILES');
    const targetFiles = await mf.getR2Bucket('TARGET_FILES');
    await source.prepare('CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT)').run();
    await source.prepare('INSERT INTO records(value) VALUES (?)').bind('synthetic fixture').run();
    const bytes = new Uint8Array(150000).map((_, i) => i % 251);
    await sourceFiles.put('fixture/manual.bin', bytes, { customMetadata: { fixture: 'yes' }, httpMetadata: { contentType: 'application/octet-stream' } });
    const archive = await new Response(exportStream(exportRecords(source, sourceFiles, () => {}))).text();
    const path = join(folder, 'synthetic.ndjson');
    await writeFile(path, archive, { mode: 0o600 });
    const checked = spawnSync('python3', ['cloudflare/scripts/verify-migration-export.py', path], { encoding: 'utf8', timeout: 30000 });
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(JSON.parse(checked.stdout).productionAcceptance, false);
    const records = archive.trimEnd().split('\n').map(JSON.parse);
    // SQL is exclusively from the synthetic database created above and already
    // passed offline validation. This test is not an arbitrary archive importer.
    for (const item of records.filter(r => r.kind === 'schema' && r.type === 'table')) await target.prepare(item.sql).run();
    for (const item of records.filter(r => r.kind === 'row')) await target.prepare(item.sql).run();
    const file = records.find(r => r.kind === 'file');
    const restoredBytes = Buffer.concat(records.filter(r => r.kind === 'file-chunk').map(r => Buffer.from(r.data, 'base64')));
    await targetFiles.put(file.key, restoredBytes, { customMetadata: file.customMetadata, httpMetadata: file.httpMetadata });
    assert.deepEqual((await target.prepare('SELECT * FROM records').all()).results, (await source.prepare('SELECT * FROM records').all()).results);
    const restored = await targetFiles.get(file.key);
    assert.deepEqual(new Uint8Array(await restored.arrayBuffer()), bytes);
    assert.deepEqual(restored.customMetadata, { fixture: 'yes' });
    assert.equal(restored.httpMetadata.contentType, 'application/octet-stream');
    await target.prepare('DELETE FROM records').run();
    assert.equal((await source.prepare('SELECT COUNT(*) AS n FROM records').first()).n, 1);
  } finally {
    await mf.dispose();
    await rm(folder, { recursive: true, force: true });
  }
});
