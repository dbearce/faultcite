import { randomBytes } from 'node:crypto';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

// Intentionally callable only by an explicitly confirmed manual GitHub run.
if (process.env.GITHUB_ACTIONS !== 'true' || process.env.REHEARSAL_CONFIRM !== 'REHEARSE-synthetic-only') throw new Error('Manual synthetic-only confirmation required');
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!/^[a-f0-9]{32}$/.test(account || '') || !token) throw new Error('Missing configured Cloudflare credentials');
const run = process.env.GITHUB_RUN_ID;
const attempt = process.env.GITHUB_RUN_ATTEMPT;
if (!/^\d+$/.test(run || '') || !/^\d+$/.test(attempt || '')) throw new Error('Invalid run identity');
const prefix = `fc-rehearsal-${run}-${attempt}-${randomBytes(4).toString('hex')}`;
const folder = await mkdtemp(join(tmpdir(), 'fc-rehearsal-'));
const manifest = { prefix, syntheticOnly: true, productionAcceptance: false, resources: [], status: 'started' };
const manifestPath = resolve('rehearsal-result.json');
const save = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Cloudflare ${method} request failed (${response.status}); response withheld`);
  const json = await response.json();
  if (json.success !== true) throw new Error('Cloudflare operation rejected; response withheld');
  return json.result;
}
function wrangler(args) {
  const result = spawnSync(resolve('node_modules/.bin/wrangler'), args, { encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, timeout: 120000 });
  // Never dump CLI stdout/stderr: it may contain environment/secret information.
  if (result.status !== 0) throw new Error('Rehearsal Worker packaging/deployment failed; output withheld');
}
await save();
try {
  const subdomain = (await api('workers/subdomain')).subdomain;
  if (!/^[a-z0-9-]+$/.test(subdomain || '')) throw new Error('Workers.dev subdomain unavailable');
  const absentWorker = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${prefix}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (absentWorker.status !== 404) throw new Error('New Worker absence not proven; refuse deployment');
  // Fresh random names. CREATE conflict is fatal, never fall back to existing resources.
  const databases = [];
  const buckets = [];
  for (const side of ['source', 'target']) {
    const name = `${prefix}-${side}`;
    const db = await api('d1/database', 'POST', { name });
    if (!/^[a-f0-9-]{36}$/.test(db.uuid || '') || db.name !== name || databases.some(existing => existing.database_id === db.uuid)) throw new Error('Invalid or reused new database identity');
    databases.push({ binding: `${side.toUpperCase()}_DB`, database_name: name, database_id: db.uuid });
    manifest.resources.push({ type: 'd1', name, id: db.uuid }); await save();
    const absentBucket = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${name}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    if (absentBucket.status !== 404) throw new Error('New R2 bucket absence not proven; refuse creation');
    await api('r2/buckets', 'POST', { name });
    buckets.push({ binding: `${side.toUpperCase()}_FILES`, bucket_name: name });
    manifest.resources.push({ type: 'r2', name }); await save();
  }
  // Pinned workerd currently supports dates through 2026-09-15; use tested runtime.
  const config = { name: prefix, main: resolve('cloudflare/rehearsal/worker.mjs'), compatibility_date: '2026-09-15', compatibility_flags: ['nodejs_compat'], workers_dev: true, preview_urls: false, routes: [], d1_databases: databases, r2_buckets: buckets, vars: { EXPIRES_AT: String(Date.now() + 10 * 60 * 1000) }, observability: { enabled: true, traces: { enabled: true } } };
  const configPath = join(folder, 'wrangler.json');
  const secretPath = join(folder, 'secrets.json');
  const rehearsalToken = randomBytes(32).toString('hex');
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  await writeFile(secretPath, JSON.stringify({ REHEARSAL_TOKEN: rehearsalToken }), { mode: 0o600 });
  manifest.resources.push({ type: 'worker', name: prefix, creationAttempted: true }); await save();
  wrangler(['deploy', '--config', configPath, '--secrets-file', secretPath]);
  const url = `https://${prefix}.${subdomain}.workers.dev/rehearse`;
  const denied = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(30000) });
  if (denied.status !== 401) throw new Error('Unauthenticated access test failed');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${rehearsalToken}` }, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Synthetic rehearsal failed (${response.status}); body withheld`);
  const evidence = await response.json();
  if (evidence.syntheticHostedRestore !== 'passed' || evidence.productionAcceptance !== false) throw new Error('Invalid rehearsal result');
  manifest.evidence = evidence;
  manifest.status = 'synthetic-rehearsal-passed';
} catch (error) {
  manifest.status = 'failed';
  console.error(error.message);
  process.exitCode = 1;
} finally {
  // Only our newly-created private temporary folder, never repository/user paths.
  await rm(folder, { recursive: true, force: true });
  await save();
  console.log('Synthetic resource names and result saved. No existing resources, DNS or billing changed. Review isolated resources for later cleanup.');
}
