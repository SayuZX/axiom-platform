const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const code = buildSync({ entryPoints: [path.resolve(__dirname, '../src/lib/axiomPresentation.ts')], bundle: true, write: false, format: 'cjs', platform: 'node' }).outputFiles[0].text;
const fixture = new Module(__filename + '.fixture', module); fixture.paths = module.paths; fixture._compile(code, __filename);
const { modelLabel, desktopScale, fetchKeyUsage } = fixture.exports;
const emptyWeek=()=>Array.from({length:7},(_,index)=>({date:`2026-10-${13+index}`,requests:0,debitedTokens:0,spentIdr:0}));
test('friendly labels never alter wire model IDs', () => {
 const model = { id: 'ax/provider/model-one', name: 'Model One' };
 assert.equal(modelLabel(model.id, [model]), 'Model One');
 assert.equal(modelLabel('ax/provider/model-two', []), 'model two');
 assert.equal(model.id, 'ax/provider/model-one');
});
test('desktop default is compact; mobile remains unscaled', () => {
 assert.equal(desktopScale(1920, false), .85);
 assert.equal(desktopScale(2560, false), .85);
 assert.equal(desktopScale(1440, false), .6375);
 assert.equal(desktopScale(390, true), 1);
});
test('usage makes one authenticated API call, returning server counts unchanged', async () => {
 const original = global.fetch; const calls = [];
 const daily=emptyWeek();daily[6]={date:'2026-10-19',requests:3,debitedTokens:42,spentIdr:12};
 const data = { keyId: 'key/one', tokenLimit: 0, tokensUsed: 100, remainingTokens: null, debitedTokens: 42, spentIdr: 12, requests: 3, recent: [], daily };
 global.fetch = async (...args) => { calls.push(args); return Response.json(data); };
 try { assert.deepEqual(await fetchKeyUsage('key/one'), data); assert.equal(calls.length, 1); assert.equal(calls[0][0], '/customer-api/axiom-chat/key/key%2Fone/usage'); assert.equal(calls[0][1].credentials, 'same-origin'); }
 finally { global.fetch = original; }
});
test('usage rejects failed requests without inventing billing counts', async () => {
 const original = global.fetch;
 global.fetch = async () => new Response('', { status: 403 });
 try { await assert.rejects(fetchKeyUsage('one'), /belum dapat dimuat/); }
 finally { global.fetch = original; }
});
test('usage retains missing charges as null rather than zero', async () => {
 const original = global.fetch;
 const data = { keyId: 'key', tokenLimit: 100, tokensUsed: 7, remainingTokens: 93, debitedTokens: 0, spentIdr: null, requests: 1, recent: [{ model: 'ax/model', inputTokens: null, outputTokens: null, debitTokens: null, saleCostIdr: null, requestedAt: 1792345000000 }], daily:emptyWeek() };
 global.fetch = async () => Response.json(data);
 try { assert.deepEqual(await fetchKeyUsage('key'), data); }
 finally { global.fetch = original; }
});
test('usage rejects a missing daily ledger series instead of drawing invented bars', async () => {
 const original=global.fetch;
 global.fetch=async()=>Response.json({keyId:'key',tokenLimit:0,tokensUsed:0,remainingTokens:null,debitedTokens:0,spentIdr:null,requests:0,recent:[]});
 try{await assert.rejects(fetchKeyUsage('key'),/tidak valid/)}finally{global.fetch=original}
});
test('fractional IDR charges remain visible', () => {
 const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 6 });
 assert.match(idr.format(.0095), /0,0095/);
});
