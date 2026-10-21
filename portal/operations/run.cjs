'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const core = path.join(root, 'apps/payment-core');
const consoleRoot = path.join(root, 'apps/merchant-console');
const mode = process.argv[2] || 'dev';
const envFile = process.env.AXIOM_ENV_FILE || path.join(root, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const env = { ...process.env, BUNDLE_GEMFILE: path.join(core, 'Gemfile') };
const ruby = process.env.RUBY || 'ruby';
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  process.exitCode = code;
}

function launch(binary, args, cwd = root, independent = false) {
  const child = spawn(binary, args, { cwd, env, stdio: 'inherit' });
  children.push(child);
  child.once('error', error => { console.error(error.message); if (!independent) stop(1); });
  child.once('exit', code => {
    const index = children.indexOf(child);
    if (index !== -1) children.splice(index, 1);
    if (stopping) return;
    if (independent) setTimeout(() => { if (!stopping) launch(binary, args, cwd, true); }, 10000);
    else stop(code || 0);
  });
  return child;
}

if (mode === 'test') {
  const checks = [
    [ruby, [path.join(core, 'test/storage.rb')]],
    [ruby, [path.join(core, 'test/channels.rb')]],
    [ruby, [path.join(core, 'test/support_policies.rb')]],
    [ruby, [path.join(core, 'test/support_chat.rb')]],
    [ruby, [path.join(core, 'test/menu_navigation.rb')]],
    [ruby, [path.join(core, 'test/financial_edges.rb')]],
    [ruby, [path.join(core, 'test/channel_edges.rb')]],
    [ruby, [path.join(core, 'test/telegram_tls.rb')]],
    [process.execPath, [path.join(core, 'test/http.cjs')]],
    [process.execPath, [path.join(core, 'test/telegram_worker.cjs')]],
    [process.execPath, [path.join(core, 'test/tunnel.cjs')]],
  ];
  for (const [binary, args] of checks) {
    const result = spawnSync(binary, args, { cwd: root, env: { ...env, RUBY: ruby }, stdio: 'inherit' });
    if (result.error) console.error(result.error.message);
    if (result.status !== 0) process.exit(result.status || 1);
  }
} else {
  if (!['dev', 'start', 'api', 'worker', 'console'].includes(mode)) throw new Error('Mode: dev, start, api, worker, console, test');
  if (env.TUNNEL_ONLY === 'true' && !['127.0.0.1', '::1'].includes(env.WEB_HOST || '127.0.0.1')) throw new Error('Tunnel origin console must bind to loopback.');
  if (mode !== 'console' && !path.isAbsolute(env.DATA_DIR || '')) throw new Error('DATA_DIR wajib path absolut ke ledger yang benar.');
  if (['dev', 'start', 'api'].includes(mode)) launch(ruby, [path.join(core, 'bin/api')]);
  if (['dev', 'start', 'worker'].includes(mode)) {
    for (const channel of ['email', 'telegram', 'payments']) {
      launch(ruby, [path.join(core, 'bin/worker'), `--channel=${channel}`], root, true);
    }
  }
  if (['dev', 'start', 'console'].includes(mode)) {
    const next = path.join(consoleRoot, 'node_modules/next/dist/bin/next');
    launch(process.execPath, [next, mode === 'dev' ? 'dev' : 'start', ...(mode === 'dev' ? ['--turbopack'] : []), '-H', env.WEB_HOST || '127.0.0.1', '-p', env.WEB_PORT || '3084'], consoleRoot);
  }
  process.once('SIGINT', () => stop());
  process.once('SIGTERM', () => stop());
}
