const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildSync } = require('esbuild');
const built = buildSync({ entryPoints: [path.join(__dirname, '../src/mobile/MobileSidebar.tsx')], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react/jsx-runtime'] }).outputFiles[0].text;

test('sidebar skeleton resolves to filtered history and cancels superseded preparation', () => {
  const originalWindow = global.window;
  const pending = new Map(), cells = []; let cursor = 0, nextId = 0;
  global.window = { requestIdleCallback(callback) { pending.set(++nextId, callback); return nextId; }, cancelIdleCallback(id) { pending.delete(id); } };
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
    useRef(value) { const index = cursor++; return cells[index] ||= { current: value }; },
    useEffect(run, deps) { const index = cursor++, previous = cells[index]; if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) { previous?.cleanup?.(); cells[index] = { deps, cleanup: run() }; } },
  };
  const mod = new Module(__filename + '.fixture', module); mod.paths = module.paths;
  mod.require = name => name === 'react' ? hooks : require(name); mod._compile(built, __filename);
  const props = { closeRef: { current: null }, name: 'Local profile', titles: ['Visible chat', 'Archived chat'], pinned: [], archived: ['Archived chat'], onClose() {}, onOpen() {}, onNew() {}, onSettings() {}, onNavigate() {} };
  const render = () => { cursor = 0; return renderToStaticMarkup(mod.exports.MobileSidebar(props)); };
  const flush = () => { const jobs = [...pending.values()]; pending.clear(); jobs.forEach(run => run()); };
  try {
    const loading = render();
    assert.match(loading, /aria-busy="true"/);
    assert.equal((loading.match(/class="m-sidebar-skeleton-row"/g) || []).length, 3);
    assert.doesNotMatch(loading, /Belum ada obrolan/);
    assert.match(loading, /data-icon="profile"/);
    flush();
    const ready = render();
    assert.match(ready, /Visible chat/); assert.doesNotMatch(ready, /Archived chat|m-sidebar-skeleton/);
    props.pinned = ['Visible chat'];
    const pinned = render(); assert.match(pinned, /Disematkan/); assert.match(pinned, /data-icon="comment"/); assert.doesNotMatch(pinned, /Terkini/);
    props.activeTitle = 'Visible chat';
    assert.match(render(), /aria-current="page"/);
    props.titles = ['Visible chat', 'Recent chat', 'Archived chat'];
    render(); flush();
    const grouped = render();
    assert.match(grouped, /Disematkan/); assert.match(grouped, /Terkini/);
    assert.equal((grouped.match(/aria-current="page"/g) || []).length, 1);
    assert.doesNotMatch(grouped, /Archived chat/);
    props.pinned = [];
    assert.match(render(), /aria-current="page"/);
    props.titles = ['Superseded']; render(); assert.equal(pending.size, 1);
    props.titles = []; render(); assert.equal(pending.size, 1);
    flush();
    const empty = render(); assert.match(empty, /Belum ada obrolan/); assert.doesNotMatch(empty, /Superseded|m-sidebar-skeleton/);
  } finally { for (const cell of cells) cell?.cleanup?.(); if (originalWindow === undefined) delete global.window; else global.window = originalWindow; }
});
