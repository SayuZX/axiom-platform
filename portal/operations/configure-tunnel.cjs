'use strict';
const fs = require('node:fs');
const path = require('node:path');

function mergeRoute(configuration, route) {
  if (!configuration || !Array.isArray(configuration.ingress)) throw new Error('Existing ingress configuration required.');
  const ingress = configuration.ingress.map(rule => ({ ...rule }));
  const matches = ingress.filter(rule => rule.hostname === route.hostname);
  if (matches.length > 1 || matches.some(rule => rule.path)) throw new Error('Hostname has path-specific routes; refuse broad overwrite.');
  const replacement = { hostname: route.hostname, service: route.service, originRequest: route.originRequest };
  if (matches.length) ingress[ingress.indexOf(matches[0])] = replacement;
  else ingress.splice(Math.max(0, ingress.length - 1), 0, replacement);
  const fallback = ingress.at(-1);
  if (!fallback || fallback.hostname || fallback.path) throw new Error('A catch-all ingress rule must remain last.');
  return { ...configuration, ingress };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const credentialsPath = process.env.CLOUDFLARE_CREDENTIALS_FILE;
  if (!credentialsPath || !path.isAbsolute(credentialsPath)) throw new Error('Set absolute CLOUDFLARE_CREDENTIALS_FILE outside source control.');
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { api_token: token, account_id: account, zone_id: zone } = credentials;
  if (!token || !/^[a-f0-9]{32}$/i.test(account || '') || !/^[a-f0-9]{32}$/i.test(zone || '')) throw new Error('Credential file needs api_token, account_id and zone_id. A tunnel connector token is not an API token.');
  const route = JSON.parse(fs.readFileSync(path.join(__dirname, 'tunnel-route.json'), 'utf8'));
  async function request(endpoint, options = {}) {
    const response = await fetch('https://api.cloudflare.com/client/v4' + endpoint, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const value = await response.json();
    if (!response.ok || !value.success) throw new Error(`Cloudflare HTTP ${response.status}; codes ${(value.errors || []).map(e => e.code).join(',')}`);
    return value.result;
  }
  const zoneInfo = await request(`/zones/${zone}`);
  if (zoneInfo.name !== 'axiomcreative.xyz') throw new Error('Zone identity mismatch.');
  const tunnelPath = `/accounts/${account}/cfd_tunnel/${route.tunnel_id}`;
  const tunnel = await request(tunnelPath);
  if (tunnel.deleted_at || !tunnel.remote_config) throw new Error('Expected active remotely managed tunnel.');
  const current = await request(tunnelPath + '/configurations');
  const before = current.config || { ingress: [{ service: 'http_status:404' }] };
  const config = mergeRoute(before, route);
  const dns = await request(`/zones/${zone}/dns_records?name=${encodeURIComponent(route.hostname)}`);
  if (dns.length > 1 || dns.some(record => !['A', 'AAAA', 'CNAME'].includes(record.type))) throw new Error('Conflicting hostname DNS records; explicit resolution required.');
  const desiredDns = { type: 'CNAME', name: route.hostname, content: `${route.tunnel_id}.cfargotunnel.com`, proxied: true, ttl: 1 };
  console.log(JSON.stringify({ tunnel_id: route.tunnel_id, hostname: route.hostname, service: route.service, retainedOtherRoutes: config.ingress.filter(rule => rule.hostname && rule.hostname !== route.hostname).length, apply }, null, 2));
  if (!apply) return;
  const health = await fetch(route.service + '/api/health', { signal: AbortSignal.timeout(10000) });
  const runtime = await health.json();
  if (!health.ok || runtime.runtime !== 'ruby' || runtime.architecture !== 'payment-core') throw new Error('The new payment-core origin is not ready; no tunnel or DNS changed.');
  const backupDir = process.env.CLOUDFLARE_BACKUP_DIR;
  if (!backupDir || !path.isAbsolute(backupDir)) throw new Error('Set absolute CLOUDFLARE_BACKUP_DIR outside source control.');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backup = path.join(backupDir, `tunnel-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify({ tunnel_id: route.tunnel_id, config: before, dns }, null, 2), { flag: 'wx', mode: 0o600 });
  const latest = await request(tunnelPath + '/configurations');
  if (JSON.stringify(latest.config || { ingress: [{ service: 'http_status:404' }] }) !== JSON.stringify(before)) throw new Error('Tunnel configuration changed during review; no update applied.');
  await request(tunnelPath + '/configurations', { method: 'PUT', body: JSON.stringify({ config }) });
  await request(`/zones/${zone}/dns_records${dns[0] ? '/' + dns[0].id : ''}`, { method: dns[0] ? 'PUT' : 'POST', body: JSON.stringify(desiredDns) });
  console.log(`Tunnel and DNS submitted. Backup: ${backup}. Verify public routing before disabling the old public origin. No firewall or unrelated hostnames changed.`);
}

module.exports = { mergeRoute };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
