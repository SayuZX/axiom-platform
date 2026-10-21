import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type ReactNode } from 'react';
import { B, I } from './Desktop';
import { parseThinking } from '../lib/endpointChat';

export { parseThinking };
import { speakText } from '../lib/clientSettings';
import { RichText } from '../components/RichText';

export const navigationItems = [
  { icon: 'folder', label: 'Projects', screen: 'projects' },
  { icon: 'spaces', label: 'Images', screen: 'images' },
  { icon: 'grid', label: 'Sites', screen: 'sites' },
  { icon: 'map', label: 'Maps', screen: '' },
  { icon: 'cube', label: 'GPTs', screen: '' },
  { icon: 'branch', label: 'Code Review', screen: '' },
];

export function MoreNavigation({ pinned, onPin, onOpen, onEnter, onLeave, onClose }: {
  pinned: string[]; onPin: (label: string) => void;
  onOpen: (item: typeof navigationItems[number]) => void;
  onEnter?: () => void; onLeave?: () => void; onClose?: () => void;
}) {
  return <div id="d-more-navigation" className="d-popover d-more" role="menu" aria-label="More navigation" onMouseEnter={onEnter} onMouseLeave={onLeave} onFocusCapture={onEnter} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))onLeave?.()}} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose?.()}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]'));const index=items.indexOf(document.activeElement as HTMLButtonElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()}
  }}>
    {navigationItems.map(item => <div className="d-more-row" key={item.label}>
      <button role="menuitem" onClick={() => onOpen(item)}><I name={item.icon}/><span>{item.label}</span></button>
      <B icon="pin" label={(pinned.includes(item.label) ? 'Unpin ' + item.label + ' from sidebar' : 'Pin ' + item.label + ' to sidebar')}
        className={'d-nav-pin ' + (pinned.includes(item.label) ? 'd-is-pinned' : '')}
        onClick={() => onPin(item.label)}/>
    </div>)}
  </div>;
}

export function usePopoverAnchor(open: boolean, anchor: RefObject<HTMLElement | null>, preferredHeight = 480, preferredWidth?: number, preferredPlacement: 'auto' | 'below' = 'auto') {
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: preferredHeight });
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const update = () => {
      const root = document.querySelector<HTMLElement>('.d-root');
      const target = anchor.current;
      if (!root || !target) return;
      const bounds = root.getBoundingClientRect(), rect = target.getBoundingClientRect();
      if (!root.offsetWidth || !bounds.width) return;
      const scale = bounds.width / root.offsetWidth;
      const above = (rect.top - bounds.top) / scale - 74;
      const below = (bounds.bottom - rect.bottom) / scale - 12;
      const useAbove = preferredPlacement === 'below' && below >= preferredHeight ? false : above >= 220 || above > below;
      const available = Math.max(80, useAbove ? above : below);
      const height = Math.min(preferredHeight, available);
      const width = Math.min(preferredWidth || rect.width / scale, root.offsetWidth - 16);
      setPosition({
        left: Math.max(8, preferredWidth ? (rect.right - bounds.left) / scale - width : (rect.left - bounds.left) / scale),
        top: useAbove ? (rect.top - bounds.top) / scale - height - 8 : (rect.bottom - bounds.top) / scale + 8,
        width, maxHeight: height,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor.current);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [open, anchor, preferredHeight, preferredWidth, preferredPlacement]);
  return position;
}

