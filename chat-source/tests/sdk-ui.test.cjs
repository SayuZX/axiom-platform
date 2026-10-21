const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const built = buildSync({ absWorkingDir: root, entryPoints: ['src/components/SDKPrimitives.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty', '.module.css': 'empty' }, external: ['react', 'react-dom', 'react/jsx-runtime'] });
const mod = new Module(path.join(__dirname, 'sdk-ui-fixture.cjs'), module);
mod.filename = path.join(__dirname, 'sdk-ui-fixture.cjs'); mod.paths = module.paths; mod._compile(built.outputFiles[0].text, mod.filename);
const ui = mod.exports, render = (name, props) => renderToStaticMarkup(React.createElement(ui[name], props));

test('SDK inputs retain native validation, password masking and explicit label association', () => {
  const html = render('ClientInput', { id: 'gateway-key', type: 'password', value: 'fixture-key', onChange() {}, required: true, invalid: true, autoComplete: 'new-password' });
  for (const part of ['id="gateway-key"', 'type="password"', 'required=""', 'autoComplete="new-password"', 'data-invalid=""', 'aria-invalid="true"']) assert.ok(html.includes(part), part);
});
test('SDK switch keeps its controlled checked state and disabled semantics', () => {
  const html = render('ClientSwitch', { label: 'Notifications', value: true, change() {}, disabled: true });
  assert.ok(html.includes('role="switch"')); assert.ok(html.includes('aria-label="Notifications"')); assert.ok(html.includes('aria-checked="true"')); assert.ok(html.includes('disabled=""'));
});
test('SDK buttons preserve form submission and prevent disabled actions', () => {
  const html = render('ClientButton', { type: 'submit', color: 'primary', variant: 'solid', disabled: true, children: 'Save endpoint' });
  assert.ok(html.includes('type="submit"')); assert.ok(html.includes('disabled=""')); assert.ok(html.includes('data-variant="solid"')); assert.ok(html.includes('Save endpoint'));
});
