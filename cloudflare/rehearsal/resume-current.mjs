import { randomBytes } from 'node:crypto';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

// One-off recovery of this exact synthetic run. No resource creation or deletion.
if (process.env.GITHUB_ACTIONS !== 'true' || process.env.REHEARSAL_CONFIRM !== 'REHEARSE-synthetic-only') throw new Error('Manual synthetic-only confirmation required');
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!/^[a-f0-9]{32}$/.test(account || '') || !token) throw new Error('Missing configured Cloudflare credentials');
const prefix = 'fc-rehearsal-36651610765-1-1df4f18b';
const databases = [
  { binding: 'SOURCE_DB', database_name: `${prefix}-source`, database_id: '1d3196f1-7b75-4759-9495-a3e8b472a21a' },
  { binding: 'TARGET_DB', database_name: `${prefix}-target`, database_id: '04287b4d-54d4-4969-88d1-0aa3ac1e54ea' },
];
const buckets = ['source', 'target'].map(side => ({ binding: `${side.toUpperCase()}_FILES`, bucket_name: `${prefix}-${side}` }));
const manifest = { prefix, resumedFromRun: '36651610765', syntheticOnly: true, productionAcceptance: false, resources: [
  ...databases.map(db => ({ type: 'd1', name: db.database_name, id: db.database_id })),
  ...buckets.map(bucket => ({ type: 'r2', name: bucket.bucket_name })),
  { type: 'worker', name: prefix },
], status: 'resume-started' };
const save = () => writeFile(resolve('rehearsal-result.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
async function api(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Cloudflare identity check failed (${response.status}); response withheld`);
  const json = await response.json();
  if (json.success !== true) throw new Error('Cloudflare identity check rejected');
  return json.result;
}
let folder;
await save();
try {
  for (const expected of databases) {
    const db = await api(`d1/database/${expected.database_id}`);
    if (db.uuid !== expected.database_id || db.name !== expected.database_name) throw new Error('Exact synthetic database identity mismatch');
  }
  for (const expected of buckets) {
    const bucket = await api(`r2/buckets/${expected.bucket_name}`);
    if (bucket.name !== expected.bucket_name) throw new Error('Exact synthetic bucket identity mismatch');
  }
  const worker = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${prefix}`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (worker.status !== 200) throw new Error('Exact existing synthetic Worker not verified');
  await worker.body?.cancel();
  const subdomain = (await api('workers/subdomain')).subdomain;
  if (!/^[a-z0-9-]+$/.test(subdomain || '')) throw new Error('Workers.dev subdomain unavailable');
  folder = await mkdtemp(join(tmpdir(), 'fc-rehearsal-resume-'));
  const config = { name: prefix, main: resolve('cloudflare/rehearsal/worker.mjs'), compatibility_date: '2026-09-15', compatibility_flags: ['nodejs_compat'], workers_dev: true, preview_urls: false, routes: [], d1_databases: databases, r2_buckets: buckets, vars: { REHEARSAL_GENERATION: randomBytes(16).toString('hex'), EXPIRES_AT: String(Date.now() + 10 * 60 * 1000) }, observability: { enabled: true, traces: { enabled: true } } };
  const configPath = join(folder, 'wrangler.json');
  const secretPath = join(folder, 'secrets.json');
  const rehearsalToken = randomBytes(32).toString('hex');
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  await writeFile(secretPath, JSON.stringify({ REHEARSAL_TOKEN: rehearsalToken }), { mode: 0o600 });
  manifest.status = 'exact-identities-verified'; await save();
  const deploy = spawnSync(resolve('node_modules/.bin/wrangler'), ['deploy', '--config', configPath, '--secrets-file', secretPath], { encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, timeout: 120000 });
  if (deploy.status !== 0) throw new Error('Synthetic Worker redeployment failed; output withheld');
  const url = `https://${prefix}.${subdomain}.workers.dev/rehearse`;
  manifest.generation = config.vars.REHEARSAL_GENERATION;
  let ready = false;
  manifest.readinessStatuses = [];
  // Poll only a read-only endpoint. Never retry the fixture-writing POST.
  for (let attempt = 0; attempt < 12; attempt++) {
    const probe = await fetch(url.replace('/rehearse', '/ready'), { headers: { Authorization: `Bearer ${rehearsalToken}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    manifest.readinessStatuses.push(probe.status);
    manifest.readinessGenerationMatched = probe.headers.get('x-rehearsal-generation') === config.vars.REHEARSAL_GENERATION;
    await save();
    if (probe.status === 200) {
      const state = await probe.json();
      if (!manifest.readinessGenerationMatched || state.ready !== true || state.expiresAt !== config.vars.EXPIRES_AT) throw new Error('Rehearsal readiness generation mismatch');
      ready = true;
      break;
    }
    await probe.body?.cancel();
    if (![401, 403, 404, 502, 503].includes(probe.status)) throw new Error(`Read-only readiness failed (${probe.status})`);
    if (attempt < 11) await delay(5000);
  }
  if (!ready) throw new Error('Current test credential readiness not established; fixture invocation not attempted');
  const postProbe = await fetch(url.replace('/rehearse', '/ready'), { method: 'POST', headers: { Authorization: `Bearer ${rehearsalToken}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  manifest.postReadinessStatus = postProbe.status;
  manifest.postReadinessGenerationMatched = postProbe.headers.get('x-rehearsal-generation') === config.vars.REHEARSAL_GENERATION;
  const postState = await postProbe.json().catch(() => ({}));
  manifest.postReadinessDiagnostics = { authorizationPresent: typeof postState.authorizationPresent === 'boolean' ? postState.authorizationPresent : null, bearerFormat: typeof postState.bearerFormat === 'boolean' ? postState.bearerFormat : null };
  await save();
  if (postProbe.status !== 200 || !manifest.postReadinessGenerationMatched || postState.ready !== true || postState.expiresAt !== config.vars.EXPIRES_AT) throw new Error('POST readiness not established; fixture invocation not attempted');
  const denied = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000) });
  manifest.unauthenticatedStatuses = [denied.status];
  manifest.anonymousGenerationMatched = denied.headers.get('x-rehearsal-generation') === config.vars.REHEARSAL_GENERATION;
  await denied.body?.cancel();
  await save();
  if (denied.status !== 401) throw new Error(`Unauthenticated check failed closed (${denied.status})`);
  manifest.status = 'authenticated-attempt-started'; await save();
  // Exactly one authenticated invocation. Existing fixture checks prevent overwrite.
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${rehearsalToken}` }, redirect: 'error', signal: AbortSignal.timeout(120000) });
  manifest.authenticatedStatus = response.status;
  manifest.authenticatedGenerationMatched = response.headers.get('x-rehearsal-generation') === config.vars.REHEARSAL_GENERATION;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    manifest.authenticationDiagnostics = {
      workerUnauthorized: body.error === 'Unauthorized',
      authorizationPresent: typeof body.authorizationPresent === 'boolean' ? body.authorizationPresent : null,
      bearerFormat: typeof body.bearerFormat === 'boolean' ? body.bearerFormat : null,
    };
    throw new Error(`Synthetic rehearsal failed (${response.status}); only non-secret diagnostics retained`);
  }
  if (!manifest.authenticatedGenerationMatched) throw new Error('Fixture response generation mismatch');
  const evidence = await response.json();
  if (evidence.syntheticHostedRestore !== 'passed' || evidence.productionAcceptance !== false || evidence.targetIsolationVerified !== true || evidence.persistentCoordinationVerified !== true || evidence.coordinationSchemaExcluded !== true || evidence.sourceAppAuthenticationVerified !== false) throw new Error('Invalid rehearsal result');
  manifest.evidence = evidence;
  manifest.status = 'synthetic-rehearsal-passed';
} catch (error) {
  manifest.status = 'failed';
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (folder) await rm(folder, { recursive: true, force: true });
  await save();
  console.log('Exact synthetic recovery inventory saved. No new resources, production, DNS or billing changes.');
}

