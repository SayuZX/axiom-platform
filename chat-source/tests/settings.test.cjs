const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const mod = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../src/lib/clientSettings.ts'), 'utf8');
new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod, mod.exports);
const { defaultSettings, normalizeSettings, loadSettings, saveSettings, prepareChatMessages, matchesShortcut, shortcutFromEvent, smartPunctuation, loadUsage, recordUsage } = mod.exports;
let records;
test.beforeEach(() => { records = new Map(); global.localStorage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) }; global.window = new EventTarget(); });

test('AXIOM navigation has no separate key page and retains inline model selection', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  for (const file of ['desktop/Desktop.tsx', 'desktop/SettingsPage.tsx', 'desktop/SettingsNavigation.tsx', 'desktop/ProfileMenu.tsx', 'desktop/ProviderModelMenu.tsx', 'desktop/NavigationPalette.tsx', 'desktop/UXControls.tsx', 'desktop/Onboarding.tsx', 'mobile/MobileApp.tsx', 'mobile/MobileSettings.tsx']) {
    assert.doesNotMatch(read(file), /Key dan model AXIOM|axiom-key|EndpointSettings/, file);
  }
  assert.equal(fs.existsSync(path.join(__dirname, '../src/desktop/EndpointSettings.tsx')), false);
  assert.doesNotMatch(read('desktop/Desktop.tsx'), /['"]Space['"]/);
  assert.match(read('desktop/Desktop.tsx'), /<ProviderModelMenu[^>]*onSelect=\{selectProviderModel\}/);
  assert.match(read('mobile/MobileApp.tsx'), /sheet === 'models'/);
  assert.match(read('mobile/MobileApp.tsx'), /selectedId: endpoint.id/);
  for (const file of ['desktop/FunctionalDialogs.tsx', 'mobile/MobileSettings.tsx']) assert.match(read(file), /<p>Dibuat oleh RAYH4ZE \(Raihan Nugroho\)\.<\/p>/);
});

test('settings validate imported values, retain safe defaults and discard unknown secrets', () => {
  const value = normalizeSettings({ timeoutSeconds: Infinity, uiSize: 999, defaultEffort: 5, efforts: [2, 2, 3, 99], accent: 'url(evil)', notifications: 'true', instructions: 'x'.repeat(30000), billingUrl: 'https://user:secret@example.com', apiKey: 'fake-secret' });
  assert.equal(value.timeoutSeconds, 120); assert.equal(value.uiSize, 24); assert.equal(value.defaultEffort, 2); assert.deepEqual(value.efforts, [2, 3]); assert.equal(value.accent, '#ffdf39'); assert.equal(value.notifications, false); assert.equal(value.instructions.length, 20000); assert.equal(value.billingUrl, ''); assert.ok(!JSON.stringify(value).includes('fake-secret'));
});
test('settings persist and legacy reduced-motion preference migrates without disabling system mode', () => {
  localStorage.setItem('client-reduce-motion', 'true'); assert.equal(loadSettings().motion, 'on');
  const value = saveSettings({ ...defaultSettings(), theme: 'light', writingStyle: 'concise' });
  assert.deepEqual(loadSettings(), value); assert.equal(value.motion, 'system');
  localStorage.setItem('client-settings-v1', 'broken JSON'); assert.deepEqual(loadSettings(), defaultSettings());
});
test('instructions, memory and writing style affect only the next request without mutating stored history', () => {
  const history = [{ role: 'user', text: 'Earlier' }, { role: 'assistant', text: 'Answer' }, { role: 'user', text: 'Current', images: ['image-data'] }];
  const original = JSON.stringify(history), prefs = { ...defaultSettings(), instructions: 'Use Indonesian.', memoriesEnabled: true, memories: ['I use Windows.'], writingStyle: 'concise' };
  const result = prepareChatMessages(history, prefs); assert.equal(JSON.stringify(history), original); assert.equal(result[0].text, 'Earlier'); assert.match(result[2].text, /Use Indonesian/); assert.match(result[2].text, /I use Windows/); assert.match(result[2].text, /concise/); assert.match(result[2].text, /Current$/); assert.deepEqual(result[2].images, ['image-data']);
  assert.equal(prepareChatMessages(history, defaultSettings()), history);
});
test('shortcut matching honors custom bindings and disabled actions', () => {
  const event = { key: 'k', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false };
  assert.equal(shortcutFromEvent(event), 'Ctrl+Shift+K'); assert.equal(matchesShortcut(event, 'Ctrl+Shift+K'), true); assert.equal(matchesShortcut(event, 'Ctrl+K'), false); assert.equal(matchesShortcut(event, ''), false);
  assert.equal(shortcutFromEvent({ ...event, key: 'a', ctrlKey: false }), '');
});

test('temporary personalization independently controls memories and custom instructions without changing preferences', () => {
  const history = [{ role: 'user', text: 'Current' }];
  const settings = { ...defaultSettings(), instructions: 'Use Indonesian.', writingStyle: 'detailed', memoriesEnabled: true, memories: ['Saved note.'] };
  const original = JSON.stringify(settings);
  const privateResult = prepareChatMessages(history, settings, { suppressMemories: true, suppressInstructions: true });
  assert.equal(privateResult, history);
  const memoryOnly = prepareChatMessages(history, settings, { suppressInstructions: true });
  assert.match(memoryOnly[0].text, /Saved note/);
  assert.doesNotMatch(memoryOnly[0].text, /Use Indonesian|Prefer detailed/);
  const instructionsOnly = prepareChatMessages(history, settings, { suppressMemories: true });
  assert.match(instructionsOnly[0].text, /Use Indonesian/);
  assert.match(instructionsOnly[0].text, /Prefer detailed/);
  assert.doesNotMatch(instructionsOnly[0].text, /Saved note/);
  assert.equal(JSON.stringify(settings), original);
  assert.equal(history[0].text, 'Current');
});
test('smart punctuation changes only trailing plain-text patterns and leaves fenced code alone', () => {
  assert.equal(smartPunctuation('Wait...'), 'Wait…'); assert.equal(smartPunctuation('a ->'), 'a →'); assert.equal(smartPunctuation('hello--'), 'hello—'); assert.equal(smartPunctuation('```js\nx ->'), '```js\nx ->');
});
test('usage stores explicit reported numbers and metadata only, never fabricated token estimates or credentials', () => {
  recordUsage({ provider: 'Fixture', model: 'alpha', source: 'chat', status: 'completed', input: 120, output: 30, key: 'fake-secret', prompt: 'private prompt' });
  recordUsage({ provider: 'Fixture', model: 'beta', source: 'agent', status: 'failed', input: NaN });
  const entries = loadUsage(); assert.equal(entries.length, 2); assert.equal(entries[0].input, 120); assert.ok(!Object.hasOwn(entries[1], 'input')); const raw = localStorage.getItem('client-usage-v1'); assert.ok(!raw.includes('fake-secret')); assert.ok(!raw.includes('private prompt'));
});
