import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { workspaceInfo, workspaceFiles, workspaceFile, localComputerInfo } from '../scripts/localWorkspace.mjs';
import { validateAgentConnection } from '../scripts/codexAgentBridge.mjs';

const base = await mkdtemp(join(tmpdir(), 'sakelar-workspace-tests-'));
const root = join(base, 'project');
await mkdir(root);
test.after(async () => { const target = resolve(base); assert.ok(target.startsWith(resolve(tmpdir()) + sep)); await rm(target, { recursive: true, force: true }); });

test('validates real folders and indexes source files without dependencies or hidden data', async () => {
  await mkdir(join(root, 'src')); await mkdir(join(root, 'node_modules')); await mkdir(join(root, '.private'));
  await writeFile(join(root, 'src', 'hello.txt'), 'Halo 🌏');
  await writeFile(join(root, 'node_modules', 'excluded.txt'), 'excluded'); await writeFile(join(root, '.private', 'excluded.txt'), 'excluded');
  await writeFile(join(root, '.env'), 'fake-secret');
  const info = await workspaceInfo(root); assert.equal(info.name, 'project'); assert.ok(info.path.endsWith('project'));
  await assert.rejects(workspaceInfo('relative'), /absolut/);
  await assert.rejects(workspaceInfo(join(root, 'src', 'hello.txt')), /folder/);
  const result = await workspaceFiles(root); assert.deepEqual(result.files, [join('src', 'hello.txt')]);
  assert.deepEqual((await workspaceFiles(root, 'HELLO')).files, result.files);
  assert.equal((await workspaceFile(root, result.files[0])).text, 'Halo 🌏');
});

test('rejects traversal, absolute paths, symlink escape, binary and oversized previews', async () => {
  await writeFile(join(base, 'outside.txt'), 'outside');
  await assert.rejects(workspaceFile(root, '../outside.txt'), /folder project/);
  await assert.rejects(workspaceFile(root, join(base, 'outside.txt')), /tidak valid/);
  await symlink(base, join(root, 'outside-link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(workspaceFile(root, join('outside-link', 'outside.txt')), /folder project/);
  assert.ok(!(await workspaceFiles(root)).files.some(name => name.includes('outside-link')));
  await writeFile(join(root, 'binary.dat'), Buffer.from([1, 0, 2])); await assert.rejects(workspaceFile(root, 'binary.dat'), /biner/);
  await writeFile(join(root, 'large.txt'), 'x'.repeat(512 * 1024 + 1)); await assert.rejects(workspaceFile(root, 'large.txt'), /512 KB/);
});

test('computer identity comes from the running host', () => { const computer = localComputerInfo(); assert.equal(computer.platform, process.platform); assert.equal(computer.execution, 'local'); assert.ok(computer.name.length); });

test('MCP connection options reject unsafe URLs and malformed executable arguments', async () => {
  const payload = { cwd: root, baseUrl: 'https://provider.example/v1', key: 'fake', model: 'test', responsesConfirmed: true };
  const server = { id: 'mcp_test', name: 'Local tool', enabled: true, kind: 'stdio', command: process.execPath, args: ['server.mjs'] };
  const config = await validateAgentConnection({ ...payload, mcp: [server, { ...server, id: 'mcp_disabled', enabled: false }] });
  assert.deepEqual(config.mcp, [{ id: 'mcp_test', command: process.execPath, args: ['server.mjs'] }]);
  await assert.rejects(validateAgentConnection({ ...payload, mcp: [{ ...server, id: 'bad.id' }] }), /ID MCP/);
  await assert.rejects(validateAgentConnection({ ...payload, mcp: [{ ...server, args: [1] }] }), /MCP/);
  for (const url of ['http://remote.example/mcp', 'https://user:secret@example.com/mcp', 'https://example.com/mcp?token=fake', 'file:///server']) await assert.rejects(validateAgentConnection({ ...payload, mcp: [{ ...server, kind: 'http', url }] }), /URL MCP/);
  assert.equal((await validateAgentConnection({ ...payload, mcp: [{ ...server, kind: 'http', url: 'http://127.0.0.1:1234/mcp' }] })).mcp[0].url, 'http://127.0.0.1:1234/mcp');
});
