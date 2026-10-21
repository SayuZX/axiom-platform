import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { desktopHostClient } from './helpers/desktopHostClient.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = process.env.SAKELAR_TEST_RUNTIME ? resolve(process.env.SAKELAR_TEST_RUNTIME) : join(root, 'src-tauri/runtime');
const temporaryRoot = await realpath(tmpdir());
const cwd = await mkdtemp(join(temporaryRoot, 'sakelar-desktop-smoke-'));
let requests = 0, sessionId, approvalCount = 0, commandOutput = '', answer = '', completed = false;
const command = "Write-Output 'desktop-command-ok'; Set-Content -LiteralPath 'desktop-proof.txt' -Value 'desktop-file-ok'";
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); requests++;
  assert.equal(req.url, '/v1/responses');
  assert.equal(req.headers.authorization, 'Bearer fake-desktop-key');
  if (requests === 2) assert.ok(body.tools.some(tool => tool.name === 'mcp__mcp_test'));
  if (requests === 3) assert.ok(JSON.stringify(body.input).includes('MCP bridge OK: desktop'));
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const item = requests === 1
    ? { type: 'function_call', id: 'fc_command', call_id: 'call_command', name: 'exec_command', arguments: JSON.stringify({ cmd: command, workdir: cwd, max_output_tokens: 1000, sandbox_permissions: 'require_escalated', justification: 'Run the desktop smoke test in its temporary workspace only.' }), status: 'completed' }
    : requests === 2
      ? { type: 'function_call', id: 'fc_mcp', call_id: 'call_mcp', namespace: 'mcp__mcp_test', name: 'echo', arguments: JSON.stringify({ message: 'desktop' }), status: 'completed' }
      : { type: 'message', id: 'msg_desktop', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'Desktop runtime OK', annotations: [] }] };
  const response = { id: 'resp_desktop', object: 'response', model: body.model, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
  const event = value => res.write('event: ' + value.type + '\ndata: ' + JSON.stringify(value) + '\n\n');
  event({ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } });
  event({ type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress' } });
  if (item.type === 'message') event({ type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'Desktop runtime OK' });
  event({ type: 'response.output_item.done', output_index: 0, item }); event({ type: 'response.completed', response }); res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const child = spawn(join(runtime, 'node.exe'), [join(runtime, 'agent/desktopAgentHost.mjs')], {
  env: { ...process.env, CODEX_RUNTIME_PATH: join(runtime, 'codex/codex.exe'), NODE_OPTIONS: '', NODE_PATH: '' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
});
let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
const exited = new Promise(resolve => child.once('exit', resolve));
const client = desktopHostClient(child.stdin, child.stdout);
const timeout = setTimeout(() => { child.kill(); console.error('Desktop runtime smoke timed out'); }, 45000);
try {
  const status = await (await client.request({ action: 'status' })).json(); assert.equal(status.available, true);
  const project = await (await client.request({ action: 'projectInfo', cwd })).json(); assert.equal(project.path, cwd);
  const connect = await client.request({ action: 'connect', cwd, baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1', key: 'fake-desktop-key', model: 'desktop-test', sandbox: 'read-only', responsesConfirmed: true,
    mcp: [{ id: 'mcp_test', name: 'Test', kind: 'stdio', command: join(runtime, 'node.exe'), args: [join(root, 'tests/fixtures/mcp-echo.mjs')], enabled: true }] });
  const connection = await connect.json(); assert.equal(connect.status, 200, JSON.stringify(connection)); sessionId = connection.sessionId;
  const turn = await client.request({ action: 'turn', sessionId, text: 'Run the temporary desktop smoke command and MCP echo, then answer.' }); assert.equal(turn.status, 200);
  let buffer = ''; const reader = turn.body.getReader(), decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true });
    let index; while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === 'approval') {
        const allowed = event.details.command?.includes('desktop-command-ok') === true;
        const response = await client.request({ action: 'approve', sessionId, requestId: event.id, accept: allowed }); assert.equal(response.status, 200); approvalCount++;
      }
      if (event.type === 'output') commandOutput += event.delta;
      if (event.type === 'text') answer += event.delta;
      if (event.type === 'error') throw Error(event.text);
      if (event.type === 'done') completed = event.status === 'completed';
    }
  }
  assert.ok(completed); assert.ok(answer.includes('Desktop runtime OK')); assert.ok(commandOutput.includes('desktop-command-ok')); assert.ok(approvalCount >= 1);
  assert.equal((await readFile(join(cwd, 'desktop-proof.txt'), 'utf8')).trim(), 'desktop-file-ok');
  const preview = await (await client.request({ action: 'projectFile', cwd, name: 'desktop-proof.txt' })).json(); assert.ok(preview.text.includes('desktop-file-ok'));
  await client.request({ action: 'close', sessionId });
  client.shutdown(); assert.equal(await exited, 0); assert.equal(stderr, '');
  console.log('PASS bundled Node + bundled Codex → private desktop pipes → actual approval + terminal + file write + MCP echo + streamed answer + clean shutdown; fake local gateway, no paid inference.');
} finally {
  clearTimeout(timeout); if (child.exitCode === null) { client.shutdown(); setTimeout(() => child.kill(), 8000).unref(); await exited; }
  client.close(); await new Promise(resolve => server.close(resolve));
  assert.ok(resolve(cwd).startsWith(resolve(temporaryRoot) + sep) && cwd.includes('sakelar-desktop-smoke-'));
  await rm(cwd, { recursive: true, force: true });
}
