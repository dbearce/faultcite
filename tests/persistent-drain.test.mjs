import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createPersistentDrain } from '../lib/persistent-drain.mjs';

const schema = await readFile(new URL('../cloudflare/rehearsal/drain-schema.sql', import.meta.url), 'utf8');
function runtime(persist) {
  return new Miniflare(convertV4MiniflareOptions({ modules: true,
    compatibilityDate: '2026-09-01', script: 'export default { fetch() { return new Response("test"); } }',
    d1Databases: { DB: 'drain-fixture' }, ...(persist ? { resourcePersistencePath: persist } : {}),
  }));
}
async function setup(t) {
  const mf = runtime(); t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await db.exec(schema.replace(/--[^\n]*/g, '').replace(/\n/g, ' '));
  return { db, a: createPersistentDrain(db), b: createPersistentDrain(db) };
}

test('D1 atomic pause races ticket admissions from separate coordinators', async t => {
  const { a, b } = await setup(t);
  const results = await Promise.allSettled([
    ...Array.from({ length: 8 }, () => a.admit()), b.pause('pause-race-01'),
    ...Array.from({ length: 8 }, () => b.admit()),
  ]);
  assert.equal(results[8].status, 'fulfilled');
  const tickets = results.filter((r, i) => i !== 8 && r.status === 'fulfilled').map(r => r.value);
  assert.equal((await a.status()).pending, tickets.length);
  await assert.rejects(b.admit(), /paused/);
  for (const ticket of tickets) await b.complete(ticket);
  assert.equal((await a.drainReceipt()).drained, true);
});

test('unresolved ticket blocks receipt and forged resume; valid completion drains', async t => {
  const { a, b } = await setup(t);
  const ticket = await a.admit();
  const paused = await b.pause('pause-block-01');
  await assert.rejects(a.drainReceipt(), /Not drained/);
  await assert.rejects(a.resume({ ...paused, pending: 0 }), /receipt/);
  await assert.rejects(b.complete({ ...ticket, epoch: ticket.epoch + 1 }), /stale/);
  assert.equal((await b.status()).pending, 1);
  await b.complete(ticket);
  await assert.rejects(a.complete(ticket), /stale/);
  assert.equal((await a.drainReceipt()).productionAcceptance, false);
});

test('receipt rejected after resume and after a new pause with same ID', async t => {
  const { a, b } = await setup(t);
  await a.pause('pause-stale-01');
  const receipt = await a.drainReceipt();
  assert.equal((await b.resume(receipt)).epoch, receipt.epoch + 1);
  await assert.rejects(a.resume(receipt), /receipt/);
  await a.pause('pause-stale-01');
  await assert.rejects(b.resume(receipt), /receipt/);
  assert.equal((await a.status()).paused, true);
});

test('missing schema or singleton fails closed', async t => {
  const mf = runtime(); t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB'); const a = createPersistentDrain(db);
  await assert.rejects(a.admit()); await assert.rejects(a.status());
  await db.exec(schema.replace(/--[^\n]*/g, '').replace(/\n/g, ' '));
  await db.prepare('DELETE FROM _faultcite_drain_state').run();
  await assert.rejects(a.admit()); await assert.rejects(a.drainReceipt());
});

test('atomic export ticket blocks concurrent export, receipt and resume until completion', async t => {
  const { a, b } = await setup(t);
  await a.pause('pause-export-01');
  const receipt = await a.drainReceipt();
  const attempts = await Promise.allSettled([a.beginExport(receipt), b.beginExport(receipt)]);
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  const ticket = attempts.find(r => r.status === 'fulfilled').value;
  assert.equal(ticket.kind, 'export');
  await assert.rejects(b.resume(receipt), /receipt/);
  await assert.rejects(a.drainReceipt(), /Not drained/);
  await b.complete(ticket);
  await b.resume(receipt);
  await assert.rejects(a.beginExport(receipt), /receipt/);
});

test('tickets and pause survive a full Miniflare restart without expiry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fc-drain-'));
  let mf = runtime(dir);
  try {
    let db = await mf.getD1Database('DB');
    await db.exec(schema.replace(/--[^\n]*/g, '').replace(/\n/g, ' '));
    const a = createPersistentDrain(db); const ticket = await a.admit();
    await a.pause('pause-restart-01'); await mf.dispose();
    mf = runtime(dir); db = await mf.getD1Database('DB'); const b = createPersistentDrain(db);
    assert.equal((await b.status()).pending, 1);
    await assert.rejects(b.admit(), /paused/); await assert.rejects(b.drainReceipt(), /Not drained/);
    await b.complete(ticket); assert.equal((await b.drainReceipt()).drained, true);
  } finally { await mf.dispose(); await rm(dir, { recursive: true, force: true }); }
});
