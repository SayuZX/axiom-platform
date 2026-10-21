import { ClientAlert } from '../components/SDKPrimitives';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { UIIcon as I } from '../components/UIIcon';
import { agentRequest } from './CodexAgent';
import { isNativeDesktop } from '../lib/nativeDesktop';

export type LocalProject = { path: string; name: string; branch?: string | null; changes?: string | null };
export function loadLocalProjects(): LocalProject[] {
  try { const values = JSON.parse(localStorage.getItem('client-project-folders-v1') || '[]'); return Array.isArray(values) ? values.filter(item => typeof item?.path === 'string' && typeof item.name === 'string').slice(0, 100) : []; } catch { return []; }
}
function remember(project: LocalProject) {
  localStorage.setItem('client-project-folders-v1', JSON.stringify([project, ...loadLocalProjects().filter(item => item.path !== project.path || item.name !== project.name)].slice(0, 100)));
}

export function LocalDialog({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { const old = document.activeElement as HTMLElement | null; (panel.current?.querySelector<HTMLElement>('[data-initial-focus]') || panel.current?.querySelector<HTMLElement>('input,button,textarea,select'))?.focus(); return () => { if (old?.isConnected) old.focus(); }; }, []);
  return <div className="d-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className={'d-local-dialog ' + className} role="dialog" aria-modal="true" aria-label={title} ref={panel} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key === 'Tab') { const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled),textarea,select,button:not(:disabled),a[href]')]; const first = elements[0], last = elements.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}><div className="d-local-heading"><h2>{title}</h2><button aria-label={'Close ' + title} onClick={onClose}><I name="close" size={22}/></button></div>{children}</div></div>;
}

export function CreateProjectDialog({ onSelect, onClose }: { onSelect: (project: LocalProject) => void; onClose: () => void }) {
  const [name, setName] = useState(''), [folder, setFolder] = useState<LocalProject | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [methods, setMethods] = useState(false), [manual, setManual] = useState(false), [path, setPath] = useState('');
  async function addFolder(fromPath = false) {
    setBusy(true); setError(''); setMethods(false);
    try {
      const response = await agentRequest(fromPath ? { action: 'projectInfo', cwd: path.trim() } : { action: 'pickFolder' });
      const data = await response.json(); const project = fromPath ? data : data.project;
      if (project) { setFolder(project); setManual(false); if (!name.trim()) setName(project.name); }
    } catch (failure) { setError((failure as Error).message); setManual(true); }
    finally { setBusy(false); }
  }
  function create() {
    if (!name.trim() || !folder || busy) return;
    if (loadLocalProjects().some(project => project.name.toLowerCase() === name.trim().toLowerCase() && project.path !== folder.path)) { setError('Nama project sudah dipakai. Pilih nama lain.'); return; }
    try { const project = { ...folder, name: name.trim() }; remember(project); onSelect(project); }
    catch { setError('Project belum tersimpan. Periksa penyimpanan browser.'); }
  }
  if (!isNativeDesktop()) return <LocalDialog title="Filesystem workspace unavailable" onClose={onClose}><p>Native filesystem folders cannot be opened in AXIOM web. Browser projects and uploaded library files remain available.</p></LocalDialog>;
  return <LocalDialog title="Create project" onClose={onClose} className="d-create-project"><form onSubmit={event => { event.preventDefault(); create(); }}>
    <div className="d-create-project-name"><I name="folder" size={24}/><input data-initial-focus aria-label="Project name" placeholder="Project name" maxLength={100} value={name} onChange={event => setName(event.target.value)} required/></div>
    <h3>Source folders</h3><div className={'d-project-sources' + (folder ? ' d-has-source' : '')}>
      {folder ? <div className="d-project-source"><I name="folder" size={24}/><span><b>{folder.name}</b><small>{folder.path}</small></span><button type="button" aria-label="Remove source folder" disabled={busy} onClick={() => setFolder(null)}><I name="close" size={20}/></button></div> : <>
        <button type="button" className="d-source-method" aria-expanded={methods} onClick={() => setMethods(value => !value)}>Add a folder on <span>this computer</span><I name="down" size={18}/></button>
        {methods && <div className="d-source-methods"><button type="button" onClick={() => void addFolder()}>Browse folders</button><button type="button" onClick={() => { setManual(true); setMethods(false); }}>Enter folder path</button></div>}
        {!manual && <button type="button" className="d-source-add" disabled={busy} onClick={() => void addFolder()}><I name="folder" size={23}/>{busy ? 'Opening…' : 'Add'}</button>}
      </>}
      {manual && !folder && <div className="d-source-path"><input aria-label="Project folder path" placeholder="D:\Projects\my-app" value={path} onChange={event => setPath(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void addFolder(true); } }}/><button type="button" disabled={busy || !path.trim()} onClick={() => void addFolder(true)}>Add folder</button></div>}
    </div>
    {error && <ClientAlert className="d-local-error">{error}</ClientAlert>}
    <div className="d-create-project-footer"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={busy || !name.trim() || !folder}>Create project</button></div>
  </form></LocalDialog>;
}

