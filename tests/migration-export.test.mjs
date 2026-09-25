import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authorizedExporter, exportGate, exportRecords, exportStream } from '../lib/migration-export.mjs';

const now = Date.now();
const config = { enabled: 'true', expiresAt: new Date(now + 60000).toISOString(), subject: 'user_test', frozen: 'true', freezeReceipt: 'offline-fixture' };
const request = (origin = 'https://staging.faultcite.com', method = 'POST') => new Request(origin + '/api/admin/migration-export', { method, headers: { origin, 'x-faultcite-export': 'download' } });
test('export is default off, production hard-blocked, and time bounded', () => {
  assert.equal(exportGate(request(), {}, now), 404);
  assert.equal(exportGate(request('https://app.faultcite.com'), config, now), 404);
  assert.equal(exportGate(request(), config, now), 200);
  assert.equal(exportGate(request(), { ...config, expiresAt: new Date(now - 1).toISOString() }, now), 403);
  assert.equal(exportGate(request(), { ...config, expiresAt: new Date(now + 3600000).toISOString() }, now), 403);
  assert.equal(exportGate(request(), { ...config, frozen: 'false' }, now), 409);
  assert.equal(exportGate(request(), { ...config, freezeReceipt: '' }, now), 409);
  assert.equal(exportGate(request(undefined, 'GET'), config, now), 403);
  const cross = request(); cross.headers.set('origin', 'https://evil.example');
  assert.equal(exportGate(cross, config, now), 403);
});
test('only existing active platform admin with pinned Clerk subject and session passes', () => {
  const identity = { provider: 'clerk', subject: 'user_test', sessionId: 'session_test' };
  assert.equal(authorizedExporter(identity, { active: true }, 'user_test'), true);
  for (const admin of [null, { active: false }, { role: 'owner' }]) assert.equal(authorizedExporter(identity, admin, 'user_test'), false);
  assert.equal(authorizedExporter(identity, { active: true }, 'someone_else'), false);
  assert.equal(authorizedExporter({ ...identity, sessionId: null }, { active: true }, 'user_test'), false);
  assert.equal(authorizedExporter({ ...identity, provider: 'chatgpt' }, { active: true }, 'user_test'), false);
});

