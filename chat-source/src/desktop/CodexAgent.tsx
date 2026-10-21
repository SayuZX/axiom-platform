import { updateAgentStream, type StreamEntry } from './AgentStream';
import { ClientAlert } from '../components/SDKPrimitives';
import { useEffect, useRef, useState } from 'react';
import { UIIcon as I } from '../components/UIIcon';
import { isNativeDesktop, nativeAgentRequest } from '../lib/nativeDesktop';
import type { EndpointProfile } from '../lib/endpointProfiles';
import type { McpProfile } from './ClientCollections';

type AgentConfig = { enabled: boolean; cwd: string; sandbox: 'read-only' | 'workspace-write'; responsesConfirmed: boolean };
type AgentItem = { id: string; type: string; status?: string; command?: string; aggregatedOutput?: string; changes?: { path: string; diff?: string; kind?: { type: string } }[]; server?: string; tool?: string };
type Approval = { id: string; kind: string; details: { command?: string; cwd?: string; reason?: string; grantRoot?: string; additionalPermissions?: unknown } };
type AgentEvent = { type: string; delta?: string; text?: string; itemId?: string; item?: AgentItem; id?: string; kind?: string; details?: Approval['details']; diff?: string; status?: string; error?: string; input?: number; output?: number; plan?: { step: string; status: string }[] };

export async function agentRequest(payload: object, signal?: AbortSignal) {
  if (!isNativeDesktop()) throw Error('Native filesystem, Codex, terminal, and Git are unavailable in AXIOM web. Browser projects and uploaded files remain available.');
  const response = await nativeAgentRequest(payload, signal);
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw Error(data.error || 'Koneksi agent gagal.'); }
  return response;
}

