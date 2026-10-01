import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '../../../auth';
import { getDb } from '../../../../db';
import { authIdentities, platformAdmins } from '../../../../db/schema';
import { maintenanceControl } from '../../../../lib/maintenance-controls.mjs';
import { createPersistentDrain } from '../../../../lib/persistent-drain.mjs';

export async function POST(request: Request) {
  const { env } = await import('cloudflare:workers');
  return maintenanceControl(request, {
    enabled: env.FAULTCITE_MAINTENANCE_CONTROL_ENABLED,
    expiresAt: env.FAULTCITE_MAINTENANCE_CONTROL_EXPIRES_AT,
    subject: env.FAULTCITE_MAINTENANCE_CONTROL_SUBJECT,
    trackingEnabled: env.FAULTCITE_DRAIN_TRACKING_ENABLED,
    pauseEnabled: env.FAULTCITE_WRITE_PAUSE_ENABLED,
    pauseId: env.FAULTCITE_WRITE_PAUSE_ID,
  }, getAuthUser, async (subject: string) => {
    // Direct existing Clerk mapping only; never initialize/bootstrap accounts.
    const db = await getDb();
    const [admin] = await db.select({ active: platformAdmins.active }).from(authIdentities)
      .innerJoin(platformAdmins, eq(platformAdmins.userId, authIdentities.userId))
      .where(and(eq(authIdentities.provider, 'clerk'), eq(authIdentities.providerSubject, subject))).limit(1);
    return admin;
  }, () => createPersistentDrain(env.DB));
}
