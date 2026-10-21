import { providerErrorMessage } from './providerErrors';
// Browser builds never load native plugins or request native permissions.
export function isNativeDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isNativeMobile(): boolean {
  return isNativeDesktop() && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export async function nativeProviderFetch(url: string, options: RequestInit): Promise<Response> {
  const target = new URL(url);
  const httpAllowedHost = target.hostname === 'localhost' || /^127\.\d+\.\d+\.\d+$/.test(target.hostname) || target.hostname === '[::1]' || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(target.hostname);
  if ((target.protocol !== 'https:' && !(target.protocol === 'http:' && httpAllowedHost)) || target.username || target.password || target.search || target.hash) {
    throw Error('Gunakan endpoint HTTPS atau HTTP localhost/Tailscale tanpa login, query, atau fragmen.');
  }
  const { fetch } = await import('@tauri-apps/plugin-http');
  // Never forward credentials through a provider redirect.
  try { return await fetch(target.toString(), { ...options, maxRedirections: 0, connectTimeout: 30000 }); }
  catch (failure) {
    if (options.signal?.aborted) throw options.signal.reason || new DOMException('Aborted', 'AbortError');
    throw new Error(providerErrorMessage(failure, true), { cause: failure });
  }
}

type AgentWireEvent = { type: 'headers' | 'chunk' | 'end' | 'error'; status?: number; headers?: [string, string][]; data?: string; error?: string };
export async function nativeAgentRequest(payload: object, signal?: AbortSignal): Promise<Response> {
  signal?.throwIfAborted();
  const { invoke, Channel } = await import('@tauri-apps/api/core');
  signal?.throwIfAborted();
  const requestId = crypto.randomUUID();
  return new Promise<Response>((resolve, reject) => {
    let controller: ReadableStreamDefaultController<Uint8Array>, settled = false, finished = false;
    const cancel = () => { void invoke('native_agent_cancel', { requestId }).catch(() => {}); };
    const cleanup = () => { finished = true; signal?.removeEventListener('abort', abort); };
    const fail = (error: unknown) => { if (finished) return; cleanup(); if (settled) controller.error(error); else reject(error); };
    const abort = () => { cancel(); fail(signal?.reason || new DOMException('Aborted', 'AbortError')); };
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; }, cancel() { cancel(); cleanup(); } });
    const channel = new Channel<AgentWireEvent>();
    channel.onmessage = event => {
      if (finished) return;
      if (event.type === 'headers') {
        if (settled) return;
        settled = true; resolve(new Response(stream, { status: event.status || 200, headers: event.headers }));
      } else if (event.type === 'chunk' && event.data) {
        controller.enqueue(Uint8Array.from(atob(event.data), char => char.charCodeAt(0)));
      } else if (event.type === 'end') {
        if (!settled) { fail(Error('Runtime tidak mengembalikan respons.')); return; }
        cleanup(); controller.close();
      } else if (event.type === 'error') fail(Error(event.error || 'Koneksi agent desktop gagal.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    void invoke('native_agent_request', { requestId, payload, onEvent: channel }).catch(fail);
  });
}

export function initializeNativeDesktop() {
  if (!isNativeDesktop()) return;
  document.documentElement.dataset.nativeDesktop = 'true';
  document.documentElement.dataset.nativeMobile = String(isNativeMobile());
  document.title = 'AXIOM AI';
  // External links belong in the system browser, outside the privileged webview.
  document.addEventListener('click', event => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0) return;
    const url = new URL(link.href, location.href);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin === location.origin) return;
    event.preventDefault();
    void import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url.href)).catch(() => {
      window.alert('Tautan belum bisa dibuka di browser sistem.');
    });
  });
}
