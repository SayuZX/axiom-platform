import { initializeAxiomHistory } from './axiomHistory';

export type AxiomSession = {
  customer: { id: string; name: string; email: string };
  keys: { id: string; name: string; models: string[] }[];
  models: { id: string; name: string }[];
};
let session: AxiomSession | null = null;
export function getAxiomSession(): AxiomSession {
  if (!session) throw new Error('Sesi AXIOM AI belum tersedia.');
  return session;
}
export function isAxiomEndpoint(value: string): boolean {
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin && /^\/customer-api\/axiom-chat\/key\/[^/]+\/v1(?:\/(?:models|chat\/completions))?\/?$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}
export function notifyAxiom(message: string, kind: 'success' | 'error' = 'error'): void {
  if (!message.trim()) return;
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'axiom-notify', kind, message }, location.origin);
    return;
  }
  (window as Window & { axiomNotify?: (options: { kind: 'success' | 'error'; message: string }) => void }).axiomNotify?.({ kind, message });
}
export function confirmAxiom(message: string): Promise<boolean> {
  if (window.parent === window) {
    const notify = window as Window & { axiomConfirm?: (options: { message: string }) => Promise<boolean> };
    return notify.axiomConfirm?.({ message }) ?? Promise.resolve(false);
  }
  return new Promise(resolve => {
    const id = crypto.randomUUID();
    const finish = (confirmed: boolean) => { clearTimeout(timer); window.removeEventListener('message', receive); resolve(confirmed); };
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'axiom-confirm-result' || event.data.id !== id || typeof event.data.confirmed !== 'boolean') return;
      finish(event.data.confirmed);
    };
    const timer = setTimeout(() => { finish(false); notifyAxiom('Konfirmasi kedaluwarsa. Silakan coba lagi.'); }, 120000);
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'axiom-confirm', id, message }, location.origin);
  });
}
export async function initializeAxiom(): Promise<void> {
  const response = await fetch('/customer-api/axiom-chat/session', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(response.status === 401 ? 'Sesi berakhir. Masuk kembali melalui AXIOM AI.' : 'Sesi AXIOM AI tidak dapat dimuat.');
  const data: unknown = await response.json();
  const value = data as Partial<AxiomSession> | null;
  const validList = (items: unknown): items is { id: string | number; name: string }[] => Array.isArray(items) && items.every(item => item && (typeof item.id === 'string' && item.id.length > 0 || typeof item.id === 'number' && Number.isSafeInteger(item.id)) && typeof item.name === 'string');
  if (!value?.customer || !['string', 'number'].includes(typeof value.customer.id) || !String(value.customer.id).trim() || typeof value.customer.name !== 'string' || typeof value.customer.email !== 'string' || !validList(value.keys) || !validList(value.models) || !value.keys.every(key => Array.isArray(key.models) && key.models.every(id => typeof id === 'string' && value.models?.some(model => model.id === id)))) throw new Error('Respons sesi AXIOM AI tidak valid.');
  session = { customer: { ...value.customer, id: String(value.customer.id) }, keys: value.keys.map(item => ({ ...item, id: String(item.id) })), models: value.models.map(item => ({ ...item, id: String(item.id) })) };
  await initializeAxiomHistory();
}
