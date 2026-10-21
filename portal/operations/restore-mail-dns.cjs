'use strict';
// Restores only the dedicated sender subdomain. Defaults to a read-only plan.
const fs = require('node:fs');
const [recordsFile, flag] = process.argv.slice(2);
if (!recordsFile || (flag && flag !== '--apply')) throw new Error('Usage: node operations/restore-mail-dns.cjs RECORDS_JSON [--apply]');
const token = process.env.CLOUDFLARE_API_TOKEN;
const zone = process.env.CLOUDFLARE_ZONE_ID;
if (!token || !zone || !/^[a-f0-9]{32}$/i.test(zone)) throw new Error('Set scoped CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID outside source control.');
const records = JSON.parse(fs.readFileSync(recordsFile, 'utf8'));
const sender = 'notify.axiomcreative.xyz';
if (!Array.isArray(records) || records.length === 0) throw new Error('Records must be a nonempty array.');
for (const record of records) {
  if (!['TXT', 'MX'].includes(record.type) || !(record.name === sender || record.name.endsWith('.' + sender)) || typeof record.content !== 'string' || !record.content) {
    throw new Error('Only TXT/MX records under notify.axiomcreative.xyz are permitted.');
  }
}
async function cloudflare(endpoint, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(`Cloudflare request failed: HTTP ${response.status}; codes ${(body.errors || []).map(e => e.code).join(',')}`);
  return body.result;
}
(async () => {
  const info = await cloudflare('');
  if (info.name !== 'axiomcreative.xyz') throw new Error('Zone identity mismatch; no DNS changed.');
  for (const record of records) {
    const existing = await cloudflare(`/dns_records?type=${record.type}&name=${encodeURIComponent(record.name)}`);
    if (existing.length > 1) throw new Error(`Multiple ${record.type} records at ${record.name}; resolve explicitly before repair.`);
    const desired = { type: record.type, name: record.name, content: record.content, ttl: 300, ...(record.type === 'MX' ? { priority: record.priority || 10 } : {}) };
    const unchanged = existing[0]?.content === record.content && (record.type !== 'MX' || existing[0].priority === desired.priority);
    console.log(JSON.stringify({ name: record.name, type: record.type, action: unchanged ? 'unchanged' : existing.length ? 'update' : 'create', apply: flag === '--apply' }));
    if (!unchanged && flag === '--apply') await cloudflare('/dns_records' + (existing.length ? '/' + existing[0].id : ''), { method: existing.length ? 'PUT' : 'POST', body: JSON.stringify(desired) });
  }
  console.log(flag === '--apply' ? 'Sender DNS changes submitted. Verify propagation, SPF/DKIM and external mailbox acceptance; inbox placement is not proven.' : 'Plan only; no DNS changed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
