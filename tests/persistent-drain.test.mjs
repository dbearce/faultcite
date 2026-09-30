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

test('abort reopens admissions but retains uncertain writers and never certifies a backup', async t => {
  const { a, b } = await setup(t);
  const writer = await a.admit();
  const paused = await a.pause('pause-abort-01');
  const aborted = await b.abortPause(paused);
  assert.equal(aborted.paused, false);
  assert.equal(aborted.drained, false);
  assert.equal(aborted.backupVerified, false);
  assert.equal(aborted.productionAcceptance, false);
  assert.equal(aborted.pending, 1);
  assert.equal(aborted.epoch, writer.epoch);
  const nextWriter = await a.admit();
  assert.equal((await a.status()).pending, 2);
  await a.complete(nextWriter);
  const repaused = await a.pause('pause-abort-02');
  assert.equal(repaused.pending, 1);
  await assert.rejects(a.drainReceipt(), /Not drained/);
  await a.complete(writer);
  assert.equal((await a.drainReceipt()).drained, true);
});

test('abort invalidates old receipts even when the next pause reuses the same ID and epoch', async t => {
  const { a, b } = await setup(t);
  const first = await a.pause('pause-reuse-01');
  await b.abortPause(first);
  await assert.rejects(a.beginExport(first), /receipt/);
  const second = await a.pause('pause-reuse-01');
  assert.equal(second.epoch, first.epoch);
  assert.equal(second.pauseGeneration, first.pauseGeneration + 1);
  await assert.rejects(a.abortPause(first), /receipt/);
  await assert.rejects(a.beginExport(first), /receipt/);
  await assert.rejects(a.resume(first), /receipt/);
  const missingGeneration = { ...second }; delete missingGeneration.pauseGeneration;
  await assert.rejects(a.abortPause(missingGeneration), /receipt/);
  await assert.rejects(a.beginExport(missingGeneration), /receipt/);
  await assert.rejects(a.resume(missingGeneration), /receipt/);
  assert.equal((await a.status()).paused, true);
});

test('abort refuses an unresolved export lock without deleting it', async t => {
  const { a, b } = await setup(t);
  const receipt = await a.pause('pause-no-abort-01');
  const ticket = await a.beginExport(receipt);
  await assert.rejects(b.abortPause(receipt), /export lock/);
  assert.equal((await a.status()).paused, true);
  assert.equal((await a.status()).pending, 1);
  await assert.rejects(b.admit(), /paused/);
  await a.complete(ticket);
  assert.equal((await b.abortPause(receipt)).maintenanceAborted, true);
});

test('abort and export race atomically: exactly one wins', async t => {
  const { a, b } = await setup(t);
  const receipt = await a.pause('pause-abort-race');
  const results = await Promise.allSettled([a.abortPause(receipt), b.beginExport(receipt)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const state = await a.status();
  if (results[0].status === 'fulfilled') {
    assert.equal(state.paused, false); assert.equal(state.pending, 0);
    await assert.rejects(b.beginExport(receipt), /receipt/);
  } else {
    assert.equal(state.paused, true); assert.equal(state.pending, 1);
    await assert.rejects(a.abortPause(receipt), /export lock/);
    await b.complete(results[1].value);
  }
});

test('concurrent aborts cannot both succeed', async t => {
  const { a, b } = await setup(t);
  const writer = await a.admit();
  const receipt = await a.pause('pause-abort-twice');
  const results = await Promise.allSettled([a.abortPause(receipt), b.abortPause(receipt)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await a.status()).pending, 1);
  await a.complete(writer);
});

test('pause generation exhaustion and legacy schema fail closed', async t => {
  const { db, a } = await setup(t);
  await db.prepare('UPDATE _faultcite_drain_state SET pause_generation = ?').bind(Number.MAX_SAFE_INTEGER).run();
  await assert.rejects(a.pause('pause-overflow'), /unavailable/);
  assert.equal((await a.status()).paused, false);
  await db.exec('ALTER TABLE _faultcite_drain_state DROP COLUMN pause_generation');
  await assert.rejects(a.pause('pause-legacy'), /unavailable/);
  await assert.rejects(a.status(), /unavailable/);
});
