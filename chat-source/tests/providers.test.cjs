const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const cache = new Map();
const session = { customer: { id: 'customer', name: 'Customer', email: 'customer@example.com' }, keys: [{ id: 'key-one', name: 'First', models: ['vendor/model'] }, { id: 'key-two', name: 'Second', models: ['vendor/model', 'vendor/selected'] }], models: [{ id: 'vendor/model', name: 'Model' }, { id: 'vendor/selected', name: 'Selected' }] };
const origin = 'https://axiom.example';
global.window = { location: { origin }, dispatchEvent() {} };
const values = new Map();
global.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
global.sessionStorage = { removeItem() {} };
function load(file) {
  file = path.resolve(__dirname, '..', file);
  if (file.endsWith('/axiom.ts')) return { getAxiomSession: () => session, isAxiomEndpoint: value => { const url = new URL(value, origin); return url.origin === origin && !url.username && !url.password && !url.search && !url.hash && /^\/customer-api\/axiom-chat\/key\/[^/]+\/v1(?:\/(?:models|chat\/completions))?$/.test(url.pathname); } };
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', output)(name => load(path.resolve(path.dirname(file), name + '.ts')), module, module.exports);
  return module.exports;
}
const { streamEndpointChat, parseThinking } = load('src/lib/endpointChat.ts');
const { loadEndpointStore, saveEndpointStore, loadEndpointKeys, normalizeBaseUrl } = load('src/lib/endpointProfiles.ts');
const profile = { id: 'key-one', name: 'AXIOM', baseUrl: origin + '/customer-api/axiom-chat/key/key-one/v1', model: 'vendor/model', models: [], auth: 'none', protocol: 'openai-compatible' };
const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; delete global.__LOCAL_PROVIDER_RELAY__; delete global.location; });

test('streams fragmented UTF-8 / CRLF events and sends configured model/history only', async () => {
  let sent;
  const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Halo 🌏"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"!"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  global.fetch = async (url, options) => { sent = { url, options }; return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3)); controller.close(); } }), { headers: { 'content-type': 'text/event-stream' } }); };
  const updates = [];
  await streamEndpointChat(profile, 'fake-secret', 'vendor/selected', [{ role: 'user', text: 'Hi' }], new AbortController().signal, text => updates.push(text), 'high');
  assert.equal(updates.at(-1), 'Halo 🌏!');
  assert.equal(sent.url, profile.baseUrl + '/chat/completions');
  assert.equal(sent.options.headers.Authorization, undefined);
  assert.equal(sent.options.redirect, 'error'); assert.equal(sent.options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(sent.options.body), { model: 'vendor/selected', stream: true, messages: [{ role: 'user', content: 'Hi' }] });
});

test('streams reasoning_content before text delta and forwards both to onText callback', async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"reasoning_content":"Thinking step 1... "}}]}\r\n\r\n',
    'data: {"choices":[{"delta":{"reasoning_content":"step 2 complete."}}]}\r\n\r\n',
    'data: {"choices":[{"delta":{"content":"Final "}}]}\r\n\r\n',
    'data: {"choices":[{"delta":{"content":"answer."}}]}\r\n\r\n',
    'data: [DONE]\r\n\r\n',
  ];
  const bytes = new TextEncoder().encode(chunks.join(''));
  global.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 8) controller.enqueue(bytes.slice(i, i + 8));
      controller.close();
    }
  }), { headers: { 'content-type': 'text/event-stream' } });

  const states = [];
  await streamEndpointChat(profile, 'fake-secret', 'deepseek-r1', [{ role: 'user', text: 'Solve x' }], new AbortController().signal, (text, reasoning) => {
    states.push({ text, reasoning });
  });

  assert.equal(states.at(-1).text, 'Final answer.');
  assert.equal(states.at(-1).reasoning, 'Thinking step 1... step 2 complete.');
  assert.ok(states.some(s => s.reasoning && !s.text), 'captures intermediate thinking state before text output');
});

test('parseThinking extracts explicit reasoning, <think> tags, and in-progress thinking state', () => {
  const explicit = parseThinking('Final answer', 'Step by step deduction');
  assert.deepEqual(explicit, { reasoning: 'Step by step deduction', content: 'Final answer', isThinking: false });

  const tagged = parseThinking('<think>\n1. Plan logic\n2. Compute result\n</think>\n42 is the answer.');
  assert.equal(tagged.reasoning, '1. Plan logic\n2. Compute result');
  assert.equal(tagged.content, '42 is the answer.');
  assert.equal(tagged.isThinking, false);

  const streamingThink = parseThinking('<think>Currently pondering quantum state...');
  assert.equal(streamingThink.reasoning, 'Currently pondering quantum state...');
  assert.equal(streamingThink.content, '');
  assert.equal(streamingThink.isThinking, true);

  const plain = parseThinking('Simple hello');
  assert.deepEqual(plain, { reasoning: '', content: 'Simple hello', isThinking: false });
});
test('supports JSON responses and sends effort only when explicitly enabled', async () => {
  let body;
  global.fetch = async (_, options) => { body = JSON.parse(options.body); return Response.json({ choices: [{ message: { content: 'Ready' } }] }); };
  let answer;
  await streamEndpointChat({ ...profile, sendReasoning: true }, 'fake', profile.model, [], new AbortController().signal, value => { answer = value; }, 'high');
  assert.equal(answer, 'Ready'); assert.equal(body.reasoning_effort, 'high');
});

