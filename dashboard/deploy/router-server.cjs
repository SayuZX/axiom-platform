require('./codebuddy-dns.cjs').install();
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const { DatabaseSync } = require('node:sqlite');
const accountBinding = require('./.next-cli-build/server/axiom-patches/account-binding.cjs');
const management = require('./.next-cli-build/server/axiom-patches/management-api.cjs');
const noticeHttp = require('./.next-cli-build/server/axiom-patches/http-notice.cjs');
require('./.next-cli-build/server/axiom-patches/harbor-free.cjs').install();
let accountDb;

const origCreate = http.createServer.bind(http);

// Per-process secret proving x-9r-real-ip was stamped below rather than sent by the client.
// A bare `next start` / `next dev` never loads this file, so it cannot produce a matching
// header even though the env var is inherited by child processes. Named like x-9r-cli-token
// so the request-detail header sanitizer redacts it too.
const PEER_TOKEN = crypto.randomBytes(24).toString("hex");
process.env.NINEROUTER_PEER_TOKEN = PEER_TOKEN;

let backgroundRefreshStarted = false;

function startBackgroundTokenRefreshFromCustomServer() {
  if (backgroundRefreshStarted) return;
  backgroundRefreshStarted = true;
  // Prefer source path (repo / standalone that still has src). Fail-open if missing
  // — initializeApp also starts the same scheduler when the Next app boots.
  const modPath = path.join(__dirname, "src", "sse", "services", "backgroundTokenRefresh.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        m.startBackgroundTokenRefresh();
      } catch (e) {
        console.error("[BackgroundTokenRefresh] start failed:", e && e.message ? e.message : e);
      }
      const stop = () => {
        try {
          m.stopBackgroundTokenRefresh();
        } catch {
          /* ignore */
        }
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((e) => {
      // Expected in published CLI standalone (src/ not on disk). App bootstrap covers it.
      if (process.env.DEBUG_BACKGROUND_TOKEN_REFRESH) {
        console.error("[BackgroundTokenRefresh] import failed:", e && e.message ? e.message : e);
      }
    });
}

// Wrap Next standalone HTTP server: derive client IP from the TCP socket
// (unspoofable) and strip client-supplied forwarding headers so downstream
// rate-limiting keys on the real peer address instead of attacker-controlled XFF.
http.createServer = (...args) => {
  const handler = args.find((a) => typeof a === "function");
  const rest = args.filter((a) => typeof a !== "function");
  if (!handler) return origCreate(...args);
  const wrapped = (req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    const modelDiscovery = (req.method === 'GET' || req.method === 'HEAD') && /^\/(?:api\/)?v1\/models\/?$/.test(pathname);
    if (!modelDiscovery && /^\/(?:(?:api\/)?v1(?:beta)?|codex|responses)(?:\/|$)/.test(pathname)) {
      try {
        const maintenance = JSON.parse(fs.readFileSync(process.env.AXIOM_MAINTENANCE_FILE || 'C:/ProgramData/AxiomAi/maintenance/settings.json', 'utf8'));
        let exempt = false;
        if (maintenance.enabled === true) {
          const authorization = req.headers.authorization;
          const key = typeof authorization === 'string' && /^Bearer /i.test(authorization) ? authorization.slice(7).trim() : req.headers['x-api-key'] || req.headers['x-goog-api-key'];
          if (typeof key === 'string' && key.length > 0 && key.length <= 512) {
            if (!accountDb) {
              accountDb = new DatabaseSync(path.join(process.env.DATA_DIR || process.cwd(), 'db', 'data.sqlite'));
              accountDb.exec('PRAGMA busy_timeout=5000');
            }
            const row = accountDb.prepare('SELECT id, isActive, expiresAt FROM apiKeys WHERE key = ?').get(key);
            exempt = row?.id === '8a2d3170-4eee-40bf-ba95-e7bcdfca4be1' && row.isActive === 1 && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now());
          }
        }
        if (maintenance.enabled === true && !exempt) {
          res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': String(maintenance.retryAfter || 300) });
          res.end(JSON.stringify({ error: { message: maintenance.message, type: 'service_unavailable', code: 'maintenance' } }));
          return;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '60' });
          res.end(JSON.stringify({ error: { message: 'Konfigurasi layanan belum tersedia.', code: 'maintenance_configuration_unavailable' } }));
          return;
        }
      }
    }
    if (pathname === '/dashboard/billing' || pathname.startsWith('/dashboard/billing/')) {
      res.writeHead(307, { Location: '/manage/billing', 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    if (pathname === '/dashboard/models' || pathname.startsWith('/dashboard/models/')) {
      res.writeHead(307, { Location: '/manage/models', 'Cache-Control': 'no-store' });res.end();return;
    }
    if (pathname === '/dashboard/settings/pricing' || pathname.startsWith('/dashboard/settings/pricing/')) {
      res.writeHead(307, { Location: '/manage/pricing', 'Cache-Control': 'no-store' });res.end();return;
    }
    if (/^\/api\/(billing|portal)(\/|$)/.test(pathname) || /^\/(portal|buy)(\/|$)/.test(pathname) || /\/static\/chunks\/app\/\(dashboard\)\/dashboard\/billing\//.test(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('Not found');
      return;
    }
    const socketIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
    const xff = req.headers["x-forwarded-for"];
    const xRealIp = req.headers["x-real-ip"];
    const viaProxy = !!(xff || xRealIp);
    const isLoopbackProxy = socketIp === "127.0.0.1" || socketIp === "::1" || socketIp === "::ffff:127.0.0.1";
    // Internal ax-shim discovery only: require loopback plus the dedicated key.
    const rawCatalog = req.headers['x-9r-raw-catalog'];
    delete req.headers['x-9r-raw-catalog'];
    if (req.method === 'GET' && /^\/(?:api\/)?v1\/models\/?$/.test(pathname) && rawCatalog === '1' && isLoopbackProxy && !viaProxy && !req.headers.forwarded && !req.headers['cf-connecting-ip']) {
      try {
        const discoveryKey = fs.readFileSync('C:/ProgramData/openclaw-9router.key', 'utf8').trim();
        if (discoveryKey && req.headers.authorization === `Bearer ${discoveryKey}`) req.headers['x-9r-raw-catalog'] = PEER_TOKEN;
      } catch { /* Missing key leaves public-only discovery. */ }
    }
    // Trust forwarding headers only when the TCP peer is a local reverse proxy.
    // Direct/public sockets remain keyed by the unspoofable peer address.
    const proxyIp = xRealIp || (xff ? String(xff).split(",")[0].trim() : "");
    const ip = isLoopbackProxy && proxyIp ? proxyIp : socketIp;
    delete req.headers["x-9r-real-ip"];
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-9r-via-proxy"];
    delete req.headers["x-9r-peer-token"];
    req.headers["x-9r-real-ip"] = ip;
    req.headers["x-9r-peer-token"] = PEER_TOKEN;
    if (viaProxy) req.headers["x-9r-via-proxy"] = "1";
    try {
      if (!accountDb) {
        accountDb = new DatabaseSync(path.join(process.env.DATA_DIR || process.cwd(), 'db', 'data.sqlite'));
        accountDb.exec('PRAGMA busy_timeout=5000');
      }
      noticeHttp.wrap(req, res, accountDb);
      if (pathname === '/api/axiom/usage' || pathname === '/api/axiom/pricing') {
        management.handle(req, res, accountDb, {
          ratesFile: path.join(process.env.DATA_DIR || process.cwd(), 'axiom-rates.json'),
          retailFile: path.join(process.env.DATA_DIR || process.cwd(), 'axiom-retail.json'),
          listModels: async key => {
            const response = await fetch(`http://127.0.0.1:${process.env.PORT || 20128}/v1/models`, { headers: { Authorization: `Bearer ${key}` } });
            if (!response.ok) throw new Error('Model catalog unavailable');
            return (await response.json()).data.map(model => model.id);
          }
        }).catch(error => {
          console.error('AXIOM management:', error.message);
          if (!res.headersSent) { res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: { code: 'management_unavailable' } })); }
        });
        return;
      }
      return accountBinding.run(req, accountDb, () => handler(req, res));
    } catch (error) {
      const status = error.status || 503;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: { code: error.code || 'account_binding_unavailable', message: error.status ? error.message : 'Account routing is unavailable.', type: status === 400 ? 'invalid_request_error' : 'server_error' } }));
    }
  };
  const server = origCreate(...rest, wrapped);
  server.once("listening", () => {
    startBackgroundTokenRefreshFromCustomServer();
  });
  const origEmit = server.emit;
  // JBR 25 sends h2c upgrades that the HTTP/1.1 server would otherwise close.
  server.emit = function (event, ...eventArgs) {
    const [req, socket, head] = eventArgs;
    if (event !== "upgrade" || String(req.headers.upgrade || "").toLowerCase() !== "h2c") {
      return origEmit.call(this, event, ...eventArgs);
    }

    const contentLength = Number(req.headers["content-length"] || 0);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      socket.destroy();
      return true;
    }
    const chunks = [head];
    let received = head.length;
    const serve = () => {
      // Replay the upgraded request through the existing HTTP/1.1 handler.
      const replay = new http.IncomingMessage(socket);
      Object.assign(replay, { method: req.method, url: req.url, headers: req.headers, complete: true });
      if (received) replay.push(Buffer.concat(chunks, received).subarray(0, contentLength));
      replay.push(null);
      const res = new http.ServerResponse(replay);
      res.shouldKeepAlive = false;
      res.assignSocket(socket);
      res.once("finish", () => socket.end());
      Promise.resolve().then(() => wrapped(replay, res)).catch((error) => {
        console.error("Failed to downgrade h2c request", error);
        socket.destroy();
      });
    };
    if (received >= contentLength) serve();
    else {
      socket.on("data", function readBody(chunk) {
        chunks.push(chunk);
        received += chunk.length;
        if (received < contentLength) return;
        socket.off("data", readBody);
        serve();
      });
      socket.resume();
    }
    delete req.headers.upgrade;
    delete req.headers["http2-settings"];
    req.headers.connection = "close";
    return true;
  };
  return server;
};

if (require.main === module) {
  const portArgIndex = process.argv.indexOf("--port");
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    process.env.PORT = process.argv[portArgIndex + 1];
  }
  const standalone = path.join(__dirname, "server.js");
  const nestedStandalone = path.join(__dirname, ".next", "standalone", "server.js");
  if (fs.existsSync(standalone)) {
    require(standalone);
  } else if (fs.existsSync(nestedStandalone)) {
    require(nestedStandalone);
  } else {
    // Repo checkout has no standalone build next to us. `next start` builds its HTTP
    // server in-process, so the wrapper above still sanitizes every request.
    const nextBin = require.resolve("next/dist/bin/next");
    process.argv = [process.argv[0], nextBin, "start", ...process.argv.slice(2)];
    require(nextBin);
  }
}
