const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const built = buildSync({ entryPoints: [path.join(__dirname, '../src/mobile/composerState.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' });
const mod = new Module(__filename + '.fixture', module);
mod._compile(built.outputFiles[0].text, __filename);
const { initialComposerState, focusComposer, blurComposer, resizeComposer } = mod.exports;

test('only the first composer focus in an app session uses the expanded layout', () => {
  let state = initialComposerState(813, 390);
  assert.equal(state.phase, 'untouched');
  state = focusComposer(state);
  assert.equal(state.phase, 'first-focus');
  state = blurComposer(state);
  assert.equal(state.phase, 'compact');
  state = focusComposer(state);
  assert.equal(state.phase, 'compact');
  assert.equal(state.focused, true);
});

test('Android keyboard dismissal collapses the first layout even when textarea never blurs', () => {
  let state = focusComposer(initialComposerState(813, 390));
  state = resizeComposer(state, 476, 390);
  assert.equal(state.keyboardOpen, true);
  assert.equal(state.phase, 'first-focus');
  state = resizeComposer(state, 813, 390);
  assert.equal(state.keyboardOpen, false);
  assert.equal(state.phase, 'compact');
  assert.equal(state.focused, false);
  state = resizeComposer(state, 476, 390, true); // Reopen while DOM focus is retained.
  assert.equal(state.phase, 'compact');
  assert.equal(state.keyboardOpen, true);
});

test('orientation changes reset viewport height without mistaking landscape for a keyboard', () => {
  let state = focusComposer(initialComposerState(813, 390));
  state = resizeComposer(state, 390, 813);
  assert.equal(state.keyboardOpen, false);
  assert.equal(state.restingHeight, 390);
});

test('a new app session restores first-focus behavior without persistent preferences', () => {
  const previous = blurComposer(focusComposer(initialComposerState(813, 390)));
  assert.equal(previous.phase, 'compact');
  assert.equal(focusComposer(initialComposerState(813, 390)).phase, 'first-focus');
});
