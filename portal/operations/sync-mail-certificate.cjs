// JavaScript, sync-mail-certificate.cjs, Node 24 Windows: retain Caddy-managed mail TLS renewal.
'use strict';
const fs = require('node:fs');
const https = require('node:https');
const { createHash } = require('node:crypto');
const root = 'C:/ProgramData/AxiomMail';
const certificateRoot = 'C:/ProgramData/Caddy/data/certificates/acme-v02.api.letsencrypt.org-directory/portal.axiomcreative.xyz/';
(async () => {
    const certificate = fs.readFileSync(certificateRoot + 'portal.axiomcreative.xyz.crt', 'utf8');
    const hash = createHash('sha256').update(certificate).digest('hex');
    const stamp = root + '/certificate.sha256';
    if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === hash) { console.log('Mail TLS certificate is current.'); return; }
    const credentials = JSON.parse(fs.readFileSync(root + '/credentials.json', 'utf8'));
    const body = { using: ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'], methodCalls: [['x:Certificate/set', { update: { [credentials.certificate_id]: { certificate: { '@type': 'Text', value: certificate }, privateKey: { '@type': 'Text', secret: fs.readFileSync(certificateRoot + 'portal.axiomcreative.xyz.key', 'utf8') } } } }, 'renew']] };
    const result = await new Promise((resolve, reject) => {
        const request = https.request({ host: '127.0.0.1', port: 8181, servername: 'portal.axiomcreative.xyz', path: '/jmap/', method: 'POST', timeout: 20000, headers: { Authorization: 'Basic ' + Buffer.from(credentials.admin_user + ':' + credentials.admin_password).toString('base64'), 'Content-Type': 'application/json' } }, response => {
            let text = ''; response.on('data', chunk => text += chunk); response.on('end', () => { try { if (response.statusCode !== 200) throw new Error('Mail certificate API HTTP ' + response.statusCode); resolve(JSON.parse(text)); } catch (error) { reject(error); } });
        });
        request.on('error', reject); request.on('timeout', () => request.destroy(new Error('Mail certificate update timeout'))); request.end(JSON.stringify(body));
    });
    const response = result.methodResponses?.[0];
    if (response?.[0] !== 'x:Certificate/set' || !Object.hasOwn(response[1].updated || {}, credentials.certificate_id)) throw new Error('Mail certificate update rejected.');
    fs.writeFileSync(stamp, hash + '\n');
    console.log('Mail TLS certificate updated from Caddy.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
