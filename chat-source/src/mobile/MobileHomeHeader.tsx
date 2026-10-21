import { UIIcon as Icon } from '../components/UIIcon';
import { MobileControlIcon } from './MobileControlIcon';

type Props = {
  mode: 'Chat' | 'Work'; temporary: boolean;
  onMode: (mode: 'Chat' | 'Work') => void;
  onSidebar: () => void; onTemporary: () => void;
};

export function MobileHomeHeader({ mode, temporary, onMode, onSidebar, onTemporary }: Props) {
  return <header className="m-header m-home-header">
    <button type="button" className="m-round" aria-label="Open sidebar" onClick={onSidebar}><Icon name="mobile-menu"/></button>
    {!temporary && <div className="m-mode" role="tablist" aria-label="Chat mode">
      {(['Chat', 'Work'] as const).map(value => <button type="button" key={value} role="tab" aria-selected={mode === value} tabIndex={mode === value ? 0 : -1}
        onClick={() => onMode(value)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'Chat' : event.key === 'End' ? 'Work' : value === 'Chat' ? 'Work' : 'Chat';
          onMode(next);
          const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]');
          tabs?.[next === 'Chat' ? 0 : 1].focus();
        }}>{value}</button>)}
    </div>}
    <button type="button" className="m-round" aria-label="Temporary chat" aria-pressed={temporary} onClick={onTemporary}><MobileControlIcon name={temporary ? 'temporary-checked' : 'temporary'}/></button>
  </header>;
}
