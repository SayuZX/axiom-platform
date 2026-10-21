'use client';
import { useState } from 'react';
import { api, useResource } from '../../../lib/api';
import { Heading, Failure, CircleLoading, Submit } from '../../../components/ui';
import { HugeiconsIcon } from '@hugeicons/react';
import { Shield01Icon } from '@hugeicons/core-free-icons';
import styles from './assistant.module.css';
type State = {
  configured: boolean;
  username: string;
  link: { user_id: string; blocked: number } | null;
  pending: { user_id: string; display_name: string } | null;
  preferences: {
    payments: number;
    withdrawals: number;
    support: number;
    security: number;
    telegram_enabled: number;
    digest: string;
    quiet_start: number | null;
    quiet_end: number | null;
  };
};
export default function Telegram() {
  const r = useResource<State>('/api/telegram');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  if (r.error) return <Failure error={r.error} retry={r.refresh} />;
  if (r.loading || !r.data) return <CircleLoading />;
  const d = r.data;
  return (
    <div className={styles.assistant}>
      <Heading
        title="Axiom Assistant"
        description="Hubungkan Telegram dan atur pemberitahuan akun Anda."
      />
      {error && <Failure error={error} />}{' '}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className={styles.layout}>
        <section className={`panel ${styles.connection}`}>
          <div className="panel-head">
            <h2><HugeiconsIcon icon={Shield01Icon} size={22} aria-hidden="true" /> Koneksi Telegram</h2>
            <button className="button" onClick={r.refresh}>
              Perbarui
            </button>
          </div>
          <div className="panel-body stack">
            <div className={styles.connectionStatus}>
              <span className={styles.statusIcon}><HugeiconsIcon icon={Shield01Icon} size={32} aria-hidden="true" /></span>
              <strong>{!d.configured ? 'Belum tersedia' : d.link?.blocked ? 'Perlu perhatian' : d.link ? 'Akun terhubung' : 'Belum terhubung'}</strong>
              <span>{d.configured ? `@${d.username}` : 'Konfigurasi bot belum tersedia.'}</span>
            </div>
            {!d.configured ? (
              <p className="notice">
                Bot belum dikonfigurasi pengelola. Tidak ada username bot yang diasumsikan tersedia.
              </p>
            ) : d.link ? (
              <>
                <p>
                  Telegram ID <strong>{d.link.user_id}</strong>
                </p>
                {d.link.blocked === 1 && (
                  <p className="notice">
                    Bot diblokir atau tidak dapat mengirim. Buka bot, lalu putuskan dan tautkan
                    kembali.
                  </p>
                )}
                <a
                  className="button primary"
                  href={`https://t.me/${d.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Buka bot
                </a>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !confirm(
                        'Putuskan tautan? Semua tombol dan percakapan tertunda dari tautan ini akan dibatalkan.',
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      await api('/api/telegram/link', { method: 'DELETE' });
                      r.refresh();
                    } catch (e) {
                      setError(e as Error);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Putuskan tautan
                </button>
              </>
            ) : (
              <>
                <ol>
                  <li>Buat tautan singkat di sini.</li>
                  <li>Buka bot dan tekan Mulai.</li>
                  <li>Kembali, cocokkan identitas, konfirmasi dengan kata sandi.</li>
                </ol>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await api<{ url: string }>('/api/telegram/link', {
                        method: 'POST',
                        body: '{}',
                      });
                      setUrl(result.data.url);
                      r.refresh();
                    } catch (e) {
                      setError(e as Error);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Buat tautan sekali pakai
                </button>
                {url && (
                  <a className="button" href={url} target="_blank" rel="noopener noreferrer">
                    Mulai penautan di Telegram
                  </a>
                )}
                <p className="hint">
                  Tautan berlaku 5 menit. Jangan teruskan ke orang lain. Akun belum terhubung sampai
                  Anda mengonfirmasi identitas di sini.
                </p>
                {d.pending?.user_id && (
                  <form
                    method="post"
                    className="stack"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      const f = new FormData(e.currentTarget);
                      try {
                        await api('/api/telegram/confirm', {
                          method: 'POST',
                          body: JSON.stringify({
                            user_id: d.pending!.user_id,
                            password: f.get('password'),
                          }),
                        });
                        setUrl('');
                        r.refresh();
                      } catch (e) {
                        setError(e as Error);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <p className="notice">
                      Identitas yang mengklaim: {d.pending.display_name}, ID {d.pending.user_id}.
                      Tolak jika bukan milik Anda.
                    </p>
                    <label className="checkbox">
                      <input type="checkbox" required />
                      Saya telah mencocokkan ID Telegram ini.
                    </label>
                    <label>
                      Kata sandi akun
                      <input
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <Submit busy={busy}>Konfirmasi tautan</Submit>
                  </form>
                )}
              </>
            )}
          </div>
        </section>
        <section className={`panel ${styles.preferences}`}>
          <div className="panel-head">
            <h2>Notifikasi & jadwal</h2>
          </div>
          <form
            method="post"
            className="panel-body stack"
            key={JSON.stringify(d.preferences)}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(undefined);
              const f = new FormData(e.currentTarget);
              const body: Record<string, unknown> = {
                digest: f.get('digest'),
                quiet_start: f.get('quiet_start') === '' ? null : Number(f.get('quiet_start')),
                quiet_end: f.get('quiet_end') === '' ? null : Number(f.get('quiet_end')),
              };
              for (const key of [
                'payments',
                'withdrawals',
                'support',
                'security',
                'telegram_enabled',
              ])
                body[key] = f.get(key) === 'on';
              try {
                await api('/api/telegram/preferences', {
                  method: 'POST',
                  body: JSON.stringify(body),
                });
                setNotice('Preferensi disimpan. Ini bukan persetujuan pemasaran.');
                r.refresh();
              } catch (e) {
                setError(e as Error);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className={styles.switches} disabled={busy}>
            <legend>Jenis pemberitahuan</legend>
            {[
              ['telegram_enabled', 'Notifikasi Telegram'],
              ['payments', 'Transaksi'],
              ['withdrawals', 'Penarikan'],
              ['support', 'Bantuan'],
              ['security', 'Keamanan akun'],
            ].map(([key, label]) => (
              <label className={styles.switchRow} key={key}>
                <input
                  type="checkbox"
                  role="switch"
                  name={key}
                  defaultChecked={d.preferences[key as keyof State['preferences']] === 1}
                />
                {label}
              </label>
            ))}
            </fieldset>
            <div className={styles.schedule}>
            <h3>Jadwal pengiriman</h3>
            <label>
              Ringkasan
              <select name="digest" defaultValue={d.preferences.digest}>
                <option value="off">Tidak aktif</option>
                <option value="daily">Harian</option>
                <option value="monthly">Bulanan</option>
              </select>
            </label>
            <div className="split equal">
              <label>
                Jam tenang mulai (WIB)
                <input
                  name="quiet_start"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={d.preferences.quiet_start ?? ''}
                />
              </label>
              <label>
                Jam tenang berakhir
                <input
                  name="quiet_end"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={d.preferences.quiet_end ?? ''}
                />
              </label>
            </div>
            <p className="hint">Kosongkan kedua jam untuk menonaktifkan jam tenang. Semua waktu menggunakan WIB.</p>
            </div>
            <Submit busy={busy}>Simpan preferensi</Submit>
            <p className="hint">
              Pemberitahuan keamanan mendesak tidak ditunda jam tenang. Pemasaran tidak diaktifkan
              oleh formulir ini.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
