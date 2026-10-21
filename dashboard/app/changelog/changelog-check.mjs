import assert from 'node:assert/strict';

const origin = process.env.AXIOM_SMOKE_ORIGIN || 'http://127.0.0.1:3000';
const get = async path => {
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 200, path);
  return response.text();
};
const feed = JSON.parse(await get('/site-api/announcements'));
const index = await get('/changelog');
const sitemap = await get('/sitemap.xml');
assert.match(index, /Pembaruan produk/);
for (const item of feed.items) {
  assert.equal(item.audience, 'public');
  const path = `/changelog/${item.slug}`;
  assert.ok(index.includes(path), `Index links ${item.slug}`);
  assert.ok(sitemap.includes(path), `Sitemap includes ${item.slug}`);
  const html = await get(path);
  assert.ok(html.includes(`rel="canonical" href="https://ai.axiomcreative.xyz${path}"`), 'Article canonical');
  assert.match(html, /menit baca/);
}
assert.match(await get('/changelog?q=zzzz-no-matching-announcement-zzzz'), /Tidak ada pembaruan yang cocok/);
assert.equal((await fetch(new URL('/changelog/nonexistent-smoke-article', origin))).status, 404);
console.log(`PASS changelog index, filters, ${feed.items.length} public articles, canonical, sitemap, missing article`);
