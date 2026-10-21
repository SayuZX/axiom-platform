const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { buildSync } = require('esbuild');
const built = buildSync({ entryPoints: [path.join(__dirname, '../src/lib/mobileBackground.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' });
function fixture(native = true) {
  const previous = global.window;
  global.window = new EventTarget();
  const sent = [], listeners = [];
  if (native) window.SuperGPTTask = { postMessage: raw => sent.push(JSON.parse(raw)), addEventListener: (_, listener) => listeners.push(listener) };
  const mod = new Module(__filename + '.fixture', module);
  mod._compile(built.outputFiles[0].text, __filename);
  return { begin: mod.exports.beginMobileBackgroundTask, sent, listeners,
    restore: () => { if (previous === undefined) delete global.window; else global.window = previous; }
  };
}
test('background task starts once per ID and ends only after all owners release', () => {
  const f = fixture();
  try {
    const first = f.begin('request-1'), second = f.begin('request-1'), other = f.begin('request-2');
    assert.deepEqual(f.sent, [{ op: 'start', id: 'request-1' }, { op: 'start', id: 'request-2' }]);
    first(); first();
    assert.equal(f.sent.length, 2);
    second(); second(); other();
    assert.deepEqual(f.sent.slice(2), [{ op: 'finish', id: 'request-1' }, { op: 'finish', id: 'request-2' }]);
    assert.equal(f.listeners.length, 1);
  } finally { f.restore(); }
});
test('browser preview and invalid identifiers do not start native work', () => {
  const f = fixture(false);
  try { f.begin('request')(); assert.equal(f.sent.length, 0); }
  finally { f.restore(); }
  const n = fixture();
  try { n.begin('')(); n.begin('x'.repeat(101))(); assert.equal(n.sent.length, 0); }
  finally { n.restore(); }
});
test('native start failure reports limitation instead of claiming background success', () => {
  const f = fixture();
  try {
    let warning = '';
    window.addEventListener('client-toast', event => { warning = event.detail; });
    const finish = f.begin('request-1');
    f.listeners[0]({ data: JSON.stringify({ ok: false }) });
    assert.match(warning, /Tetap buka aplikasi/);
    finish();
  } finally { f.restore(); }
});
