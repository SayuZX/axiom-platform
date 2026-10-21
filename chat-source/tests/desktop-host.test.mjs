import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startDesktopAgentHost } from '../scripts/desktopAgentHost.mjs';
import { desktopHostClient } from './helpers/desktopHostClient.mjs';

test('desktop pipe host multiplexes approvals and streaming without a listening server', async () => {
  const input = new PassThrough(), output = new PassThrough(), cwd = await mkdtemp(join(tmpdir(), 'sakelar-host-test-'));
  let closed = 0, interrupted = 0, approval;
  const session = { id: 'private-session', threadId: 'thread', busy: false, touched: Date.now(), closed: false,
    async close() { closed++; }, clean(text) { return text; }, async interrupt() { interrupted++; },
    async turn(text, sink) { this.sink = sink; this.busy = true; approval = sink; sink({ type: 'approval', id: 'permit-1', kind: 'command', details: { command: 'test-only' } }); },
    approve(id, accept) { assert.equal(id, 'permit-1'); if (accept) approval({ type: 'output', itemId: 'cmd', delta: 'approved-output' }); approval({ type: 'done', status: accept ? 'completed' : 'failed' }); this.busy = false; },
  };
  const host = startDesktopAgentHost(input, output, { findRuntime: async () => 'fake-runtime', createSession: async () => session });
  const client = desktopHostClient(input, output);
  try {
    assert.equal((await (await client.request({ action: 'status' })).json()).available, true);
    const info = await (await client.request({ action: 'computerInfo' })).json(); assert.equal(info.execution, 'local');
    const denied = await client.request({ action: 'connect', cwd, baseUrl: 'https://fake.example/v1', key: 'fake-key', model: 'test-model', responsesConfirmed: false }); assert.equal(denied.status, 400);
    const connect = await (await client.request({ action: 'connect', cwd, baseUrl: 'https://fake.example/v1', key: 'fake-key', model: 'test-model', responsesConfirmed: true })).json();
    assert.equal(connect.sessionId, 'private-session');
    const turn = await client.request({ action: 'turn', sessionId: connect.sessionId, text: 'Test' });
    assert.equal(turn.headers.get('content-type'), 'application/x-ndjson');
    const body = turn.text();
    const decision = await client.request({ action: 'approve', sessionId: connect.sessionId, requestId: 'permit-1', accept: true }); assert.equal(decision.status, 200);
    const events = (await body).trim().split('\n').map(JSON.parse);
    assert.ok(events.some(event => event.type === 'approval'));
    assert.ok(events.some(event => event.delta === 'approved-output'));
    assert.ok(events.some(event => event.type === 'done' && event.status === 'completed'));
    const next = await client.request({ action: 'turn', sessionId: connect.sessionId, text: 'Cancel' });
    await next.body.cancel(); await new Promise(resolve => setImmediate(resolve)); assert.equal(interrupted, 1);
    await host.shutdown(); assert.equal(closed, 1);
  } finally { await host.shutdown(); client.close(); input.destroy(); output.destroy(); await rm(cwd, { recursive: true, force: true }); }
});
