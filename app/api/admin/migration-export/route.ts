import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '../../../auth';
import { getDb } from '../../../../db';
import { authIdentities, platformAdmins } from '../../../../db/schema';
import { authorizedExporter, exportGate, exportRecords, exportStream } from '../../../../lib/migration-export.mjs';

export async function POST(request: Request) {
  const { env } = await import('cloudflare:workers');
  const config = {
    enabled: env.FAULTCITE_MIGRATION_EXPORT_ENABLED,
    expiresAt: env.FAULTCITE_MIGRATION_EXPORT_EXPIRES_AT,
    subject: env.FAULTCITE_MIGRATION_EXPORT_SUBJECT,
    frozen: env.FAULTCITE_MIGRATION_SOURCE_FROZEN,
    freezeReceipt: env.FAULTCITE_MIGRATION_FREEZE_RECEIPT,
  };
  const blocked = exportGate(request, config);
  if (blocked !== 200) return new Response(null, { status: blocked, headers: { 'cache-control': 'no-store' } });
  const identity = await getAuthUser();
  if (!identity || identity.provider !== 'clerk') return new Response(null, { status: 403 });
  // Read-only identity lookup: never initialize accounts, map email fallbacks,
  // increment rate-limit rows, or write audit records during a frozen snapshot.
  const db = await getDb();
  const [admin] = await db.select({ active: platformAdmins.active }).from(authIdentities)
    .innerJoin(platformAdmins, eq(platformAdmins.userId, authIdentities.userId))
    .where(and(eq(authIdentities.provider, 'clerk'), eq(authIdentities.providerSubject, identity.subject))).limit(1);
  if (!authorizedExporter(identity, admin, config.subject)) return new Response(null, { status: 403 });
  const lease = () => { if (exportGate(request, config) !== 200) throw new Error('Export lease expired'); };
  return new Response(exportStream(exportRecords(env.DB, env.BUCKET, lease)), { headers: {
    'content-type': 'application/x-ndjson',
    'content-disposition': 'attachment; filename="faultcite-migration.ndjson"',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  } });
}
