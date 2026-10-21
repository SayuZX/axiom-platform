'use strict';
const { Resolver } = require('node:dns/promises');
const net = require('node:net');
const resolver = new Resolver({ timeout: 5000, tries: 2 });
const [domain, selector, senderIp] = process.argv.slice(2);
if (!domain || !/^[a-z0-9.-]+$/i.test(domain) || !selector || !/^[a-z0-9_-]+$/i.test(selector) || net.isIP(senderIp) !== 4) {
  throw new Error('Usage: node operations/check-mail-dns.cjs SENDER_DOMAIN DKIM_SELECTOR SENDER_IPV4');
}
(async () => {
  const result = {};
  for (const [label, name, type] of [
    ['spf', domain, 'TXT'],
    ['dkim', `${selector}._domainkey.${domain}`, 'TXT'],
    ['dmarc', `_dmarc.${domain}`, 'TXT'],
    ['mx', domain, 'MX'],
  ]) {
    try { result[label] = await resolver.resolve(name, type); }
    catch (error) { result[label] = { error: error.code }; }
  }
  try { result.ptr = await resolver.reverse(senderIp); }
  catch (error) { result.ptr = { error: error.code }; }
  const spf = Array.isArray(result.spf) ? result.spf.map(parts => parts.join('')).filter(record => record.startsWith('v=spf1')) : [];
  const dkim = Array.isArray(result.dkim) ? result.dkim.map(parts => parts.join('')) : [];
  const ready = spf.length === 1 && dkim.some(record => record.includes('p=') && !/p=\s*(;|$)/.test(record)) && Array.isArray(result.mx) && result.mx.length > 0;
  console.log(JSON.stringify({ domain, selector, senderIp, records: result, basicRecordsPresent: ready, inboxDeliveryProven: false }, null, 2));
  if (!ready) process.exitCode = 1;
})().catch(error => { console.error(error.code || error.name); process.exitCode = 1; });
