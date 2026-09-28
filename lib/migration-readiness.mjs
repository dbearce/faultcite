import { authorizedExporter } from './migration-export.mjs';

// Non-exporting development check. No database/file capabilities are accepted.
export async function migrationReadiness(request, config, getIdentity, findAdmin, now = Date.now) {
  const reply = (body, status) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  const url = new URL(request.url);
  if (config.enabled !== 'true' || !['https://staging.faultcite.com', 'http://localhost:5173'].includes(url.origin)) return reply({ error: 'Not found' }, 404);
  if (request.method !== 'POST' || request.headers.get('origin') !== url.origin || request.headers.get('x-faultcite-readiness') !== 'check') return reply({ error: 'Forbidden' }, 403);
  const expiry = Date.parse(config.expiresAt || '');
  const validLease = () => Number.isFinite(expiry) && expiry > now() && expiry - now() <= 15 * 60 * 1000 && Boolean(config.subject);
  if (!validLease()) return reply({ error: 'Forbidden' }, 403);
  try {
    const identity = await getIdentity();
    if (!identity || identity.provider !== 'clerk' || !identity.sessionId || identity.subject !== config.subject) return reply({ error: 'Forbidden' }, 403);
    const admin = await findAdmin(identity.subject);
    if (!validLease() || !authorizedExporter(identity, admin, config.subject)) return reply({ error: 'Forbidden' }, 403);
    return reply({ administratorIdentityVerified: true, exportPerformed: false, maintenanceVerified: false, productionAcceptance: false }, 200);
  } catch {
    return reply({ error: 'Readiness verification unavailable' }, 503);
  }
}
