import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ClientTooltip } from '../components/SDKPrimitives';

export function TooltipButton({ label, tooltip, shortcut, className, onClick, children, enabled = true, disabled, expanded, controls, onEnter, onLeave, onFocusMenu, onBlurMenu }: {
  label: string; tooltip: string; shortcut?: string; className: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void; children?: ReactNode; enabled?: boolean;
  disabled?: boolean; expanded?: boolean; controls?: string;
  onEnter?: () => void; onLeave?: () => void; onFocusMenu?: () => void; onBlurMenu?: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [side, setSide] = useState<'right' | 'top' | 'bottom'>('top');
  useEffect(() => { setSide(button.current?.closest('.d-rail') ? 'right' : button.current?.closest('.d-titlebar') ? 'bottom' : 'top'); }, []);
  return <ClientTooltip content={enabled ? <span>{tooltip}{shortcut && <kbd>{shortcut}</kbd>}</span> : null} side={side} openDelay={450} compact contentClassName="d-sdk-tooltip"><button ref={button} className={className} aria-label={label} disabled={disabled} aria-expanded={expanded} aria-controls={controls} onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onFocusMenu} onBlur={onBlurMenu} onClick={onClick}>{children}</button></ClientTooltip>;
}
