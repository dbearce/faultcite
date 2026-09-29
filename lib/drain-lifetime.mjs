/**
 * Tracks one already-admitted request; complete closes its persistent ticket.
 * Every side effect MUST be awaited by handler or registered with the supplied
 * context. Detached work, scheduled/queue handlers, old deployments and direct
 * storage writers are outside this contract. Runtime termination leaves the
 * ticket unresolved; there is deliberately no timeout-based success or retry.
 */
export async function runTrackedRequest(handler, request, env, ctx, { complete }) {
  if (typeof handler !== 'function' || typeof complete !== 'function' || typeof ctx?.waitUntil !== 'function') {
    throw new TypeError('Handler, complete callback and execution context required');
  }
  let pending = 1; // Includes handler finally blocks.
  let failure;
  let sealed = false;
  let resolveLifetime;
  let rejectLifetime;
  const lifetime = new Promise((resolve, reject) => {
    resolveLifetime = resolve;
    rejectLifetime = reject;
  });
  // Register before invoking application code. Preserve the native receiver.
  ctx.waitUntil(lifetime);
  const fail = error => { failure ||= error instanceof Error ? error : new Error('Tracked work failed'); };
  const settle = () => {
    pending -= 1;
    if (pending !== 0 || sealed) return;
    sealed = true;
    if (failure) { rejectLifetime(failure); return; }
    // No retry: an ambiguous completion failure must not clear another ticket.
    Promise.resolve().then(complete).then(resolveLifetime, rejectLifetime);
  };
  const trackedContext = new Proxy(ctx, {
    get(target, property) {
      if (property === 'waitUntil') return promise => {
        if (sealed) throw new Error('Cannot register work after tracked lifetime closed');
        pending += 1;
        Promise.resolve(promise).then(settle, error => { fail(error); settle(); });
      };
      if (property === 'passThroughOnException') return () => {
        const error = new Error('passThroughOnException is forbidden for tracked requests');
        fail(error);
        throw error;
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  try {
    const response = await handler(request, env, trackedContext);
    if (!(response instanceof Response)) throw new TypeError('Handler must return a Response');
    if (response.status === 101 || response.webSocket) throw new Error('WebSocket lifetimes are not supported');
    if (response.status >= 500) fail(new Error('Server error response leaves admission unresolved'));
    if (!response.body) return response;
    const reader = response.body.getReader();
    pending += 1;
    let finished = false;
    const finish = error => {
      if (finished) return;
      finished = true;
      if (error) fail(error);
      reader.releaseLock();
      settle();
    };
    // Pull only on demand: no full-body buffering or eager drain before delivery.
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) { controller.close(); finish(); }
          else controller.enqueue(value);
        } catch (error) { fail(error); controller.error(error); finish(); }
      },
      async cancel(reason) {
        fail(new Error('Response consumption cancelled'));
        // A pending read can settle during cancellation, before the underlying
        // source's cancel cleanup. Keep a separate lifetime reference for it.
        pending += 1;
        try { await reader.cancel(reason); } finally { finish(); settle(); }
      },
    }, { highWaterMark: 0 });
    return new Response(body, response);
  } catch (error) {
    fail(error);
    throw error;
  } finally {
    settle();
  }
}
