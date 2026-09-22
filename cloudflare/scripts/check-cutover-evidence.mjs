import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function validateCutoverEvidence(evidence, now = Date.now()) {
  const required = value => typeof value === 'string' && value.trim().length > 0 && !/TBD|REPLACE|PENDING/i.test(value);
  const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const time = Date.parse(evidence.verifiedAt);
  if (!Number.isFinite(time) || time > now || now - time > 86400000) throw new Error('Data reconciliation and backup evidence must be less than 24 hours old');
  if (!required(evidence.approvedBy) || evidence.hostname !== 'app.faultcite.com' || evidence.targetWorker !== 'faultcite-production') throw new Error('Missing approved production target');
  if (!required(evidence.sourceDatabaseRef) || !required(evidence.sourceBucketRef) || evidence.targetDatabaseName !== 'faultcite-production-db' || evidence.targetBucketName !== 'faultcite-production-files') throw new Error('Missing source/target storage identity');
  for (const kind of ['database', 'files']) {
    const item = evidence[kind];
    if (!item || !digest(item.sourceDigest) || item.sourceDigest !== item.targetDigest || !required(item.reconciliationReceipt)) throw new Error(`${kind}: source and target reconciliation missing or mismatched`);
    if (!required(item.protectedBackupReceipt) || item.restoreVerified !== true) throw new Error(`${kind}: protected backup and restore proof required`);
  }
  if (evidence.writesFrozen !== true || !required(evidence.writeFreezeReceipt)) throw new Error('A verified write freeze is required to prevent data loss during cutover');
  return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateCutoverEvidence(JSON.parse(readFileSync('docs/PRODUCTION_DATA_CONTINUITY.json', 'utf8')));
    console.log('Reviewed data continuity and protected recovery receipts are present.');
  } catch (error) {
    console.error(`Production cutover blocked: ${error.message}. See docs/PRODUCTION_CUTOVER.md. No production changes permitted.`);
    process.exitCode = 1;
  }
}
