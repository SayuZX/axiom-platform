import { ClientAlert, ClientButton, ClientInput } from '../components/SDKPrimitives';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { UIIcon as I } from '../components/UIIcon';
import { profileInitials, saveLocalProfile, type LocalProfile } from '../lib/localProfile';

function ProfileOverlay({ children, label, close, fullPage = false }: { children: ReactNode; label: string; close?: () => void; fullPage?: boolean }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { if (previous?.isConnected && !previous.closest('[inert]')) previous.focus(); };
  }, []);
  const content = <div className={'d-setup' + (fullPage ? ' d-auth-page' : '')} onMouseDown={event => { if (close && event.target === event.currentTarget) close(); }}>
    {fullPage && <div className="d-auth-wordmark"><img className="d-brand-logo" src="/axiom-chat/axiom-logo.svg" alt=""/>AXIOM AI</div>}
    <div className="d-setup-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label={label}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); if (close) close(); }
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled)') || []).filter(element => !element.closest('[hidden],[inert]'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>{children}</div>
  </div>;
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}

export function Onboarding({ onComplete }: { onComplete: (profile: LocalProfile) => void }) {
  const [name, setName] = useState(''), [error, setError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  return <ProfileOverlay label="Pengaturan awal" fullPage>
    <div className="d-auth-name-step">
      <h1>Selamat datang</h1><p className="d-setup-intro">Masukkan namamu untuk mulai menggunakan AXIOM AI.</p>
      <form className="d-name-form" onSubmit={event => { event.preventDefault(); try { onComplete(saveLocalProfile(name)); } catch (failure) { setError((failure as Error).message); } }}>
        <label htmlFor="setup-name">Nama kamu</label><ClientInput pill ref={nameInput} id="setup-name" maxLength={80} autoComplete="name" placeholder="Masukkan nama" value={name} onChange={event => { setName(event.target.value); setError(''); }} required/>
        {error && <ClientAlert className="d-setup-error">{error}</ClientAlert>}
        <ClientButton color="primary" variant="solid" className="d-setup-primary" type="submit">Lanjut</ClientButton>
      </form>
      <p className="d-auth-footnote">Nama disimpan di perangkat ini dan bisa diubah dari profil.<br/>AXIOM AI adalah aplikasi independen.</p>
    </div>
  </ProfileOverlay>;
}

export function ProfileNameDialog({ profile, onSave, onClose }: { profile: LocalProfile; onSave: (profile: LocalProfile) => void; onClose: () => void }) {
  const [name, setName] = useState(profile.name), [error, setError] = useState('');
  return <ProfileOverlay label="Nama profil" close={onClose}>
    <div className="d-profile-edit-heading"><span>{profileInitials(name)}</span><button aria-label="Tutup pengaturan nama" onClick={onClose}><I name="close" size={20}/></button></div>
    <h1>Nama profil</h1><p className="d-setup-intro">Gunakan nama yang ingin kamu tampilkan di aplikasi.</p>
    <form className="d-name-form" onSubmit={event => { event.preventDefault(); try { onSave(saveLocalProfile(name)); } catch (failure) { setError((failure as Error).message); } }}>
      <label htmlFor="profile-name">Nama kamu</label><ClientInput pill id="profile-name" maxLength={80} autoComplete="name" value={name} onChange={event => { setName(event.target.value); setError(''); }} required/>
      {error && <ClientAlert className="d-setup-error">{error}</ClientAlert>}
      <ClientButton color="primary" variant="solid" className="d-setup-primary" type="submit">Simpan nama</ClientButton>
    </form>
  </ProfileOverlay>;
}
