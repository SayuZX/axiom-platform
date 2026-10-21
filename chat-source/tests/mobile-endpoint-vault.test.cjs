const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { buildSync } = require('esbuild');
const built = buildSync({ entryPoints: [path.join(__dirname, '../src/lib/mobileEndpointVault.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' });
function fixture(native = true) {
  const previous = { window: global.window, localStorage: global.localStorage };
  global.window = new EventTarget();
  const values = new Map();
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const messages = [], listeners = [];
  if (native) window.SuperGPTEndpointVault = {
    addEventListener: (_, listener) => listeners.push(listener),
    postMessage: raw => messages.push(JSON.parse(raw))
  };
  const mod = new Module(__filename + '.fixture', module);
  mod._compile(built.outputFiles[0].text, __filename);
  return { api: mod.exports, messages, values,
    reply: (message, keys = {}, ok = true) => listeners.forEach(listener => listener({ data: JSON.stringify({ id: message.id, ok, keys }) })),
    restore: () => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete global[key]; else global[key] = value; } }
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('native hydration restores credentials before synchronous reads and ignores unknown replies', async () => {
  const f = fixture();
  try {
    const hydration = f.api.initializeMobileEndpointVault();
    assert.equal(f.messages[0].op, 'load');
    f.reply({ id: 'unknown' }, { wrong: 'value' });
    f.reply(f.messages[0], { endpoint: 'fixture-token' });
    await hydration;
    assert.deepEqual(f.api.nativeEndpointKeys(), { endpoint: 'fixture-token' });
    assert.equal(f.api.endpointVaultState(), 'ready');
    assert.equal(f.values.size, 0, 'no credentials enter persistent web storage');
  } finally { f.restore(); }
});

test('native writes serialize, retain latest value, and surface persistence failures', async () => {
  const f = fixture();
  try {
    f.api.persistNativeEndpointKeys({ endpoint: 'first' });
    f.api.persistNativeEndpointKeys({ endpoint: 'second' });
    const done = f.api.flushEndpointKeyPersistence();
    await tick();
    assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0].keys.endpoint, 'first');
    f.reply(f.messages[0]); await tick();
    assert.equal(f.messages[1].keys.endpoint, 'second');
    f.reply(f.messages[1], {}, false);
    await assert.rejects(done, /Penyimpanan aman/);
    assert.equal(f.api.endpointVaultState(), 'error');
    assert.deepEqual(f.api.nativeEndpointKeys(), { endpoint: 'second' });
    assert.equal(f.values.size, 0);
  } finally { f.restore(); }
});

test('signout invalidates late hydration and queued saves, retains clear tombstone on failure', async () => {
  const f = fixture();
  try {
    const hydration = f.api.initializeMobileEndpointVault();
    f.api.persistNativeEndpointKeys({ endpoint: 'old-session' });
    const clearing = f.api.clearNativeEndpointKeys();
    f.reply(f.messages[0], { endpoint: 'old-session' });
    await hydration; await tick();
    assert.equal(f.messages.length, 2);
    assert.equal(f.messages[1].op, 'clear');
    assert.deepEqual(f.api.nativeEndpointKeys(), {});
    f.reply(f.messages[1], {}, false);
    await assert.rejects(clearing);
    assert.equal(f.values.get('client-endpoint-vault-cleared-v1'), 'true');
    assert.equal(f.messages.some(message => message.op === 'save'), false);
  } finally { f.restore(); }
});

test('browser preview does not initialize or persist a native vault', async () => {
  const f = fixture(false);
  try {
    await f.api.initializeMobileEndpointVault();
    f.api.persistNativeEndpointKeys({ endpoint: 'fixture-token' });
    await f.api.flushEndpointKeyPersistence();
    await f.api.clearNativeEndpointKeys();
    assert.equal(f.api.usesNativeEndpointVault(), false);
    assert.equal(f.api.endpointVaultState(), 'session');
    assert.deepEqual(f.api.nativeEndpointKeys(), {});
    assert.equal(f.values.size, 0);
  } finally { f.restore(); }
});

test('restart after failed signout clears the vault instead of restoring credentials', async () => {
  const f = fixture();
  try {
    f.values.set('client-endpoint-vault-cleared-v1', 'true');
    const hydration = f.api.initializeMobileEndpointVault();
    assert.equal(f.messages[0].op, 'clear');
    f.reply(f.messages[0]);
    await hydration;
    assert.deepEqual(f.api.nativeEndpointKeys(), {});
    assert.equal(f.values.has('client-endpoint-vault-cleared-v1'), false);
  } finally { f.restore(); }
});