export function ComposerAddMenu({ anchor, plan, onFiles, onSelect, onUnavailable }: {
  anchor: RefObject<HTMLElement | null>; plan: boolean; onFiles: () => void;
  onSelect: (label: string) => void; onUnavailable: (label: string) => void;
}) {
  const position = usePopoverAnchor(true, anchor);
  const rows = [
    { icon: 'paperclip', label: 'Files and folders', hint: '', action: onFiles },
    { icon: 'chrome', label: 'Attach Google Chrome', hint: '', action: () => onUnavailable('Attach Google Chrome') },
    { icon: 'goal', label: 'Goal', hint: 'Set a goal to keep pursuing', action: () => onSelect('Goal') },
    { icon: 'bulb', label: 'Plan mode', hint: plan ? 'Turn plan mode off' : 'Turn plan mode on', action: () => onSelect('Plan mode') },
    { icon: 'sketch', label: 'Sketch', hint: 'Draw a sketch', action: () => onSelect('Sketch') },
  ];
  return <div className="d-popover d-composer-add" role="menu" aria-label="Add to message" style={{ ...position, visibility: position.width ? 'visible' : 'hidden' }}
    onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
    <p>Add</p>
    {rows.map((row, index) => <button className={index === 0 ? 'd-add-default' : ''} role="menuitem" key={row.label} onClick={row.action}>
      <I name={row.icon}/><span>{row.label}</span>{row.hint && <small>{row.hint}</small>}{row.label === 'Plan mode' && plan && <I name="check"/>}
    </button>)}
    <p>Plugins</p>
    {[
      ['plugin', 'MCP servers', 'Configure connected tools'],
      ['book', 'Local instructions', 'Use saved skills and instructions'],
      ['document', 'Documents', 'Create and edit local notes'],
    ].map(([icon, label, hint]) => <button role="menuitem" key={label} onClick={() => onSelect(label)}><I name={icon}/><span>{label}</span><small>{hint}</small></button>)}
  </div>;
}

export type PreviewMessage = { role: 'user' | 'assistant'; text: string; reasoning?: string; reasoningDurationMs?: number; timestamp?: number; attachments?: { id: string; name: string; type: string }[] };

export function ChatMessage({ message, onEdit, onNotice, streaming = false, experience = 'ChatGPT', streamContent }: {
  message: PreviewMessage; onEdit: (text: string) => void; onNotice: (text: string) => void; streaming?: boolean; experience?: 'ChatGPT' | 'Codex'; streamContent?: ReactNode;
}) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(message.text);
  const [time] = useState(() => message.timestamp || Date.now());
  const codex = experience === 'Codex';
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - time) / 1000)));
  useEffect(() => {
    if (!codex || !streaming) return;
    const start = Date.now();
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [codex, streaming, time]);

  const parsed = message.role === 'assistant' ? parseThinking(message.text, message.reasoning) : { reasoning: '', content: message.text, isThinking: false };

  return <section className={'d-chat-message d-chat-message-' + message.role}>
    {!!message.attachments?.length && <div className="d-message-files">{message.attachments.map(file => <span key={file.id}><I name="paperclip" size={17}/>{file.name}</span>)}</div>}
    {codex && streaming && message.role === 'assistant' && <div className={'d-codex-response-status' + (parsed.content || streamContent ? ' d-codex-response-working' : ' d-codex-response-thinking')}>
      {parsed.content || streamContent ? `Working for ${elapsed}s` : <span role="status">Thinking</span>}
    </div>}
    {editing ? <div className="d-message-editor"><textarea aria-label="Edit message" autoFocus value={draft} onChange={e => setDraft(e.target.value)}
      onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }}/><div><button onClick={() => setEditing(false)}>Cancel</button><button disabled={!draft.trim()} onClick={() => { onEdit(draft.trim()); setEditing(false); }}>Save</button></div></div>
      : streamContent ? streamContent : (parsed.content || (streaming && !codex)) ? <div className={message.role === 'user' ? 'd-user-message' : 'd-assistant-message'} role={message.role === 'assistant' && !parsed.content ? 'status' : undefined} aria-label={message.role === 'assistant' && !parsed.content ? 'Menunggu jawaban' : undefined}>{message.role === 'assistant' && parsed.content ? <RichText text={parsed.content}/> : parsed.content}</div> : null}
    {!editing && !streaming && parsed.content && <MessageActions text={parsed.content} user={message.role === 'user'} timestamp={time} onNotice={onNotice} onEdit={() => { setDraft(message.text); setEditing(true); }}/ >}
  </section>;
}

