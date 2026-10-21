const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildSync } = require('esbuild');

// Bundle the real SDK renderer: its published ESM/CSS modules need a bundler.
// Only CSS is omitted here; browser-style checks run separately.
const root = path.resolve(__dirname, '..');
const result = buildSync({ absWorkingDir: root, entryPoints: ['src/components/RichTextRenderer.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty', '.module.css': 'empty' }, external: ['react', 'react-dom', 'react/jsx-runtime'] });
const mod = new Module(path.join(__dirname, 'rich-text-fixture.cjs'), module);
mod.filename = path.join(__dirname, 'rich-text-fixture.cjs'); mod.paths = module.paths;
mod._compile(result.outputFiles[0].text, mod.filename);
const { default: Renderer, richTextUrl } = mod.exports;
const render = text => renderToStaticMarkup(React.createElement(Renderer, { text }));

test('official SDK renders headings, emphasis, nested lists, quotes and GFM tables', () => {
  const html = render('# Heading\n\n**Bold** and *italic* with `inline code`.\n\n- One\n  - Nested\n\n> Quote\n\n| Name | Value |\n| --- | --- |\n| A | B |');
  for (const fragment of ['<h1>Heading</h1>', '<strong>Bold</strong>', '<em>italic</em>', '<ul>', '<li>Nested</li>', '<blockquote>', '<table>', '<th>Name</th>', '<td>A</td>']) assert.ok(html.includes(fragment), fragment);
  assert.ok(!html.includes('**Bold**'));
});

test('official SDK code blocks contain syntax tokens and a copy control without executing code', () => {
  const html = render('```javascript\nconst answer = 42;\n```');
  assert.ok(html.includes('<pre')); assert.ok(html.includes('token keyword')); assert.ok(html.includes('answer')); assert.ok(html.includes('<button')); assert.ok(/copy/i.test(html));
});

test('untrusted HTML, active links and remote images cannot execute or load automatically', () => {
  const html = render('<script>alert(1)</script>\n\n[Bad](javascript:alert%281%29) [Good](https://example.com)\n\n![Remote](https://example.com/track.png)\n\n<iframe src="https://example.com"></iframe>');
  assert.ok(!html.includes('<script')); assert.ok(!html.includes('<iframe')); assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('rel="noopener noreferrer"')); assert.ok(html.includes('target="_blank"'));
  assert.ok(!html.includes('<img')); assert.ok(html.includes('Tampilkan gambar'));
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///C:/secret', '//example.com/track', 'vbscript:msgbox(1)']) assert.equal(richTextUrl(url), '');
  assert.equal(richTextUrl('https://example.com/path'), 'https://example.com/path');
});

test('incomplete streamed Markdown and literal think tags in code remain renderable', () => {
  for (const text of ['**unfinished', '```typescript\nconst x =', '| A | B |\n| ---', '$$\nx^2']) assert.doesNotThrow(() => render(text));
  const html = render('```xml\n<think>literal</think>\n```');
  assert.ok(html.includes('think')); assert.ok(html.includes('literal')); assert.ok(!html.includes('<think>'));
});
