import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const hostname = 'app.faultcite.com';
const service = 'faultcite-production';
const normalize = record => ({
  type: record.type, name: record.name, content: record.content?.replace(/\.$/, ''),
  ttl: record.ttl, proxied: record.proxied,
  comment: record.comment ?? null, tags: [...(record.tags ?? [])].sort(),
  settings: record.settings ?? {},
});
export async function recoverProductionDomain({ account, zone, token, original, fetcher = fetch, pause = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (!/^[a-f0-9]{32}$/i.test(account ?? '') || !/^[a-f0-9]{32}$/i.test(zone ?? '') || !token) throw new Error('Missing recovery credentials or identifiers');
  if (original.type !== 'CNAME' || original.name !== hostname || original.proxied !== false || original.content?.replace(/\.$/, '') !== 'custom-domains.chatgpt.site') throw new Error('Unapproved recovery DNS record');
  const api = async (path, method = 'GET', body) => {
    const response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Recovery API ${method} failed: HTTP ${response.status}`);
    const data = await response.json();
    if (data.success !== true) throw new Error(`Recovery API ${method} rejected operation`);
    return data.result;
  };
  const domainsPath = `/accounts/${account}/workers/domains`;
  const dnsPath = `/zones/${zone}/dns_records`;
  const domains = await api(`${domainsPath}?hostname=${hostname}`);
  if (!Array.isArray(domains) || domains.length > 1 || domains.some(d => d.hostname !== hostname || d.service !== service || d.zone_id !== zone || !d.id)) throw new Error('Unknown domain association; manual recovery required');
  for (const domain of domains) await api(`${domainsPath}/${encodeURIComponent(domain.id)}`, 'DELETE');
  let records;
  for (let attempt = 0; attempt < 6; attempt++) {
    records = await api(`${dnsPath}?name=${hostname}`);
    if (!Array.isArray(records)) throw new Error('Invalid DNS response');
    if (records.length === 0 || (records.length === 1 && JSON.stringify(normalize(records[0])) === JSON.stringify(normalize(original)))) break;
    if (attempt < 5) await pause(2000);
  }
  if (records.length === 0) await api(dnsPath, 'POST', original);
  else if (records.length !== 1 || JSON.stringify(normalize(records[0])) !== JSON.stringify(normalize(original))) throw new Error('Conflicting DNS remains; refusing to delete unrecognized records');
  const finalDomains = await api(`${domainsPath}?hostname=${hostname}`);
  const finalRecords = await api(`${dnsPath}?name=${hostname}`);
  if (!Array.isArray(finalDomains) || finalDomains.length !== 0 || !Array.isArray(finalRecords) || finalRecords.length !== 1 || JSON.stringify(normalize(finalRecords[0])) !== JSON.stringify(normalize(original))) throw new Error('Legacy recovery could not be verified');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await recoverProductionDomain({ account: process.env.CLOUDFLARE_ACCOUNT_ID, zone: process.env.PRODUCTION_ZONE_ID, token: process.env.CLOUDFLARE_API_TOKEN, original: JSON.parse(readFileSync(`${process.env.RUNNER_TEMP}/production-legacy-dns-create.json`, 'utf8')) });
    console.log('Verified restoration of the original app.faultcite.com CNAME. No database rollback was performed.');
  } catch (error) {
    console.error(`URGENT: production hostname recovery failed: ${error.message}. Operator intervention required; do not retry cutover.`);
    process.exitCode = 1;
  }
}
