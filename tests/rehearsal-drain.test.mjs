import test from 'node:test';
import assert from 'node:assert/strict';
import { createRehearsalDrain } from '../lib/rehearsal-drain.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('slow upload and finally cleanup both finish before a receipt is available', async () => {
  const drain = createRehearsalDrain();
  const upload = deferred(), cleanup = deferred(), cleaning = deferred();
  const effects = [];
  const running = drain.run(async () => {
    try { await upload.promise; effects.push('object and row written'); }
    finally { cleaning.resolve(); await cleanup.promise; effects.push('temporary objects deleted'); }
  });
  drain.pause();
  assert.throws(() => drain.admit(), /paused/);
  assert.throws(() => drain.drainReceipt(), /Not drained/);
  upload.resolve();
  await cleaning.promise;
  assert.deepEqual(effects, ['object and row written']);
  assert.throws(() => drain.drainReceipt(), /Not drained/);
  cleanup.resolve();
  await running;
  assert.equal(drain.status().pending, 0);
  assert.equal(drain.drainReceipt().distributedRuntimeVerified, false);
});

test('failed work stays unresolved even after finally cleanup and repeated pause checks', async () => {
  const drain = createRehearsalDrain();
  let cleaned = false;
  await assert.rejects(drain.run(async () => {
    try { throw new Error('storage outcome uncertain'); }
    finally { cleaned = true; }
  }), /uncertain/);
  assert.equal(cleaned, true);
  for (let i = 0; i < 20; i += 1) {
    drain.pause();
    assert.equal(drain.status().pending, 1);
    assert.throws(() => drain.drainReceipt(), /Not drained/);
    assert.throws(() => drain.resume({ epoch: 1 }), /receipt required/);
  }
});

test('abandoned tickets never automatically expire or yield a receipt', () => {
  const drain = createRehearsalDrain();
  drain.admit();
  drain.pause();
  assert.equal(drain.status().drained, false);
  assert.throws(() => drain.drainReceipt(), /Not drained/);
  assert.throws(() => drain.resume(null), /receipt required/);
});

test('serialized pause races count prior admission and reject later admission', async () => {
  const drain = createRehearsalDrain();
  const results = await Promise.allSettled([
    Promise.resolve().then(() => drain.admit()),
    Promise.resolve().then(() => drain.pause()),
    Promise.resolve().then(() => drain.admit()),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[2].status, 'rejected');
  assert.equal(drain.status().pending, 1);
  drain.complete(results[0].value);
  assert.equal(drain.status().drained, true);
  assert.equal(drain.drainReceipt().epoch, 1);
});

test('resume requires current receipt and advances epoch without accepting stale tickets', () => {
  const drain = createRehearsalDrain();
  assert.throws(() => drain.drainReceipt(), /Not drained/);
  const ticket = drain.admit();
  assert.throws(() => drain.complete({ ...ticket }), /Unknown/);
  drain.complete(ticket);
  assert.throws(() => drain.complete(ticket), /Unknown/);
  drain.pause();
  const receipt = drain.drainReceipt();
  assert.throws(() => drain.resume({ ...receipt }), /receipt required/);
  assert.equal(drain.resume(receipt).epoch, 2);
  assert.throws(() => drain.complete(ticket), /Unknown/);
  drain.pause();
  assert.throws(() => drain.resume(receipt), /receipt required/);
  const next = drain.drainReceipt();
  assert.equal(next.epoch, 2);
  assert.equal(next.testOnly, true);
  assert.equal(drain.resume(next).paused, false);
});
