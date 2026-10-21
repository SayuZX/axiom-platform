const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { renderToStaticMarkup } = require('react-dom/server');
const built = require('esbuild').buildSync({ entryPoints: ['src/mobile/MobileResponseActions.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react/jsx-runtime'] }).outputFiles[0].text;

function fixture() {
  const cells = []; let cursor = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], value => { cells[index] = value; }]; },
    useRef(initial) { const index = cursor++; return cells[index] ||= { current: initial }; },
    useEffect(run) { const index = cursor++; if (!cells[index]) cells[index] = { cleanup: run() }; },
  };
  const mod = new Module(__filename + '.fixture', module); mod.paths = module.paths;
  mod.require = name => name === 'react' ? hooks : require(name); mod._compile(built, __filename);
  return { ...mod.exports, render(props) { cursor = 0; return mod.exports.MobileResponseActions(props); }, unmount() { cells.forEach(cell => cell?.cleanup?.()); } };
}

test('response has four actions; copy confirms only success, resets after 2 seconds and handles failures', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const writes = [], notices = []; let fail = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { async writeText(text) { if (fail) throw Error('denied'); writes.push(text); } } } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = fixture(), props = { text: 'Only this response', onNotice: text => notices.push(text), onMore() {} };
  try {
    let tree = app.render(props);
    assert.equal(tree.props.children.length, 4);
    tree.props.children[0].props.onClick(); await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(writes, ['Only this response']);
    assert.match(renderToStaticMarkup(app.render(props)), /Response copied/);
    t.mock.timers.tick(1999); assert.match(renderToStaticMarkup(app.render(props)), /Response copied/);
    t.mock.timers.tick(1); assert.doesNotMatch(renderToStaticMarkup(app.render(props)), /Response copied/);
    fail = true; app.render(props).props.children[0].props.onClick(); await Promise.resolve(); await Promise.resolve();
    assert.doesNotMatch(renderToStaticMarkup(app.render(props)), /Response copied/);
    assert.deepEqual(notices, ['Penyalinan tidak tersedia.']);
  } finally { app.unmount(); t.mock.timers.reset(); if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator; }
});

test('sharing fallback copies only response text; cancellation does not show a false error', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const writes = [], notices = [], app = fixture();
  const nav = { clipboard: { async writeText(text) { writes.push(text); } } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
  try {
    await app.shareMobileResponse('Share this', text => notices.push(text));
    assert.deepEqual(writes, ['Share this']); assert.equal(notices.length, 1);
    nav.share = async () => { const error = new Error('cancel'); error.name = 'AbortError'; throw error; };
    await app.shareMobileResponse('Cancel this', text => notices.push(text));
    assert.equal(notices.length, 1);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator; }
});
