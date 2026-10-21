type TaskBridge = { postMessage(value: string): void; addEventListener?(type: 'message', handler: (event: MessageEvent) => void): void };
const active = new Map<string, number>();
let connected: TaskBridge | undefined;
function bridge(): TaskBridge | undefined { return typeof window === 'undefined' ? undefined : (window as Window & { SuperGPTTask?: TaskBridge }).SuperGPTTask; }
function warn() { window.dispatchEvent(new CustomEvent('client-toast', { detail: 'Android belum mengizinkan tugas latar belakang. Tetap buka aplikasi sampai respons selesai.' })); }
/** Call only for an actual user-started request; always release from finally. */
export function beginMobileBackgroundTask(id: string): () => void {
  const native = bridge();
  if (!native || !id || id.length > 100) return () => {};
  if (connected !== native) {
    connected = native;
    native.addEventListener?.('message', event => {
      try { if (JSON.parse(String(event.data)).ok === false) warn(); } catch { /* Ignore malformed native status. */ }
    });
  }
  const count = active.get(id) || 0;
  active.set(id, count + 1);
  if (!count) {
    try { native.postMessage(JSON.stringify({ op: 'start', id })); }
    catch { active.delete(id); warn(); return () => {}; }
  }
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    const remaining = (active.get(id) || 1) - 1;
    if (remaining) { active.set(id, remaining); return; }
    active.delete(id);
    try { native.postMessage(JSON.stringify({ op: 'finish', id })); } catch { /* Native service has its own hard timeout. */ }
  };
}
