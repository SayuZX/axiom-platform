import { useEffect, useRef, useState } from 'react';
import { ClientSwitch } from '../components/SDKPrimitives';
import { UIIcon } from '../components/UIIcon';

export function TemporaryChatControls({ memories, instructions, onMemories, onInstructions }: {
  memories: boolean; instructions: boolean; onMemories: (value: boolean) => void; onInstructions: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <div ref={root} className="d-temporary-personalization" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); root.current?.querySelector('button')?.focus(); } }}>
    <button type="button" aria-expanded={open} aria-controls="temporary-personalization-options" onClick={() => setOpen(!open)}>{memories || instructions ? 'Personalized' : 'Not personalized'}<UIIcon name="down" size={20}/></button>
    {open && <div id="temporary-personalization-options" className="d-temporary-personalization-options" role="group" aria-label="Temporary chat personalization">
      <label><span>Saved memories<small>Use your saved notes for this chat.</small></span><ClientSwitch label="Use saved memories in temporary chat" value={memories} change={onMemories}/></label>
      <label><span>Custom instructions<small>Apply your instructions and writing style.</small></span><ClientSwitch label="Use custom instructions in temporary chat" value={instructions} change={onInstructions}/></label>
      <p>These choices apply only to this temporary chat. Files you attach can still be sent to your provider.</p>
    </div>}
  </div>;
}
