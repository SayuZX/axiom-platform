import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { ClientButton, ClientToast } from './SDKPrimitives';
import './host.css';
declare const __AXIOM_CSS__: string;
type Notice = { id: number; kind: 'success' | 'error'; message: string };
type Confirmation = { message: string; resolve: (value: boolean) => void };
declare global { interface Window { axiomNotify: (data?: unknown) => void; axiomConfirm: (data?: unknown) => Promise<boolean>; axiomFeedbackHost: () => HTMLElement; __axiomSDKFeedback?: boolean } }
if (!window.__axiomSDKFeedback) {
  window.__axiomSDKFeedback = true;
  let serial = 0;
  let notices: Notice[] = [];
  const noticeTimers = new Map<number, number>();
  let confirmations: Confirmation[] = [];
  let snapshot = { notices, confirmations };
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const validMessage = (value: unknown): value is { message: string } => !!value && typeof value === 'object' && 'message' in value && typeof value.message === 'string' && !!value.message.trim();
  const publish = () => { snapshot = { notices, confirmations }; listeners.forEach(listener => listener()); };
  const dismiss = (id: number) => { clearTimeout(noticeTimers.get(id)); noticeTimers.delete(id); notices = notices.filter(item => item.id !== id); publish(); };
  const host = document.createElement('div');
  host.id = 'axiom-feedback';
  // Inline important placement prevents host-page div rules from moving the overlay.
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = __AXIOM_CSS__;
  const mount = document.createElement('div'); mount.className = 'axiom-root';
  const syncTheme = () => { mount.dataset.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'; };
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  window.addEventListener('axiom-theme-change', syncTheme);
  shadow.append(style, mount);
  window.axiomFeedbackHost = () => host;
  window.axiomNotify = value => {
    if (!validMessage(value) || !('kind' in value) || (value.kind !== 'success' && value.kind !== 'error')) return;
    const id = ++serial;
    notices = [...notices, { id, kind: value.kind, message: value.message }];
    // Start once on delivery, not on renders or polling updates.
    noticeTimers.set(id, window.setTimeout(() => dismiss(id), 5000));
    publish();
  };
  window.axiomConfirm = value => {
    if (!validMessage(value)) return Promise.resolve(false);
    const { promise, resolve } = Promise.withResolvers<boolean>();
    confirmations = [...confirmations, { message: value.message, resolve }]; publish();
    return promise;
  };
  function Confirm({ request }: { request: Confirmation }) {
    const ref = useRef<HTMLDialogElement>(null);
    const previous = useRef<HTMLElement | null>(null);
    const finished = useRef(false);
    const finish = (value: boolean) => {
      if (finished.current) return;
      finished.current = true;
      ref.current?.close();
      if (previous.current?.isConnected) previous.current.focus();
      confirmations = confirmations.slice(1); publish(); request.resolve(value);
    };
    useLayoutEffect(() => {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      previous.current = active as HTMLElement | null;
      ref.current!.showModal();
      ref.current!.querySelector<HTMLButtonElement>('button')!.focus();
    }, []);
    return <dialog ref={ref} aria-labelledby="axiom-confirm-title" aria-describedby="axiom-confirm-message" onCancel={event => { event.preventDefault(); finish(false); }} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = ref.current!.querySelectorAll<HTMLButtonElement>('button');
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus(); }
    }}><h2 id="axiom-confirm-title">Konfirmasi AXIOM AI</h2><p id="axiom-confirm-message">{request.message}</p><div className="axiom-actions"><ClientButton size="lg" onClick={() => finish(false)}>Batal</ClientButton><ClientButton size="lg" color="danger" variant="solid" onClick={() => finish(true)}>Lanjutkan</ClientButton></div></dialog>;
  }
  function App() {
    const state = useSyncExternalStore(subscribe, () => snapshot);
    return <><section className="axiom-notices" aria-label="Pemberitahuan AXIOM AI">{state.notices.map(item => <ClientToast key={item.id} {...item} onDismiss={() => dismiss(item.id)}/>)}</section>{state.confirmations[0] && <Confirm key={serialFor(state.confirmations[0])} request={state.confirmations[0]}/>}</>;
  }
  const requestIds = new WeakMap<Confirmation, number>();
  function serialFor(request: Confirmation) { if (!requestIds.has(request)) requestIds.set(request, ++serial); return requestIds.get(request); }
  function start() {
    // Clean cutover: remove the old DOM host, never retain its vanilla toast renderer.
    document.getElementById('axiom-feedback')?.remove();
    document.body.append(host); createRoot(mount).render(<App/>);
    window.dispatchEvent(new Event('axiom-feedback-ready'));
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  function trustedFrame(event: MessageEvent) {
    if (event.origin !== location.origin) return false;
    return [...document.querySelectorAll<HTMLIFrameElement>('iframe[src]')].some(frame => {
      const url = new URL(frame.src, location.href);
      return url.origin === location.origin && url.pathname === '/axiom-chat/index.html' && frame.contentWindow === event.source;
    });
  }
  window.addEventListener('message', async event => {
    if (!trustedFrame(event)) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'axiom-notify') window.axiomNotify(data);
    if (data.type === 'axiom-confirm' && typeof data.id === 'string' && data.id.length > 0 && data.id.length <= 200 && validMessage(data)) {
      const confirmed = await window.axiomConfirm(data);
      if (trustedFrame(event)) (event.source as Window).postMessage({ type: 'axiom-confirm-result', id: data.id, confirmed }, event.origin);
    }
  });
}