export function useCodexAgent() {
  const [config, setConfig] = useState<AgentConfig>(() => { try { const data = JSON.parse(localStorage.getItem('client-agent-config-v1') || '{}'); return { enabled: false, cwd: typeof data.cwd === 'string' ? data.cwd : '', sandbox: data.sandbox === 'workspace-write' ? 'workspace-write' : 'read-only', responsesConfirmed: false }; } catch { return { enabled: false, cwd: '', sandbox: 'read-only', responsesConfirmed: false }; } });
  const [dialog, setDialog] = useState(false), [available, setAvailable] = useState<boolean | null>(null), [notice, setNotice] = useState('');
  const [items, setItems] = useState<AgentItem[]>([]), [approvals, setApprovals] = useState<Approval[]>([]), [diff, setDiff] = useState('');
  const [plan, setPlan] = useState<{ step: string; status: string }[]>([]), [pendingDecision, setPendingDecision] = useState('');
  const session = useRef<{ id: string; fingerprint: string; conversation: string } | null>(null);
  const busy = useRef(false);
  const [timeline, setTimeline] = useState<StreamEntry[]>([]), [conversation, setConversation] = useState('');
  async function disconnect() { const previous = session.current; session.current = null; if (previous) await agentRequest({ action: 'close', sessionId: previous.id }).catch(() => {}); }
  function reset() { setTimeline([]); setConversation(''); void disconnect(); setItems([]); setApprovals([]); setDiff(''); setPlan([]); setNotice(''); }
  useEffect(() => () => { void disconnect(); }, []);
  useEffect(() => { if (!dialog) return; const controller = new AbortController(); setAvailable(null); setNotice(''); void agentRequest({ action: 'status' }, controller.signal).then(response => response.json()).then(data => setAvailable(data.available)).catch(error => { if (!controller.signal.aborted) { setAvailable(false); setNotice(error.message); } }); return () => controller.abort(); }, [dialog]);
  function save(next: AgentConfig) { setTimeline([]); setConversation(''); void disconnect(); setConfig(next); localStorage.setItem('client-agent-config-v1', JSON.stringify({ cwd: next.cwd, sandbox: next.sandbox })); setDialog(false); setItems([]); setApprovals([]); setDiff(''); setPlan([]); }
  async function decide(id: string, accept: boolean) {
    if (!session.current) return;
    setPendingDecision(id);
    try { await agentRequest({ action: 'approve', sessionId: session.current.id, requestId: id, accept }); setApprovals(previous => previous.filter(item => item.id !== id)); }
    catch (error) { setNotice((error as Error).message); }
    finally { setPendingDecision(''); }
  }
  async function run(endpoint: EndpointProfile, key: string, model: string, history: { role: string; text: string; images?: string[] }[], conversation: string, forceNew: boolean, signal: AbortSignal, onText: (text: string) => void, effort?: string, planOnly = false, mcp: McpProfile[] = [], runtimeOptions: { networkAccess?: boolean; onUsage?: (usage: { input?: number; output?: number }) => void } = {}) {
    if (busy.current) throw Error('Agent masih bekerja.');
    if (!config.cwd || !config.responsesConfirmed) { setDialog(true); throw Error('Pilih folder dan konfirmasikan dukungan Responses API.'); }
    busy.current = true; setTimeline([]); setConversation(conversation); setItems([]); setApprovals([]); setDiff(''); setPlan([]); setNotice('');
    const fingerprint = JSON.stringify([endpoint.id, endpoint.baseUrl, model, key, config.cwd, config.sandbox, mcp, runtimeOptions.networkAccess === true]);
    const stop = () => { if (session.current) void agentRequest({ action: 'stop', sessionId: session.current.id }).catch(() => {}); };
    signal.addEventListener('abort', stop, { once: true });
    try {
      if (forceNew || session.current?.fingerprint !== fingerprint || session.current?.conversation !== conversation) await disconnect();
      let first = false;
      if (!session.current) {
        const response = await agentRequest({ action: 'connect', cwd: config.cwd, sandbox: config.sandbox, networkAccess: runtimeOptions.networkAccess === true, responsesConfirmed: true, baseUrl: endpoint.baseUrl, key, model, mcp });
        const result = await response.json(); session.current = { id: result.sessionId, fingerprint, conversation }; first = true;
      }
      signal.throwIfAborted();
      const text = first && history.length > 1 ? 'Previous conversation (context only):\n' + history.slice(0, -1).map(item => item.role + ': ' + item.text).join('\n\n') + '\n\nCurrent request:\n' + history.at(-1)!.text : history.at(-1)!.text;
      const images = first ? history.flatMap(message => message.images || []) : history.at(-1)?.images || [];
      const response = await agentRequest({ action: 'turn', sessionId: session.current.id, text, images, effort: endpoint.sendReasoning ? effort : undefined, planOnly }, signal);
      if (!response.body) throw Error('Stream agent tidak tersedia.');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', ended = false, failure = '';
      const messages = new Map<string, string>();
      const publish = () => { const text = [...messages.values()].join('\n\n'); if (text.length > 1024 * 1024) throw Error('Jawaban agent terlalu besar.'); onText(text); };
      function consume(event: AgentEvent) {
        setTimeline(previous => updateAgentStream(previous, event));
        if (event.type === 'text') { const id = event.itemId || 'answer'; messages.set(id, (messages.get(id) || '') + (event.delta || '')); publish(); }
        if (event.type === 'message') { messages.set(event.itemId || 'answer', event.text || ''); publish(); }
        if (event.type === 'item' && event.item) { const item = event.item; setItems(previous => { const old = previous.find(value => value.id === item.id); const next = { ...old, ...item }; return [...previous.filter(value => value.id !== item.id), next].slice(-100); }); }
        if (event.type === 'output') setItems(previous => previous.map(item => item.id === event.itemId ? { ...item, aggregatedOutput: ((item.aggregatedOutput || '') + (event.delta || '')).slice(-50000) } : item));
        if (event.type === 'approval' && event.id) setApprovals(previous => [...previous.filter(item => item.id !== event.id), { id: event.id!, kind: event.kind || '', details: event.details || {} }]);
        if (event.type === 'resolved') setApprovals(previous => previous.filter(item => item.id !== event.id));
        if (event.type === 'diff') setDiff((event.diff || '').slice(0, 150000));
        if (event.type === 'plan') setPlan(event.plan || []);
        if (event.type === 'notice') setNotice(event.text || '');
        if (event.type === 'usage' && Number.isFinite(event.input) && Number.isFinite(event.output)) runtimeOptions.onUsage?.({ input: event.input, output: event.output });
        if (event.type === 'error') failure = event.text || 'Agent gagal.';
        if (event.type === 'done') { ended = true; if (event.error) failure = event.error; if (event.status === 'interrupted') failure = 'Agent dihentikan.'; }
      }
      try {
        while (true) {
          const { value, done } = await reader.read(); buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
          if (buffer.length > 2 * 1024 * 1024) throw Error('Output agent terlalu besar.');
          let index; while ((index = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (line.trim()) consume(JSON.parse(line)); }
          if (done) break;
        }
        if (buffer.trim()) consume(JSON.parse(buffer));
        if (failure) throw Error(failure);
        if (!ended) throw Error('Koneksi agent terputus sebelum selesai.');
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } finally { signal.removeEventListener('abort', stop); if (signal.aborted) stop(); busy.current = false; setApprovals([]); }
  }
  return { timeline, conversation, config, dialog, setDialog, available, notice, items, approvals, diff, plan, pendingDecision, save, decide, run, reset };
}

export function AgentWorkspaceDialog({ agent, providerName, onClose }: { agent: ReturnType<typeof useCodexAgent>; providerName: string; onClose: () => void }) {
  const [draft, setDraft] = useState(agent.config);
  const [browsing, setBrowsing] = useState(false), [folderError, setFolderError] = useState('');
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  if (!isNativeDesktop()) return <div className="d-modal-backdrop"><section className="d-modal d-agent-dialog" role="dialog" aria-modal="true" aria-label="Agent unavailable"><h2>Agent unavailable</h2><p>Codex, filesystem workspaces, terminal, and Git require a native runtime and are disabled in AXIOM web.</p><button autoFocus onClick={onClose}>Close</button></section></div>;
  return <div className="d-modal-backdrop" onClick={onClose}><form className="d-modal d-agent-dialog" role="dialog" aria-modal="true" aria-label="Codex local agent" onClick={event => event.stopPropagation()} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); onClose(); } if (event.key === 'Tab') { const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('input,select,button:not(:disabled)')]; const first = elements[0], last = elements.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }} onSubmit={event => { event.preventDefault(); agent.save(draft); }}>
    <header><div><h2>Codex local agent</h2><p>{agent.available === null ? 'Mencari runtime…' : agent.available ? 'Codex runtime tersedia' : 'Runtime lokal belum tersedia'}</p></div><button type="button" aria-label="Close agent settings" onClick={onClose}><I name="close" size={22}/></button></header>
    <p>Agent memakai endpoint dan model pilihanmu untuk membaca project, menjalankan terminal, dan mengedit file.</p>
    <label>Folder project<input ref={first} required value={draft.cwd} placeholder="D:\\Projects\\my-app" onChange={event => setDraft({ ...draft, cwd: event.target.value })}/></label>
    <button type="button" className="d-local-primary" disabled={browsing} onClick={async () => { setBrowsing(true); setFolderError(''); try { const { project } = await (await agentRequest({ action: 'pickFolder' })).json(); if (project) setDraft(previous => ({ ...previous, cwd: project.path })); } catch (failure) { setFolderError((failure as Error).message); } finally { setBrowsing(false); } }}>{browsing ? 'Menunggu pilihan folder…' : 'Browse folders'}</button>
    {folderError && <ClientAlert>{folderError}</ClientAlert>}
    <label>Akses project<select value={draft.sandbox} onChange={event => setDraft({ ...draft, sandbox: event.target.value as AgentConfig['sandbox'] })}><option value="read-only">Baca saja</option><option value="workspace-write">Baca & edit di folder project</option></select></label>
    <label className="d-agent-check"><input type="checkbox" checked={draft.responsesConfirmed} onChange={event => setDraft({ ...draft, responsesConfirmed: event.target.checked })}/><span>{providerName || 'Endpoint pilihan'} mendukung Responses API dan tool calling.</span></label>
    <label className="d-agent-check"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })}/><span>Gunakan agent untuk pesan di mode Codex.</span></label>
    <p className="d-agent-footnote">Izin command dan perubahan file mengikuti sandbox runtime. Permintaan tambahan ditampilkan untuk kamu tinjau. Browser dan kontrol desktop belum dihubungkan.</p>
    {agent.notice && <p role="status">{agent.notice}</p>}
    <footer><button type="button" onClick={onClose}>Batal</button><button type="submit" disabled={draft.enabled && (!agent.available || !draft.responsesConfirmed)}>Simpan</button></footer>
  </form></div>;
}