export function MessageActions({ text, user = false, timestamp, onEdit, onNotice }: {
  text: string | (() => string); user?: boolean; timestamp?: number; onEdit?: () => void; onNotice: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false), [more, setMore] = useState(false), [feedback, setFeedback] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(timer); }, [copied]);
  useEffect(() => {
    if (!more) return;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMore(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMore(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [more]);
  function content() { return typeof text === 'function' ? text() : text; }
  async function copy() { try { await navigator.clipboard.writeText(content()); setCopied(true); } catch { onNotice('Clipboard tidak tersedia'); } }
  function speak() {
    try { speakText(content()); } catch (failure) { onNotice((failure as Error).message); }
  }
  return <div className={'d-message-actions d-live-actions ' + (user ? 'd-user-actions' : '')} ref={menuRef}>
    {user && timestamp && <time>{new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time>}
    <B icon={copied ? 'check' : 'copy'} label={copied ? 'Copied' : user ? 'Copy message' : 'Copy response'} onClick={() => void copy()}/>
    {user ? <B icon="edit" label="Edit message" onClick={onEdit}/> : <>
      <B icon="sound" label="Read aloud" onClick={speak}/>
      <B icon="feedback" label={feedback || 'Mark helpful'} onClick={() => setFeedback(feedback ? '' : 'Marked helpful in this view')} className={feedback ? 'd-selected' : ''}/>
      <B icon="dots" label="More response actions" onClick={() => setMore(!more)}/>
      {timestamp && <time>{new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time>}
    </>}
    {more && <div className="d-popover d-response-menu"><button onClick={() => { void copy(); setMore(false); }}>Copy response</button><button onClick={() => { speak(); setMore(false); }}>Read aloud</button></div>}
  </div>;
}

export function PreviewCard({ onNotice }: { onNotice: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="d-preview-card" ref={ref}><span className="d-preview-icon"><I name="globe" size={30}/></span><div><strong>Web preview</strong><p>Website</p></div><button aria-expanded={open} onClick={() => setOpen(!open)}>Open in <I name="down" size={16}/></button>
    {open && <div className="d-popover d-preview-menu"><a href={location.origin} target="_blank" rel="noreferrer">Open in browser</a><button onClick={() => { void navigator.clipboard.writeText(location.origin).then(() => onNotice('Preview link copied'), () => onNotice('Clipboard tidak tersedia')); setOpen(false); }}>Copy link</button></div>}
  </div>;
}

export function ScrollToLatest({ scrollRef, showDisclaimer = false }: { scrollRef: RefObject<HTMLDivElement | null>; showDisclaimer?: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const update = () => setVisible(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    update(); el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update); observer.observe(el); if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => { observer.disconnect(); el.removeEventListener('scroll', update); };
  }, [scrollRef]);
  return visible || showDisclaimer ? <div className="d-composer-status">{visible ? <B icon="arrow" label="Scroll to latest" className="d-scroll-latest" onClick={() => { const el = scrollRef.current; el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }}/> : <p className="d-chat-disclaimer">AI can make mistakes. Check important information.</p>}</div> : null;
}

export function SketchDialog({ onClose, onAttach }: { onClose: () => void; onAttach: (file: File) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), drawing = useRef(false), [hasDrawing, setHasDrawing] = useState(false);
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - rect.left) * 900 / rect.width, (event.clientY - rect.top) * 450 / rect.height];
  }
  return <div className="d-modal-backdrop" onClick={onClose}><div className="d-sketch-dialog" role="dialog" aria-modal="true" aria-label="Sketch" onClick={e => e.stopPropagation()}><div className="d-row"><h2>Sketch</h2><B icon="close" label="Close sketch" onClick={onClose}/></div>
    <canvas ref={canvas} width={900} height={450} aria-label="Drawing canvas" onPointerDown={event => { const ctx = canvas.current?.getContext('2d'); if (!ctx) return; drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); const [x, y] = point(event); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#222'; }}
      onPointerMove={event => { if (!drawing.current) return; const [x, y] = point(event); const ctx = canvas.current?.getContext('2d'); ctx?.lineTo(x, y); ctx?.stroke(); setHasDrawing(true); }} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }}/>
    <div className="d-sketch-actions"><button onClick={() => { canvas.current?.getContext('2d')?.clearRect(0, 0, 900, 450); setHasDrawing(false); }}>Clear</button><button disabled={!hasDrawing} onClick={() => canvas.current?.toBlob(blob => { if (blob) { onAttach(new File([blob], 'sketch.png', { type: 'image/png' })); onClose(); } })}>Attach sketch</button></div>
  </div></div>;
}