test('JSON provider reasoning is validated before rendering and matches streaming fallback fields', async () => {
  for (const invalid of [{ summary: 'vendor object' }, ['vendor array'], 5, true]) {
    global.fetch = async () => Response.json({ choices: [{ message: { content: 'Valid answer', reasoning: invalid } }] });
    let result;
    await streamEndpointChat(profile, 'fake', profile.model, [], new AbortController().signal, (text, reasoning) => { result = { text, reasoning }; });
    assert.deepEqual(result, { text: 'Valid answer', reasoning: '' });
  }
  global.fetch = async () => Response.json({ choices: [{ message: { content: null, reasoning_content: {}, reasoning: 'Partial reasoning' } }] });
  let result;
  await streamEndpointChat(profile, 'fake', profile.model, [], new AbortController().signal, (text, reasoning) => { result = { text, reasoning }; });
  assert.deepEqual(result, { text: '', reasoning: 'Partial reasoning' });
  global.fetch = async () => Response.json({ choices: [{ message: { content: null, reasoning: {} } }] });
  await assert.rejects(streamEndpointChat(profile, 'fake', profile.model, [], new AbortController().signal, () => {}), /tidak mengirim jawaban/);
  global.fetch = async () => new Response('data: {"choices":[{"delta":{"content":"Answer","reasoning_content":{},"reasoning":"Safe fallback"}}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  await streamEndpointChat(profile, 'fake', profile.model, [], new AbortController().signal, (text, reasoning) => { result = { text, reasoning }; });
  assert.deepEqual(result, { text: 'Answer', reasoning: 'Safe fallback' });
});

test('vision attachments produce OpenAI-compatible image content and preserve plain text history', async () => {
  let body;
  global.fetch = async (_, options) => { body = JSON.parse(options.body); return Response.json({ choices: [{ message: { content: 'Image received' } }] }); };
  const image = 'data:image/png;base64,aGVsbG8=';
  await streamEndpointChat(profile, 'fake', profile.model, [{ role: 'assistant', text: 'Earlier' }, { role: 'user', text: 'Describe', images: [image] }], new AbortController().signal, () => {});
  assert.deepEqual(body.messages, [{ role: 'assistant', content: 'Earlier' }, { role: 'user', content: [{ type: 'text', text: 'Describe' }, { type: 'image_url', image_url: { url: image } }] }]);
});
test('does not call network without required session credential', async () => {
  global.fetch = () => { throw Error('Unexpected network'); };
  await assert.rejects(streamEndpointChat({ ...profile, auth: 'bearer' }, '', profile.model, [], new AbortController().signal, () => {}), /API key sesi/);
});

test('usage callbacks report actual provider values for JSON and SSE without requesting unsupported options', async () => {
  const reported = []; let body;
  global.fetch = async (_, options) => { body = JSON.parse(options.body); return Response.json({ choices: [{ message: { content: 'Ready' } }], usage: { prompt_tokens: 123, completion_tokens: 45 } }); };
  await streamEndpointChat(profile, 'fake', profile.model, [], new AbortController().signal, () => {}, undefined, value => reported.push(value));
  assert.deepEqual(reported[0], { input: 123, output: 45 }); assert.equal(body.stream_options, undefined);
  global.fetch = async () => new Response('data: {"choices":[{"delta":{"content":"Ready"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  await streamEndpointChat(profile, 'fake', profile.model, [], new AbortController().signal, () => {}, undefined, value => reported.push(value));
  assert.deepEqual(reported[1], { input: 10, output: 2 });
});
test('safe errors exclude provider error body and credentials', async () => {
  global.fetch = async () => Response.json({ error: { message: 'leaked fake-secret' } }, { status: 401 });
  await assert.rejects(streamEndpointChat(profile, 'fake-secret', profile.model, [], new AbortController().signal, () => {}), error => /Akses ditolak/.test(error.message) && !error.message.includes('fake-secret'));
});
test('rejects empty / malformed streams instead of showing a demo reply', async () => {
  for (const body of ['data: [DONE]\n\n', 'data: invalid-json\n\n']) {
    global.fetch = async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    await assert.rejects(streamEndpointChat(profile, 'fake', profile.model, [], new AbortController().signal, () => {}));
  }
});
test('session profiles select customer keys and models without browser credentials', () => {
  const store = loadEndpointStore();
  assert.deepEqual(store.profiles.map(value => value.id), ['key-one', 'key-two']);
  assert.ok(store.profiles.every(value => value.auth === 'none'));
  assert.deepEqual(loadEndpointKeys(store.profiles), {});
  saveEndpointStore({ ...store, selectedId: 'key-two', profiles: store.profiles.map(value => value.id === 'key-two' ? { ...value, model: 'vendor/selected' } : value) }, {});
  assert.equal(loadEndpointStore().selectedId, 'key-two');
  assert.equal(loadEndpointStore().profiles[1].model, 'vendor/selected');
  assert.throws(() => saveEndpointStore({ ...store, profiles: store.profiles.map(value => value.id === 'key-one' ? { ...value, model: 'vendor/selected' } : value) }, {}), /Model AXIOM/);
  assert.throws(() => saveEndpointStore({ ...store, selectedId: 'unknown' }, {}), /Key AXIOM/);
  values.clear();
});
test('development relay enforces loopback/same-origin and forwards models and streaming safely', async () => {
  const { localProviderRelay } = await import('../scripts/localProviderRelay.mjs');
  const received = [];
  const upstream = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received.push({ path: req.url, key: req.headers.authorization, body });
    if (req.url === '/v1/redirect/models') { res.writeHead(302, { Location: '/v1/models' }); res.end(); return; }
    if (req.url === '/v1/chat/completions') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n'); res.end('data: [DONE]\n\n'); return; }
    if (req.url === '/v1/denied/models') { res.writeHead(401); res.end('secret-body-must-not-be-forwarded'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"data":[{"id":"local-model"}]}');
  });
  let middleware;
  localProviderRelay().configureServer({ middlewares: { use(route, handler) { assert.equal(route, '/__client/provider'); middleware = handler; } } });
  const relay = http.createServer((req, res) => middleware(req, res));
  await Promise.all([new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve)), new Promise(resolve => relay.listen(0, '127.0.0.1', resolve))]);
  const origin = 'http://127.0.0.1:' + relay.address().port, target = 'http://127.0.0.1:' + upstream.address().port;
  const call = (url, extra = {}, originHeader = origin) => realFetch(origin + '/__client/provider', { method: 'POST', headers: { Origin: originHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ url, key: 'fake-key', ...extra }) });
  try {
    assert.equal((await call(target + '/v1/models', {}, 'https://untrusted.example')).status, 403);
    assert.equal((await call(target + '/unrelated')).status, 400);
    assert.equal((await call('http://remote.example/v1/models')).status, 400);
    const models = await call(target + '/v1/models'); assert.deepEqual(await models.json(), { data: [{ id: 'local-model' }] });
    assert.equal(received[0].key, 'Bearer fake-key'); assert.equal(models.headers.get('cache-control'), 'no-store');
    const stream = await call(target + '/v1/chat/completions', { body: { model: 'local-model', messages: [], stream: true } }); assert.match(await stream.text(), /\[DONE\]/);
    const denied = await call(target + '/v1/denied/models'); assert.equal(denied.status, 401); assert.ok(!(await denied.text()).includes('secret-body'));
    assert.equal((await call(target + '/v1/redirect/models')).status, 502);
  } finally { await Promise.all([new Promise(resolve => relay.close(resolve)), new Promise(resolve => upstream.close(resolve))]); }
});