export function ProjectChooser({ onSelect, onClose }: { onSelect: (project: LocalProject) => void; onClose: () => void }) {
  const [projects, setProjects] = useState(loadLocalProjects), [path, setPath] = useState(''), [query, setQuery] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(() => !loadLocalProjects().length);
  async function select(value: string) {
    setBusy(true); setError('');
    try { const project = await (await agentRequest({ action: 'projectInfo', cwd: value })).json(); remember(project); onSelect(project); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function browse() {
    setBusy(true); setError('');
    try { const { project } = await (await agentRequest({ action: 'pickFolder' })).json(); if (project) { remember(project); onSelect(project); } }
    catch (failure) { setError((failure as Error).message + ' Kamu juga bisa memasukkan path folder di bawah.'); }
    finally { setBusy(false); }
  }
  if (!isNativeDesktop()) return <LocalDialog title="Filesystem workspace unavailable" onClose={onClose}><p>Native filesystem folders cannot be opened in AXIOM web. Saved project records are preserved; use browser projects and uploaded library files instead.</p></LocalDialog>;
  if (creating) return <CreateProjectDialog onSelect={onSelect} onClose={onClose}/>;
  return <LocalDialog title="Choose project" onClose={onClose}>
    <button className="d-local-primary d-local-wide" onClick={() => setCreating(true)}><I name="plus" size={20}/>Create project</button>
    <p>Pilih folder kerja di komputer ini. File tidak diunggah saat memilih folder.</p>
    <button className="d-local-primary d-local-wide" disabled={busy} onClick={() => void browse()}><I name="folder" size={20}/>{busy ? 'Menunggu pilihan folder…' : 'Browse folders'}</button>
    <form onSubmit={event => { event.preventDefault(); void select(path); }}><label>Path folder<input aria-label="Project folder path" placeholder="D:\Projects\my-app" value={path} onChange={event => setPath(event.target.value)} required/></label><button disabled={busy || !path.trim()}>Open folder</button></form>
    {!!projects.length && <><h3>Recent projects</h3><input aria-label="Search projects" placeholder="Search projects" value={query} onChange={event => setQuery(event.target.value)}/><div className="d-local-list">{projects.filter(project => (project.name + project.path).toLowerCase().includes(query.toLowerCase())).map(project => <div className="d-local-project-row" key={project.path+'|'+project.name}><button disabled={busy} onClick={() => void select(project.path)}><I name="folder" size={20}/><span><b>{project.name}</b><small>{project.path}</small></span></button><button aria-label={'Forget ' + project.name} onClick={() => { const next = projects.filter(item => item.path !== project.path); localStorage.setItem('client-project-folders-v1', JSON.stringify(next)); setProjects(next); }}><I name="close" size={17}/></button></div>)}</div></>}
    {error && <ClientAlert className="d-local-error">{error}</ClientAlert>}
  </LocalDialog>;
}

export function WorkInMenu({ anchor, onClose }: { anchor: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null); const [position, setPosition] = useState({ left: 0, top: 0, width: 422 });
  useLayoutEffect(() => {
    const update = () => {
      const root = anchor.current?.closest<HTMLElement>('.d-root'), target = anchor.current;
      if (!root || !target) return;
      const bounds = root.getBoundingClientRect(), rect = target.getBoundingClientRect(), scale = bounds.width / root.offsetWidth;
      if (!scale) return;
      const width = Math.min(422, root.offsetWidth - 24), above = (rect.top - bounds.top) / scale - 184;
      setPosition({ width, left: Math.max(12, Math.min((rect.left - bounds.left) / scale, root.offsetWidth - width - 12)), top: above >= 12 ? above : (rect.bottom - bounds.top) / scale + 8 });
    };
    update(); const observer = new ResizeObserver(update); if (anchor.current) observer.observe(anchor.current);
    window.addEventListener('resize', update); return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [anchor]);
  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [anchor, onClose]);
  function close() { onClose(); anchor.current?.focus(); }
  return <div ref={menu} id="d-work-in-menu" className="d-popover d-work-in-menu" role="menu" aria-label="Work in" style={position} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } if (event.key === 'Tab') onClose(); if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); } }}>
    <p>Work in</p><button role="menuitemradio" aria-checked={isNativeDesktop()} disabled={!isNativeDesktop()} title={!isNativeDesktop() ? 'Native runtime unavailable in AXIOM web' : undefined} onClick={close}><I name="computer" size={23}/><span>This computer{!isNativeDesktop() && ' — unavailable on web'}</span>{isNativeDesktop() && <I name="check" size={20}/>}</button>
    <button role="menuitemradio" aria-checked="false" disabled title="Cloud runtime belum terhubung"><I name="cloud" size={23}/><span>Cloud</span></button>
    <button role="menuitemradio" aria-checked="false" disabled title="Remote runtime belum terhubung"><I name="globe" size={23}/><span>Remote</span></button>
  </div>;
}

