// JavaScript, sync-merchant.cjs, Node.js 24 on Windows: pin existing main merchant bridge.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomBytes } = require('node:crypto');
const root = process.env.AXIOM_PAYMENT_DATA || 'C:/ProgramData/DjPayment';
const merchantRoot = process.env.MERCHANT_BRIDGE_ROOT || 'C:/Sites/axiom/dashboard';
(async () => {
    process.loadEnvFile(path.join(merchantRoot, '.env.production.local'));
    const { merchantDb, setting } = await import(pathToFileURL(path.join(merchantRoot, 'lib/merchant-store.mjs')).href);
    const db = merchantDb();
    try {
        const merchant = await setting('website_merchant');
        if (!merchant?.key || !merchant?.merchantId) throw new Error('Merchant utama belum terhubung.');
        const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
        if (env.GOPAY_MERCHANT_ID !== merchant.merchantId) throw new Error('Merchant berbeda dari konfigurasi awal. Perubahan merchant memerlukan migrasi eksplisit.');
        const response = await fetch('http://127.0.0.1:3082/api/merchant/user-config', { headers: { 'x-api-key': merchant.key }, signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`Pemeriksaan merchant gagal: HTTP ${response.status}`);
        const profile = await response.json();
        if (profile.merchant?.id !== merchant.merchantId) throw new Error('Identitas merchant provider berbeda.');
        const filename = path.join(root, 'merchant-connection.json');
        const temporary = filename + '.' + randomBytes(8).toString('hex') + '.tmp';
        try {
            fs.writeFileSync(temporary, JSON.stringify({ merchant_id: merchant.merchantId, key: merchant.key }), { flag: 'wx', mode: 0o600 });
            fs.renameSync(temporary, filename);
        } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
        console.log(JSON.stringify({ connected: true, merchant_pinned: true, refresh_owner: 'AxiomMerchant' }));
    } finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
