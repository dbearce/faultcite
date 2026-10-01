// Admission control only. This does NOT drain already-admitted requests,
// waitUntil work, old deployments, or writers using storage directly.
// Platform-served static assets may bypass fetch; only Worker admissions
// are governed here. Static delivery is not evidence of a write-pause failure.
// Never use this state alone to certify a consistent backup.
export function writePauseState(config) {
  if (config.enabled === undefined || config.enabled === 'false') return 'off';
  if (config.enabled !== 'true' || typeof config.id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(config.id)) return 'invalid';
  return 'paused';
}

export function writePauseResponse(request, config) {
  const state = writePauseState(config);
  if (state === 'off') return null;
  // This only admits a request to protected handlers; it never grants access.
  // No custom header, cookie, user role, or HTTP read method bypasses the gate.
  if (state === 'paused' && isProtectedMaintenanceRequest(request)) return null;
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0',
    'retry-after': '60',
    'x-faultcite-write-pause': state,
  };
  return new Response(request.method === 'HEAD' ? null : JSON.stringify({
    error: 'FaultCite is temporarily paused for maintenance. Please try again later.',
    code: 'MAINTENANCE_PAUSED',
  }), { status: 503, headers });
}

// Dispatch exception only: these handlers independently authenticate and
// authorize every operation. Never grant access based on this predicate.
export function isProtectedMaintenanceRequest(request) {
  const url = new URL(request.url);
  return request.method === 'POST' && !url.search &&
    ['/api/admin/migration-export', '/api/admin/maintenance-control'].includes(url.pathname);
}
