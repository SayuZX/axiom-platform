import { useEffect, useRef } from 'react';
import { UIIcon } from '../components/UIIcon';

export function TemporaryChatIntro({ onClose, scale = 1 }: { onClose: () => void; scale?: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLButtonElement>('.d-temporary-intro-continue')?.focus();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="d-temporary-intro" style={{ zoom: scale }} aria-labelledby="temporary-intro-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="d-temporary-intro-art">
      <button className="d-temporary-intro-close" aria-label="Close temporary chat introduction" onClick={onClose}><UIIcon name="close" size={20}/></button>
      <span><UIIcon name="temporary-checked" size={48}/></span>
    </div>
    <div className="d-temporary-intro-body">
      <h2 id="temporary-intro-title">Temporary chat</h2>
      <p>This chat won’t appear in history on this device or use saved memories. Custom instructions still apply. Your selected provider determines how requests are stored.</p>
      <button className="d-temporary-intro-continue" autoFocus onClick={onClose}>Continue</button>
    </div>
  </dialog>;
}
