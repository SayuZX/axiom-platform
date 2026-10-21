import { createInterface } from 'node:readline';
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  let request; try { request = JSON.parse(line); } catch { return; }
  if (request.id === undefined) return;
  let result;
  if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'local-test-mcp', version: '1.0.0' } };
  else if (request.method === 'tools/list') result = { tools: [{ name: 'echo', description: 'Return a harmless local test message', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }] };
  else if (request.method === 'tools/call') result = { content: [{ type: 'text', text: 'MCP bridge OK: ' + request.params.arguments.message }] };
  else if (request.method === 'ping') result = {};
  else { process.stdout.write(JSON.stringify({ id: request.id, jsonrpc: '2.0', error: { code: -32601, message: 'Unknown method' } }) + '\n'); return; }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});
