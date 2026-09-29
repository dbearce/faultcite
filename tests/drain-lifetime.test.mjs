import test from 'node:test';
import assert from 'node:assert/strict';
import { runTrackedRequest } from '../lib/drain-lifetime.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(complete) {
  const promises = [];
  let completions = 0;
  const ctx = { waitUntil(promise) { assert.equal(this, ctx); promises.push(promise); promise.catch(() => {}); } };
  return {
    run: handler => runTrackedRequest(handler, new Request('https://example.test'), {}, ctx, {
      complete: async () => { completions++; await complete?.(); },
    }),
    done: () => Promise.all(promises),
    count: () => completions,
  };
}

test('no-body response completes exactly once after handler finally cleanup', async () => {
  const f = fixture(); const cleanup = deferred();
  const response = f.run(async () => { try { return new Response(null, { status: 204 }); } finally { await cleanup.promise; } });
  await tick(); assert.equal(f.count(), 0);
  cleanup.resolve(); assert.equal((await response).status, 204);
  await f.done(); assert.equal(f.count(), 1);
});

test('waits for pending background work and nested waitUntil registrations', async () => {
  const f = fixture(); const outer = deferred(); const inner = deferred();
  await f.run(async (_request, _env, ctx) => {
    ctx.waitUntil(outer.promise.then(() => { ctx.waitUntil(inner.promise); }));
    return new Response(null, { status: 204 });
  });
  outer.resolve(); await tick(); assert.equal(f.count(), 0);
  inner.resolve(); await f.done(); assert.equal(f.count(), 1);
});

test('stream is not eagerly consumed and completion waits for EOF', async () => {
  const f = fixture(); let pulls = 0;
  const response = await f.run(() => new Response(new ReadableStream({ pull(controller) {
    pulls++; if (pulls === 1) controller.enqueue(new Uint8Array([42])); else controller.close();
  } }, { highWaterMark: 0 })));
  await tick(); assert.equal(pulls, 0); assert.equal(f.count(), 0);
  const reader = response.body.getReader();
  assert.deepEqual((await reader.read()).value, new Uint8Array([42])); assert.equal(f.count(), 0);
  assert.equal((await reader.read()).done, true);
  await f.done(); assert.equal(f.count(), 1);
});

test('stream error leaves ticket unresolved', async () => {
  const f = fixture();
  const response = await f.run(() => new Response(new ReadableStream({ pull(controller) { controller.error(new Error('stream failure')); } })));
  await assert.rejects(response.text(), /stream failure/);
  await assert.rejects(f.done(), /stream failure/); assert.equal(f.count(), 0);
});

test('cancellation awaits underlying cleanup but never completes ticket', async () => {
  const f = fixture(); const cleanup = deferred();
  const response = await f.run(() => new Response(new ReadableStream({ cancel() { return cleanup.promise; } })));
  const cancelling = response.body.cancel();
  await tick(); assert.equal(f.count(), 0);
  cleanup.resolve(); await cancelling;
  await assert.rejects(f.done(), /cancelled/); assert.equal(f.count(), 0);
});

test('handler exception and rejected background work leave tickets unresolved', async () => {
  const a = fixture();
  await assert.rejects(a.run(() => { throw new Error('handler failure'); }), /handler failure/);
  await assert.rejects(a.done(), /handler failure/); assert.equal(a.count(), 0);
  const b = fixture();
  await b.run((_request, _env, ctx) => { ctx.waitUntil(Promise.reject(new Error('background failure'))); return new Response(null); });
  await assert.rejects(b.done(), /background failure/); assert.equal(b.count(), 0);
});

test('pending read cancellation tracks delayed source cancellation cleanup', async () => {
  const f = fixture(); const cleanup = deferred();
  const response = await f.run(() => new Response(new ReadableStream({ cancel() { return cleanup.promise; } })));
  const reader = response.body.getReader();
  const read = reader.read(); await tick();
  let lifetimeSettled = false;
  const observed = f.done().catch(() => { lifetimeSettled = true; });
  const cancelled = reader.cancel();
  await read; await tick(); assert.equal(lifetimeSettled, false);
  cleanup.resolve(); await cancelled; await observed;
  assert.equal(lifetimeSettled, true); assert.equal(f.count(), 0);
});

test('5xx response and caught passThrough attempt fail closed', async () => {
  const a = fixture(); assert.equal((await a.run(() => new Response(null, { status: 503 }))).status, 503);
  await assert.rejects(a.done(), /Server error/); assert.equal(a.count(), 0);
  const b = fixture();
  await b.run((_request, _env, ctx) => { assert.throws(() => ctx.passThroughOnException(), /forbidden/); return new Response(null); });
  await assert.rejects(b.done(), /forbidden/); assert.equal(b.count(), 0);
});

test('completion callback failure is observed by waitUntil without retry', async () => {
  const f = fixture(() => { throw new Error('completion failed'); });
  await f.run(() => new Response(null));
  await assert.rejects(f.done(), /completion failed/); assert.equal(f.count(), 1);
});

test('stream EOF cannot complete while background work is still pending', async () => {
  const f = fixture(); const background = deferred();
  const response = await f.run((_request, _env, ctx) => { ctx.waitUntil(background.promise); return new Response('ok'); });
  assert.equal(await response.text(), 'ok'); assert.equal(f.count(), 0);
  background.resolve(); await f.done(); assert.equal(f.count(), 1);
});
