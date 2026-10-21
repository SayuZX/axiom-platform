import { CODEX_MODE_ENABLED } from '../lib/clientFeatures';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { UIIcon as I } from '../components/UIIcon';

type PaletteAction = { id: string; label: string; icon?: string; shortcut?: string; detail?: string };
export type NavigationPaletteProps = {
  titles: string[]; snippets: Record<string, string>; onClose: () => void;
  onOpen: (title: string) => void; onAction: (action: string) => void;
};

const actionGroups: { label: string; actions: PaletteAction[] }[] = [
  { label: 'Quick actions', actions: [
    { id: 'new', label: 'New chat', icon: 'edit', shortcut: 'Ctrl+N' },
    { id: 'projects', label: 'Open folder', icon: 'folder', shortcut: 'Ctrl+O' },
    { id: 'files', label: 'Search files', icon: 'search', shortcut: 'Ctrl+P' },
  ] },
  { label: 'Settings', actions: [
    ['General', 'settings'], ['Import', 'download'], ['Profile', 'page'], ['Account', 'comment'],
    ['Appearance', 'bulb'], ['Voice', 'mic'], ['Storage', 'folder'], ['Mini & Pets', 'plugin'],
    ['Git', 'branch'], ['Codex Cloud', 'cloud'], ['Code Review', 'branch'],
    ['Environments', 'computer'], ['Worktrees', 'expand'], ['Configuration', 'shield'],
    ['Work preferences', 'settings'], ['Personalization', 'settings'], ['Browser', 'globe'],
    ['Computer use', 'computer'], ['MCP servers', 'terminal'], ['Hooks', 'terminal'],
    ['Plugins', 'plugin'], ['Data controls', 'shield'], ['Archived chats', 'archive'],
  ].map(([label, icon]) => ({ id: 'settings:' + label, label, icon })) },
  { label: 'Navigation', actions: [
    { id: 'chat', label: 'Switch to Chat', icon: 'comment' },
    { id: 'work', label: 'Switch to Work', icon: 'shield' },
    { id: 'codex', label: 'Switch to Codex', icon: 'terminal' },
    { id: 'back', label: 'Back', icon: 'arrow', shortcut: 'Alt+←' },
    { id: 'forward', label: 'Forward', icon: 'arrow', shortcut: 'Alt+→' },
    { id: 'sidebar', label: 'Toggle sidebar', icon: 'panel', shortcut: 'Ctrl+Shift+S' },
    { id: 'temporary', label: 'New temporary chat', icon: 'temporary', shortcut: 'Ctrl+Shift+J' },
  ] },
];

export function NavigationPalette({ titles, snippets, onClose, onOpen, onAction }: NavigationPaletteProps) {
  const [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null), panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const groups = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const matches = (item: PaletteAction) => (item.label + ' ' + (item.detail || '')).toLocaleLowerCase().includes(term);
    const chats: PaletteAction[] = titles.map((title, index) => ({ id: 'chat:' + title, label: title,
      detail: snippets[title], shortcut: index < 9 ? 'Alt+' + (index + 1) : undefined }));
    return [{ label: 'Chats', actions: (term ? chats.filter(matches) : chats.slice(0, 9)) },
      ...actionGroups.map(group => ({ ...group, actions: group.actions.filter(item => (item.id !== 'codex' || CODEX_MODE_ENABLED) && matches(item)) }))].filter(group => group.actions.length);
  }, [query, snippets, titles]);
  const items = groups.flatMap(group => group.actions);
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));
  const run = (item: PaletteAction) => item.id.startsWith('chat:') ? onOpen(item.label) : onAction(item.id);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current;
    input.current?.focus();
    return () => { if (previous?.isConnected && (document.activeElement === document.body || element?.contains(document.activeElement))) previous.focus(); };
  }, []);
  useEffect(() => { panel.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [activeIndex]);
  return <div className="d-navigation-shade" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="d-navigation-palette" role="dialog" aria-modal="true" aria-label="Search chats and actions" ref={panel}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') { event.preventDefault(); input.current?.focus(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setActive((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length));
        }
        if (event.key === 'Enter' && items[activeIndex]) { event.preventDefault(); run(items[activeIndex]); }
        if (event.altKey && /^[1-9]$/.test(event.key)) {
          const item = items.find(item => item.id.startsWith('chat:') && item.shortcut === 'Alt+' + event.key);
          if (item) { event.preventDefault(); event.stopPropagation(); run(item); }
        }
      }}>
      <input ref={input} role="combobox" aria-label="Search chats" aria-autocomplete="list" aria-expanded="true"
        aria-controls={listId} aria-activedescendant={items.length ? listId + '-' + activeIndex : undefined}
        placeholder="Search chats" value={query} onChange={event => { setQuery(event.target.value); setActive(0); }}/>
      <div className="d-navigation-results" role="listbox" id={listId} aria-label="Chats and actions">
        {!items.length && <p className="d-navigation-empty">No results</p>}
        {groups.map(group => <div role="group" aria-label={group.label} key={group.label}>
          <h2>{group.label}</h2>{group.actions.map(item => {
            const index = items.indexOf(item);
            return <button key={item.id} id={listId + '-' + index} role="option" aria-selected={activeIndex === index}
              tabIndex={-1} onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => run(item)}>
              <span className="d-navigation-icon">{item.icon && <I name={item.icon}/>}</span><span className="d-navigation-label">{item.label}</span>
              {item.detail && <span className="d-navigation-detail">{item.detail}</span>}{item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>;
          })}
        </div>)}
      </div>
    </div>
  </div>;
}
