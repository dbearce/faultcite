// TEST-ONLY protocol model. Not imported by production code.
// Calls execute synchronously on one shared coordinator to model serialization.
// This is NOT a distributed lock, persistent ticket store, or proof that old
// deployments, direct clients, response streams, or waitUntil work have drained.
// run() must receive a promise covering ALL work, including finally cleanup.
export function createRehearsalDrain() {
  let epoch = 1;
  let paused = false;
  let nextTicket = 0;
  let receipt = null;
  const pending = new Map();

  const status = () => Object.freeze({
    testOnly: true, distributedRuntimeVerified: false,
    epoch, paused, pending: pending.size,
    drained: paused && pending.size === 0,
  });
  const admit = () => {
    if (paused) throw new Error('Admissions paused');
    const ticket = Object.freeze({ epoch, id: ++nextTicket });
    pending.set(ticket, 'running');
    return ticket;
  };
  const complete = ticket => {
    // Identity checks prevent stale, duplicate, or reconstructed tickets from
    // completing another request. Completion is an explicit caller assertion.
    if (!pending.has(ticket) || ticket.epoch !== epoch) throw new Error('Unknown or stale ticket');
    if (pending.get(ticket) !== 'running') throw new Error('Unresolved work cannot be cleared');
    pending.delete(ticket);
  };
  return Object.freeze({
    status, admit, complete,
    pause() { paused = true; return status(); },
    async run(allWork) {
      const ticket = admit();
      try {
        const value = await allWork();
        complete(ticket);
        return value;
      } catch (error) {
        // Conservative: failure is not evidence all effects have settled.
        // No timeout, automatic ticket removal, or force-resume escape hatch.
        if (pending.has(ticket)) pending.set(ticket, 'unresolved');
        throw error;
      }
    },
    drainReceipt() {
      if (!paused || pending.size) throw new Error('Not drained');
      receipt ||= Object.freeze({ testOnly: true, distributedRuntimeVerified: false, epoch });
      return receipt;
    },
    resume(verifiedReceipt) {
      if (!paused || pending.size || !receipt || verifiedReceipt !== receipt) throw new Error('Current drained receipt required');
      epoch += 1;
      paused = false;
      receipt = null;
      return status();
    },
  });
}
