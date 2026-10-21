import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { allowedAgentRequest, validateAgentConnection, CodexAgentSession, codexAgentBridge } from '../scripts/codexAgentBridge.mjs';

test('agent bridge accepts only same-origin JSON requests on loopback', () => {
  const request = { method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:5174', origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' } };
  assert.equal(allowedAgentRequest(request), true);
  assert.equal(allowedAgentRequest({ ...request, headers: { ...request.headers, origin: 'https://evil.example' } }), false);
  assert.equal(allowedAgentRequest({ ...request, headers: { ...request.headers, host: 'evil.example', origin: 'http://evil.example' } }), false);
  assert.equal(allowedAgentRequest({ ...request, method: 'GET' }), false);
  assert.equal(allowedAgentRequest({ ...request, socket: { remoteAddress: '192.168.1.10' } }), false);
});

test('agent validates real project folders, Responses confirmation and provider destination', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sakelar-agent-test-'));
  const payload = { cwd, baseUrl: 'https://gateway.example/v1/', key: 'fake', model: 'custom-model', responsesConfirmed: true, sandbox: 'workspace-write' };
  try {
    const options = await validateAgentConnection(payload);
    assert.equal(options.baseUrl, 'https://gateway.example/v1'); assert.equal(options.sandbox, 'workspace-write');
    assert.equal((await validateAgentConnection({ ...payload, sandbox: 'danger-full-access' })).sandbox, 'read-only');
    await assert.rejects(validateAgentConnection({ ...payload, responsesConfirmed: false }), /Responses/);
    await assert.rejects(validateAgentConnection({ ...payload, cwd: 'relative' }), /absolut/);
    await assert.rejects(validateAgentConnection({ ...payload, baseUrl: 'http://example.com/v1' }), /tidak valid/);
    await assert.rejects(validateAgentConnection({ ...payload, baseUrl: 'https://user:secret@gateway.example' }), /tidak valid/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

function fakeProcess() {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = 0;
  const sent = []; child.stdin = new Writable({ write(chunk, encoding, callback) { sent.push(JSON.parse(chunk)); callback(); } });
  return { child, sent, reply: message => child.stdout.write(JSON.stringify(message) + '\n') };
}

test('app-server protocol forwards text/tool output/diffs and requires explicit approval', async () => {
  const { child, sent, reply } = fakeProcess();
  const session = new CodexAgentSession(child, { key: 'fake-secret' }, 'unused');
  const events = []; session.threadId = 'thread-one'; session.sink = event => events.push(event);
  reply({ method: 'item/agentMessage/delta', params: { threadId: 'thread-one', itemId: 'answer', delta: 'hello' } });
  reply({ id: 91, method: 'item/commandExecution/requestApproval', params: { command: 'echo fake-secret', cwd: 'project' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.length, 0); assert.equal(events[1].type, 'approval'); assert.equal(events[1].details.command, 'echo [REDACTED]');
  session.approve('91', false); assert.deepEqual(sent.at(-1), { id: 91, result: { decision: 'decline' } });
  assert.throws(() => session.approve('91', true), /tidak aktif/);
  reply({ id: 92, method: 'item/fileChange/requestApproval', params: { grantRoot: 'project' } });
  await new Promise(resolve => setImmediate(resolve)); session.approve('92', true);
  assert.deepEqual(sent.at(-1), { id: 92, result: { decision: 'accept' } });
  reply({ id: 93, method: 'unknown/requestPermission', params: {} });
  reply({ method: 'item/commandExecution/outputDelta', params: { itemId: 'command', delta: 'fake-secret output' } });
  reply({ method: 'turn/diff/updated', params: { diff: '+changed' } });
  reply({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.find(item => item.id === 93).error.code, -32601);
  assert.ok(events.some(item => item.type === 'output' && item.delta === '[REDACTED] output'));
  assert.ok(events.some(item => item.type === 'diff' && item.diff === '+changed'));
  assert.equal(events.at(-1).type, 'done');
  session.lines.close(); child.stdout.end();
});

test('stop during turn/start waits for turn identity then interrupts the correct turn', async () => {
  const { child, sent, reply } = fakeProcess(); const session = new CodexAgentSession(child, { key: '' }, 'unused');
  session.threadId = 'thread-one';
  const starting = session.turn('hello', () => {});
  await session.interrupt();
  reply({ id: sent[0].id, result: { turn: { id: 'turn-one' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[1].method, 'turn/interrupt'); assert.deepEqual(sent[1].params, { threadId: 'thread-one', turnId: 'turn-one' });
  reply({ id: sent[1].id, result: {} }); await starting;
  session.fail('closed'); session.lines.close(); child.stdout.end();
});

test('HTTP transport rejects foreign origins, streams turns and isolates session capabilities', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sakelar-agent-test-'));
  let middleware; const server = createServer((req, res) => middleware(req, res)); let stopped = false;
  const plugin = codexAgentBridge({ findRuntime: async () => '/fake/codex', createSession: async options => ({ id: 'private-session-capability', threadId: 'thread', closed: false, busy: false, touched: Date.now(), clean: value => value, options, close: async () => {}, interrupt: async () => { stopped = true; }, approve: () => {}, turn: async (text, sink) => { sink({ type: 'text', itemId: 'answer', delta: 'Answer: ' + text }); sink({ type: 'done', status: 'completed' }); } }) });
  plugin.configureServer({ httpServer: server, middlewares: { use(path, handler) { middleware = handler; } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const request = (body, origin = url) => fetch(url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await request({ action: 'status' }, 'https://evil.example')).status, 403);
    assert.equal((await (await request({ action: 'status' })).json()).available, true);
    const connection = await (await request({ action: 'connect', cwd, baseUrl: 'https://gateway.example/v1', key: 'not-logged', model: 'test', responsesConfirmed: true })).json();
    assert.equal(connection.sessionId, 'private-session-capability'); assert.ok(!JSON.stringify(connection).includes('not-logged'));
    assert.equal((await request({ action: 'stop', sessionId: 'not-this-session' })).status, 404);
    const output = await (await request({ action: 'turn', sessionId: connection.sessionId, text: 'test' })).text();
    assert.match(output, /Answer: test/); assert.match(output, /"type":"done"/);
    await request({ action: 'stop', sessionId: connection.sessionId }); assert.equal(stopped, true);
    await request({ action: 'close', sessionId: connection.sessionId });
    assert.equal((await request({ action: 'turn', sessionId: connection.sessionId, text: 'late' })).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(cwd, { recursive: true, force: true }); }
});

test('Plan mode is read-only without escalation and the next turn restores project access', async () => {
  const { child, sent, reply } = fakeProcess(); const session = new CodexAgentSession(child, { key: '', cwd: '/project', sandbox: 'workspace-write' }, 'unused');
  session.threadId = 'thread';
  const planning = session.turn('Propose a change', () => {}, undefined, true);
  assert.deepEqual(sent[0].params.sandboxPolicy, { type: 'readOnly', networkAccess: false });
  assert.equal(sent[0].params.approvalPolicy, 'never'); assert.match(sent[0].params.input[0].text, /Plan only/);
  reply({ id: sent[0].id, result: { turn: { id: 'plan-turn' } } }); await planning;
  reply({ method: 'turn/completed', params: { turn: { status: 'completed' } } }); await new Promise(resolve => setImmediate(resolve));
  const next = session.turn('Implement it', () => {});
  assert.deepEqual(sent[1].params.sandboxPolicy, { type: 'workspaceWrite', writableRoots: ['/project'], networkAccess: false });
  assert.equal(sent[1].params.approvalPolicy, 'on-request');
  reply({ id: sent[1].id, result: { turn: { id: 'implementation-turn' } } }); await next;
  session.fail('closed'); session.lines.close(); child.stdout.end();
});

test('native vision input uses image items alongside text without treating paths as images', async () => {
  const { child, sent, reply } = fakeProcess(); const session = new CodexAgentSession(child, { key: '' }, 'unused'); session.threadId = 'vision';
  const image = 'data:image/png;base64,aGVsbG8=';
  const starting = session.turn('Describe', () => {}, undefined, false, [image]);
  assert.deepEqual(sent[0].params.input, [{ type: 'text', text: 'Describe' }, { type: 'image', url: image }]);
  reply({ id: sent[0].id, result: { turn: { id: 'turn' } } }); await starting;
  session.fail('closed'); session.lines.close(); child.stdout.end();
});

test('explicit network setting reaches ordinary sandbox turns but Plan always disables network', async () => {
  const { child, sent, reply } = fakeProcess(); const session = new CodexAgentSession(child, { key: '', cwd: '/project', sandbox: 'workspace-write', networkAccess: true }, 'unused'); session.threadId = 'thread';
  const first = session.turn('Task', () => {}); assert.equal(sent[0].params.sandboxPolicy.networkAccess, true); reply({ id: sent[0].id, result: { turn: { id: 'one' } } }); await first;
  reply({ method: 'turn/completed', params: { turn: { status: 'completed' } } }); await new Promise(resolve => setImmediate(resolve));
  const second = session.turn('Plan', () => {}, undefined, true); assert.equal(sent[1].params.sandboxPolicy.networkAccess, false); assert.equal(sent[1].params.approvalPolicy, 'never'); reply({ id: sent[1].id, result: { turn: { id: 'two' } } }); await second;
  session.fail('closed'); session.lines.close(); child.stdout.end();
});

test('native cumulative usage becomes per-turn usage across successive model calls', async () => {
  const { child, sent, reply } = fakeProcess(); const session = new CodexAgentSession(child, { key: '' }, 'unused'); session.threadId = 'thread'; const events = [];
  const first = session.turn('Task', event => events.push(event)); reply({ id: sent[0].id, result: { turn: { id: 'one' } } }); await first;
  reply({ method: 'thread/tokenUsage/updated', params: { threadId: 'thread', tokenUsage: { total: { inputTokens: 100, outputTokens: 20 } } } });
  reply({ method: 'thread/tokenUsage/updated', params: { threadId: 'thread', tokenUsage: { total: { inputTokens: 250, outputTokens: 40 } } } });
  reply({ method: 'turn/completed', params: { turn: { status: 'completed' } } }); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events.filter(event => event.type === 'usage').at(-1), { type: 'usage', input: 250, output: 40 });
  const second = session.turn('Next', event => events.push(event)); reply({ id: sent[1].id, result: { turn: { id: 'two' } } }); await second;
  reply({ method: 'thread/tokenUsage/updated', params: { threadId: 'thread', tokenUsage: { total: { inputTokens: 300, outputTokens: 45 } } } }); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events.filter(event => event.type === 'usage').at(-1), { type: 'usage', input: 50, output: 5 });
  session.fail('closed'); session.lines.close(); child.stdout.end();
});


test('app-server forwards exposed reasoning summaries with normal credential redaction', async () => {
  const { child, reply } = fakeProcess();
  const session = new CodexAgentSession(child, { key: 'fake-secret' }, 'unused');
  const events = []; session.threadId = 'thread-one'; session.sink = event => events.push(event);
  reply({ method: 'item/reasoning/summaryTextDelta', params: { threadId: 'thread-one', itemId: 'summary', delta: 'Checking fake-secret configuration' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, [{ type: 'summary', itemId: 'summary:0', delta: 'Checking [REDACTED] configuration' }]);
  session.lines.close(); child.stdout.end();
});


test('agent gateway accepts Tailscale HTTP without relaxing Responses confirmation or public HTTP checks', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sakelar-tailnet-test-'));
  const payload = { cwd, baseUrl: 'http://100.90.1.2:20128/v1', key: 'fake-test-key', model: 'test-model', responsesConfirmed: true };
  try {
    assert.equal((await validateAgentConnection(payload)).baseUrl, payload.baseUrl);
    for (const host of ['100.63.255.255', '100.128.0.0', '100.90.1.2.evil.example']) await assert.rejects(validateAgentConnection({ ...payload, baseUrl: `http://${host}/v1` }), /tidak valid/);
    await assert.rejects(validateAgentConnection({ ...payload, responsesConfirmed: false }), /Responses/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
