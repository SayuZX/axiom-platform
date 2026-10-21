'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, money } from '../../../../lib/api';
import { useUser } from '../../../../components/workspace';
import { Heading, Failure, Submit } from '../../../../components/ui';
import styles from './withdrawal.module.css';
type DestinationGroup = { label: string; kind: 'bank' | 'wallet'; names: string[] };
type Draft = {
  amount: number;
  bank_name: string;
  account_number: string;
  account_holder: string;
  request_id: string;
  expected_customer_id: string;
};
export default function NewWithdrawal() {
  const user = useUser();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>();
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [uncertain, setUncertain] = useState(false);
  const [groups, setGroups] = useState<DestinationGroup[]>([]);
  const [catalogError, setCatalogError] = useState<Error>();
  const [search, setSearch] = useState('');
  const [destination, setDestination] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [amount, setAmount] = useState('');
  const isWallet = groups.some((g) => g.kind === 'wallet' && g.names.includes(destination));
  const currentStep = draft ? 3 : step;
  useEffect(() => {
    let active = true;
    api<{ groups: DestinationGroup[] }>('/api/withdrawal-destinations')
      .then((r) => { if (active) setGroups(r.data.groups); })
      .catch((e: Error) => { if (active) setCatalogError(e); });
    return () => { active = false; };
  }, []);
  const storageKey = `axiom-withdrawal:${user.id}`;
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.expected_customer_id === user.id) {
          setDraft(d);
          setUncertain(true);
        }
      }
    } catch {}
  }, [storageKey, user.id]);
  return (
    <>
      <Heading title="Ajukan penarikan" description="Tentukan tujuan, masukkan nominal, lalu konfirmasi pengajuan Anda." />
      <ol className={styles.steps} aria-label="Tahap pengajuan penarikan">
        {['Tujuan transfer', 'Nominal penarikan', 'Periksa & konfirmasi'].map((label, index) => (
          <li key={label} aria-current={currentStep === index + 1 ? 'step' : undefined} data-complete={currentStep > index + 1}>
            <span>{index + 1}</span><strong>{label}</strong>
          </li>
        ))}
      </ol>
      <div className={styles.workspace}>
        <section className={`panel ${styles.formPanel}`} aria-label={`Langkah ${currentStep}`}>
          {error && <Failure error={error} />}
          {draft ? (
            <form method="post" className="stack" onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError(undefined);
              const password = new FormData(e.currentTarget).get('password');
              try {
                sessionStorage.setItem(storageKey, JSON.stringify(draft));
                const r = await api<{ withdrawal: { id: string } }>('/api/withdrawals', {
                  method: 'POST',
                  body: JSON.stringify({ ...draft, password }),
                });
                sessionStorage.removeItem(storageKey);
                router.push(`/dashboard/penarikan/${r.data.withdrawal.id}`);
              } catch (e) {
                setError(e as Error);
                setUncertain(true);
              } finally {
                setBusy(false);
              }
            }}>
              <div className={styles.sectionHeading}><h2>Periksa sebelum mengirim</h2><p>Pastikan tujuan dan nominal pada ringkasan sudah benar.</p></div>
              {uncertain && <p className="notice" role="status">Hasil pengajuan belum pasti. Pengiriman ulang memakai ID yang sama agar tidak menggandakan reservasi.</p>}
              <div className={styles.reviewAmount}><span>Nominal pengajuan</span><strong>{money(draft.amount)}</strong><span>Ke {draft.bank_name} · {draft.account_number}</span><span>{draft.account_holder}</span></div>
              <label className="checkbox"><input type="checkbox" required disabled={busy} />Saya memastikan rincian benar dan memahami transfer manual diperkirakan 1–2 hari kalender.</label>
              <label>Kata sandi untuk konfirmasi<input name="password" type="password" autoComplete="current-password" required disabled={busy} /></label>
              <div className={styles.actions}>
                {!uncertain && <button type="button" className="button" disabled={busy} onClick={() => { setDraft(undefined); setStep(2); setError(undefined); }}>Ubah nominal</button>}
                <Submit busy={busy}>Konfirmasi pengajuan</Submit>
              </div>
            </form>
          ) : step === 1 ? (
            <form method="post" className="stack" onSubmit={(e) => { e.preventDefault(); setError(undefined); setStep(2); }}>
              <div className={styles.sectionHeading}><h2>Ke mana dana dikirim?</h2><p>Gunakan rekening atau e-wallet yang dapat menerima transfer.</p></div>
              {catalogError && <Failure error={catalogError} />}
              <label>Cari bank atau e-wallet<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Contoh: BCA, syariah, DANA" aria-controls="withdrawal-destination" /></label>
              <label>Bank / e-wallet tujuan
                <select id="withdrawal-destination" name="bank_name" value={destination} onChange={(e) => {
                  const nextIsWallet = groups.some((g) => g.kind === 'wallet' && g.names.includes(e.target.value));
                  if (nextIsWallet !== isWallet) setAccountNumber('');
                  setDestination(e.target.value);
                }} required disabled={!groups.length} aria-describedby="destination-guidance">
                  <option value="">{groups.length ? 'Pilih tujuan penarikan' : 'Memuat daftar tujuan…'}</option>
                  {groups.map((group) => {
                    const query = search.trim().toLocaleLowerCase('id');
                    const names = group.names.filter((name) => name === destination || `${group.label} ${name}`.toLocaleLowerCase('id').includes(query));
                    return names.length > 0 && <optgroup key={group.label} label={group.label}>{names.map((name) => <option key={name} value={name}>{name}</option>)}</optgroup>;
                  })}
                </select>
              </label>
              <p id="destination-guidance" className={styles.guidance}>Daftar pilihan umum, bukan seluruh bank Indonesia. Jika tujuan tidak tersedia, hubungi bantuan; jangan memilih bank lain.</p>
              <label>{isWallet ? 'Nomor HP e-wallet' : 'Nomor rekening'}<input name="account_number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} inputMode="numeric" pattern={isWallet ? '(08[1-9][0-9]{7,10}|628[1-9][0-9]{7,10})' : '[0-9]{6,34}'} maxLength={isWallet ? 14 : 34} aria-describedby="account-guidance" required /></label>
              <p id="account-guidance" className={styles.guidance}>{isWallet ? 'Gunakan nomor HP terdaftar: 08 (10–13 digit) atau 628 (11–14 digit), tanpa spasi atau tanda +.' : 'Masukkan 6–34 digit nomor rekening, termasuk angka nol di awal; bukan nomor kartu atau virtual account.'}</p>
              <label>{isWallet ? 'Nama pemilik e-wallet' : 'Nama pemilik rekening'}<input name="account_holder" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} minLength={2} maxLength={120} required /></label>
              <div className={styles.actions}><button className="button primary" disabled={!destination || !groups.length}>Lanjut ke nominal</button></div>
            </form>
          ) : (
            <form method="post" className="stack" onSubmit={(e) => {
              e.preventDefault();
              setDraft({ amount: Number(amount), bank_name: destination, account_number: accountNumber, account_holder: accountHolder, request_id: crypto.randomUUID(), expected_customer_id: user.id });
            }}>
              <div className={styles.sectionHeading}><h2>Berapa yang ingin ditarik?</h2><p>Pengajuan menggunakan saldo neto tersedia. Saldo dan nominal akan divalidasi oleh server.</p></div>
              <label>Nominal penarikan (Rp)<input className={styles.amountInput} name="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={1} max={9007199254740991} step={1} required /></label>
              <p className={styles.guidance}>Masukkan Rupiah penuh, tanpa desimal.</p>
              <div className={styles.actions}><button type="button" className="button" onClick={() => setStep(1)}>Ubah tujuan</button><button className="button primary">Periksa pengajuan</button></div>
            </form>
          )}
        </section>
        <aside className={styles.summary} aria-label="Ringkasan pengajuan">
          <h2>Ringkasan pengajuan</h2>
          <dl>
            <div><dt>Bank / e-wallet</dt><dd>{draft?.bank_name || destination || 'Belum dipilih'}</dd></div>
            <div><dt>Nomor rekening / HP</dt><dd>{draft?.account_number || accountNumber || 'Belum diisi'}</dd></div>
            <div><dt>Nama pemilik</dt><dd>{draft?.account_holder || accountHolder || 'Belum diisi'}</dd></div>
            <div className={styles.summaryTotal}><dt>Nominal penarikan</dt><dd>{draft ? money(draft.amount) : amount ? money(Number(amount)) : 'Belum diisi'}</dd></div>
          </dl>
          <div className={styles.transferNote}><strong>Transfer manual · 1–2 hari kalender</strong><p>Administrator memproses pengajuan, bukan integrasi payout otomatis. Pantau perkembangannya di riwayat penarikan.</p></div>
          <Link href="/dashboard/penarikan">Lihat riwayat penarikan</Link>
        </aside>
      </div>
    </>
  );
}
