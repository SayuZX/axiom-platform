import { HistoryTitle } from './HistoryTitle';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { B, I } from './Desktop';
import { Disclosure, useHoverPreview } from './Motion';

export type HistoryListProps = {
  titles: string[]; pinned: string[]; archived: string[]; active: string;
  projects?: string[]; showPinned?: boolean; experience?: 'ChatGPT' | 'Codex';
  onNew: () => void; onOpen: (title: string) => void; onPin: (title: string) => void;
  onArchive: (title: string) => void; onOptions?: (title: string, action: string) => void; onCreateProject?: () => void; onProject?: (title: string) => void;
};

export function HistoryList({ titles, pinned, archived, active, onNew, onOpen, onPin, onArchive,
  showPinned = true, projects = [], experience = 'ChatGPT', onOptions, onCreateProject, onProject }: HistoryListProps) {
  const preview = useHoverPreview<{ title: string; top: number }>(180);
  const [collapsed, setCollapsed] = useState(false), [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [options, setOptions] = useState<'Projects' | 'Recents' | null>(null), [alphabetical, setAlphabetical] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null), optionsAnchor = useRef<HTMLElement | null>(null);
  const [optionsPosition, setOptionsPosition] = useState({ left: 0, top: 0 });
  const [chatOptions, setChatOptions] = useState<{ title: string; left: number; top: number } | null>(null);
  useEffect(() => { setChatOptions(null); setOptions(null); preview.close(); }, [experience]);
  const chatOptionsRef = useRef<HTMLDivElement>(null), chatOptionsAnchor = useRef<HTMLElement | null>(null);
  function toggleOptions(section: 'Projects' | 'Recents', anchor: HTMLElement) {
    optionsAnchor.current = anchor;
    const root = document.querySelector<HTMLElement>('.d-root'); if (!root) return;
    const bounds = root.getBoundingClientRect(), rect = anchor.getBoundingClientRect(), scale = bounds.width / root.offsetWidth || 1;
    setOptionsPosition({ left: Math.min((rect.left - bounds.left) / scale, root.offsetWidth - 300), top: Math.min((rect.bottom - bounds.top) / scale + 6, root.offsetHeight - 150) });
    preview.close(); setOptions(previous => previous === section ? null : section);
  }
  function toggleChatOptions(title: string, anchor: HTMLElement) {
    const root = document.querySelector<HTMLElement>('.d-root'); if (!root) return;
    const bounds = root.getBoundingClientRect(), rect = anchor.getBoundingClientRect(), scale = bounds.width / root.offsetWidth || 1;
    chatOptionsAnchor.current = anchor; preview.close(); setOptions(null);
    const height = experience === 'ChatGPT' ? 410 : 204;
    const anchorTop = (rect.top - bounds.top) / scale;
    setChatOptions(previous => previous?.title === title ? null : { title, left: Math.max(8, Math.min((rect.left - bounds.left) / scale - 16, root.offsetWidth - 308)), top: Math.max(8, Math.min(anchorTop >= height + 8 ? anchorTop - height - 8 : (rect.bottom - bounds.top) / scale + 8, root.offsetHeight - height - 8)) });
  }
  useEffect(() => {
    if (!options && !chatOptions) return;
    const close = (event: PointerEvent) => {
      if (options && !optionsRef.current?.contains(event.target as Node) && !optionsAnchor.current?.contains(event.target as Node)) setOptions(null);
      if (chatOptions && !chatOptionsRef.current?.contains(event.target as Node) && !chatOptionsAnchor.current?.contains(event.target as Node)) setChatOptions(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOptions(null); setChatOptions(null); chatOptionsAnchor.current?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [options, chatOptions]);
  function enter(title: string, element: HTMLElement, immediate = false) {
    const root = document.querySelector<HTMLElement>('.d-root'); if (!root) return;
    const bounds = root.getBoundingClientRect(), rect = element.getBoundingClientRect(), scale = bounds.width / root.offsetWidth;
    preview.show({ title, top: Math.min((rect.top - bounds.top) / scale, root.offsetHeight - 110) }, immediate);
  }
  function row(title: string) {
    return <div key={title} className={'d-history-row ' + (active === title ? 'd-selected' : '')}
      onMouseEnter={event => enter(title, event.currentTarget)} onMouseLeave={preview.leave}
      onFocus={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) enter(title, event.currentTarget, true); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) preview.leave(); }}>
      <HistoryTitle title={title} onOpen={() => { preview.close(); onOpen(title); }}/>
      <div className="d-history-actions">
        {experience === 'ChatGPT' && <B icon="dots" label="Conversation options" expanded={chatOptions?.title === title} onClick={event => toggleChatOptions(title, event.currentTarget)}/>}
        <B icon="pin" label={pinned.includes(title) ? 'Unpin chat' : 'Pin chat'} onClick={() => onPin(title)}/>
        {experience === 'Codex' && <B icon="archive" label="Archive chat" onClick={() => { preview.close(); onArchive(title); }}/>}</div>
    </div>;
  }
  const visibleTitles = titles.filter(title => (!showPinned || !pinned.includes(title)) && !archived.includes(title));
  const sortedTitles = alphabetical ? [...visibleTitles].sort((a, b) => a.localeCompare(b)) : visibleTitles;
  const root = typeof document === 'undefined' ? null : document.querySelector('.d-root');
  return <div className="d-history-list">
    <B icon="edit" label="New chat" className="d-navrow" onClick={onNew}>New chat</B>
    <div className="d-history-scroll" onScroll={() => { preview.close(); setOptions(null); setChatOptions(null); }}>
      {showPinned && pinned.some(title => !archived.includes(title)) && <><div className="d-history-section"><button className="d-section-toggle" aria-expanded={!pinnedCollapsed} onClick={()=>{setPinnedCollapsed(!pinnedCollapsed);preview.close()}}><span>Pinned</span><I name="down" size={15}/></button></div><Disclosure open={!pinnedCollapsed}>{pinned.filter(title => !archived.includes(title)).map(row)}</Disclosure></>}
      <div className="d-history-section"><button aria-expanded={!projectsCollapsed} className="d-section-toggle" onClick={() => { setProjectsCollapsed(!projectsCollapsed); preview.close(); }}><span>Projects</span><I name="down" size={15}/></button>
        <div className="d-section-tools"><B icon="dots" label="Project options" onClick={event => toggleOptions('Projects', event.currentTarget)}/><B icon="plus" label="New project" onClick={onCreateProject}/></div>
      </div>
      <Disclosure open={!projectsCollapsed}>{projects.length ? projects.map(project => <button key={project} className="d-project-row" onClick={() => onProject?.(project)}><I name="folder" size={21}/>{project}</button>) : <p className="d-empty">No projects</p>}</Disclosure>
      <div className="d-history-section d-recents-section"><button className="d-section-toggle" aria-expanded={!collapsed} onClick={() => { setCollapsed(!collapsed); preview.close(); }}><span>Recents</span><I name="down" size={15}/></button>
        <div className="d-section-tools"><B icon="dots" label="Recent chat options" onClick={event => toggleOptions('Recents', event.currentTarget)}/><B icon="edit" label="New chat" onClick={onNew}/></div>
      </div>
      <Disclosure open={!collapsed}>{sortedTitles.map(row)}</Disclosure>
    </div>
    {options && root && createPortal(<div className="d-history-options" style={{ ...optionsPosition, position: 'fixed' }} ref={optionsRef} role="menu" aria-label={options + ' options'}>{options === 'Projects' ? <button role="menuitem" onClick={() => { onCreateProject?.(); setOptions(null); }}>New project</button> : <><button role="menuitemradio" aria-checked={!alphabetical} onClick={() => { setAlphabetical(false); setOptions(null); }}>Recent first{!alphabetical && <I name="check" size={18}/>}</button><button role="menuitemradio" aria-checked={alphabetical} onClick={() => { setAlphabetical(true); setOptions(null); }}>Alphabetical{alphabetical && <I name="check" size={18}/>}</button></>}</div>, root)}
    {experience === 'ChatGPT' && chatOptions && root && createPortal(<div className="d-history-chat-options" style={{ left: chatOptions.left, top: chatOptions.top, position: 'fixed' }} ref={chatOptionsRef} role="menu" aria-label={'Options for ' + chatOptions.title}>
      <button role="menuitem" onClick={() => { onOptions?.(chatOptions.title, 'Rename'); setChatOptions(null); }}><I name="edit" size={22}/><span>Rename</span><small>Ctrl+Alt+R</small></button>
      <button role="menuitem" onClick={() => { onPin(chatOptions.title); setChatOptions(null); }}><I name="pin" size={22}/><span>{pinned.includes(chatOptions.title) ? 'Unpin' : 'Pin'}</span><small>Ctrl+Alt+P</small></button>
      {experience === 'ChatGPT' && <button role="menuitem" onClick={() => { onOptions?.(chatOptions.title, 'Section'); setChatOptions(null); }}><I name="list" size={22}/><span>Section</span><I name="down" size={16}/></button>}
      <hr/>
      <button role="menuitem" onClick={() => { onOptions?.(chatOptions.title, 'Share'); setChatOptions(null); }}><I name="upload" size={19}/>Share</button>
      {experience === 'ChatGPT' && <><hr/><button role="menuitem" aria-disabled="true" title="Chat lokal belum tersinkron dengan chatgpt.com" disabled><I name="globe" size={22}/><span>Open on chatgpt.com</span></button><hr/></>}
      <button role="menuitem" onClick={() => { onArchive(chatOptions.title); setChatOptions(null); }}><I name="archive" size={22}/><span>Archive</span><small>Ctrl+Shift+A</small></button>
      {experience === 'ChatGPT' && <><button className="d-history-delete" role="menuitem" onClick={() => { onOptions?.(chatOptions.title, 'Delete'); setChatOptions(null); }}><I name="trash" size={22}/><span>Delete</span></button><hr/><button role="menuitem" onClick={() => { onOptions?.(chatOptions.title, 'Move to project'); setChatOptions(null); }}><I name="folder" size={22}/><span>Move to project</span><I name="down" size={16}/></button></>}
    </div>, root)}
    {preview.data && root && createPortal(<div className="d-history-preview" data-open={preview.open} aria-hidden={!preview.open} style={{ top: preview.data.top }} onMouseEnter={preview.keep} onMouseLeave={preview.leave}>
      <div><b>{preview.data.title}</b><I name="computer" size={18}/><time>Local</time></div><p><I name="comment" size={20}/>Chat</p>
    </div>, root)}
  </div>;
}