test('endpoint profiles reject non-AXIOM destinations', () => {
  assert.equal(normalizeBaseUrl(profile.baseUrl + '/models'), profile.baseUrl);
  for (const value of ['https://provider.example/v1', 'http://100.64.0.1/v1', origin + '/unrelated', profile.baseUrl + '?secret=value']) assert.throws(() => normalizeBaseUrl(value), /AXIOM/);
});

test('development relay allows Tailscale upstream while preserving its loopback-only client access', async () => {
  const { localProviderRelay } = await import('../scripts/localProviderRelay.mjs');
  let middleware, forwarded;
  localProviderRelay().configureServer({ middlewares: { use(_route, handler) { middleware = handler; } } });
  const relay = http.createServer((req, res) => middleware(req, res));
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + relay.address().port;
  global.fetch = async (url, options) => { forwarded = { url: String(url), options }; return new Response('{"data":[]}', { headers: { 'content-type': 'application/json' } }); };
  const call = (host, originHeader = origin) => realFetch(origin + '/__client/provider', { method: 'POST', headers: { Origin: originHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: `http://${host}:20128/v1/models`, key: 'fake-test-key' }) });
  try {
    const result = await call('100.90.1.2'); assert.equal(result.status, 200); await result.text();
    assert.equal(forwarded.url, 'http://100.90.1.2:20128/v1/models');
    assert.equal(forwarded.options.redirect, 'error');
    assert.equal((await call('100.128.0.0')).status, 400);
    assert.equal((await call('100.90.1.2', 'https://untrusted.example')).status, 403);
  } finally { global.fetch = realFetch; relay.closeAllConnections(); await new Promise(resolve => relay.close(resolve)); }
});
