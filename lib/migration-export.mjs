import { createHash } from 'node:crypto';

// Development gate: production cannot be enabled by changing an environment flag.
export function exportGate(request, config, now = Date.now()) {
  const url = new URL(request.url);
  if (config.enabled !== 'true' || !['https://staging.faultcite.com', 'http://localhost:5173'].includes(url.origin)) return 404;
  if (request.method !== 'POST' || request.headers.get('origin') !== url.origin || request.headers.get('x-faultcite-export') !== 'download') return 403;
  const expires = Date.parse(config.expiresAt || '');
  if (!Number.isFinite(expires) || expires <= now || expires - now > 15 * 60 * 1000 || !config.subject) return 403;
  // This flag is an operator prerequisite, NOT an implementation of a write freeze.
  if (config.frozen !== 'true' || !config.freezeReceipt) return 409;
  return 200;
}

export function authorizedExporter(identity, admin, subject) {
  return Boolean(identity?.provider === 'clerk' && identity.sessionId && identity.subject === subject && admin?.active === true);
}

const identifier = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const hash = () => createHash('sha256');

// NDJSON is a migration transport, not a SQLite .dump. A terminal digest is
// mandatory. Consumers must reject missing footers and rehearse restoration.
export async function* exportRecords(db, bucket, checkLease) {
  const digest = hash();
  let records = 0;
  function record(value) {
    const line = JSON.stringify(value) + '\n';
    digest.update(line); records++;
    return new TextEncoder().encode(line);
  }
  checkLease();
  yield record({ kind: 'header', format: 'faultcite-migration-v1', restoreVerified: false });
  const schema = await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' ORDER BY type,name").all();
  if (!schema.success) throw new Error('Schema read failed');
  for (const entry of schema.results) {
    checkLease();
    if (entry.type === 'table' && /CREATE\s+VIRTUAL\s+TABLE/i.test(entry.sql || '')) throw new Error('Virtual tables require a reviewed exporter');
    yield record({ kind: 'schema', ...entry });
  }
  for (const table of schema.results.filter(x => x.type === 'table')) {
    const columns = await db.prepare(`PRAGMA table_xinfo(${identifier(table.name)})`).all();
    if (!columns.success || !columns.results.length) throw new Error('Column inventory failed');
    const writable = columns.results.filter(x => x.hidden === 0);
    const names = writable.map(x => x.name);
    const flags = await db.prepare('PRAGMA table_list').all();
    const info = flags.results?.find(x => x.name === table.name && x.schema === 'main');
    if (!flags.success || !info) throw new Error('Table layout unavailable');
    if (info.wr === 0) {
      const alias = ['rowid', '_rowid_', 'oid'].find(x => !columns.results.some(c => c.name.toLowerCase() === x));
      if (!alias) throw new Error('Shadowed rowid requires reviewed exporter');
      names.unshift(alias);
    }
    // SQL literals preserve 64-bit integers, BLOBs and embedded NUL text without
    // converting integers to imprecise JavaScript numbers.
    const values = names.map(name => {
      const col = identifier(name);
      return `CASE typeof(${col}) WHEN 'text' THEN 'CAST(X''' || hex(CAST(${col} AS BLOB)) || ''' AS TEXT)' ELSE quote(${col}) END`;
    }).join(" || ',' || ");
    const prefix = `INSERT INTO ${identifier(table.name)} (${names.map(identifier).join(',')}) VALUES (`;
    let offset = 0;
    while (true) {
      checkLease();
      const page = await db.prepare(`SELECT ${literal(prefix)} || ${values} || ');' AS statement FROM ${identifier(table.name)} LIMIT 20 OFFSET ?`).bind(offset).all();
      if (!page.success) throw new Error('Table read failed');
      for (const row of page.results) yield record({ kind: 'row', table: table.name, sql: row.statement });
      offset += page.results.length;
      if (page.results.length < 20) break;
    }
    yield record({ kind: 'table-end', table: table.name, rows: offset });
  }
  // AUTOINCREMENT high-water marks are not application tables, but must survive restore.
  const seq = await db.prepare("SELECT name FROM sqlite_schema WHERE name = 'sqlite_sequence'").all();
  if (!seq.success) throw new Error('Sequence inventory failed');
  if (seq.results.length) {
    const rows = await db.prepare('SELECT name, CAST(seq AS TEXT) AS seq FROM sqlite_sequence ORDER BY name').all();
    if (!rows.success) throw new Error('Sequence read failed');
    yield record({ kind: 'sequences', rows: rows.results });
  }
  let cursor;
  const seenCursors = new Set();
  do {
    checkLease();
    const page = await bucket.list({ limit: 100, cursor, include: ['httpMetadata', 'customMetadata'] });
    for (const listed of page.objects) {
      checkLease();
      const object = await bucket.get(listed.key, { onlyIf: { etagMatches: listed.etag } });
      if (!object?.body || object.version !== listed.version) throw new Error('Object missing or changed');
      yield record({ kind: 'file', key: listed.key, size: object.size, etag: object.etag, version: object.version, uploaded: object.uploaded, httpMetadata: object.httpMetadata, customMetadata: object.customMetadata, storageClass: object.storageClass });
      const contentHash = hash();
      let size = 0;
      const reader = object.body.getReader();
      try {
        while (true) {
          checkLease();
          const chunk = await reader.read();
          if (chunk.done) break;
          contentHash.update(chunk.value); size += chunk.value.byteLength;
          for (let start = 0; start < chunk.value.byteLength; start += 65536) {
            yield record({ kind: 'file-chunk', data: Buffer.from(chunk.value.subarray(start, start + 65536)).toString('base64') });
          }
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
      if (size !== object.size) throw new Error('Object length mismatch');
      yield record({ kind: 'file-end', key: listed.key, bytes: size, sha256: contentHash.digest('hex') });
    }
    if (page.truncated && (!page.cursor || seenCursors.has(page.cursor))) throw new Error('Invalid bucket pagination');
    cursor = page.truncated ? page.cursor : undefined;
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  checkLease();
  yield new TextEncoder().encode(JSON.stringify({ kind: 'complete', records, sha256: digest.digest('hex') }) + '\n');
}

export function exportStream(iterator) {
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close(); else controller.enqueue(next.value);
      } catch { await iterator.return(); controller.error(new Error('Export incomplete; discard this download')); }
    },
    async cancel() { await iterator.return(); },
  });
}
