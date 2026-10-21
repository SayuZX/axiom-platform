const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const bootstrap = fs.readFileSync(path.join(__dirname, '../public/theme-init.js'), 'utf8');
function documentFixture() {
  const meta = { content: '', setAttribute(key, value) { this[key] = value; } };
  const root = { dataset: {}, style: { setProperty(key, value) { this[key] = value; } } };
  return { documentElement: root, querySelector() { return meta; }, meta };
}
test('saved/system theme applies before React; invalid or inaccessible storage has a deterministic fallback', () => {
  for (const [value, systemLight, expected] of [[{ theme: 'light' }, false, 'light'], [{ theme: 'dark' }, true, 'dark'], [{ theme: 'system' }, true, 'light'], [{ theme: 'system' }, false, 'dark'], [{ theme: 'invalid' }, true, 'dark'], [null, false, 'dark'], ['corrupt', false, 'dark'], ['throws', true, 'dark']]) {
    const document = documentFixture();
    vm.runInNewContext(bootstrap, { document, navigator: { userAgent: 'Chrome' }, location: { search: '' }, URLSearchParams, window: { matchMedia() { return { matches: systemLight }; } }, localStorage: { getItem() { if (value === 'throws') throw Error('denied'); return value === 'corrupt' ? '{' : JSON.stringify(value); } } });
    assert.equal(document.documentElement.dataset.clientTheme, expected); assert.equal(document.documentElement.dataset.theme, expected); assert.equal(document.documentElement.style.colorScheme, expected);
  }
});

test('system changes, explicit overrides, persistence, other-window changes and listener cleanup', () => {
  const previous = Object.fromEntries(['window', 'document', 'localStorage'].map(key => [key, global[key]]));
  const values = new Map([['client-settings-v1', JSON.stringify({ theme: 'system' })]]);
  class Media extends EventTarget { constructor(matches) { super(); this.matches = matches; this.listeners = new Set(); } addEventListener(name, fn) { super.addEventListener(name, fn); this.listeners.add(fn); } removeEventListener(name, fn) { super.removeEventListener(name, fn); this.listeners.delete(fn); } change(value) { this.matches = value; this.dispatchEvent(new Event('change')); } }
  const color = new Media(true), motion = new Media(false), nativeCalls = [];
  const cells = []; let cursor = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
    useEffect(run, deps) { const index = cursor++, previous = cells[index]; if (!previous || deps.some((value, i) => value !== previous.deps[i])) { previous?.cleanup?.(); cells[index] = { deps, cleanup: run() }; } },
  };
  try {
    global.window = new EventTarget(); window.matchMedia = query => query.includes('color-scheme') ? color : motion; window.SuperGPTTheme = { postMessage(value) { nativeCalls.push(value); } };
    global.document = documentFixture(); global.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
    const code = buildSync({ entryPoints: [path.join(__dirname, '../src/desktop/useClientSettings.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'] }).outputFiles[0].text;
    const mod = new Module(__filename + '.fixture', module); mod.paths = module.paths; mod.require = name => name === 'react' ? hooks : require(name); mod._compile(code, __filename);
    let api; const render = () => { cursor = 0; api = mod.exports.useClientSettings(message => { throw Error(message); }); };
    render(); assert.equal(document.documentElement.dataset.theme, 'light');
    color.change(false); assert.equal(document.documentElement.dataset.theme, 'dark'); assert.equal(JSON.parse(values.get('client-settings-v1')).theme, 'system');
    api.update({ theme: 'light' }); render(); assert.equal(document.documentElement.dataset.theme, 'light'); assert.equal(JSON.parse(values.get('client-settings-v1')).theme, 'light');
    color.change(true); color.change(false); assert.equal(document.documentElement.dataset.theme, 'light');
    assert.equal(document.meta.content, '#ffffff'); assert.equal(document.documentElement.style.colorScheme, 'light');
    values.set('client-settings-v1', JSON.stringify({ ...api.settings, theme: 'dark' })); const event = new Event('storage'); event.key = 'client-settings-v1'; window.dispatchEvent(event); render(); assert.equal(document.documentElement.dataset.theme, 'dark');
    assert.equal(nativeCalls.at(-1), 'dark'); assert.equal(color.listeners.size, 1); assert.equal(motion.listeners.size, 1);
    for (const cell of cells) cell?.cleanup?.(); assert.equal(color.listeners.size, 0); assert.equal(motion.listeners.size, 0);
  } finally { for (const key of Object.keys(previous)) { if (previous[key] === undefined) delete global[key]; else global[key] = previous[key]; } }
});
