import type { RefObject } from 'react';
import { MobileControlIcon } from './MobileControlIcon';

export function MobileAttachmentMenu({ firstRef, thinkHarder, onClose, onCamera, onPhoto, onFile, onPlugins, onThink }: {
  firstRef: RefObject<HTMLButtonElement | null>; thinkHarder: boolean;
  onClose: () => void; onCamera: () => void; onPhoto: () => void;
  onFile: () => void; onPlugins: () => void; onThink: () => void;
}) {
  return <div className="m-overlay m-attachment-overlay">
    <button className="m-backdrop" aria-label="Close attachments" onClick={onClose}/>
    <section className="m-attachment-menu" role="dialog" aria-modal="true" aria-label="Add attachments">
      {([
        ['camera', 'Kamera', onCamera], ['photo', 'Foto', onPhoto],
        ['paperclip', 'File', onFile], ['plugin', 'Plugin', onPlugins],
        ['think-harder', 'Berpikir lebih keras', onThink],
      ] as const).map(([icon, label, action], index) => <button key={icon} ref={index === 0 ? firstRef : undefined} onClick={action} aria-pressed={icon === 'think-harder' ? thinkHarder : undefined}>
        <span className="m-attachment-icon"><MobileControlIcon name={icon}/></span><span>{label}</span>
      </button>)}
    </section>
  </div>;
}
