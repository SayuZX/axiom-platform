const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const output = file.endsWith('SDKPrimitives.tsx') ? require('esbuild').buildSync({ absWorkingDir: root, entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty', '.module.css': 'empty' }, external: ['react', 'react-dom', 'react/jsx-runtime'] }).outputFiles[0].text : ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', output)(name => {
    if (!name.startsWith('.')) return require(name);
    const base = path.resolve(path.dirname(file), name);
    return load([base + '.tsx', base + '.ts', base + '/index.ts'].find(candidate => fs.existsSync(candidate)));
  }, mod, mod.exports);
  return mod.exports;
}
const { HistoryList } = load(path.join(root, 'src/desktop/HistoryList.tsx'));
function rowActions(experience, pinned = []) {
  const markup = renderToStaticMarkup(React.createElement(HistoryList, { experience, titles: ['Example chat'], pinned, archived: [], active: 'Example chat', onNew() {}, onOpen() {}, onPin() {}, onArchive() {} }));
  const row = markup.match(/<div class="d-history-actions">(.*?)<\/div>/s);
  assert.ok(row, 'History row actions exist');
  return [...row[1].matchAll(/aria-label="([^"]+)"/g)].map(match => match[1]);
}
test('Codex history exposes pin and archive without a conversation dots menu', () => { assert.deepEqual(rowActions('Codex'), ['Pin chat', 'Archive chat']); });
test('ChatGPT history keeps conversation dots and pin without an archive shortcut', () => { assert.deepEqual(rowActions('ChatGPT'), ['Conversation options', 'Pin chat']); });
test('both experiences expose unpin for a pinned chat', () => { assert.deepEqual(rowActions('Codex', ['Example chat']), ['Unpin chat', 'Archive chat']); assert.deepEqual(rowActions('ChatGPT', ['Example chat']), ['Conversation options', 'Unpin chat']); });
