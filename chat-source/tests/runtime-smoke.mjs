import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCodexRuntime, createCodexAgent } from '../scripts/codexAgentBridge.mjs';
const cwd = await mkdtemp(join(tmpdir(), 'sakelar-runtime-smoke-'));
let requests = 0, session;
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); requests++;
  console.log('gateway', req.method, req.url, 'model', body.model, 'tool names', (body.tools || []).map(tool => tool.name).join(','));
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  if (requests === 2 && !body.tools.some(tool => tool.name === 'mcp__mcp_test')) throw Error('MCP namespace missing');
  if (requests === 3 && !JSON.stringify(body.input).includes('MCP bridge OK: local test')) throw Error('MCP tool was not executed successfully');
  const item = requests === 1 ? { type: 'function_call', id: 'fc_test', call_id: 'call_test', name: 'exec_command', arguments: JSON.stringify({ cmd: process.platform === 'win32' ? "Write-Output 'agent-bridge-command-ok'" : "printf 'agent-bridge-command-ok\\n'", workdir: cwd, max_output_tokens: 1000 }), status: 'completed' } : requests === 2 ? { type: 'function_call', id: 'fc_mcp', call_id: 'call_mcp', namespace: 'mcp__mcp_test', name: 'echo', arguments: JSON.stringify({ message: 'local test' }), status: 'completed' } : { type: 'message', id: 'msg_test', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'Runtime bridge OK', annotations: [] }] };
  const response = { id: 'resp_test', object: 'response', model: body.model, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
  const event = value => res.write('event: ' + value.type + '\ndata: ' + JSON.stringify(value) + '\n\n');
  event({ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } });
  event({ type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress' } });
  if (item.type === 'message') event({ type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'Runtime bridge OK' });
  event({ type: 'response.output_item.done', output_index: 0, item });
  event({ type: 'response.completed', response }); res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  session = await createCodexAgent({ cwd, baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1', key: 'fake-local-key', model: 'test-model', sandbox: 'read-only', mcp: [{ id: 'mcp_test', command: process.execPath, args: [fileURLToPath(new URL('./fixtures/mcp-echo.mjs', import.meta.url))] }] }, await findCodexRuntime());
  console.log('thread ready');
  let finish; const done = new Promise((resolve, reject) => { finish = { resolve, reject }; });
  const timeout = setTimeout(() => finish.reject(Error('Runtime smoke exceeded 40s')), 40000);
  let text = '', output = '';
  await session.turn('Run the harmless test command and say hello.', event => { console.log('event', event.type, event.status || ''); if (event.type === 'text') text += event.delta; if (event.type === 'output') output += event.delta; if (event.type === 'item') console.log('item', event.item.type, event.item.status, event.item.exitCode, event.item.aggregatedOutput || ''); if (event.type === 'approval') session.approve(event.id, event.details.command?.includes('agent-bridge-command-ok') === true); if (event.type === 'error') console.log('runtime error', event.text); if (event.type === 'done') finish.resolve(event); });
  try { const result = await done; if (result.status !== 'completed' || !text.includes('Runtime bridge OK') || requests < 3 || !output.includes('agent-bridge-command-ok')) throw Error('Missing completed command runtime response'); console.log('PASS real Codex runtime → mock gateway → local command + actual MCP echo result → streamed answer; no external inference'); }
  finally { clearTimeout(timeout); }
} finally { if (session) await session.close(); await new Promise(resolve => server.close(resolve)); if (!resolve(cwd).startsWith(resolve(tmpdir()) + sep) || !cwd.includes('sakelar-runtime-smoke-')) throw Error('Unexpected cleanup path'); await rm(cwd, { recursive: true, force: true }); }
