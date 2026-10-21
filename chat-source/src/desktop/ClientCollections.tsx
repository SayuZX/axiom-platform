import { ClientAlert } from '../components/SDKPrimitives';
import { useEffect, useState } from 'react';
import { UIIcon as I } from '../components/UIIcon';
import { LocalDialog, type LocalProject, loadLocalProjects } from './WorkspaceControls';
import { ImagesHub } from './ImagesHub';
import { PublicCatalog } from '../components/PublicCatalog';

export type LocalDocument = { id: string; title: string; text: string; updated: number };
export type LocalTask = { id: string; title: string; prompt: string; due: number; fired?: boolean };
export type McpProfile = { id: string; name: string; kind: 'http' | 'stdio'; url: string; command: string; args: string[]; enabled: boolean };
export type ClientData = { documents: LocalDocument[]; sites: { id: string; title: string; url: string }[]; tasks: LocalTask[]; mcp: McpProfile[]; skills: LocalDocument[]; notifications: { id: string; text: string; time: number }[] };
const dataKey = 'client-local-features-v1';
function load(): ClientData {
  const empty = { documents: [], sites: [], tasks: [], mcp: [], skills: [], notifications: [] };
  try {
    const data = JSON.parse(localStorage.getItem(dataKey) || '{}');
    const validators: Record<string, (item: any) => boolean> = {
      documents: item => typeof item.title === 'string' && typeof item.text === 'string' && Number.isFinite(item.updated),
      skills: item => typeof item.title === 'string' && typeof item.text === 'string' && Number.isFinite(item.updated),
      tasks: item => typeof item.title === 'string' && typeof item.prompt === 'string' && Number.isFinite(item.due),
      sites: item => { try { const url = new URL(item.url); return typeof item.title === 'string' && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } },
      mcp: item => typeof item.name === 'string' && ['http', 'stdio'].includes(item.kind) && typeof item.url === 'string' && typeof item.command === 'string' && Array.isArray(item.args) && item.args.every((arg: unknown) => typeof arg === 'string'),
      notifications: item => typeof item.text === 'string' && Number.isFinite(item.time),
    };
    for (const key of Object.keys(empty)) if (Array.isArray(data?.[key])) (empty as Record<string, unknown>)[key] = data[key].filter((item: { id?: unknown }) => item && typeof item.id === 'string' && validators[key](item)).slice(-100);
  } catch { /* Invalid local preferences do not prevent startup. */ }
  return empty;
}
export function useClientData(notify: (text: string) => void) {
  const [data, setData] = useState<ClientData>(load);
  useEffect(() => { try { localStorage.setItem(dataKey, JSON.stringify(data)); } catch { notify('Penyimpanan lokal penuh. Ekspor data sebelum menambah file.'); } }, [data]);
  useEffect(() => { const refresh = (event: StorageEvent) => { if (event.key === dataKey) setData(load()); }; window.addEventListener('storage', refresh); return () => window.removeEventListener('storage', refresh); }, []);
  useEffect(() => { const tick = () => setData(previous => { const due = previous.tasks.filter(task => !task.fired && task.due <= Date.now()); if (!due.length) return previous; due.forEach(task => notify('Pengingat: ' + task.title)); return { ...previous, tasks: previous.tasks.map(task => due.some(item => item.id === task.id) ? { ...task, fired: true } : task), notifications: [...due.map(task => ({ id: crypto.randomUUID(), text: task.title, time: Date.now() })), ...previous.notifications].slice(0, 100) }; }); tick(); const timer = setInterval(tick, 15000); return () => clearInterval(timer); }, []);
  return { data, setData };
}
export function downloadFile(name: string, text: string, type = 'text/plain') { const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement('a'); link.href = url; link.download = name.replace(/[\\/:*?"<>|]/g, '-'); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

export function CollectionScreen({ screen, store, onOpen, onDraft, onAttach, onChooseProject, onSelectProject }: { screen: string; store: ReturnType<typeof useClientData>; onOpen: (feature: string) => void; onDraft: (text: string) => void; onAttach?: (file: File) => void; onChooseProject: () => void; onSelectProject: (project: LocalProject) => void }) {
  const [query, setQuery] = useState(''); const { data, setData } = store;
  const title = screen === 'scheduled' ? 'Scheduled' : screen === 'plugins' ? 'Plugins' : screen === 'skills' ? 'Skills' : screen === 'projects' ? 'Projects' : screen === 'sites' ? 'Sites' : screen === 'images' ? 'Images' : 'Pages';
  const documents = screen === 'skills' ? data.skills : data.documents;
  const includes = (text: string) => text.toLowerCase().includes(query.toLowerCase());
  return <div className="d-page d-functional-page"><div className="d-page-header"><h1>{title}</h1><label className="d-search"><I name="search" size={20}/><input aria-label={'Search ' + title} placeholder={'Search ' + title} value={query} onChange={event => setQuery(event.target.value)}/></label><button className="d-white" onClick={() => screen === 'projects' ? onChooseProject() : onOpen(screen === 'scheduled' ? 'New task' : screen === 'plugins' ? 'Add MCP server' : screen === 'sites' ? 'Add site' : screen === 'skills' ? 'New skill' : screen === 'images' ? 'Images' : 'New page')}>Add <I name="plus" size={18}/></button></div>
    {screen === 'skills' && <><PublicCatalog kind="skills" query={query}/><h2>Instruksi lokal tersimpan</h2></>}
    {screen === 'scheduled' ? <><p className="d-local-subtitle">Pengingat lokal aktif selama aplikasi terbuka. Prompt dijalankan setelah kamu memilih Run.</p><div className="d-functional-cards">{data.tasks.filter(task => includes(task.title)).map(task => <section key={task.id}><h2>{task.title}</h2><p>{new Date(task.due).toLocaleString()} · {task.fired ? 'Due' : 'Upcoming'}</p><p>{task.prompt}</p><div><button onClick={() => onDraft(task.prompt)}>Run in chat</button><button onClick={() => onOpen('Edit task:' + task.id)}>Edit</button><button onClick={() => setData(previous => ({ ...previous, tasks: previous.tasks.filter(item => item.id !== task.id) }))}>Delete</button></div></section>)}</div>{!data.tasks.length && <p className="d-local-empty">Belum ada pengingat. Tambahkan jadwal pertamamu.</p>}</>
    : screen === 'plugins' ? <><PublicCatalog kind="plugins" query={query}/><h2>Konfigurasi lokal tersimpan</h2><p className="d-local-subtitle">Referensi konfigurasi saja. MCP tidak dipasang atau dijalankan melalui browser.</p><div className="d-functional-cards">{data.mcp.filter(item => includes(item.name)).map(item => <section key={item.id}><h2><I name="plugin" size={22}/> {item.name}</h2><p>{item.kind === 'http' ? item.url : item.command + ' ' + item.args.join(' ')}</p><p>Tersimpan lokal · Tidak dijalankan</p><div><button onClick={() => onOpen('Edit MCP:' + item.id)}>Edit referensi</button><button onClick={() => setData(previous => ({ ...previous, mcp: previous.mcp.filter(value => value.id !== item.id) }))}>Remove</button></div></section>)}</div>{!data.mcp.length && <p className="d-local-empty">Belum ada referensi MCP tersimpan.</p>}</>
    : screen === 'projects' ? <div className="d-functional-cards">{loadLocalProjects().filter(project => includes(project.name + project.path)).map(project => <section key={project.path+'|'+project.name}><h2>{project.name}</h2><p>{project.path}</p><button onClick={() => onSelectProject(project)}>Open project</button></section>)}</div>
    : screen === 'sites' ? <><div className="d-functional-cards">{data.sites.filter(site => includes(site.title + site.url)).map(site => <section key={site.id}><h2>{site.title}</h2><a href={site.url} target="_blank" rel="noreferrer">{site.url}</a><div><button onClick={() => onDraft('Use this website as context: ' + site.url)}>Use in chat</button><button onClick={() => setData(previous => ({ ...previous, sites: previous.sites.filter(item => item.id !== site.id) }))}>Remove</button></div></section>)}</div>{!data.sites.length && <p className="d-local-empty">Simpan tautan website yang ingin dibuka atau dipakai sebagai konteks.</p>}</>
    : screen === 'images' ? <ImagesHub onDraft={onDraft} onAttach={onAttach} query={query} onUploadClick={() => onOpen('Images')} />
    : <><p className="d-local-subtitle">{screen === 'skills' ? 'Instruksi lokal yang bisa dipilih dan dikirim sebagai konteks agent/chat.' : 'Catatan lokal yang dapat diedit, diekspor, dan dipakai sebagai konteks percakapan.'}</p><div className="d-functional-cards">{documents.filter(document => includes(document.title + document.text)).map(document => <section key={document.id}><h2>{document.title}</h2><p>{document.text.slice(0, 180)}</p><div><button onClick={() => onOpen((screen === 'skills' ? 'Edit skill:' : 'Edit page:') + document.id)}>Edit</button><button onClick={() => onDraft((screen === 'skills' ? 'Use these instructions:\n' : 'Context:\n') + document.text)}>Use in chat</button><button onClick={() => downloadFile(document.title + '.md', document.text)}>Export</button><button onClick={() => setData(previous => ({ ...previous, [screen === 'skills' ? 'skills' : 'documents']: documents.filter(item => item.id !== document.id) }))}>Delete</button></div></section>)}</div>{!documents.length && <p className="d-local-empty">Belum ada {screen === 'skills' ? 'skill' : 'catatan'} tersimpan.</p>}</>}
  </div>;
}

export function CollectionEditor({ feature, store, onClose, initialPrompt = '' }: { feature: string; store: ReturnType<typeof useClientData>; onClose: () => void; initialPrompt?: string }) {
  const { data, setData } = store; const skill = /skill/i.test(feature), task = /task/i.test(feature), mcp = /MCP/.test(feature), site = feature === 'Add site';
  const id = feature.split(':').slice(1).join(':');
  const document = (skill ? data.skills : data.documents).find(item => item.id === id);
  const existingTask = data.tasks.find(item => item.id === id), existingMcp = data.mcp.find(item => item.id === id);
  const [title, setTitle] = useState(document?.title || existingTask?.title || existingMcp?.name || ''), [text, setText] = useState(document?.text || existingTask?.prompt || initialPrompt), [date, setDate] = useState(existingTask ? new Date(existingTask.due - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const [kind, setKind] = useState<'http' | 'stdio'>(existingMcp?.kind || 'http'), [url, setUrl] = useState(existingMcp?.url || ''), [command, setCommand] = useState(existingMcp?.command || ''), [args, setArgs] = useState(JSON.stringify(existingMcp?.args || [])), [error, setError] = useState('');
  function save() {
    setError(''); const name = title.trim(); if (!name) { setError('Isi nama terlebih dahulu.'); return; }
    try {
      if (mcp) {
        if (kind === 'http') { const target = new URL(url); if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password || target.search || target.hash || (target.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))) throw Error('Gunakan HTTPS atau HTTP localhost tanpa token/query.'); }
        if (kind === 'stdio' && !command.trim()) throw Error('Isi executable MCP server.');
        const values = JSON.parse(args); if (!Array.isArray(values) || !values.every(item => typeof item === 'string') || values.length > 50) throw Error('Arguments harus berupa JSON array string.');
        const entry: McpProfile = { id: existingMcp?.id || 'mcp_' + crypto.randomUUID().replaceAll('-', ''), name, kind, url: url.trim(), command: command.trim(), args: values, enabled: false };
        setData(previous => ({ ...previous, mcp: [...previous.mcp.filter(item => item.id !== entry.id), entry].slice(-10) }));
      } else if (task) {
        const due = new Date(date).getTime(); if (!Number.isFinite(due) || due <= Date.now()) throw Error('Pilih waktu yang akan datang.'); if (!text.trim()) throw Error('Isi prompt pengingat.');
        const entry = { id: existingTask?.id || crypto.randomUUID(), title: name, prompt: text, due, fired: false }; setData(previous => ({ ...previous, tasks: [...previous.tasks.filter(item => item.id !== entry.id), entry] }));
      } else if (site) {
        const target = new URL(url); if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw Error('Isi alamat website HTTP/HTTPS yang valid.'); setData(previous => ({ ...previous, sites: [...previous.sites, { id: crypto.randomUUID(), title: name, url: target.toString() }] }));
      } else {
        const entry = { id: document?.id || crypto.randomUUID(), title: name, text, updated: Date.now() }; const key = skill ? 'skills' : 'documents'; setData(previous => ({ ...previous, [key]: [...previous[key].filter(item => item.id !== entry.id), entry] }));
      }
      onClose();
    } catch (failure) { setError((failure as Error).message); }
  }
  return <LocalDialog title={feature.split(':')[0]} onClose={onClose}><form onSubmit={event => { event.preventDefault(); save(); }}><label>Name<input aria-label="Item name" maxLength={100} value={title} onChange={event => setTitle(event.target.value)} required/></label>
    {mcp ? <><label>Transport<select value={kind} onChange={event => setKind(event.target.value as 'http' | 'stdio')}><option value="http">HTTP MCP</option><option value="stdio">Local executable (stdio)</option></select></label>{kind === 'http' ? <label>Server URL<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/mcp" required/></label> : <><label>Executable<input value={command} onChange={event => setCommand(event.target.value)} placeholder="C:\tools\mcp-server.exe" required/></label><label>Arguments (JSON)<input value={args} onChange={event => setArgs(event.target.value)}/></label></>}<p>Form ini hanya menyimpan referensi lokal, bukan memasang, menghubungkan, atau menjalankan MCP. Jangan masukkan rahasia ke URL atau arguments.</p></>
    : site ? <label>Website URL<input type="url" value={url} onChange={event => setUrl(event.target.value)} required/></label>
    : <><label>{task ? 'Prompt' : 'Content'}<textarea aria-label="Item content" maxLength={100000} rows={8} value={text} onChange={event => setText(event.target.value)}/></label>{task && <label>When<input type="datetime-local" required value={date} onChange={event => setDate(event.target.value)}/></label>}</>}
    {error && <ClientAlert className="d-local-error">{error}</ClientAlert>}<div className="d-local-actions"><button type="button" onClick={onClose}>Batal</button><button type="submit" className="d-local-primary">Save</button></div></form></LocalDialog>;
}
