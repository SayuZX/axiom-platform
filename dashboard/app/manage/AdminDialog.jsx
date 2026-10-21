'use client';

import { useEffect, useId, useRef, useState } from 'react';
import GlobalFeedback, { OverlayPortal } from '../components/GlobalFeedback';

export default function AdminDialog(props) {
  return <OverlayPortal dialog><DialogContent {...props}/></OverlayPortal>;
}

function DialogContent({ title, children, onClose, onConfirm, confirmLabel = 'Lanjutkan', pending = false }) {
  const ref = useRef(null);
  const lock = useRef(false);
  const [working, setWorking] = useState(false);
  const id = useId();
  const blocked = pending || working;
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); const top = [...document.querySelectorAll('dialog[open]')].at(-1); if (previous?.isConnected && (!top || top.contains(previous))) previous.focus(); };
  }, []);
  async function confirm() {
    if (lock.current || pending) return;
    lock.current = true; setWorking(true);
    try { await onConfirm(); } finally { lock.current = false; setWorking(false); }
  }
  return <dialog ref={ref} className="axiom-admin-dialog" aria-labelledby={id} aria-describedby={`${id}-body`} aria-busy={blocked} onCancel={event => { event.preventDefault(); if (!blocked) onClose(); }} style={{ width: 'min(380px, calc(100vw - 24px))', maxHeight: 'calc(100dvh - 24px)', overflow: 'auto', boxSizing: 'border-box', border: '1px solid var(--axiom-dialog-border)', borderRadius: 12, padding: 18, background: 'var(--axiom-dialog-surface)', color: 'var(--axiom-dialog-text)', boxShadow: '0 12px 36px #0004' }}>
    <style>{'.axiom-admin-dialog{position:fixed!important;inset:0!important;margin:auto!important;height:fit-content;max-width:calc(100vw - 24px);font:14px/1.45 system-ui,sans-serif}.axiom-admin-dialog::backdrop{background:rgba(10,18,30,.58);backdrop-filter:blur(3px)}.axiom-admin-dialog button:focus-visible{outline:3px solid #2563eb;outline-offset:3px}.axiom-admin-dialog h2{margin:0 0 10px;font-size:17px;line-height:1.3}.axiom-admin-dialog p{margin:0;line-height:1.45;overflow-wrap:anywhere}'}</style>
    <h2 id={id}>{title}</h2><div id={`${id}-body`}>{children}</div>
    <div className="dash-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
      <button autoFocus type="button" className="dash-button" disabled={blocked} onClick={onClose}>{onConfirm ? 'Batal' : 'Tutup'}</button>
      {onConfirm && <button type="button" className="dash-button dash-button-danger" disabled={blocked} onClick={confirm}>{blocked ? 'Memproses…' : confirmLabel}</button>}
    </div>
  </dialog>;
}

export function ErrorDialog({ message }) {
  return <GlobalFeedback>{message}</GlobalFeedback>;
}
