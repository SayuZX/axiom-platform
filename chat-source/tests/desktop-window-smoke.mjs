import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';

// Opt-in integration test against our compiled app, never an existing user window.
// CDP is enabled only in this child process and its isolated temporary WebView profile.
const root = fileURLToPath(new URL('../', import.meta.url));
const executable = resolve(process.env.SAKELAR_TEST_EXE || join(root, 'src-tauri/target/release/SuperGPT.exe'));
const temporaryRoot = await realpath(tmpdir());
const profile = await mkdtemp(join(temporaryRoot, 'sakelar-window-smoke-'));
const screenshots = process.env.SAKELAR_TEST_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });
let app, browser, page, exited;
const errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await pause(100); }
  throw Error('Timed out: ' + label);
}
async function launch() {
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  app = spawn(executable, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + port } });
  exited = new Promise(resolve => app.once('exit', resolve));
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; } }, 'our WebView CDP');
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  await waitFor(() => browser.contexts().some(context => context.pages().some(item => /tauri\.localhost/.test(item.url()))), 'our app page');
  page = browser.contexts().flatMap(context => context.pages()).find(item => /tauri\.localhost/.test(item.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.d-titlebar').waitFor();
}
async function close() {
  await page.locator('.d-native-window-controls button[aria-label="Close window"]').click().catch(error => {
    if (!/closed|destroyed/i.test(error.message)) throw error;
  });
  await waitFor(() => app.exitCode !== null, 'native Close button');
  assert.equal(await exited, 0);
  await browser.close().catch(() => {}); browser = null; app = null;
  await pause(500);
}
async function screenshot(name) {
  if (screenshots) {
    await page.screenshot({ path: join(screenshots, name + '.png') });
    await page.locator('.d-titlebar').screenshot({ path: join(screenshots, name + '-header.png') });
  }
}
try {
  await launch();
  assert.equal(await page.locator('.d-titlebar button').count(), 3, 'Name onboarding shows only native window controls');
  assert.equal((await page.locator('.d-titlebar').innerText()).trim(), '');
  await page.getByRole('button', { name: 'Maximize window', exact: true }).click();
  await page.getByRole('button', { name: 'Restore window', exact: true }).waitFor();
  await screenshot('onboarding-name');
  await page.locator('#setup-name').fill('Desktop persistence test');
  await page.getByRole('button', { name: 'Lanjut', exact: true }).click();
  await page.locator('.d-titlebar .d-back').waitFor();
  assert.equal(await page.locator('.d-auth-page').count(), 0, 'Name submission opens chat without endpoint onboarding');
  await screenshot('onboarding-complete');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('client-local-profile-v1')));
  assert.equal(saved?.name, 'Desktop persistence test', 'Continue must persist the name and finish onboarding');
  await close();
  console.log('PASS name is saved and onboarding finishes; native Close exits cleanly.');

  await launch();
  assert.equal(await page.locator('.d-auth-page').count(), 0);
  assert.equal(await page.locator('.d-titlebar .d-back').count(), 1, 'Main app restores navigation after onboarding');
  assert.equal(await page.getByRole('button', { name: 'Space', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  assert.equal(await page.getByRole('menuitem', { name: 'Key dan model AXIOM', exact: true }).count(), 0);
  await page.getByRole('menuitem', { name: 'About', exact: true }).click();
  await page.getByText('Dibuat oleh RAYH4ZE (Raihan Nugroho).', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_decorated', { label: 'main' })), false);
  const header = await page.locator('.d-titlebar').boundingBox(); assert.ok(header.y < 1);
  await page.getByRole('button', { name: 'Maximize window', exact: true }).click();
  await page.getByRole('button', { name: 'Restore window', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_maximized', { label: 'main' })), true);
  await screenshot('desktop-dark');
  await page.getByRole('button', { name: 'Restore window', exact: true }).click();
  await page.getByRole('button', { name: 'Maximize window', exact: true }).waitFor();
  await page.keyboard.press('Control+,');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('combobox', { name: 'Appearance mode' }).selectOption('light');
  await page.waitForFunction(() => document.documentElement.dataset.clientTheme === 'light');
  const lightContrast = await page.locator('.d-native-window-controls button').first().evaluate(element => {
    const luminance = value => {
      const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => { const s = channel / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const foreground = luminance(getComputedStyle(element).color), background = luminance(getComputedStyle(document.querySelector('.d-root')).backgroundColor);
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  });
  assert.ok(lightContrast >= 3, 'Window icons must remain visible against the light titlebar');
  await screenshot('desktop-light');
  await close();
  console.log('PASS removed navigation, formal About, frameless controls, dark/light themes.');

  await launch();
  assert.equal(await page.locator('.d-auth-page').count(), 0);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('client-local-profile-v1')));
  assert.equal(persisted.name, 'Desktop persistence test');
  await page.getByRole('button', { name: 'Minimize window', exact: true }).click();
  await waitFor(() => page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_minimized', { label: 'main' })), 'native minimize');
  await close();
  assert.deepEqual(errors, []);
  console.log('PASS three process launches: name persists, onboarding does not recur, minimize/close work.');
} finally {
  if (app?.exitCode === null) { app.kill(); await exited; }
  await browser?.close().catch(() => {});
  assert.ok(resolve(profile).startsWith(resolve(temporaryRoot) + sep) && profile.includes('sakelar-window-smoke-'));
  // WebView subprocesses may briefly keep LevelDB files open after the parent exits.
  await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
}
