import { exportRecords } from './migration-export.mjs';

// Acquires a persistent exclusive export ticket before reading business data.
// Cancellation, failed reads, or failed completion leave the ticket unresolved.
export async function drainedExportRecords(db, bucket, drain, pauseId, lease) {
  lease();
  const receipt = await drain.drainReceipt();
  if (receipt.pauseId !== pauseId) throw new Error('Pause identity mismatch');
  const ticket = await drain.beginExport(receipt);
  return (async function* () {
    yield* exportRecords(db, bucket, lease);
    lease();
    await drain.complete(ticket);
  })();
}