export function AgentActivity({ agent, showItems = true }: { agent: ReturnType<typeof useCodexAgent>; showItems?: boolean }) {
  return <div className="d-agent-activity">
    {!!agent.plan.length && <details open><summary>Plan</summary><ol>{agent.plan.map((item, index) => <li key={index}>{item.status === 'completed' ? '✓ ' : ''}{item.step}</li>)}</ol></details>}
    {showItems && agent.items.map(item => <details key={item.id}><summary><I name={item.type === 'commandExecution' ? 'terminal' : item.type === 'fileChange' ? 'page' : 'plugin'} size={18}/><span>{item.command || (item.type === 'fileChange' ? 'File changes' : item.type === 'mcpToolCall' ? [item.server, item.tool].filter(Boolean).join(' / ') : item.type)}</span><small>{item.status}</small></summary>{item.aggregatedOutput && <pre>{item.aggregatedOutput}</pre>}{item.changes?.map(change => <div key={change.path}><b>{change.path}</b><pre>{change.diff || change.kind?.type}</pre></div>)}</details>)}
    {agent.diff && <details><summary><I name="branch" size={18}/>View changes</summary><pre>{agent.diff}</pre></details>}
    {agent.approvals.map(item => <div className="d-agent-approval" key={item.id} role="region" aria-label="Agent approval"><b>{item.kind.includes('commandExecution') ? 'Izinkan command ini?' : 'Izinkan perubahan file?'}</b>{item.details.command && <pre>{item.details.command}</pre>}<p>{item.details.cwd || item.details.grantRoot}</p><p>{item.details.reason}</p>{item.details.additionalPermissions!=null&&<pre>{JSON.stringify(item.details.additionalPermissions,null,2)}</pre>}<div><button disabled={agent.pendingDecision === item.id} onClick={() => void agent.decide(item.id, false)}>Tolak</button><button disabled={agent.pendingDecision === item.id} onClick={() => void agent.decide(item.id, true)}>Izinkan sekali</button></div></div>)}
    {agent.notice && <p role="status">{agent.notice}</p>}
  </div>;
}
