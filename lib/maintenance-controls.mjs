import { authorizedExporter } from './migration-export.mjs';
import { writePauseState } from './write-pause.mjs';

const route = '/api/admin/maintenance-control';
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) => object(value) && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
const receiptKeys = ['epoch', 'pauseGeneration', 'pauseId', 'paused', 'pending'];
const validReceipt = value => keys(value, receiptKeys) && Number.isSafeInteger(value.epoch) && value.epoch >= 1 &&
  Number.isSafeInteger(value.pauseGeneration) && value.pauseGeneration >= 1 && validId(value.pauseId) &&
  value.paused === true && Number.isSafeInteger(value.pending) && value.pending >= 0;

async function boundedJson(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '') ||
    (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity')) throw new Error('Invalid body');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096)) throw new Error('Invalid body');
  if (!request.body) throw new Error('Invalid body');
  const reader = request.body.getReader();
  const bytes = new Uint8Array(4096);
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.byteLength > bytes.length) {
        await reader.cancel();
        throw new Error('Invalid body');
      }
      bytes.set(value, size); size += value.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
  } finally { reader.releaseLock(); }
}

// Development-only operational control. Authentication never bootstraps users or
// grants roles. No export, ticket deletion, force-resume or production enablement.
export async function maintenanceControl(request, config, getIdentity, findAdmin, getDrain, now = Date.now) {
  const reply = (body, status) => Response.json(body, { status, headers: {
    'cache-control': 'private, no-store, max-age=0', 'x-content-type-options': 'nosniff',
  } });
  const url = new URL(request.url);
  if (config.enabled !== 'true' || !['https://staging.faultcite.com', 'http://localhost:5173'].includes(url.origin) ||
    url.pathname !== route || url.search) return reply({ error: 'Not found' }, 404);
  if (request.method !== 'POST' || request.headers.get('origin') !== url.origin ||
    (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin') ||
    request.headers.get('x-faultcite-maintenance') !== 'control') return reply({ error: 'Forbidden' }, 403);
  const expires = Date.parse(config.expiresAt || '');
  const leaseValid = () => { const time = now(); return Number.isFinite(expires) && expires > time &&
    expires - time <= 900000 && typeof config.subject === 'string' && config.subject.length > 0; };
  if (!leaseValid()) return reply({ error: 'Forbidden' }, 403);
  try {
    const identity = await getIdentity();
    if (!identity || identity.provider !== 'clerk' || !identity.sessionId || identity.subject !== config.subject) return reply({ error: 'Forbidden' }, 403);
    const admin = await findAdmin(identity.subject);
    if (!leaseValid() || !authorizedExporter(identity, admin, config.subject)) return reply({ error: 'Forbidden' }, 403);
    let body;
    try { body = await boundedJson(request); } catch { return reply({ error: 'Invalid maintenance request' }, 400); }
    if (!object(body)) return reply({ error: 'Invalid maintenance request' }, 400);
    const { operation } = body;
    const valid = operation === 'status' ? keys(body, ['operation']) : operation === 'pause' ?
      keys(body, ['operation', 'pauseId', 'confirmation']) && validId(body.pauseId) && body.confirmation === 'PAUSE-staging' :
      ['abort', 'resume'].includes(operation) && keys(body, ['operation', 'receipt', 'confirmation']) &&
      validReceipt(body.receipt) && body.confirmation === `${operation.toUpperCase()}-staging` &&
      (operation !== 'resume' || body.receipt.pending === 0);
    if (!valid) return reply({ error: 'Invalid maintenance request' }, 400);
    // Recheck after request streaming: an expired session lease cannot mutate.
    if (!leaseValid()) return reply({ error: 'Forbidden' }, 403);
    if (config.trackingEnabled !== 'true') return reply({ error: 'Persistent tracking is not enabled' }, 409);
    const environmentWritePause = writePauseState({ enabled: config.pauseEnabled, id: config.pauseId });
    if (operation === 'pause' && (environmentWritePause === 'invalid' ||
      (environmentWritePause === 'paused' && config.pauseId !== body.pauseId))) {
      return reply({ error: 'Maintenance pause configuration conflicts with this request' }, 409);
    }
    const drain = getDrain();
    const state = operation === 'status' ? await drain.status() : operation === 'pause' ? await drain.pause(body.pauseId) :
      operation === 'abort' ? await drain.abortPause(body.receipt) : await drain.resume(body.receipt);
    return reply({ operation, receipt: Object.fromEntries(receiptKeys.map(key => [key, state[key]])),
      drained: state.drained, scope: 'cooperating-writers-only', environmentWritePause,
      environmentWritePauseMustBeDisabled: environmentWritePause !== 'off',
      cooperatingAdmissionsOpen: state.paused === false,
      applicationWritesResumed: false, // Requires separate live health/write verification.
      unresolvedTicketsRetained: operation === 'abort',
      backupVerified: false, restorationVerified: false, productionAcceptance: false,
    }, 200);
  } catch {
    // A failed response may follow a committed write. Inspect status; never
    // blindly retry mutation or clear uncertain writer/export tickets.
    return reply({ error: 'Maintenance operation unavailable; inspect status before retrying', outcomeUnknown: true }, 503);
  }
}
