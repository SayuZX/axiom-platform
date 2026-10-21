'use client';
import { useRef, useState } from 'react';
import { api, useResource, date } from '../../../lib/api';
import type { Key } from '../../../lib/types';
import { Heading, Failure, CircleLoading, Submit, Empty } from '../../../components/ui';
import styles from './keys.module.css';

export default function Keys() {
  const r = useResource<{ keys: Key[]; usage: { active: number; limit: number } }>('/api/keys');
  const createDialog = useRef<HTMLDialogElement>(null);
  const actionDialog = useRef<HTMLDialogElement>(null);
  const createForm = useRef<HTMLFormElement>(null);
  const secretField = useRef<HTMLTextAreaElement>(null);
  const pending = useRef(false);
  const [secret, setSecret] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<Key>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const usage = r.data?.usage;
  const atLimit = !usage || usage.active >= usage.limit;
  const keys = r.data?.keys.filter(k =>
    `${k.name} ${k.prefix}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (status === 'all' || (status === 'revoked' ? !!k.revoked_at : !k.revoked_at))
  ) || [];
  function closeCreate() {
    if (pending.current || (secret && !acknowledged)) return;
    createDialog.current?.close();
  }
  function resetCreate() {
    createForm.current?.reset();
    setSecret(''); setAcknowledged(false); setCopied(''); setError(undefined);
  }
  return (
    <>
      <Heading title="Kunci API" description="Kelola akses integrasi tanpa membagikan kata sandi akun." action={
        <button className="button primary" disabled={busy || atLimit || r.loading || !!r.error} onClick={() => {
          resetCreate(); createDialog.current?.showModal();
        }}>Buat kunci API</button>
      } />
      <section className="panel">
        <div className="panel-head"><h2>Kunci integrasi</h2><span className="hint">{usage ? `${usage.active} / ${usage.limit} kunci aktif` : 'Memuat batas…'}</span></div>
        <div className={styles.filters}>
          <label>Cari kunci<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nama atau prefix" /></label>
          <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Semua status</option><option value="active">Aktif</option><option value="revoked">Dicabut</option></select></label>
        </div>
        {usage && usage.active >= usage.limit && <p className={styles.limit} role="status">{usage.limit === 0 ? 'Pembuatan kunci dinonaktifkan oleh administrator.' : 'Batas kunci aktif tercapai. Cabut kunci yang tidak digunakan atau hubungi administrator.'} Kunci yang sudah aktif tidak berubah.</p>}
        {r.error ? <Failure error={r.error} retry={r.refresh} /> : r.loading ? <CircleLoading /> : !keys.length ? <Empty>{r.data?.keys.length ? 'Tidak ada kunci sesuai pencarian.' : 'Belum ada kunci API dalam daftar.'}</Empty> : (
          <div className="table-wrap"><table><thead><tr><th>Nama</th><th>Prefix</th><th>Terakhir dipakai</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>
            {keys.map(k => <tr key={k.id}><td>{k.name}<small>{date(k.created_at)}</small></td><td><code>{k.prefix}…</code></td><td>{date(k.last_used_at)}</td><td>{k.revoked_at ? 'Dicabut' : 'Aktif'}</td><td><button className={`button ${k.revoked_at ? '' : 'danger'}`} disabled={busy} aria-label={`${k.revoked_at ? 'Hapus' : 'Cabut'} kunci ${k.name}`} onClick={() => {
              setTarget(k); setError(undefined); actionDialog.current?.showModal();
            }}>{k.revoked_at ? 'Hapus dari daftar' : 'Cabut'}</button></td></tr>)}
          </tbody></table></div>
        )}
      </section>
      <dialog ref={createDialog} className={styles.dialog} aria-labelledby="create-key-title" aria-describedby="create-key-description" onCancel={e => {
        if (pending.current || secret) e.preventDefault();
      }} onClose={resetCreate}>
        {secret ? <div className="stack">
          <h2 id="create-key-title">Simpan secret sekarang</h2>
          <p id="create-key-description" className="hint">Secret hanya ditampilkan sekali. Simpan di server yang aman; jangan bagikan melalui Telegram atau kode frontend.</p>
          <textarea ref={secretField} className={styles.secret} readOnly value={secret} aria-label="Secret API baru" spellCheck={false} autoFocus />
          <button className="button" type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(secret); setCopied('Secret disalin.'); }
            catch { secretField.current?.focus(); secretField.current?.select(); setCopied('Penyalinan otomatis tidak tersedia. Salin secret yang dipilih secara manual.'); }
          }}>Salin secret</button>
          <p role="status" className="hint">{copied}</p>
          <label className="checkbox"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />Saya sudah menyimpan secret dengan aman.</label>
          <button className="button primary" disabled={!acknowledged} onClick={closeCreate}>Sudah disimpan, tutup</button>
        </div> : <form ref={createForm} method="post" className="stack" onSubmit={async e => {
          e.preventDefault(); if (pending.current) return;
          pending.current = true; setBusy(true); setError(undefined);
          const form = e.currentTarget;
          const data = new FormData(form);
          try {
            const created = await api<{ key: Key; secret: string }>('/api/keys', { method: 'POST', body: JSON.stringify({ name: data.get('name'), password: data.get('password') }) });
            form.reset(); setSecret(created.data.secret); r.refresh();
          } catch (err) { setError(err as Error); r.refresh(); }
          finally { const password = form.elements.namedItem('password'); if (password instanceof HTMLInputElement) password.value = ''; pending.current = false; setBusy(false); }
        }}>
          <h2 id="create-key-title">Buat kunci API</h2>
          <p id="create-key-description" className="hint">{usage?.active ?? '—'} dari {usage?.limit ?? '—'} kunci aktif. Kunci dicabut tidak dihitung.</p>
          {error && <Failure error={error} />}
          <label>Nama integrasi<input name="name" maxLength={60} required placeholder="Server toko" autoFocus disabled={busy} /></label>
          <label>Kata sandi untuk verifikasi<input name="password" type="password" autoComplete="current-password" required disabled={busy} /></label>
          <div className={styles.actions}><button type="button" className="button" disabled={busy} onClick={closeCreate}>Batal</button><Submit busy={busy}>Buat kunci API</Submit></div>
        </form>}
      </dialog>
      <dialog ref={actionDialog} className={styles.dialog} aria-labelledby="key-action-title" aria-describedby="key-action-description" onCancel={e => { if (pending.current) e.preventDefault(); }} onClose={() => { setTarget(undefined); setError(undefined); }}>
        <form className="stack" onSubmit={async e => {
          e.preventDefault(); if (pending.current || !target) return;
          pending.current = true; setBusy(true); setError(undefined);
          try {
            await api(`/api/keys/${encodeURIComponent(target.id)}${target.revoked_at ? '/remove' : ''}`, { method: target.revoked_at ? 'POST' : 'DELETE' });
            actionDialog.current?.close(); r.refresh();
          } catch (err) { setError(err as Error); }
          finally { pending.current = false; setBusy(false); }
        }}>
          <h2 id="key-action-title">{target?.revoked_at ? 'Hapus kunci dari daftar?' : 'Cabut kunci API?'}</h2>
          <p id="key-action-description"><strong>{target?.name}</strong>{target?.revoked_at ? ' akan disembunyikan dari daftar. Riwayat audit tetap tersimpan; kunci tidak dapat dipakai kembali.' : ' akan langsung berhenti bekerja. Integrasi harus menggunakan kunci lain. Tindakan ini tidak dapat dibatalkan.'}</p>
          {error && <Failure error={error} />}
          <div className={styles.actions}><button type="button" className="button" autoFocus disabled={busy} onClick={() => { if (!pending.current) actionDialog.current?.close(); }}>Batal</button><button type="submit" className="button danger" disabled={busy}>{busy ? 'Memproses…' : target?.revoked_at ? 'Hapus dari daftar' : 'Ya, cabut kunci'}</button></div>
        </form>
      </dialog>
    </>
  );
}
