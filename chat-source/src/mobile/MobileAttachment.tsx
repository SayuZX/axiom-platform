import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { libraryFile, type FileRef } from '../lib/fileLibrary';
import { MobileControlIcon } from './MobileControlIcon';

export function attachmentKind(file: FileRef) {
  if (file.type.startsWith('image/')) return 'Foto';
  if (file.type.startsWith('video/')) return 'Video';
  if (/\.pdf$/i.test(file.name)) return 'PDF';
  if (/\.html?$/i.test(file.name)) return 'HTML';
  return 'Dokumen';
}

// Keep media bytes in IndexedDB. Object URLs live only as long as this card.
export function MobileAttachment({ file, pending = false, onRemove }: { file: FileRef; pending?: boolean; onRemove?: () => void }) {
  const [url, setUrl] = useState(''), [size, setSize] = useState(''), [preview, setPreview] = useState(false), [missing, setMissing] = useState(false);
  const kind = attachmentKind(file), media = kind === 'Foto' || kind === 'Video';
  useEffect(() => {
    let disposed = false, objectUrl = '';
    setUrl(''); setMissing(false); setSize('');
    void libraryFile(file.id).then(value => {
      if (disposed) return;
      if (!value) { setMissing(true); return; }
      setSize(value.size >= 1048576 ? (value.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(value.size / 1024)) + ' KB');
      if (media) { objectUrl = URL.createObjectURL(value.blob); setUrl(objectUrl); }
    }).catch(() => { if (!disposed) setMissing(true); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.id, media]);
  useEffect(() => {
    if (!preview) return;
    const content = document.querySelector<HTMLElement>('.m-content'), wasInert = content?.inert;
    if (content) content.inert = true;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setPreview(false); } };
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('keydown', escape, true); if (content) content.inert = wasInert || false; };
  }, [preview]);
  return <div className={`m-file-card${media ? ' m-file-media' : ''}${pending ? ' m-file-pending' : ''}`}>
    <button type="button" className="m-file-open" aria-label={'Lihat ' + file.name} disabled={!url || !media} onClick={() => setPreview(true)}>
      {url && kind === 'Foto' ? <img src={url} alt={file.name}/> : url && kind === 'Video' ? <><video src={url} preload="metadata" muted playsInline/><span className="m-file-play" aria-hidden="true">▶</span></> : <><span className="m-file-type"><MobileControlIcon name="page"/></span><span className="m-file-label"><strong>{file.name}</strong><small>{missing ? 'File tidak tersedia' : [kind, size].filter(Boolean).join(' · ')}</small></span></>}
    </button>
    {onRemove && <button className="m-file-remove" type="button" aria-label={'Hapus lampiran ' + file.name} onClick={onRemove}><MobileControlIcon name="close"/></button>}
    {preview && createPortal(<div className="m-media-preview" role="dialog" aria-modal="true" aria-label={file.name}>
      <header><button autoFocus type="button" aria-label="Tutup pratinjau" onClick={() => setPreview(false)}><MobileControlIcon name="close"/></button><span>{file.name}</span></header>
      {kind === 'Video' ? <video src={url} controls playsInline/> : <img src={url} alt={file.name}/>}
    </div>, document.querySelector('.m-app') || document.body)}
  </div>;
}
