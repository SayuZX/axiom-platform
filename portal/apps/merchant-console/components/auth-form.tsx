'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useResource } from '../lib/api';
import { Failure, Submit, CircleLoading } from './ui';
import { PublicHeader, PublicFooter } from './policy';
import styles from './auth-form.module.css';
export default function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const config = useResource<{ registration_available: boolean; tos_version: string | null }>(
    '/api/auth/config',
  );
  const [challenge, setChallenge] = useState<{ registration_id: string; email: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  return (
    <div className="public-page">
      <PublicHeader />
    <div className={styles.shell}>
      <aside className={styles.story} aria-labelledby="auth-story-title">
        <div>
          <h1 id="auth-story-title">Pembayaran masuk.<br />Usaha tetap berjalan.</h1>
          <p>Kelola pembayaran QRIS dari tagihan pertama hingga pengajuan penarikan.</p>
        </div>
        <ol className={styles.workflow}>
          <li><span aria-hidden="true">01</span><div><h2>Buat tagihan QRIS</h2><p>Siapkan invoice untuk pembayaran pelanggan.</p></div></li>
          <li><span aria-hidden="true">02</span><div><h2>Periksa pembayaran</h2><p>Pantau status tagihan dan riwayat transaksi di dashboard.</p></div></li>
          <li><span aria-hidden="true">03</span><div><h2>Ajukan penarikan</h2><p>Kirim pengajuan penarikan saldo untuk diproses secara manual.</p></div></li>
        </ol>
        <footer>Transaksi dan saldo hanya dapat diakses melalui akun Anda.</footer>
      </aside>
      <main className={styles.main}>
        <div className={styles.panel}>
          <h2>{challenge ? 'Verifikasi email' : register ? 'Buat akun Anda' : 'Selamat datang kembali'}</h2>
          <p>
            {challenge
              ? `Masukkan kode enam digit untuk ${challenge.email}.`
              : register
                ? 'Daftarkan akun untuk menggunakan layanan pembayaran.'
                : 'Masuk ke Axiom Payment untuk mengelola transaksi Anda.'}
          </p>
          {error && <Failure error={error} />}{' '}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {register && config.loading ? (
            <CircleLoading />
          ) : register && config.error ? (
            <Failure error={config.error} retry={config.refresh} />
          ) : register && !config.data?.registration_available ? (
            <div className="notice">
              Registrasi belum tersedia. Pengiriman email sedang diperiksa.
            </div>
          ) : (
            <form
              method="post"
              className="stack"
              aria-busy={busy}
              onSubmit={async (event) => {
                event.preventDefault();
                if (inFlight.current) return;
                const form = new FormData(event.currentTarget);
                inFlight.current = true;
                setBusy(true);
                setError(undefined);
                let navigating = false;
                try {
                  if (challenge) {
                    await api('/api/auth/verify', {
                      method: 'POST',
                      body: JSON.stringify({
                        registration_id: challenge.registration_id,
                        otp: form.get('otp'),
                      }),
                    });
                    navigating = true;
                    router.replace('/dashboard');
                  } else if (register) {
                    const r = await api<{ registration_id: string; email: string }>(
                      '/api/auth/register',
                      {
                        method: 'POST',
                        body: JSON.stringify({
                          username: form.get('username'),
                          email: form.get('email'),
                          password: form.get('password'),
                          tos_version: form.get('tos_version'),
                          accept_tos: form.get('accept_tos') === 'on',
                        }),
                      },
                    );
                    setChallenge(r.data);
                    setCooldown(60);
                    setNotice('Kode diajukan ke layanan email. Periksa inbox dan spam.');
                  } else {
                    await api('/api/auth/login', {
                      method: 'POST',
                      body: JSON.stringify({
                        username: form.get('username'),
                        password: form.get('password'),
                      }),
                    });
                    navigating = true;
                    router.replace('/dashboard');
                  }
                } catch (e) {
                  setError(e as Error);
                } finally {
                  if (!navigating) {
                    inFlight.current = false;
                    setBusy(false);
                  }
                }
              }}
            >
              <fieldset className={styles.fields} disabled={busy}>
              {challenge ? (
                <label>
                  Kode verifikasi
                  <input
                    name="otp"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                  />
                </label>
              ) : (
                <>
                  <label>
                    Nama pengguna
                    <input
                      name="username"
                      autoComplete="username"
                      pattern="[A-Za-z0-9_]{3,32}"
                      required
                    />
                  </label>
                  {register && (
                    <label>
                      Email
                      <input name="email" type="email" autoComplete="email" required />
                    </label>
                  )}
                  <div className={styles.passwordField}>
                    <label htmlFor="auth-password">Kata sandi</label>
                    <div className={styles.passwordControl}>
                      <input
                        id="auth-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={register ? 'new-password' : 'current-password'}
                        minLength={12}
                        maxLength={128}
                        required
                        aria-describedby={capsLock ? 'auth-caps-lock' : undefined}
                        onKeyDown={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                        onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                        onBlur={() => setCapsLock(false)}
                      />
                      <button
                        type="button"
                        className={styles.passwordToggle}
                        aria-controls="auth-password"
                        aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                        onClick={() => setShowPassword((shown) => !shown)}
                      >
                        {showPassword ? 'Sembunyikan' : 'Tampilkan'}
                      </button>
                    </div>
                    {capsLock && <p id="auth-caps-lock" className={styles.capsLock} role="status">Caps Lock aktif.</p>}
                  </div>
                  {register && (
                    <p className="hint">
                      12–128 karakter. Jangan gunakan kata sandi yang sama dengan layanan lain.
                    </p>
                  )}
                </>
              )}
              {register && !challenge && (
                <>
                  <input type="hidden" name="tos_version" value={config.data?.tos_version || ''} />
                  <label className="checkbox">
                    <input name="accept_tos" type="checkbox" required />
                    <span>
                      Saya menyetujui{' '}
                      <Link
                        href={`/terms-of-service?version=${encodeURIComponent(config.data?.tos_version || '')}`}
                        target="_blank"
                      >
                        Syarat Layanan
                      </Link>{' '}
                      versi {config.data?.tos_version}.
                    </span>
                  </label>
                  <p className="hint">
                    Baca <Link href="/privacy-policy">Kebijakan Privasi</Link>. Persetujuan ini
                    tidak mengaktifkan Telegram atau pemasaran.
                  </p>
                </>
              )}
              <Submit busy={busy}>
                {challenge ? 'Verifikasi dan masuk' : register ? 'Buat akun' : 'Masuk ke akun'}
              </Submit>
              </fieldset>
            </form>
          )}
          {challenge && (
            <button
              className="button"
              style={{ marginTop: 16 }}
              disabled={busy || cooldown > 0}
              onClick={async () => {
                if (inFlight.current || cooldown > 0) return;
                inFlight.current = true;
                setBusy(true);
                setError(undefined);
                try {
                  await api('/api/auth/resend', {
                    method: 'POST',
                    body: JSON.stringify({ registration_id: challenge.registration_id }),
                  });
                  setCooldown(60);
                  setNotice('Kode baru diajukan. Periksa inbox dan spam.');
                } catch (e) {
                  setError(e as Error);
                } finally {
                  inFlight.current = false;
                  setBusy(false);
                }
              }}
            >
              {cooldown ? `Kirim ulang dalam ${cooldown} detik` : 'Kirim ulang kode'}
            </button>
          )}
          <div className="auth-switch">
            {register ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
            <Link href={register ? '/login' : '/register'}>
              {register ? 'Masuk' : 'Daftar sekarang'}
            </Link>
          </div>
          <Link className="auth-back" href="/docs">
            Dokumentasi integrasi
          </Link>
        </div>
      </main>
    </div>
      <PublicFooter />
    </div>
  );
}
