// Android credentials live in an encrypted native vault; web previews stay session-only.
type Bridge = { postMessage(value: string): void; addEventListener(type: 'message', handler: (event: MessageEvent) => void): void };
type VaultWindow = Window & { SuperGPTEndpointVault?: Bridge };
type Keys = Record<string, string>;
export type EndpointVaultState = 'session' | 'loading' | 'ready' | 'saving' | 'error';
let cache: Keys = {}, state: EndpointVaultState = 'session', generation = 0;
let initialized: Promise<void> | undefined, tail: Promise<void> = Promise.resolve();
let connected: Bridge | undefined;
const clearedMarker = 'client-endpoint-vault-cleared-v1';
function markedClear() { try { return localStorage.getItem(clearedMarker) === 'true'; } catch { return false; } }
function markClear(value: boolean) { try { if (value) localStorage.setItem(clearedMarker, 'true'); else localStorage.removeItem(clearedMarker); } catch { /* Native clear remains authoritative. */ } }
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
function bridge() { return typeof window === 'undefined' ? undefined : (window as VaultWindow).SuperGPTEndpointVault; }
export function usesNativeEndpointVault() {
  return !!bridge() || (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent));
}
export function endpointVaultState() { return state; }
function publish(next: EndpointVaultState) {
  state = next;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('client-endpoint-vault-changed'));
}
function validKeys(value: unknown): Keys {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, key]) => id.length > 0 && id.length <= 100 && !Object.hasOwn(Object.prototype, id) && typeof key === 'string' && key.length <= 4096).slice(0, 50)) as Keys;
}
function request(op: 'load' | 'save' | 'clear', keys?: Keys): Promise<unknown> {
  const native = bridge();
  if (!native) return Promise.reject(Error('Penyimpanan aman Android tidak tersedia.'));
  if (connected !== native) {
    connected = native;
    native.addEventListener('message', event => {
      try {
        const value = JSON.parse(String(event.data));
        const item = pending.get(value.id);
        if (!item) return;
        pending.delete(value.id); clearTimeout(item.timer);
        if (value.ok === true) item.resolve(value.keys);
        else item.reject(Error('Penyimpanan aman Android gagal. Coba simpan ulang API key.'));
      } catch { /* Ignore unrelated or malformed native replies. */ }
    });
  }
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(Error('Penyimpanan aman Android tidak merespons. Coba simpan ulang.')); }, 10000);
    pending.set(id, { resolve, reject, timer });
    try { native.postMessage(JSON.stringify({ id, op, ...(keys ? { keys } : {}) })); }
    catch { pending.delete(id); clearTimeout(timer); reject(Error('Penyimpanan aman Android tidak tersedia.')); }
  });
}
export function initializeMobileEndpointVault(): Promise<void> {
  if (!usesNativeEndpointVault()) return Promise.resolve();
  if (initialized) return initialized;
  const epoch = generation;
  publish('loading');
  const clearOnStart = markedClear();
  initialized = request(clearOnStart ? 'clear' : 'load').then(value => {
    if (generation !== epoch) return;
    if (clearOnStart) markClear(false);
    cache = validKeys(value); publish('ready');
  }).catch(() => { if (generation === epoch) publish('error'); });
  return initialized;
}
export function nativeEndpointKeys(): Keys { return { ...cache }; }
function enqueue(op: 'save' | 'clear', keys?: Keys) {
  const epoch = generation;
  publish('saving');
  const operation = tail.catch(() => {}).then(async () => {
    // A sign-out invalidates every queued credential write from that session.
    if (op === 'save' && generation !== epoch) return;
    await request(op, keys);
    if (generation === epoch) { markClear(false); publish('ready'); }
  }).catch(error => { if (generation === epoch) publish('error'); throw error; });
  tail = operation;
  void operation.catch(() => {});
}
export function persistNativeEndpointKeys(keys: Keys) {
  if (!usesNativeEndpointVault()) return;
  cache = validKeys(keys);
  enqueue('save', { ...cache });
}
export function flushEndpointKeyPersistence(): Promise<void> { return usesNativeEndpointVault() ? tail : Promise.resolve(); }
export function clearNativeEndpointKeys(): Promise<void> {
  generation++; cache = {};
  if (!usesNativeEndpointVault()) return Promise.resolve();
  markClear(true);
  enqueue('clear');
  return tail;
}