// Real SQLite fixture exercises generated SQL, not hand-written mock row output.
function sqliteDb() {
  return { prepare(query) {
    let bindings = [];
    return { bind(...args) { bindings = args; return this; }, async all() {
      const code = `import sqlite3,json,sys\nc=sqlite3.connect(':memory:')\nc.row_factory=sqlite3.Row\nc.execute('CREATE TABLE records (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT, data BLOB)')\nc.execute('INSERT INTO records VALUES (?,?,?)',(9223372036854775806,'a\\x00b',bytes([0,255,1])))\nq,b=json.loads(sys.stdin.read())\nprint(json.dumps([dict(r) for r in c.execute(q,b)]))`;
      const result = spawnSync('python', ['-c', code], { input: JSON.stringify([query, bindings]), encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return { success: true, results: JSON.parse(result.stdout) };
    } };
  } };
}
function bucket(changed = false) {
  return {
    async list() { return { objects: [{ key: 'tenant/manual.pdf', etag: 'e', version: 'v' }], truncated: false }; },
    async get(key, options) {
      assert.deepEqual(options, { onlyIf: { etagMatches: 'e' } });
      if (changed) return null;
      return { key, etag: 'e', version: 'v', size: 3, customMetadata: { test: 'fixture' }, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([0,255,1])); c.close(); } }) };
    },
  };
}
test('exports schema, exact SQL values, file bytes and terminal checksum', async () => {
  const response = new Response(exportStream(exportRecords(sqliteDb(), bucket(), () => {})));
  const text = await response.text();
  const lines = text.trimEnd().split('\n');
  const records = lines.map(JSON.parse);
  const footer = records.at(-1);
  assert.equal(footer.kind, 'complete');
  assert.equal(footer.records, records.length - 1);
  assert.equal(footer.sha256, createHash('sha256').update(lines.slice(0,-1).join('\n') + '\n').digest('hex'));
  const row = records.find(x => x.kind === 'row');
  assert.match(row.sql, /9223372036854775806/);
  assert.match(row.sql, /CAST\(X'610062' AS TEXT\)/);
  assert.match(row.sql, /X'00FF01'/);
  assert.match(row.sql, /"rowid"/);
  const restore = spawnSync('python', ['-c', "import sqlite3,sys,json;c=sqlite3.connect(':memory:');s=json.load(sys.stdin);c.execute(s[0]);c.execute(s[1]);r=c.execute('select cast(id as text),hex(value),hex(data) from records').fetchone();print(json.dumps(r))"], { input: JSON.stringify([records.find(x => x.kind === 'schema' && x.type === 'table').sql, row.sql]), encoding: 'utf8' });
  assert.equal(restore.status, 0, restore.stderr);
  assert.deepEqual(JSON.parse(restore.stdout), ['9223372036854775806','610062','00FF01']);
  assert.equal(records.find(x => x.kind === 'sequences').rows[0].seq, '9223372036854775806');
  assert.deepEqual(Buffer.from(records.find(x => x.kind === 'file-chunk').data, 'base64'), Buffer.from([0,255,1]));
  assert.equal(records.find(x => x.kind === 'file-end').sha256, createHash('sha256').update(Buffer.from([0,255,1])).digest('hex'));
  const folder = mkdtempSync(join(tmpdir(), 'faultcite-export-test-'));
  try {
    const archive = join(folder, 'synthetic.ndjson');
    writeFileSync(archive, text, { mode: 0o600 });
    const verified = spawnSync('python3', ['cloudflare/scripts/verify-migration-export.py', archive], { encoding: 'utf8' });
    assert.equal(verified.status, 0, verified.stderr);
    const report = JSON.parse(verified.stdout);
    assert.equal(report.offlineRestorePassed, true);
    assert.equal(report.productionAcceptance, false);
    assert.equal(report.tables, 1);
    assert.equal(report.rows, 1);
    assert.equal(report.files, 1);
    assert.equal(report.archiveSha256, footer.sha256);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
test('missing or changed file produces a failed stream, never completion', async () => {
  await assert.rejects(new Response(exportStream(exportRecords(sqliteDb(), bucket(true), () => {}))).text(), /incomplete/);
});
test('lease expiration aborts instead of certifying completion', async () => {
  let calls = 0;
  await assert.rejects(new Response(exportStream(exportRecords(sqliteDb(), bucket(), () => { if (++calls > 2) throw Error('expired'); }))).text(), /incomplete/);
});

test('table and bucket pagination do not truncate full pages', async () => {
  const offsets = [], cursors = [];
  const db = { prepare(sql) {
    let offset;
    return { bind(value) { offset = value; return this; }, async all() {
      let results = [];
      if (sql.includes('type,name,tbl_name')) results = [{ type: 'table', name: 'records', sql: 'CREATE TABLE records(id INTEGER)' }];
      else if (sql === 'PRAGMA table_list') results = [{ name: 'records', schema: 'main', wr: 0 }];
      else if (sql.startsWith('PRAGMA')) results = [{ name: 'id', hidden: 0 }];
      else if (sql.startsWith('SELECT \'INSERT')) {
        offsets.push(offset);
        results = Array.from({ length: offset === 0 ? 20 : 1 }, (_, i) => ({ statement: `INSERT INTO records VALUES (${offset + i});` }));
      }
      return { success: true, results };
    } };
  } };
  const storage = { async list({ cursor }) {
    cursors.push(cursor);
    // Empty pages are legal when a cursor indicates more objects.
    return { objects: [], truncated: !cursor, cursor: cursor ? undefined : 'page2' };
  } };
  const text = await new Response(exportStream(exportRecords(db, storage, () => {}))).text();
  assert.deepEqual(offsets, [0,20]);
  assert.deepEqual(cursors, [undefined,'page2']);
  const rows = text.trim().split('\n').map(JSON.parse);
  assert.equal(rows.filter(x => x.kind === 'row').length, 21);
  assert.equal(rows.at(-1).kind, 'complete');
});

test('database read failure and repeated bucket cursor abort', async () => {
  const failed = { prepare() { return { async all() { return { success: false }; } }; } };
  await assert.rejects(new Response(exportStream(exportRecords(failed, bucket(), () => {}))).text(), /incomplete/);
  const repeated = { async list() { return { objects: [], truncated: true, cursor: 'same' }; } };
  await assert.rejects(new Response(exportStream(exportRecords(sqliteDb(), repeated, () => {}))).text(), /incomplete/);
});

function sqliteFixture(setup) {
  return { prepare(query) {
    let bindings = [];
    return { bind(...args) { bindings = args; return this; }, async all() {
      const code = "import sqlite3,json,sys\ns,q,b=json.load(sys.stdin)\nc=sqlite3.connect(':memory:')\nc.row_factory=sqlite3.Row\nc.executescript(s)\nprint(json.dumps([dict(r) for r in c.execute(q,b)]))";
      const result = spawnSync('python', ['-c', code], { input: JSON.stringify([setup, query, bindings]), encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return { success: true, results: JSON.parse(result.stdout) };
    } };
  } };
}

test('hidden rowids, generated columns, WITHOUT ROWID and REAL values survive SQL restore', async () => {
  const setup = `
    CREATE TABLE hidden (key TEXT PRIMARY KEY, rowid TEXT, value REAL, doubled REAL GENERATED ALWAYS AS (value * 2) STORED);
    INSERT INTO hidden (_rowid_,key,rowid,value) VALUES (71,'a','shadow',1.2345678901234567);
    INSERT INTO hidden (_rowid_,key,rowid,value) VALUES (93,'b','shadow',1e999);
    INSERT INTO hidden (_rowid_,key,rowid,value) VALUES (105,'c','shadow',-1e999);
    CREATE TABLE compact (a TEXT, b INTEGER, value BLOB, PRIMARY KEY(a,b)) WITHOUT ROWID;
    INSERT INTO compact VALUES ('x',9223372036854775806,X'0001FF');
  `;
  const storage = { async list() { return { objects: [], truncated: false }; } };
  const text = await new Response(exportStream(exportRecords(sqliteFixture(setup), storage, () => {}))).text();
  const records = text.trim().split('\n').map(JSON.parse);
  const statements = [
    ...records.filter(r => r.kind === 'schema' && r.type === 'table').map(r => r.sql),
    ...records.filter(r => r.kind === 'row').map(r => r.sql),
  ];
  const verify = `import sqlite3,json,sys,math
statements=json.load(sys.stdin)
c=sqlite3.connect(':memory:')
for s in statements: c.execute(s)
assert c.execute('select _rowid_ from hidden order by key').fetchall()==[(71,),(93,),(105,)]
assert c.execute('select value from hidden where key="a"').fetchone()[0]==1.2345678901234567
assert c.execute('select doubled from hidden where key="a"').fetchone()[0]==1.2345678901234567*2
assert c.execute('select value from hidden where key="b"').fetchone()[0]==math.inf
assert c.execute('select value from hidden where key="c"').fetchone()[0]==-math.inf
assert c.execute('select a,cast(b as text),hex(value) from compact').fetchone()==('x','9223372036854775806','0001FF')
assert c.execute('pragma integrity_check').fetchone()[0]=='ok'
`;
  const restored = spawnSync('python', ['-c', verify], { input: JSON.stringify(statements), encoding: 'utf8' });
  assert.equal(restored.status, 0, restored.stderr);
});

test('all rowid aliases shadowed and virtual tables fail closed', async () => {
  const storage = { async list() { return { objects: [], truncated: false }; } };
  for (const setup of [
    'CREATE TABLE ambiguous (rowid TEXT, _rowid_ TEXT, oid TEXT);',
    'CREATE VIRTUAL TABLE searchable USING fts5(body);',
  ]) {
    await assert.rejects(new Response(exportStream(exportRecords(sqliteFixture(setup), storage, () => {}))).text(), /incomplete/);
  }
});
