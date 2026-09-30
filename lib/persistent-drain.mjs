/**
 * Persistent admission protocol for cooperating writers, NOT a production freeze
 * certificate. Old deployments, direct storage clients, detached work and other
 * writers bypassing this protocol are outside its scope. The caller must retain
 * its ticket until ALL effects (including streams/background work) have settled.
 * A lost/unresolved ticket intentionally blocks draining indefinitely. No TTL,
 * automatic repair, forced completion or schema creation is provided here.
 * Operations require trusted server-side callers; this module is not an auth API.
 */
export function createPersistentDrain(db) {
  if (!db || typeof db.prepare !== 'function') throw new Error('D1 binding required');
  // Read replication must not turn a stale read into a drained assertion.
  const connection = () => typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
  const query = async (sql, ...values) => {
    try { return await connection().prepare(sql).bind(...values).first(); }
    catch { throw new Error('Drain storage unavailable'); }
  };
  const stateColumns = `epoch, pause_generation AS pauseGeneration, paused, pause_id AS pauseId,
    (SELECT COUNT(*) FROM _faultcite_drain_tickets) AS pending`;
  const stateSql = `SELECT ${stateColumns}
    FROM _faultcite_drain_state WHERE singleton = 1`;
  const normalize = row => {
    if (!row || !Number.isSafeInteger(row.epoch) || row.epoch < 1 ||
      !Number.isSafeInteger(row.pauseGeneration) || row.pauseGeneration < 0 ||
      ![0, 1].includes(row.paused) || !Number.isSafeInteger(row.pending) || row.pending < 0 ||
      (row.paused === 1 && !validId(row.pauseId))) throw new Error('Drain state unavailable');
    return Object.freeze({ ...row, paused: row.paused === 1,
      drained: row.paused === 1 && row.pending === 0,
      scope: 'cooperating-writers-only', productionAcceptance: false });
  };
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
  const status = async () => normalize(await query(stateSql));
  return Object.freeze({
    status,
    async admit() {
      const id = crypto.randomUUID();
      const ticket = await query(`INSERT INTO _faultcite_drain_tickets(id, epoch, kind)
        SELECT ?, epoch, 'writer' FROM _faultcite_drain_state WHERE singleton = 1 AND paused = 0
        RETURNING id, epoch, kind`, id);
      if (!ticket) throw new Error('Admissions paused or drain state unavailable');
      return Object.freeze(ticket);
    },
    async beginExport(receipt) {
      if (!receipt || !Number.isSafeInteger(receipt.epoch) ||
        !Number.isSafeInteger(receipt.pauseGeneration) || receipt.pauseGeneration < 1 || !validId(receipt.pauseId) ||
        receipt.paused !== true || receipt.pending !== 0) throw new Error('Current drained receipt required');
      const ticket = await query(`INSERT INTO _faultcite_drain_tickets(id, epoch, kind)
        SELECT ?, epoch, 'export' FROM _faultcite_drain_state
        WHERE singleton = 1 AND paused = 1 AND epoch = ? AND pause_id = ? AND pause_generation = ?
        AND NOT EXISTS (SELECT 1 FROM _faultcite_drain_tickets)
        RETURNING id, epoch, kind`, crypto.randomUUID(), receipt.epoch, receipt.pauseId, receipt.pauseGeneration);
      if (!ticket) throw new Error('Current drained receipt required');
      return Object.freeze(ticket);
    },
    async complete(ticket) {
      if (!ticket || !validId(ticket.id) || !Number.isSafeInteger(ticket.epoch) ||
        !['writer', 'export'].includes(ticket.kind)) throw new Error('Invalid ticket');
      const removed = await query(`DELETE FROM _faultcite_drain_tickets WHERE id = ? AND epoch = ?
        AND kind = ?
        AND epoch = (SELECT epoch FROM _faultcite_drain_state WHERE singleton = 1)
        RETURNING id`, ticket.id, ticket.epoch, ticket.kind);
      if (!removed) throw new Error('Unknown or stale ticket');
    },
    async pause(pauseId) {
      if (!validId(pauseId)) throw new Error('Invalid pause ID');
      const changed = await query(`UPDATE _faultcite_drain_state SET paused = 1, pause_id = ?, pause_generation = pause_generation + 1
        WHERE singleton = 1 AND paused = 0 AND pause_generation < 9007199254740991 RETURNING ${stateColumns}`, pauseId);
      if (!changed) throw new Error('Already paused or drain state unavailable');
      return normalize(changed);
    },
    async drainReceipt() {
      const state = await status();
      if (!state.drained) throw new Error('Not drained');
      return state;
    },
    // Availability recovery only: this does NOT drain, clear uncertain tickets,
    // certify a backup, or override an export lock. The writer epoch is preserved
    // so legitimately settling writers can still complete their own tickets.
    async abortPause(receipt) {
      if (!receipt || !Number.isSafeInteger(receipt.epoch) ||
        !Number.isSafeInteger(receipt.pauseGeneration) || receipt.pauseGeneration < 1 ||
        !validId(receipt.pauseId) || receipt.paused !== true) {
        throw new Error('Current pause receipt required');
      }
      const changed = await query(`UPDATE _faultcite_drain_state SET paused = 0, pause_id = NULL
        WHERE singleton = 1 AND paused = 1 AND epoch = ? AND pause_id = ? AND pause_generation = ?
        AND NOT EXISTS (SELECT 1 FROM _faultcite_drain_tickets WHERE kind = 'export')
        RETURNING ${stateColumns}`, receipt.epoch, receipt.pauseId, receipt.pauseGeneration);
      if (!changed) throw new Error('Current pause receipt without export lock required');
      return Object.freeze({ ...normalize(changed), maintenanceAborted: true,
        backupVerified: false, unresolvedTicketsRetained: true });
    },
    async resume(receipt) {
      if (!receipt || !Number.isSafeInteger(receipt.epoch) ||
        !Number.isSafeInteger(receipt.pauseGeneration) || receipt.pauseGeneration < 1 || !validId(receipt.pauseId) ||
        receipt.paused !== true || receipt.pending !== 0) throw new Error('Current drained receipt required');
      const changed = await query(`UPDATE _faultcite_drain_state SET paused = 0, pause_id = NULL, epoch = epoch + 1
        WHERE singleton = 1 AND paused = 1 AND epoch = ? AND epoch < 9007199254740991 AND pause_id = ? AND pause_generation = ?
        AND NOT EXISTS (SELECT 1 FROM _faultcite_drain_tickets) RETURNING ${stateColumns}`, receipt.epoch, receipt.pauseId, receipt.pauseGeneration);
      if (!changed) throw new Error('Current drained receipt required');
      return normalize(changed);
    },
  });
}
