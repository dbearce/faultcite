import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '../../../auth';
import { getDb } from '../../../../db';
import { authIdentities, platformAdmins } from '../../../../db/schema';
import { migrationReadiness } from '../../../../lib/migration-readiness.mjs';

export async function POST(request: Request) {
  const { env } = await import('cloudflare:workers');
  return migrationReadiness(request, {
    enabled: env.FAULTCITE_MIGRATION_READINESS_ENABLED,
    expiresAt: env.FAULTCITE_MIGRATION_READINESS_EXPIRES_AT,
    subject: env.FAULTCITE_MIGRATION_EXPORT_SUBJECT,
  }, getAuthUser, async (subject: string) => {
    // Existing mapping only: no account creation, email fallback, or role grants.
    const db = await getDb();
    const [admin] = await db.select({ active: platformAdmins.active }).from(authIdentities)
      .innerJoin(platformAdmins, eq(platformAdmins.userId, authIdentities.userId))
      .where(and(eq(authIdentities.provider, 'clerk'), eq(authIdentities.providerSubject, subject))).limit(1);
    return admin;
  });
}