export function ComputerChooser({ folder, onSettings, onClose }: { folder: string; onSettings: () => void; onClose: () => void }) {
  const [computer, setComputer] = useState<{ name: string; platform: string; runtimeAvailable: boolean } | null>(null), [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); void agentRequest({ action: 'computerInfo' }, controller.signal).then(response => response.json()).then(setComputer).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }); return () => controller.abort(); }, []);
  if (!isNativeDesktop()) return <LocalDialog title="Execution environment unavailable" onClose={onClose}><p>AXIOM web has no native runtime. Codex, terminal, and Git execution are disabled.</p></LocalDialog>;
  return <LocalDialog title="Execution environment" onClose={onClose}>
    <button className="d-local-environment" onClick={onClose}><I name="computer" size={25}/><span><b>This computer</b><small>{computer ? computer.name + ' · ' + computer.platform : 'Memeriksa komputer…'}</small></span><I name="check" size={20}/></button>
    <dl><dt>Codex runtime</dt><dd>{computer ? computer.runtimeAvailable ? 'Available' : 'Not installed' : 'Checking…'}</dd><dt>Project</dt><dd>{folder || 'Belum dipilih'}</dd></dl>
    <p>Eksekusi berlangsung di komputer ini. Pengaturan agent menentukan akses folder dan koneksi model.</p>
    {error && <ClientAlert className="d-local-error">{error}</ClientAlert>}
    <button className="d-local-primary d-local-wide" onClick={onSettings}>Agent settings</button>
  </LocalDialog>;
}

export function ProjectFiles({ cwd, onChooseProject, onAttach, onClose }: { cwd: string; onChooseProject: () => void; onAttach: (file: File) => void; onClose: () => void }) {
  const [files, setFiles] = useState<string[]>([]), [query, setQuery] = useState(''), [error, setError] = useState(''), [limited, setLimited] = useState(false), [preview, setPreview] = useState<{ name: string; text: string } | null>(null);
  useEffect(() => { if (!cwd) return; const controller = new AbortController(); void agentRequest({ action: 'projectFiles', cwd }, controller.signal).then(response => response.json()).then(data => { setFiles(data.files); setLimited(data.limited); }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }); return () => controller.abort(); }, [cwd]);
  async function open(name: string) { try { setError(''); setPreview(await (await agentRequest({ action: 'projectFile', cwd, name })).json()); } catch (failure) { setError((failure as Error).message); } }
  if (!isNativeDesktop()) return <LocalDialog title="Filesystem workspace unavailable" onClose={onClose}><p>AXIOM web cannot read native project folders. Attach files through the browser or choose uploaded files from your library.</p></LocalDialog>;
  return <LocalDialog title="Project files" onClose={onClose} className="d-local-files"><p>{cwd || 'Pilih folder project untuk mencari file lokal.'}</p>{!cwd ? <button className="d-local-primary" onClick={onChooseProject}>Choose project</button> : <><input aria-label="Search project files" placeholder="Search files" value={query} onChange={event => setQuery(event.target.value)}/>{limited && <p>Menampilkan indeks terbatas; folder dependency dan file tersembunyi dilewati.</p>}<div className="d-file-explorer"><div>{files.filter(name => name.toLowerCase().includes(query.toLowerCase())).slice(0, 250).map(name => <button key={name} onClick={() => void open(name)}>{name}</button>)}{!files.length && <p>Belum ada file yang ditampilkan.</p>}</div><div>{preview ? <><b>{preview.name}</b><pre>{preview.text}</pre><button className="d-local-primary" onClick={() => { onAttach(new File([preview.text], preview.name, { type: 'text/plain' })); onClose(); }}>Attach to chat</button></> : <p>Pilih file untuk preview.</p>}</div></div></>}{error && <ClientAlert className="d-local-error">{error}</ClientAlert>}</LocalDialog>;
}
