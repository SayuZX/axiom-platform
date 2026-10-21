import assert from 'node:assert/strict';
import { topics } from './app/docs/topics.mjs';
const base = process.env.AXIOM_SITE || 'https://ai.axiomcreative.xyz';
for (const path of ['/docs', ...topics.map(topic => '/docs/' + topic.slug), '/provider-logos/atria.png', '/provider-logos/codebuddy.svg', '/provider-logos/codex.svg']) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  if (path.startsWith('/docs')) assert.match(await response.text(), /docs-content/, path);
}
assert.equal((await fetch(base + '/docs/not-a-topic')).status, 404);
const catalog = await fetch(base + '/site-api/catalog').then(r => r.json());
assert.equal(catalog.available, true);
assert.ok(catalog.models.every(m => typeof m.id === 'string' && typeof m.provider === 'string'));
console.log('Docs routes, genuine assets, unknown-topic 404, live catalog: PASS');
