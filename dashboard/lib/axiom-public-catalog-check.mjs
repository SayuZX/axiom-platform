import assert from 'node:assert/strict';
import { fetchPublicCatalog } from './axiom-public-catalog.mjs';
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const registry = { servers: Array.from({ length: 25 }, (_, i) => ({ server: { name: `org.test/server-${i}`, description: 'Actual upstream metadata\u0000', repository: { url: 'javascript:alert(1)' } }, _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } } })) };
const plugins = await fetchPublicCatalog('plugins', async (url, options) => {
  assert.equal(new URL(url).hostname, 'registry.modelcontextprotocol.io');
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal);
  return json(registry);
});
assert.equal(plugins.items.length, 20);
assert.equal(plugins.kind, 'plugins');
assert.ok(plugins.items.every(item => item.url.startsWith('https://registry.modelcontextprotocol.io/') && !item.description.includes('\u0000')));
const skills = await fetchPublicCatalog('skills', async url => {
  assert.equal(new URL(url).hostname, 'api.github.com');
  return json({ sha: 'a'.repeat(40), truncated: false, tree: [{ type: 'blob', path: 'skills/pdf/SKILL.md' }, { type: 'blob', path: 'skills/no-skill/README.md' }, { type: 'blob', path: 'skills/../SKILL.md' }] });
});
assert.equal(skills.items.length, 1);
assert.equal(skills.items[0].name, 'pdf');
assert.equal(skills.items[0].url, `https://github.com/anthropics/skills/blob/${'a'.repeat(40)}/skills/pdf/SKILL.md`);
await assert.rejects(fetchPublicCatalog('invalid', async () => { throw Error('must not fetch'); }), error => error.status === 400);
for (const response of [json({}), json({ servers: [] }), new Response('unavailable', { status: 503 }), new Response('{', { headers: { 'content-type': 'application/json' } }), new Response('x'.repeat(2_000_001), { headers: { 'content-type': 'application/json' } })]) {
  await assert.rejects(fetchPublicCatalog('plugins', async () => response), error => error.status === 503);
}
await assert.rejects(fetchPublicCatalog('skills', async () => json({ sha: 'a'.repeat(40), truncated: true, tree: [] })), error => error.status === 503);
await assert.rejects(fetchPublicCatalog('plugins', async () => { throw new DOMException('Timeout', 'TimeoutError'); }), error => error.status === 503);
console.log('Public catalog checks passed');
