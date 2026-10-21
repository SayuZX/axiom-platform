import { getNativeTheme, injectNativeTheme } from '../../../../lib/native-theme.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function proxyPage(request, { params }, headOnly = false) {
  const { segments } = await params;
  if (!Array.isArray(segments) || !segments.length || !segments.every(value => /^[a-zA-Z0-9_-]+$/.test(value)) || !(segments[0] === 'dashboard' || (segments.length === 1 && segments[0] === 'login'))) {
    return new Response('Not found', { status: 404 });
  }
  const url = new URL(`http://127.0.0.1:20128/${segments.join('/')}`);
  url.search = new URL(request.url).search;
  const upstreamHeaders = new Headers({
    Host: 'ai.axiomcreative.xyz',
    'X-Forwarded-Host': 'ai.axiomcreative.xyz',
    'X-Forwarded-Proto': 'https',
    // Set by Caddy, never taken from an arbitrary client-supplied forwarding header.
    'X-Real-IP': request.headers.get('x-axiom-client-ip') || '198.51.100.1',
    'X-Forwarded-For': request.headers.get('x-axiom-client-ip') || '198.51.100.1',
  });
  for (const name of ['cookie', 'accept', 'accept-language', 'user-agent', 'rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-url']) {
    const value = request.headers.get(name);
    if (value !== null) upstreamHeaders.set(name, value);
  }
  try {
    const upstream = await fetch(url, { headers: upstreamHeaders, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const headers = new Headers(upstream.headers);
    for (const name of ['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'etag', 'last-modified', 'x-powered-by', 'set-cookie']) headers.delete(name);
    for (const cookie of upstream.headers.getSetCookie()) headers.append('set-cookie', cookie);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    if (headOnly) {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status, headers });
    }
    if (!upstream.ok || !headers.get('content-type')?.includes('text/html')) {
      // In particular, preserve native redirect/auth decisions and React Flight byte framing.
      return new Response(upstream.body, { status: upstream.status, headers });
    }
    if (!upstream.body) throw new Error('Empty upstream document');
    const reader = upstream.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) throw new Error('Document exceeds limit');
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const theme = await getNativeTheme();
    const html = injectNativeTheme(Buffer.concat(chunks).toString('utf8'), theme.version);
    headers.set('X-Axiom-Theme', theme.version);
    return new Response(html, { status: upstream.status, headers });
  } catch {
    return new Response('Halaman administrasi sementara tidak tersedia. Muat ulang beberapa saat lagi.', { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}

export function GET(request, context) { return proxyPage(request, context); }
export function HEAD(request, context) { return proxyPage(request, context, true); }
