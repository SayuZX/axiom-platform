import { getAxiomHistory, setHistoryContent, setHistoryTitles } from '../lib/axiomHistory';
import { ClientAlert } from '../components/SDKPrimitives';
import { useEffect, useRef, useState } from 'react';
import { loadEndpointStore, loadEndpointKeys, type EndpointStore } from '../lib/endpointProfiles';
import { streamEndpointChat, type ProviderMessage } from '../lib/endpointChat';
import { loadSettings, prepareChatMessages, recordUsage } from '../lib/clientSettings';
import { useClientSettings } from './useClientSettings';
import { RichText } from '../components/RichText';
import { UIIcon as I } from '../components/UIIcon';

type MiniMessage = ProviderMessage & { timestamp?: number };
export function MiniChat() {
  const [store, setStore] = useState<EndpointStore>(loadEndpointStore), [messages, setMessages] = useState<MiniMessage[]>([]), [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null), area = useRef<HTMLTextAreaElement>(null), title = useRef('');
  const { settings } = useClientSettings(setError);
  useEffect(() => { const refresh = () => setStore(loadEndpointStore()); window.addEventListener('storage', refresh); window.addEventListener('client-endpoints-changed', refresh); return () => { request.current?.abort(); window.removeEventListener('storage', refresh); window.removeEventListener('client-endpoints-changed', refresh); }; }, []);
  useEffect(() => { if (!settings.confirmClose) return; const guard = (event: BeforeUnloadEvent) => { if (text.trim() || request.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [settings.confirmClose, text]);
  function persist(history: MiniMessage[]) {
    try {
      const { content, titles } = getAxiomHistory();
      if (!title.current) { const base = (history.find(message => message.role === 'user')?.text || 'Mini chat').slice(0, 45); let value = base, index = 2; while (titles.includes(value) || Object.hasOwn(Object.prototype, value)) value = base + ' (mini ' + index++ + ')'; title.current = value; }
      setHistoryContent({ ...content, [title.current]: history.map(message => ({ ...message, timestamp: message.timestamp || Date.now() })) }); setHistoryTitles([title.current, ...titles.filter(name => name !== title.current)]);
    } catch { setError('Mini chat belum tersimpan.'); }
  }
  async function send() {
    const value = text.trim(); if (!value || request.current) return;
    const profile = store.profiles.find(item => item.id === store.selectedId); if (!profile?.model) { setError('Pilih endpoint/model di aplikasi utama terlebih dahulu.'); return; }
    const key = loadEndpointKeys(store.profiles)[profile.id] || ''; if (profile.auth === 'bearer' && !key) { setError('API key sesi mini ini belum tersedia. Buka mini dari aplikasi utama setelah mengisi key.'); return; }
    const history: MiniMessage[] = [...messages, { role: 'user', text: value, timestamp: Date.now() }], controller = new AbortController(); request.current = controller; setBusy(true); setError(''); setText(''); setMessages([...history, { role: 'assistant', text: '' }]); persist(history);
    const timer = setTimeout(() => controller.abort(), settings.timeoutSeconds * 1000); let answer = '', status = 'completed', usage: { input?: number; output?: number } = {};
    try { await streamEndpointChat(profile, key, profile.model, prepareChatMessages(history, loadSettings()), controller.signal, value => { answer = value; setMessages([...history, { role: 'assistant', text: value }]); }, profile.sendReasoning ? ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'][settings.defaultEffort] : undefined, value => { usage = value; }); }
    catch (failure) { status = controller.signal.aborted ? 'interrupted' : 'failed'; setError(controller.signal.aborted ? 'Jawaban dihentikan.' : (failure as Error).message); }
    finally { clearTimeout(timer); const final: MiniMessage[] = answer ? [...history, { role: 'assistant', text: answer, timestamp: Date.now() }] : history; setMessages(final); persist(final); request.current = null; setBusy(false); try { recordUsage({ provider: profile.name, model: profile.model, source: 'chat', status, ...usage }); } catch { /* Usage is optional. */ } }
  }
  return <div className="d-mini-chat"><header><strong><img className="d-brand-logo" src="/axiom-chat/axiom-logo.svg" alt=""/>AXIOM AI mini</strong><span>{store.profiles.find(item => item.id === store.selectedId)?.model || 'No model'}</span><button aria-label="New mini chat" disabled={busy} onClick={() => { setMessages([]); title.current = ''; setError(''); area.current?.focus(); }}><I name="plus" size={20}/></button></header><main>{!messages.length && <p>What would you like to ask?</p>}{messages.map((message, index) => <div key={index} className={'d-mini-message d-mini-' + message.role}>{message.role === 'assistant' && message.text ? <RichText text={message.text}/> : message.text || '…'}</div>)}</main>{error && <ClientAlert className="d-mini-error">{error}</ClientAlert>}<form onSubmit={event => { event.preventDefault(); void send(); }}><textarea ref={area} aria-label="Mini message" rows={2} placeholder="Ask AXIOM AI" value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (!event.nativeEvent.isComposing && event.key === 'Enter' && !event.shiftKey && (settings.sendShortcut === 'enter' ? !event.ctrlKey && !event.metaKey : event.ctrlKey || event.metaKey)) { event.preventDefault(); void send(); } }}/><button type={busy ? 'button' : 'submit'} aria-label={busy ? 'Stop mini response' : 'Send mini message'} onClick={busy ? () => request.current?.abort() : undefined}><I name={busy ? 'stop' : 'arrow'} size={22}/></button></form><a href={location.pathname} target="_blank" rel="noreferrer">Open full client</a></div>;
}
