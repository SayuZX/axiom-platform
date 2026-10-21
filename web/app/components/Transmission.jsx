'use client';

import { useEffect, useRef } from 'react';

export default function Transmission() {
  const dialog = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    const element = dialog.current;
    const restoreFocus = () => trigger.current?.focus();
    element.addEventListener('close', restoreFocus);
    return () => {
      element.removeEventListener('close', restoreFocus);
      if (element.open) element.close();
    };
  }, []);

  function open(event) {
    if (typeof dialog.current?.showModal === 'function') {
      event.preventDefault();
      dialog.current.showModal();
    }
  }

  function dismissBackdrop(event) {
    if (event.target !== dialog.current) return;
    const bounds = dialog.current.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current.close();
  }

  return <>
    <a className="primary" href="#about" ref={trigger} aria-haspopup="dialog" onClick={open}>BUKA TRANSMISI <span className="arrow" aria-hidden="true">↗</span></a>
    <dialog ref={dialog} aria-labelledby="message-title" onClick={dismissBackdrop}>
      <div className="dialog-head"><span>AXM // TRANSMISSION 001</span><button className="close" type="button" aria-label="Tutup transmisi" onClick={() => dialog.current.close()}>TUTUP ×</button></div>
      <div className="dialog-body">
        <h2 id="message-title">CERITA BESAR.<br />SEGERA DIMULAI.</h2>
        <p>Axiom Creative sedang menyiapkan portal komunitas FiveM. Akses kota belum dibuka dan tanggal peluncuran belum diumumkan.</p>
        <p>Simpan alamat <a href="https://axiomcreative.xyz">axiomcreative.xyz</a>. Pengumuman berikutnya akan hadir di sini.</p>
        <p className="signal-line">END OF TRANSMISSION. STAY CURIOUS_</p>
      </div>
    </dialog>
  </>;
}
