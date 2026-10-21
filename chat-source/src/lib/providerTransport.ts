import { isAxiomEndpoint } from './axiom';
import { isNativeDesktop, nativeProviderFetch } from './nativeDesktop';
declare const __LOCAL_PROVIDER_RELAY__: boolean;
export function usesLocalProviderRelay(): boolean {
  return !isNativeDesktop() && typeof __LOCAL_PROVIDER_RELAY__ !== 'undefined' && __LOCAL_PROVIDER_RELAY__ && typeof location !== 'undefined' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
}

// The development relay runs only on this computer; deployed web builds call providers directly.
export function providerFetch(url: string, key: string, signal: AbortSignal, body?: object): Promise<Response> {
  if (isAxiomEndpoint(url)) return fetch(url, {
    method: body ? 'POST' : 'GET', headers: { Accept: body ? 'text/event-stream, application/json' : 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
  });
  if (usesLocalProviderRelay()) return fetch('/__client/provider', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, key, ...(body ? { body } : {}) }), signal,
    credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
  });
  return (isNativeDesktop() ? nativeProviderFetch : fetch)(url, {
    method: body ? 'POST' : 'GET', headers: { Accept: body ? 'text/event-stream, application/json' : 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
  });
}

export function providerStatusError(status: number): Error {
  if (status === 401 || status === 403) return Error('Akses ditolak. Periksa API key dan izin penyedia.');
  if (status === 429) return Error('Kuota atau batas permintaan tercapai. Periksa saldo dan batas penyedia.');
  if (status === 400 || status === 404) return Error('Model atau alamat API tidak tersedia. Periksa Base URL dan ID model.');
  if (status === 413) return Error('Percakapan terlalu besar untuk koneksi ini. Mulai chat baru atau kurangi teks.');
  if (status === 502) return Error('Koneksi lokal gagal menghubungi penyedia. Periksa Base URL dan jaringan.');
  if (status === 504) return Error('Penyedia terlalu lama merespons. Coba lagi.');
  return Error('Permintaan gagal (HTTP ' + status + '). Coba lagi nanti.');
}
