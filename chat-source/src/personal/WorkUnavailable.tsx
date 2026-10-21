import { useEffect, useRef } from 'react';

export function WorkUnavailable({onClose}:{onClose:()=>void}){
 const dialog=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  return()=>previous?.focus();
 },[]);
 return <div className="p-work-backdrop" onClick={onClose}><div ref={dialog} className="p-work-modal" role="dialog" aria-modal="true" aria-labelledby="p-work-title" aria-describedby="p-work-description" onClick={e=>e.stopPropagation()} onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();onClose();return}
  if(e.key!=='Tab')return;
  const controls=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button')||[]);
  const first=controls[0],last=controls[controls.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
 }}>
 <button className="p-work-close" aria-label="Tutup" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
 <div className="p-work-illustration" aria-hidden="true"><span>Chat</span><span>Work</span></div>
 <h2 id="p-work-title">Work tidak tersedia</h2>
 <p id="p-work-description">Fitur Work belum tersedia saat ini.<br/>Kamu tetap bisa melanjutkan percakapan di Chat.</p>
 <button className="p-work-return" onClick={onClose}>Kembali ke Chat</button>
 </div></div>
}
