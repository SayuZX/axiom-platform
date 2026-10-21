const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/lib/reasoningTiming.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} }; new Function('module','exports',code)(mod,mod.exports);
const {createReasoningTimer,completedThinkingLabel} = mod.exports;

test('reasoning under one second does not invent a one-second duration', () => {
  let now = 100; const timer = createReasoningTimer(() => now);
  timer.observe('', ''); now = 3000; timer.observe('Thinking', '');
  now = 3200; timer.observe('Thinking', 'Answer');
  now = 10000; timer.finish();
  assert.equal(timer.elapsedMs(), 200);
  assert.equal(completedThinkingLabel(timer.elapsedMs()), 'Thought');
});

test('reasoning duration freezes at first answer and survives serialization', () => {
  let now = 0; const timer = createReasoningTimer(() => now);
  timer.observe('Thinking', ''); now = 2500; timer.observe('Thinking more', '');
  now = 3600; timer.observe('Thinking more', 'Answer begins');
  now = 50000; timer.observe('Thinking more', 'Long answer finishes'); timer.finish();
  const saved = JSON.parse(JSON.stringify({reasoningDurationMs:timer.elapsedMs()}));
  assert.equal(saved.reasoningDurationMs, 3600);
  assert.equal(completedThinkingLabel(saved.reasoningDurationMs), 'Thought for 3 seconds');
});

test('Stop freezes partial reasoning and missing/invalid durations remain unspecified', () => {
  let now = 0; const timer = createReasoningTimer(() => now); timer.observe('Partial reasoning', '');
  now = 1200; timer.finish(); now = 10000; timer.finish();
  assert.equal(completedThinkingLabel(timer.elapsedMs()), 'Thought for 1 second');
  assert.equal(createReasoningTimer(() => now).elapsedMs(), undefined);
  for (const value of [undefined, null, -1, Infinity, NaN, '2000', {}]) assert.equal(completedThinkingLabel(value), 'Thought');
});
