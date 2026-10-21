const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const built = buildSync({ absWorkingDir: root, stdin: { contents: "export * from './src/lib/nativeDesktop'; export * from './src/lib/providerTransport'; export * from './src/lib/endpointChat'; export * from './src/lib/providerErrors';", resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs' });
const mod = new Module(__filename + '.fixture', module);
mod.filename = __filename + '.fixture'; mod.paths = module.paths;
mod._compile(built.outputFiles[0].text, mod.filename);
const client = mod.exports;
const originalWindow = global.window, originalFetch = global.fetch;

test('native mobile detection requires both the native bridge and a mobile user agent', () => {
  const descriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
  try {
    Object.defineProperty(global, 'navigator', {value:{userAgent:'Mozilla/5.0 (Linux; Android 14)'},configurable:true});
    global.window = {};
    assert.equal(client.isNativeMobile(), false);
    global.window = {__TAURI_INTERNALS__:{}};
    assert.equal(client.isNativeMobile(), true);
    Object.defineProperty(global, 'navigator', {value:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'},configurable:true});
    assert.equal(client.isNativeMobile(), true);
    Object.defineProperty(global, 'navigator', {value:{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'},configurable:true});
    assert.equal(client.isNativeMobile(), false);
  } finally {
    if (descriptor) Object.defineProperty(global, 'navigator', descriptor); else delete global.navigator;
  }
});

test('every native HTTP scope parses and allows HTTPS plus loopback/Tailscale without allowing public HTTP', () => {
  const { URLPattern } = require('urlpattern-polyfill');
  const capability = require('../src-tauri/capabilities/default.json');
  const patterns = capability.permissions.find(permission => permission.identifier === 'http:default').allow.map(entry => new URLPattern(entry.url));
  for (const url of ['https://api.provider.example/v1/models', 'https://api.provider.example:8443/v1/models', 'https://api.provider.example/v1/chat/completions', 'http://localhost:5174/v1/models', 'http://100.64.0.0:20128/v1/models', 'http://100.127.255.255:20128/v1/models', 'http://100.90.1.2:20128/v1/models', 'http://127.0.0.1:5174/v1/models', 'http://127.42.1.2:5174/v1/models', 'http://[::1]:5174/v1/models']) {
    assert.ok(patterns.some(pattern => pattern.test(url)), url);
  }
  for (const url of ['http://provider.example/v1/models', 'http://100.63.255.255/v1/models', 'http://100.128.0.0/v1/models', 'http://100.90.1.2.evil.example/v1/models', 'http://192.168.1.2/v1/models', 'http://127.0.0.1.evil.example/v1/models', 'file:///private']) assert.ok(!patterns.some(pattern => pattern.test(url)), url);
});

test('native HTTP converts a plain-string permission rejection into an actionable Error', async () => {
  global.window = { __TAURI_INTERNALS__: { invoke: async () => { throw 'error deserializing scope: not a valid URL pattern'; } } };
  await assert.rejects(client.nativeProviderFetch('https://provider.example/v1/models', {}), failure => failure instanceof Error && /Izin koneksi aplikasi desktop/.test(failure.message));
});

test('provider errors distinguish native TLS/timeouts from browser CORS and handle stream string failures', () => {
  assert.match(client.providerErrorMessage('error deserializing scope: invalid name', true), /Izin koneksi/);
  assert.match(client.providerErrorMessage('TLS certificate verify failed', true), /Sertifikat HTTPS/);
  assert.match(client.providerErrorMessage('operation timed out', true), /batas waktu/);
  assert.match(client.providerErrorMessage(new TypeError('fetch failed'), true), /tidak memerlukan izin CORS/);
  assert.match(client.providerErrorMessage(new TypeError('fetch failed'), false), /CORS untuk aplikasi web/);
  assert.equal(client.providerErrorMessage(new Error('Akses ditolak.'), true), 'Akses ditolak.');
  assert.equal(client.providerErrorMessage(new Error('HTTP 403 Forbidden'), true), 'HTTP 403 Forbidden');
});
test.afterEach(() => { global.fetch = originalFetch; if (originalWindow === undefined) delete global.window; else global.window = originalWindow; });

function nativeTransport(body, contentType = 'application/json') {
  const calls = []; let read = false;
  global.window = { __TAURI_INTERNALS__: { invoke: async (command, payload) => {
    calls.push({ command, payload });
    if (command === 'plugin:http|fetch') return 1;
    if (command === 'plugin:http|fetch_send') return { status: 200, statusText: 'OK', url: 'https://provider.example/v1/chat/completions', headers: [['content-type', contentType]], rid: 2 };
    if (command === 'plugin:http|fetch_read_body') { if (read) return [1]; read = true; return [...new TextEncoder().encode(body), 0]; }
    if (command === 'plugin:http|fetch_cancel' || command === 'plugin:http|fetch_cancel_body') return;
    throw Error('Unexpected native command: ' + command);
  } } };
  global.fetch = () => { throw Error('Native provider must not use browser fetch or development relay'); };
  return calls;
}

test('native provider uses Rust HTTP with session credential and redirects disabled', async () => {
  const calls = nativeTransport('{"data":[{"id":"configured-model"}]}');
  assert.equal(client.isNativeDesktop(), true);
  assert.equal(client.usesLocalProviderRelay(), false);
  const response = await client.providerFetch('https://provider.example/v1/models', 'fake-test-key', new AbortController().signal);
  assert.equal((await response.json()).data[0].id, 'configured-model');
  const config = calls[0].payload.clientConfig;
  assert.equal(config.method, 'GET');
  assert.equal(config.maxRedirections, 0);
  assert.deepEqual(config.headers.find(([name]) => name === 'authorization'), ['authorization', 'Bearer fake-test-key']);
});


test('cancelled native request does not create an IPC request', async () => {
  const calls = nativeTransport('{}'), controller = new AbortController(); controller.abort();
  await assert.rejects(client.providerFetch('https://provider.example/v1/models', '', controller.signal));
  assert.equal(calls.length, 0);
});

test('native transport rejects insecure or credential-bearing destinations before IPC', async () => {
  const calls = nativeTransport('{}');
  for (const url of ['http://provider.example/v1/models', 'http://100.63.255.255/v1/models', 'http://100.128.0.0/v1/models', 'http://100.90.1.2.evil.example/v1/models', 'https://user:secret@provider.example/v1/models', 'https://provider.example/v1/models?key=secret', 'file:///private']) {
    await assert.rejects(client.nativeProviderFetch(url, {}), /endpoint HTTPS/);
  }
  assert.equal(calls.length, 0);
});

test('native agent channel exposes streamed Unicode output as an ordinary Response', async () => {
  global.window = { __TAURI_INTERNALS__: { transformCallback: () => 1, invoke: async (command, payload) => {
    assert.equal(command, 'native_agent_request'); assert.equal(payload.payload.action, 'status');
    queueMicrotask(() => {
      payload.onEvent.onmessage({ type: 'headers', status: 200, headers: [['content-type', 'application/x-ndjson']] });
      payload.onEvent.onmessage({ type: 'chunk', data: Buffer.from('{"text":"selesai ✓"}\n').toString('base64') });
      payload.onEvent.onmessage({ type: 'end' });
    });
  } } };
  const response = await client.nativeAgentRequest({ action: 'status' });
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson');
  assert.equal(await response.text(), '{"text":"selesai ✓"}\n');
});

test('native agent abort cancels the matching Rust request and errors its stream', async () => {
  const calls = [], controller = new AbortController();
  global.window = { __TAURI_INTERNALS__: { transformCallback: () => 1, invoke: async (command, payload) => {
    calls.push({ command, payload });
    if (command === 'native_agent_request') queueMicrotask(() => payload.onEvent.onmessage({ type: 'headers', status: 200, headers: [] }));
  } } };
  const response = await client.nativeAgentRequest({ action: 'turn' }, controller.signal);
  const body = response.text(); controller.abort(); await assert.rejects(body, /abort/i);
  assert.equal(calls[1].command, 'native_agent_cancel');
  assert.equal(calls[0].payload.requestId, calls[1].payload.requestId);
});


test('native transport accepts Tailscale HTTP with fake credential and rejects adjacent ranges before IPC', async () => {
  const calls = nativeTransport('{}');
  await client.nativeProviderFetch('http://100.90.1.2:20128/v1/models', { headers: { Authorization: 'Bearer fake-test-key' } });
  assert.equal(calls[0].payload.clientConfig.url, 'http://100.90.1.2:20128/v1/models');
  const count = calls.length;
  for (const url of ['http://100.63.255.255/v1/models', 'http://100.128.0.0/v1/models', 'http://100.90.1.2.evil.example/v1/models']) await assert.rejects(client.nativeProviderFetch(url, {}));
  assert.equal(calls.length, count);
});
