import Link from 'next/link';
import CodeExample from '../../components/code-example';
import { PolicyFooter } from '../../components/policy';
import './docs.css';

export const metadata = { title: 'Dokumentasi API' };

const navigation = [
  [
    'Mulai integrasi',
    [
      ['autentikasi', 'Buat API key'],
      ['environment', 'Environment dan header'],
      ['quickstart', 'Pembayaran pertama'],
      ['respons', 'Baca respons'],
    ],
  ],
  [
    'Pembayaran',
    [
      ['invoice', 'Buat invoice'],
      ['status', 'Periksa status'],
      ['daftar', 'Daftar dan detail'],
      ['laporan', 'Riwayat dan laporan'],
      ['checkout', 'Checkout QRIS'],
      ['biaya', 'Biaya dan saldo'],
    ],
  ],
  [
    'Akun dan operasional',
    [
      ['sesi', 'Sesi, OTP, dan CSRF'],
      ['penarikan', 'Penarikan manual'],
      ['admin', 'Administrasi'],
      ['telegram', 'Axiom Assistant'],
      ['bantuan', 'Tiket bantuan'],
      ['kebijakan', 'Versi kebijakan'],
    ],
  ],
  [
    'Referensi',
    [
      ['endpoint', 'Seluruh endpoint'],
      ['errors', 'Error dan pemulihan'],
      ['limits', 'Batas dan waktu'],
      ['checklist', 'Checklist produksi'],
    ],
  ],
] as const;

const endpointGroups = [
  {
    title: 'Pembayaran pelanggan',
    rows: [
      ['POST', '/create-qris', 'API key atau sesi + password', 'Buat invoice provider-bound.'],
      [
        'GET / POST',
        '/check-payment',
        'API key atau sesi',
        'qris_id atau trx_id; POST sesi memerlukan CSRF.',
      ],
      ['GET', '/api/payments', 'API key atau sesi', 'status, search, limit, offset.'],
      ['GET', '/api/payments/:id', 'API key atau sesi', 'Detail invoice milik akun; data.payment.'],
      ['GET', '/api/overview', 'API key atau sesi', 'Bruto, komisi, neto, grafik tujuh hari WIB.'],
      ['GET', '/transactions', 'API key atau sesi', 'Transaksi PAID; default tiga hari terakhir.'],
      ['GET', '/transactions/all', 'API key atau sesi', 'Transaksi PAID; default awal bulan UTC.'],
      ['GET', '/api/reports', 'Sesi', 'CSV akun: period=daily|monthly, date=YYYY-MM-DD.'],
    ],
  },
  {
    title: 'Checkout publik',
    rows: [
      ['GET', '/qr/:id', 'Tautan acak', 'Halaman checkout; jaga kerahasiaan tautan.'],
      ['GET', '/qr/:id?format=raw', 'Tautan acak', 'PNG QR aktif; raw=1 juga didukung.'],
      ['GET', '/api/qr-image/:id', 'Tautan acak', 'PNG lokal; 410 bila QR tidak aktif.'],
      [
        'GET',
        '/api/qr-status/:id',
        'Tautan acak',
        'Status terverifikasi tanpa identitas pribadi akun.',
      ],
      [
        'GET',
        '/health, /api/health',
        'Publik',
        'Kesiapan proses, bukan jaminan provider atau email.',
      ],
    ],
  },
  {
    title: 'Identitas dan kunci',
    rows: [
      ['GET', '/api/auth/config', 'Publik', 'Ketersediaan registrasi, versi ToS aktif, masa OTP.'],
      [
        'POST',
        '/api/auth/register',
        'Origin + JSON + header',
        'username, email, password, accept_tos, tos_version.',
      ],
      [
        'POST',
        '/api/auth/verify',
        'Origin + JSON + header',
        'registration_id, otp; membuat sesi setelah sukses.',
      ],
      [
        'POST',
        '/api/auth/resend',
        'Origin + JSON + header',
        'registration_id; cooldown server berlaku.',
      ],
      ['POST', '/api/auth/login', 'Origin + JSON + header', 'username, password; cookie HttpOnly.'],
      [
        'POST',
        '/api/auth/logout',
        'Origin + JSON + header',
        'Mencabut sesi yang sedang digunakan.',
      ],
      ['GET', '/api/me', 'Sesi', 'id, username, email, role, created_at.'],
      ['GET / POST', '/api/keys', 'Sesi', 'GET: keys dan usage.active/limit. POST: name dan password; secret hanya sekali.'],
      ['DELETE', '/api/keys/:id', 'Sesi + CSRF', 'Pencabutan langsung berlaku.'],
      ['POST', '/api/keys/:id/remove', 'Sesi + CSRF', 'Hapus dari daftar hanya setelah dicabut; audit dipertahankan.'],
      ['POST', '/api/admin/customers/:id/api-key-limit', 'Admin + CSRF', 'Body limit: integer 0–100. Tidak mencabut kunci yang sudah aktif.'],
    ],
  },
  {
    title: 'Saldo dan penarikan',
    rows: [
      ['GET', '/api/wallet', 'Sesi', 'Saldo buku besar dan estimasi proses.'],
      [
        'GET / POST',
        '/api/withdrawals',
        'Sesi',
        'POST: password + rincian + request_id + expected_customer_id.',
      ],
      ['GET', '/api/withdrawals/:id', 'Sesi pemilik', 'Detail dan riwayat status.'],
      [
        'GET / POST',
        '/api/bank-account',
        'Sesi',
        'POST: rekening baru + password; verifikasi lama dibatalkan.',
      ],
      [
        'GET',
        '/api/actions/:id',
        'Sesi pemilik',
        'Draf sensitif dari Telegram, status dan kedaluwarsa.',
      ],
      [
        'POST',
        '/api/actions/:id/confirm',
        'Sesi + CSRF + password',
        'Konfirmasi draf yang sama; hasil tidak digandakan.',
      ],
    ],
  },
  {
    title: 'Telegram dan bantuan',
    rows: [
      ['GET', '/api/telegram', 'Sesi', 'Tautan, klaim tertunda, preferensi.'],
      [
        'POST / DELETE',
        '/api/telegram/link',
        'Sesi + CSRF',
        'Buat tautan sekali pakai atau putuskan generasi lama.',
      ],
      [
        'POST',
        '/api/telegram/confirm',
        'Sesi + CSRF + password',
        'Konfirmasi user_id yang diklaim lewat /start.',
      ],
      [
        'POST',
        '/api/telegram/preferences',
        'Sesi + CSRF',
        'Jenis notifikasi, aktivasi, digest dan jam tenang.',
      ],
      [
        'POST',
        '/api/telegram/webhook',
        'Secret webhook Telegram',
        'Update durable, deduplikasi update_id. Bukan API pelanggan.',
      ],
      [
        'GET / POST',
        '/api/support',
        'Sesi',
        'Daftar: search, status, offset, limit. Buat: subject, message, attachment dan request_id opsional.',
      ],
      [
        'GET',
        '/api/support/:id',
        'Sesi pemilik',
        'Riwayat terbaru: before, limit (1–100), has_more, last_read_message_id.',
      ],
      [
        'POST',
        '/api/support/:id/messages',
        'Sesi + CSRF',
        'Balas: message, reply_to_id, attachment, request_id UUID opsional.',
      ],
      [
        'POST',
        '/api/support/:id/read',
        'Sesi + CSRF',
        'Tandai sampai message_id terlihat; watermark hanya maju.',
      ],
      ['POST', '/api/support/:id/status', 'Sesi + CSRF', 'OPEN atau CLOSED.'],
      [
        'GET',
        '/api/support-attachments/:id',
        'Sesi berizin',
        'Unduh lampiran, bukan eksekusi/preview aktif.',
      ],
    ],
  },
  {
    title: 'Administrasi dan kebijakan',
    rows: [
      ['GET', '/api/admin/overview', 'Sesi admin', 'Ringkasan seluruh platform.'],
      ['GET', '/api/admin/customers', 'Sesi admin', 'Pencarian, limit dan offset.'],
      [
        'GET',
        '/api/admin/customers/:id',
        'Sesi admin',
        'Identitas, saldo, snapshot rekening; tanpa kredensial.',
      ],
      [
        'POST',
        '/api/admin/customers/:id/bank-account/verify',
        'Sesi admin + password',
        'revision harus sama dengan rekening yang diperiksa.',
      ],
      [
        'GET',
        '/api/admin/payments',
        'Sesi admin',
        'Filter status, search, customer_id, limit, offset.',
      ],
      ['GET', '/api/admin/withdrawals', 'Sesi admin', 'Filter status, customer_id, limit, offset.'],
      ['GET', '/api/admin/withdrawals/:id', 'Sesi admin', 'Tujuan transfer dan riwayat status.'],
      [
        'POST',
        '/api/admin/withdrawals/:id/status',
        'Sesi admin + password',
        'Transisi valid, bukti transfer atau alasan.',
      ],
      [
        'GET',
        '/api/admin/commissions',
        'Sesi admin',
        'Jumlah snapshot PAID, bukan tarif kini dikali jumlah invoice.',
      ],
      ['GET', '/api/admin/audit', 'Sesi admin', 'Audit penarikan, limit dan offset.'],
      [
        'GET',
        '/api/admin/operations',
        'Sesi admin',
        'Antrean kanal, tiket tertunda, audit kanal terbaru.',
      ],
      [
        'GET',
        '/api/admin/support, /api/admin/support/:id',
        'Sesi admin',
        'Daftar dan detail tiket lintas pelanggan.',
      ],
      [
        'POST',
        '/api/admin/support/:id/messages',
        'Sesi admin + CSRF',
        'message, reply_to_id, attachment, request_id UUID dan internal opsional.',
      ],
      [
        'POST',
        '/api/admin/support/:id/read',
        'Sesi admin + CSRF',
        'Tandai pesan terlihat; receipt pembacaan web, bukan penerimaan Telegram.',
      ],
      [
        'POST',
        '/api/admin/support/:id/status',
        'Sesi admin + CSRF',
        'Buka kembali atau tutup tiket.',
      ],
      [
        'GET',
        '/api/policies, /api/policies/:slug',
        'Publik',
        'Versi terbit/aktif; query version untuk arsip.',
      ],
      [
        'GET',
        '/api/admin/policies/:slug',
        'Sesi admin',
        'Draf internal; data belum lengkap tidak dipublikasikan.',
      ],
      ['POST', '/api/policies/consent', 'Sesi + CSRF', 'accept_tos=true, tos_version aktif.'],
      [
        'GET',
        '/api/config, /token-status, /api/logs',
        'Master key server',
        'Operasional server; bukan hak dashboard admin.',
      ],
    ],
  },
];

const exampleInvoice = {
  success: true,
  data: {
    qris_id: 'contoh-id-invoice-acak',
    trx_id: 'AXP-contoh-referensi',
    amount: 100000,
    fee_rate_bps: 200,
    fee_policy: 'percentage_200bps',
    fee_amount: 2000,
    net_amount: 98000,
    status: 'PENDING',
    created_at: '2026-10-10T03:00:00.000Z',
    expires_at: '2026-10-10T03:15:00.000Z',
    qr_url: 'https://portal.axiomcreative.xyz/qr/contoh-id-invoice-acak',
    qris_string: 'payload QRIS asli dari respons provider',
  },
};

export default function Docs() {
  return (
    <div className="api-docs">
      <header className="api-docs-header glass-chrome">
        <Link className="brand" href="/dashboard">
          <b>a.</b>
          <span>
            Axiom<small>Payment API</small>
          </span>
        </Link>
        <nav aria-label="Navigasi dokumentasi">
          <a href="#quickstart">Mulai</a>
          <a href="#endpoint">Referensi</a>
          <Link className="button" href="/dashboard">
            Buka konsol
          </Link>
        </nav>
      </header>
      <div className="api-docs-layout">
        <aside className="api-docs-nav">
          <p>Daftar isi</p>
          {navigation.map(([group, links]) => (
            <details key={group} open>
              <summary>{group}</summary>
              <nav aria-label={group}>
                {links.map(([id, title]) => (
                  <a key={id} href={`#${id}`}>
                    {title}
                  </a>
                ))}
              </nav>
            </details>
          ))}
        </aside>
        <main className="api-docs-content" id="main">
          <div className="api-docs-intro">
            <span className="section-marker" aria-hidden="true" />
            <p>Dokumentasi pengembang</p>
            <h1>Integrasi API Axiom Payment</h1>
            <p>
              Panduan autentikasi, pembuatan QRIS, pemeriksaan status, laporan transaksi, dan
              pengajuan penarikan. Endpoint web dan Telegram menggunakan aturan bisnis yang sama.
            </p>
          </div>
          <section id="autentikasi">
            <h2>Autentikasi: buat API key</h2>
            <p>
              Key pelanggan mengidentifikasi akun dan membatasi akses ke invoice miliknya. Master
              key server bukan pengganti key pelanggan.
            </p>
            <ol className="api-steps">
              <li>
                <strong>Masuk ke konsol</strong>
                <p>Gunakan akun dengan email terverifikasi, kemudian buka Kunci API.</p>
              </li>
              <li>
                <strong>Beri nama integrasi</strong>
                <p>Contoh: server-toko-produksi. Maksimal 60 karakter, tanpa karakter kontrol.</p>
              </li>
              <li>
                <strong>Konfirmasi dan salin</strong>
                <p>
                  Verifikasi password saat membuat key. Secret lengkap hanya ditampilkan sekali.
                </p>
              </li>
              <li>
                <strong>Simpan di server</strong>
                <p>
                  Gunakan environment atau pengelola secret. Jangan simpan pada frontend, URL, log,
                  tiket, atau Telegram.
                </p>
              </li>
            </ol>
            <div className="api-callout">
              <p>
                Key hilang tidak dapat ditampilkan kembali. Cabut, buat pengganti, lalu perbarui
                server Anda.
              </p>
              <Link href="/dashboard/kunci-api">Buka Kunci API</Link>
            </div>
          </section>
          <section id="environment">
            <h2>Environment dan header</h2>
            <p>
              Base URL produksi: <code>https://portal.axiomcreative.xyz</code>. Axiom menggunakan
              header <code>x-api-key</code>, bukan Bearer token. Jangan tambahkan prefix{' '}
              <code>/v1</code>.
            </p>
            <CodeExample
              title="macOS / Linux"
              code={`export AXIOM_BASE_URL="https://portal.axiomcreative.xyz"\nexport AXIOM_API_KEY="key-pelanggan-Anda"`}
            />
            <CodeExample
              title="Windows PowerShell"
              code={`$env:AXIOM_BASE_URL = "https://portal.axiomcreative.xyz"\n$env:AXIOM_API_KEY = "key-pelanggan-Anda"`}
            />
            <CodeExample
              title="Header HTTP"
              code={`x-api-key: <AXIOM_API_KEY>\nContent-Type: application/json`}
            />
            <p className="hint">
              Contoh key dan ID pada halaman ini bukan kredensial aktif. Gunakan nilai dari konsol
              dan respons API Anda.
            </p>
          </section>
          <section id="quickstart">
            <h2>Pembayaran pertama</h2>
            <p>
              Kirim nominal Rupiah bulat. Simpan <code>qris_id</code> dan <code>trx_id</code>,
              tampilkan checkout kepada pembeli, lalu periksa status ID yang sama.
            </p>
            <CodeExample
              title="cURL: buat invoice"
              code={`curl -X POST "$AXIOM_BASE_URL/create-qris" \\\n  -H "x-api-key: $AXIOM_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount":100000}'`}
            />
            <CodeExample
              title="PowerShell: buat invoice"
              code={`$request = @{\n  Method = 'Post'\n  Uri = "$env:AXIOM_BASE_URL/create-qris"\n  Headers = @{ 'x-api-key' = $env:AXIOM_API_KEY }\n  ContentType = 'application/json'\n  Body = (@{ amount = 100000 } | ConvertTo-Json)\n}\n$invoice = Invoke-RestMethod @request\n$invoice.data.qr_url`}
            />
            <CodeExample
              title="Node.js: create dan tangani hasil ambigu"
              code={`const response = await fetch(process.env.AXIOM_BASE_URL + '/create-qris', {\n  method: 'POST',\n  headers: {\n    'x-api-key': process.env.AXIOM_API_KEY,\n    'Content-Type': 'application/json',\n  },\n  body: JSON.stringify({ amount: 100000 }),\n});\nconst result = await response.json();\nif (!response.ok || !result.success) {\n  if (result.data?.qris_id) {\n    console.error('Periksa invoice yang sama:', result.data.qris_id);\n  }\n  throw new Error(result.message || 'Permintaan gagal');\n}\nconsole.log(result.data.qr_url);`}
            />
            <p className="hint">
              Simpan ID hasil create pada catatan order aplikasi Anda sebelum meminta pembayaran.
              API tidak menyediakan idempotency key untuk pembuatan invoice baru; setiap create baru
              dapat menghasilkan invoice berbeda.
            </p>
          </section>
          <section id="respons">
            <h2>Baca respons</h2>
            <p>
              Contoh berikut menggambarkan struktur respons, bukan QR yang dapat dibayar. Nilai masa
              berlaku dan QRIS selalu berasal dari provider.
            </p>
            <CodeExample
              title="JSON: invoice berhasil"
              code={JSON.stringify(exampleInvoice, null, 2)}
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Makna</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>success</code>
                    </td>
                    <td>Keberhasilan permintaan; periksa juga status HTTP.</td>
                  </tr>
                  <tr>
                    <td>
                      <code>data.qris_id</code>
                    </td>
                    <td>ID invoice acak. Dipakai pada detail, checkout, dan pemeriksaan.</td>
                  </tr>
                  <tr>
                    <td>
                      <code>data.trx_id</code>
                    </td>
                    <td>Identitas order provider, bukan pencocokan nominal saja.</td>
                  </tr>
                  <tr>
                    <td>
                      <code>amount / fee_amount / net_amount</code>
                    </td>
                    <td>Bruto, snapshot komisi, dan neto dalam integer Rupiah.</td>
                  </tr>
                  <tr>
                    <td>
                      <code>fee_policy / fee_rate_bps</code>
                    </td>
                    <td>
                      Invoice baru: percentage_200bps, 200 bps (2%). Snapshot historis tetap
                      berlaku; bps 0 pada fixed_2500 bukan komisi nol. Gunakan fee_amount tersimpan.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>qr_url / qris_string</code>
                    </td>
                    <td>
                      Tautan checkout dan payload QR provider. Raw payload hanya pada respons yang
                      memerlukannya.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>created_at / expires_at</code>
                    </td>
                    <td>ISO 8601 UTC. Tampilkan dalam zona waktu yang sesuai, misalnya WIB.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section id="invoice">
            <h2>Buat invoice</h2>
            <div className="api-endpoint">
              <span>POST</span>
              <code>/create-qris</code>
            </div>
            <p>
              <strong>Autentikasi:</strong> API key pelanggan. Sesi browser juga didukung, tetapi
              memerlukan password, origin yang sama, dan header CSRF.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Body</th>
                    <th>Tipe</th>
                    <th>Aturan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>amount</code>
                    </td>
                    <td>integer</td>
                    <td>
                      Wajib, Rp1–Rp10.000.000 dalam Rupiah bulat. String digit juga diterima demi
                      kompatibilitas; integer direkomendasikan.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>password</code>
                    </td>
                    <td>string</td>
                    <td>
                      Hanya wajib untuk autentikasi sesi browser. Jangan kirim pada integrasi server
                      ber-API key.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Komisi dihitung server. Field komisi yang dikirim pelanggan tidak mengubah tarif.
              Invoice disimpan dengan identitas order sebelum pemanggilan provider; reservasi lokal
              belum berarti QR berhasil dibuat.
            </p>
            <div className="api-callout">
              <p>
                Timeout setelah reservasi dapat mengembalikan <code>success:false</code> beserta{' '}
                <code>data.qris_id</code>. Simpan referensi dan periksa hasil yang sama. Jika
                koneksi putus tanpa respons, periksa daftar invoice sebelum membuat pengganti.
              </p>
            </div>
          </section>
          <section id="status">
            <h2>Periksa status pembayaran</h2>
            <div className="api-endpoint">
              <span>GET / POST</span>
              <code>/check-payment</code>
            </div>
            <p>
              Berikan salah satu <code>qris_id</code> atau <code>trx_id</code>. Field{' '}
              <code>amount</code> opsional memeriksa kesesuaian nominal, bukan mencari transaksi
              dengan nominal yang sama.
            </p>
            <CodeExample
              title="cURL: status invoice"
              code={`curl "$AXIOM_BASE_URL/check-payment?qris_id=$QRIS_ID" \\\n  -H "x-api-key: $AXIOM_API_KEY"`}
            />
            <CodeExample
              title="JSON: settlement terverifikasi"
              code={JSON.stringify(
                {
                  success: true,
                  paid: true,
                  status: 'PAID',
                  data: { ...exampleInvoice.data, status: 'PAID', qris_string: undefined },
                  transaction: {
                    transaction_id: 'referensi-provider',
                    order_id: 'AXP-contoh-referensi',
                    amount: 100000,
                    fee_amount: 2000,
                    net_amount: 98000,
                    payment_type: 'QRIS',
                    payer_issuer: 'QRIS',
                    transaction_time: null,
                    confirmed_at: '2026-10-10T03:05:00.000Z',
                  },
                },
                null,
                2,
              )}
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Arti</th>
                    <th>Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>PENDING</td>
                    <td>Belum ada konfirmasi pembayaran.</td>
                    <td>Tampilkan QR jika masih aktif; jangan kredit saldo.</td>
                  </tr>
                  <tr>
                    <td>PAID</td>
                    <td>Identitas, nominal, currency dan settlement provider tervalidasi.</td>
                    <td>Proses order Anda secara idempoten menggunakan ID invoice.</td>
                  </tr>
                  <tr>
                    <td>EXPIRED</td>
                    <td>QR melewati masa berlaku atau provider menandai terminal.</td>
                    <td>
                      Jangan menampilkan QR aktif. Konfirmasi settlement terlambat tetap diperiksa
                      berdasarkan bukti provider.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <code>transaction_time</code> dapat null jika tidak tersedia dari provider.{' '}
              <code>confirmed_at</code> adalah waktu portal mengonfirmasi, bukan waktu transfer
              bank. Jangan menganggap HTTP 502/503 atau <code>paid:false</code> pada respons gagal
              sebagai bukti belum dibayar.
            </p>
            <p>
              Pemeriksaan terjadwal dilakukan terpusat. Hindari polling rapat per pengguna; gunakan
              jeda dan hentikan setelah hasil final. Axiom belum menyediakan webhook pembayaran
              pelanggan.
            </p>
          </section>
          <section id="daftar">
            <h2>Daftar dan detail invoice</h2>
            <CodeExample
              title="cURL: filter dan pagination"
              code={`curl "$AXIOM_BASE_URL/api/payments?status=PAID&limit=20&offset=0" \\\n  -H "x-api-key: $AXIOM_API_KEY"`}
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Nilai</th>
                    <th>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>status</td>
                    <td>all, PENDING, PAID, EXPIRED</td>
                    <td>Default all.</td>
                  </tr>
                  <tr>
                    <td>search</td>
                    <td>string, maksimal 120 karakter</td>
                    <td>
                      Cari ID atau referensi. Karakter persen/underscore diperlakukan literal.
                    </td>
                  </tr>
                  <tr>
                    <td>limit</td>
                    <td>1–100</td>
                    <td>Default 25.</td>
                  </tr>
                  <tr>
                    <td>offset</td>
                    <td>0–100.000.000</td>
                    <td>Default 0. Urutan created_at terbaru, lalu ID.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <CodeExample
              title="JSON: halaman invoice"
              code={JSON.stringify(
                {
                  success: true,
                  data: {
                    payments: [
                      {
                        qris_id: 'contoh-id-invoice-acak',
                        trx_id: 'AXP-contoh-referensi',
                        amount: 100000,
                        fee_amount: 2000,
                        net_amount: 98000,
                        status: 'PAID',
                      },
                    ],
                    total: 1,
                    limit: 20,
                    offset: 0,
                  },
                },
                null,
                2,
              )}
            />
            <p>
              Setiap elemen memuat field invoice lengkap seperti{' '}
              <a href="#respons">referensi respons</a>. Contoh daftar di atas disingkat.{' '}
              <code>GET /api/payments/:id</code> mengembalikan <code>data.payment</code>, termasuk
              payload QR. ID akun lain ditolak 404.
            </p>
            <p>
              <code>GET /api/overview</code> mengembalikan <code>data.totals</code>,{' '}
              <code>data.charts</code>, <code>data.wallet</code>, kesiapan merchant dan username.
              Grafik tujuh hari memakai tanggal pembuatan invoice dalam WIB, bukan tanggal
              settlement.
            </p>
          </section>
          <section id="laporan">
            <h2>Riwayat transaksi dan laporan</h2>
            <div className="api-endpoint">
              <span>GET</span>
              <code>/transactions</code>
            </div>
            <p>
              Hanya invoice PAID. Query <code>startTime</code> dan <code>endTime</code> memakai Unix
              timestamp dalam detik. Rentang maksimal 31 hari; <code>pageSize</code> 1–100,{' '}
              <code>from</code> adalah offset mulai 0.
            </p>
            <CodeExample
              title="cURL: transaksi terbayar"
              code={`curl "$AXIOM_BASE_URL/transactions?pageSize=20&from=0" \\\n  -H "x-api-key: $AXIOM_API_KEY"`}
            />
            <CodeExample
              title="JSON: total halaman transaksi"
              code={JSON.stringify(
                {
                  success: true,
                  total: 1,
                  from: 0,
                  page_size: 20,
                  total_amount: '100000',
                  total_fee_amount: '2000',
                  total_net_amount: '98000',
                  data: {
                    transactions: [
                      {
                        qris_id: 'contoh-id-invoice-acak',
                        trx_id: 'AXP-contoh-referensi',
                        amount: 100000,
                        fee_amount: 2000,
                        net_amount: 98000,
                        status: 'settlement',
                        time: null,
                        issuer: 'QRIS',
                        order_id: 'AXP-contoh-referensi',
                        transaction_id: 'referensi-provider',
                      },
                    ],
                  },
                },
                null,
                2,
              )}
            />
            <p>
              <code>total</code> menghitung seluruh hasil sesuai filter. <code>total_amount</code>,{' '}
              <code>total_fee_amount</code> dan <code>total_net_amount</code> berupa string jumlah{' '}
              <strong>halaman yang dikembalikan</strong>, bukan saldo akun.
            </p>
            <p>
              Unduh CSV dari sesi web melalui{' '}
              <code>/api/reports?period=daily&amp;date=2026-10-10</code> atau{' '}
              <code>period=monthly</code>. Laporan memakai batas hari/bulan WIB dan hanya data akun
              sendiri. Endpoint CSV tidak menerima API key sebagai pengganti sesi.
            </p>
          </section>
          <section id="checkout">
            <h2>Checkout dan gambar QRIS</h2>
            <p>
              Gunakan <code>data.qr_url</code> untuk membagikan halaman pembayaran. ID acak pada URL
              memberi akses terbatas ke invoice; jangan memublikasikan daftar tautan pelanggan.
            </p>
            <ul>
              <li>
                <code>/qr/:id</code>: halaman checkout publik.
              </li>
              <li>
                <code>/qr/:id?format=raw</code> atau <code>/api/qr-image/:id</code>: gambar PNG QRIS
                lokal.
              </li>
              <li>
                <code>/api/qr-status/:id</code>: hanya ID invoice, referensi, total pembayaran,
                status, dan masa berlaku. Tidak menyertakan komisi, neto, identitas pemilik, atau
                rincian transaksi penyedia, termasuk saat lunas atau terjadi kesalahan.
              </li>
            </ul>
            <p>
              PNG hanya tersedia selama invoice PENDING dan belum kedaluwarsa. Respons 410 berarti
              QR tidak aktif; 503 berarti payload belum tersedia. Jangan membuat QR pengganti dari
              nominal atau screenshot.
            </p>
          </section>
          <section id="biaya">
            <h2>Komisi, neto dan saldo</h2>
            <p>
              Invoice baru memakai komisi <strong>2%</strong>, dibulatkan ke bawah ke Rupiah penuh
              tanpa minimum biaya: <code>fee_amount = floor(amount * 200 / 10000)</code>. Pembeli
              membayar bruto; komisi dipotong dari hasil pembayaran, bukan ditambahkan. Contoh
              Rp100.000 mencatat komisi Rp2.000 dan neto Rp98.000. Nominal invoice Rp1–Rp10.000.000
              dalam Rupiah bulat; Rp1 mencatat komisi Rp0 dan neto Rp1. Tarif dan nominal komisi
              dibekukan saat invoice dibuat. Pending dan expired tidak menambah pendapatan diakui.
            </p>
            <CodeExample
              title="Rumus saldo penarikan"
              code={`net_amount = amount - fee_amount\nreserved_amount = requested_amount + processing_amount\navailable_amount = earned_amount - reserved_amount - paid_out_amount`}
            />
            <p>
              <code>earned_amount</code> adalah neto invoice PAID. Snapshot historis tidak berubah:
              invoice lama dapat memakai komisi tetap Rp2.500 (fixed_2500), nol, atau persentase
              lain. Tidak dihitung ulang, termasuk bila dibayar setelah perubahan tarif. Nilai{' '}
              <code>fee_amount</code> dari server tetap menjadi dasar perhitungan.
            </p>
            <p>
              Biaya provider/MDR terpisah dan tidak direkayasa sebagai potongan tambahan. Saldo buku
              besar bukan pembacaan rekening bank provider. Lihat{' '}
              <Link href="/fee-policy">Kebijakan Biaya</Link>.
            </p>
          </section>
          <section id="sesi">
            <h2>Sesi, OTP dan keamanan browser</h2>
            <p>
              Dashboard menggunakan cookie <code>axiom_session</code>: HttpOnly, SameSite=Lax,
              Secure pada HTTPS, berlaku tujuh hari. Semua perubahan berbasis sesi memerlukan origin
              yang sama, JSON, dan <code>X-Axiom-Request: 1</code>.
            </p>
            <CodeExample
              title="Fetch same-origin dari halaman aplikasi"
              code={`const response = await fetch('/api/keys', {\n  method: 'POST',\n  credentials: 'same-origin',\n  headers: {\n    'Content-Type': 'application/json',\n    'X-Axiom-Request': '1',\n  },\n  body: JSON.stringify({ name: 'server-toko', password: passwordFromForm }),\n});\nconst result = await response.json();\nif (!response.ok) throw new Error(result.message);\n// Simpan result.data.secret sekali. Jangan catat secret ke log.`}
            />
            <p>
              Browser mengirim header Origin; JavaScript tidak perlu memalsukannya. Jangan
              menggunakan cookie sesi pelanggan untuk integrasi backend otomatis—gunakan API key
              untuk endpoint yang mendukungnya.
            </p>
            <ul>
              <li>Username: 3–32 huruf, angka, underscore; case-insensitive.</li>
              <li>Password: 12–128 karakter, maksimal 512 byte.</li>
              <li>OTP: enam digit, berlaku 10 menit, maksimal lima percobaan, sekali pakai.</li>
              <li>
                Resend: minimal 60 detik. Kegagalan pengiriman kode baru tidak mengganti kode lama
                yang masih berlaku.
              </li>
              <li>
                Registrasi memerlukan <code>accept_tos:true</code> dan <code>tos_version</code>{' '}
                aktif dari <code>/api/auth/config</code>.
              </li>
              <li>
                SMTP accepted bukan bukti inbox menerima email. Periksa spam; gunakan bantuan jika
                email tetap tidak masuk.
              </li>
            </ul>
            <p>
              API key invalid tidak otomatis beralih menggunakan sesi yang kebetulan tersedia. Key
              hanya disimpan sebagai hash, secret ditampilkan sekali. Batas awal 10 key aktif per
              akun; administrator dapat mengatur 0–100. Batas 0 memblokir pembuatan baru. Kunci
              dicabut tidak dihitung; menurunkan batas tidak mencabut kunci yang sudah aktif.
            </p>
          </section>
          <section id="penarikan">
            <h2>Pengajuan penarikan manual</h2>
            <div className="api-endpoint">
              <span>POST</span>
              <code>/api/withdrawals</code>
            </div>
            <p>
              Endpoint ini memerlukan sesi pelanggan, CSRF dan password. Tidak menerima API key.
              Simpan satu <code>request_id</code> untuk satu pengajuan; ulangi ID dan rincian sama
              jika respons terputus.
            </p>
            <CodeExample
              title="Body pengajuan penarikan"
              code={JSON.stringify(
                {
                  amount: 100000,
                  bank_name: 'Nama bank tujuan',
                  account_number: '001234567890',
                  account_holder: 'Nama pemilik rekening',
                  request_id: 'id-acak-pengajuan-unik',
                  expected_customer_id: 'id-akun-dari-api-me',
                  password: 'diisi-dari-form-aman',
                },
                null,
                2,
              )}
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Aturan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>amount</td>
                    <td>
                      Integer positif, maksimal saldo tersedia dan batas integer aman
                      9.007.199.254.740.991.
                    </td>
                  </tr>
                  <tr>
                    <td>bank_name / account_holder</td>
                    <td>2–80 / 2–120 karakter; karakter kontrol ditolak.</td>
                  </tr>
                  <tr>
                    <td>account_number</td>
                    <td>String 6–34 digit. Nol awal dipertahankan.</td>
                  </tr>
                  <tr>
                    <td>request_id</td>
                    <td>16–100 karakter huruf/angka/underscore/tanda hubung; unik per akun.</td>
                  </tr>
                  <tr>
                    <td>expected_customer_id</td>
                    <td>
                      ID akun yang sedang ditampilkan; mencegah pengajuan dari tab yang berganti
                      akun.
                    </td>
                  </tr>
                  <tr>
                    <td>password</td>
                    <td>Verifikasi tambahan. Jangan simpan bersama draft atau kirim ke bot.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              HTTP 201 berarti pengajuan baru; HTTP 200 dapat berarti replay identik. Payload
              berbeda dengan request_id sama ditolak 409. Respons memuat{' '}
              <code>data.withdrawal</code> dan <code>data.wallet</code>.
            </p>
            <ul>
              <li>REQUESTED: saldo dicadangkan.</li>
              <li>PROCESSING: sedang diproses, belum bukti dana terkirim.</li>
              <li>
                PAID: transfer manual dicatat setelah benar-benar berhasil, referensi unik wajib.
              </li>
              <li>REJECTED: alasan wajib; reservasi dilepas tepat sekali.</li>
            </ul>
            <p>
              Estimasi 1–2 hari kalender, bukan transfer otomatis atau jaminan pencairan.{' '}
              <Link href="/withdrawal-policy">Ketentuan penarikan</Link> menjelaskan pemeriksaan dan
              keberatan.
            </p>
          </section>
          <section id="admin">
            <h2>Administrasi</h2>
            <p>
              Seluruh <code>/api/admin/*</code> memerlukan sesi akun ber-role admin. Customer API
              key dan master key server tidak memberikan akses dashboard admin. Role diperiksa ulang
              oleh server.
            </p>
            <CodeExample
              title="Body perubahan status penarikan"
              code={JSON.stringify(
                {
                  status: 'PAID',
                  transfer_reference: 'referensi-transfer-nyata-unik',
                  confirm_transferred: true,
                  password: 'diisi-dari-form-admin',
                },
                null,
                2,
              )}
            />
            <p>
              REQUESTED dapat menjadi PROCESSING atau REJECTED. Hanya PROCESSING dapat menjadi PAID.
              Penolakan memerlukan <code>rejection_reason</code> 5–500 karakter. PAID memerlukan
              referensi 5–120 karakter yang belum digunakan dan{' '}
              <code>confirm_transferred:true</code>. Gambar transfer bukan konfirmasi bank otomatis.
            </p>
            <p>
              Verifikasi rekening memakai <code>revision</code> yang sama dengan detail yang
              ditinjau. Jika pelanggan mengganti rekening, approval lama ditolak 409. Tidak tersedia
              endpoint edit saldo bebas, pemberian role, atau penghapusan ledger.
            </p>
          </section>
          <section id="telegram">
            <h2>Axiom Assistant di Telegram</h2>
            <p>
              Bot adalah kanal dari sistem yang sama, bukan database atau saldo terpisah. Mulai
              penautan melalui <Link href="/dashboard/telegram">halaman Telegram</Link>, buka tautan
              sekali pakai, tekan Mulai, lalu cocokkan Telegram ID dan konfirmasi kembali di web.
            </p>
            <ol className="api-steps">
              <li>
                <strong>Token web sekali pakai</strong>
                <p>
                  Berlaku lima menit dan hanya hash yang disimpan. Username/email yang diketik dalam
                  chat tidak cukup untuk menautkan akun.
                </p>
              </li>
              <li>
                <strong>Konfirmasi identitas</strong>
                <p>
                  Private user ID dan chat ID harus cocok. Tautan tidak aktif sebelum konfirmasi web
                  dengan password.
                </p>
              </li>
              <li>
                <strong>Gunakan menu</strong>
                <p>
                  Saldo, invoice, transaksi, penarikan, rekap, API key tersamarkan, notifikasi,
                  bantuan, kebijakan dan akun.
                </p>
              </li>
              <li>
                <strong>Otorisasi tindakan sensitif</strong>
                <p>
                  Invoice/penarikan disusun di bot; konfirmasi akhir pada halaman web aman. Rekening
                  Telegram harus terverifikasi.
                </p>
              </li>
            </ol>
            <p>
              Menu admin memerlukan akun admin yang sudah ditautkan dan Telegram ID pada allowlist.
              Allowlist tidak memberikan role. Callback terikat pada aktor, generasi tautan,
              tindakan, resource dan draft yang ditinjau.
            </p>
            <p>
              Webhook produksi memakai HTTPS dan <code>X-Telegram-Bot-Api-Secret-Token</code>.
              Update disimpan sebelum respons sukses, dideduplikasi berdasarkan update_id, lalu
              dikerjakan worker. Mode long polling hanya untuk pengembangan dan tidak boleh berjalan
              bersamaan dengan webhook.
            </p>
            <p>
              Notifikasi email dan Telegram memiliki status delivery terpisah. Jam tenang mengikuti
              WIB; ringkasan dapat harian/bulanan. Pemutusan tautan membatalkan tombol, percakapan
              dan pengiriman generasi lama. Pesan diterima API Telegram tidak berarti sudah dibaca.
            </p>
          </section>
          <section id="bantuan">
            <h2>Tiket bantuan dan lampiran</h2>
            <p>
              Web dan Telegram memakai tiket yang sama. Balasan operator dipetakan dengan ticket ID,
              chat ID dan message ID, bukan pelanggan terakhir yang mengirim pesan.
            </p>
            <CodeExample
              title="Body tiket baru"
              code={JSON.stringify(
                {
                  subject: 'Pemeriksaan status pembayaran',
                  message:
                    'Mohon periksa invoice dengan referensi yang tercantum. Pembayaran belum terlihat pada status.',
                },
                null,
                2,
              )}
            />
            <p>
              Status tiket: OPEN, WAITING_ADMIN, WAITING_CUSTOMER dan CLOSED. Untuk membalas tiket
              tertutup, buka kembali dengan <code>status:OPEN</code>. Catatan{' '}
              <code>internal:true</code> hanya untuk admin dan tidak diteruskan ke pelanggan.
            </p>
            <p>
              Daftar percakapan mendukung <code>search</code>, <code>status</code>,
              <code>offset</code> dan <code>limit</code>; pencarian, pratinjau dan jumlah belum
              dibaca mengikuti hak akses. Detail mengambil 50 pesan terbaru, berurutan dari lama ke
              baru. Gunakan <code>before</code> dengan ID pesan pertama untuk halaman sebelumnya.
              Balasan dapat menyertakan <code>reply_to_id</code> dari tiket yang sama. Catatan
              internal tidak dapat dikutip pada pesan publik.
            </p>
            <p>
              <code>request_id</code> UUID mencegah pesan ganda saat pengiriman diulang. Gunakan ID
              yang sama hanya untuk payload yang sama; payload berbeda mendapat HTTP 409. Status
              tersimpan bukan bukti dibaca. Setelah pesan terlihat, kirim
              <code>{' {message_id: ID} '}</code> ke <code>/api/support/:id/read</code>; untuk admin
              gunakan <code>/api/admin/support/:id/read</code>. Membuka API detail atau menerima
              notifikasi Telegram tidak menandai pesan dibaca.
            </p>
            <p>
              Lampiran opsional memakai <code>{'{name,type,data}'}</code>; data berupa Base64
              PNG/JPEG/PDF maksimal 2 MiB setelah decode. Server memeriksa signature file dan
              mengirim sebagai download. Jangan kirim password, OTP, API secret atau nomor rekening
              lengkap. Screenshot tidak menetapkan pembayaran PAID.
            </p>
            <p>
              Di luar jam layanan, pesan masuk antrean. Balasan otomatis diberi label dan tidak
              menyatakan pengelola sedang membaca.
            </p>
          </section>
          <section id="kebijakan">
            <h2>Versi kebijakan dan persetujuan</h2>
            <p>
              <code>GET /api/policies</code> memuat ketersediaan, versi aktif dan versi yang
              diumumkan. <code>GET /api/policies/:slug?version=...</code> mengambil arsip immutable.
              Persetujuan menyimpan akun, versi, waktu dan kanal.
            </p>
            <p>
              Persetujuan ToS, aktivasi notifikasi Telegram dan pemasaran dipisahkan. Dokumen belum
              lengkap tidak diterbitkan sebagai fakta. Akun lama tetap dapat masuk, menyelesaikan
              kewajiban dan mengajukan pengaduan saat kebijakan baru belum aktif.
            </p>
            <PolicyFooter />
          </section>
          <section id="endpoint">
            <h2>Referensi seluruh endpoint</h2>
            <p>
              Endpoint bertanda sesi bukan API server ber-key. Semua mutation sesi memakai
              same-origin, JSON dan header CSRF. Jalur admin memerlukan role admin; password
              tambahan disebutkan pada tiap tindakan sensitif.
            </p>
            {endpointGroups.map((group) => (
              <div className="api-reference-group" key={group.title}>
                <h3>{group.title}</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Metode</th>
                        <th>Path</th>
                        <th>Akses</th>
                        <th>Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map(([method, route, auth, description]) => (
                        <tr key={route}>
                          <td>
                            <span className="api-method">{method}</span>
                          </td>
                          <td>
                            <code>{route}</code>
                          </td>
                          <td>{auth}</td>
                          <td>{description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
          <section id="errors">
            <h2>Error dan pemulihan</h2>
            <CodeExample
              title="JSON: contoh error saldo"
              code={JSON.stringify(
                {
                  success: false,
                  message: 'Saldo tersedia tidak mencukupi.',
                  code: 'insufficient_balance',
                },
                null,
                2,
              )}
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>HTTP</th>
                    <th>Makna</th>
                    <th>Penanganan</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      '400',
                      'Input tidak valid',
                      'Perbaiki tipe, nominal, field wajib, versi ToS atau parameter.',
                    ],
                    [
                      '401',
                      'Autentikasi/step-up tidak valid',
                      'Periksa key, sesi atau password. Jangan ulangi tanpa batas.',
                    ],
                    [
                      '403',
                      'Akses, role, origin atau secret webhook ditolak',
                      'Gunakan kanal dan izin yang benar; jangan melewati kontrol.',
                    ],
                    [
                      '404',
                      'Resource tidak ditemukan atau bukan milik akun',
                      'Periksa ID dan akun; jangan mencoba ID pelanggan lain.',
                    ],
                    [
                      '409',
                      'Konflik status, replay, saldo atau identitas akun',
                      'Baca code, perbarui data dan pertahankan request_id untuk retry identik.',
                    ],
                    ['410', 'QRIS tidak aktif', 'Hentikan tampilan QR; periksa status invoice.'],
                    ['413', 'Request terlalu besar', 'Kurangi body atau lampiran sesuai batas.'],
                    ['429', 'Batas permintaan', 'Tunggu cooldown; jangan retry rapat.'],
                    [
                      '500',
                      'Gangguan internal',
                      'Simpan referensi, hubungi pengelola; jangan asumsi perubahan uang gagal.',
                    ],
                    [
                      '502',
                      'Data provider tidak cocok/terverifikasi',
                      'Jangan mengkredit order; periksa lagi atau ajukan tiket.',
                    ],
                    [
                      '503',
                      'Provider/email/konfigurasi belum tersedia',
                      'Tunda dan periksa referensi yang sama sebelum mutation baru.',
                    ],
                  ].map(([status, meaning, action]) => (
                    <tr key={status}>
                      <td>{status}</td>
                      <td>{meaning}</td>
                      <td>{action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              <code>account_changed</code> berarti sesi berbeda dari akun pada formulir; muat ulang.{' '}
              <code>insufficient_balance</code> berarti reservasi baru tidak dibuat. Jangan mengubah
              request_id hanya untuk menghindari konflik payload.
            </p>
          </section>
          <section id="limits">
            <h2>Batas, waktu dan pengulangan</h2>
            <ul>
              <li>
                Body JSON umum maksimal 16 KiB; webhook Telegram 256 KiB; body tiket dengan Base64
                maksimal 2.810.000 byte.
              </li>
              <li>Invoice baru Rp1–Rp10.000.000; seluruh nominal disimpan sebagai integer.</li>
              <li>Pagination maksimal 100 item. Halaman dashboard umumnya memakai 20 item.</li>
              <li>
                Login dibatasi 30 percobaan/IP dan 10/username per 15 menit. Verifikasi OTP maksimal
                lima percobaan per challenge.
              </li>
              <li>Pengiriman OTP maksimal lima per email/IP per jam; cooldown email 60 detik.</li>
              <li>
                Verifikasi password tindakan sensitif dibatasi 10 percobaan per akun per 15 menit.
              </li>
              <li>
                Sesi tujuh hari; OTP 10 menit; tautan Telegram lima menit; callback 10 menit;
                percakapan 30 menit; draft finansial 15 menit.
              </li>
              <li>
                Retry pengiriman kanal terbatas dengan jeda. Telegram 429 mengikuti retry_after.
                Pengiriman pesan tidak dijamin exactly-once; perubahan finansial wajib idempoten.
              </li>
            </ul>
            <p>
              Timestamp API umumnya ISO 8601 UTC; query riwayat transaksi menggunakan Unix detik.
              Laporan dan grafik berlabel WIB menggunakan Asia/Jakarta. Jangan mencampur waktu
              pembuatan, konfirmasi portal dan settlement provider.
            </p>
          </section>
          <section id="checklist">
            <h2>Checklist sebelum produksi</h2>
            <ol className="api-steps">
              <li>
                <strong>Amankan kredensial</strong>
                <p>
                  Simpan API key pada server. Pisahkan key tiap lingkungan; cabut key yang bocor.
                </p>
              </li>
              <li>
                <strong>Uji respons dan kegagalan</strong>
                <p>
                  Uji provider gagal, timeout, status tidak cocok, key dicabut, dan akses lintas
                  akun tanpa transaksi uang nyata otomatis.
                </p>
              </li>
              <li>
                <strong>Proses order sekali</strong>
                <p>
                  Simpan qris_id pada order Anda dan pastikan konfirmasi berulang tidak menggandakan
                  pemenuhan barang/jasa.
                </p>
              </li>
              <li>
                <strong>Periksa snapshot biaya</strong>
                <p>
                  Gunakan amount, fee_amount, net_amount dari invoice, bukan tarif yang dihitung
                  ulang di frontend.
                </p>
              </li>
              <li>
                <strong>Siapkan operasional</strong>
                <p>
                  Gunakan HTTPS, origin privat, backup konsisten, antrean persisten dan pengaduan
                  yang dapat ditelusuri. Status delivery bukan bukti pesan dibaca.
                </p>
              </li>
            </ol>
            <div className="api-callout">
              <p>
                Axiom tidak menyediakan transfer bank otomatis, callback pembayaran pelanggan, atau
                klaim izin regulator melalui API. Kemampuan produksi mengikuti konfigurasi, kontrak
                provider dan peninjauan hukum yang benar-benar tersedia.
              </p>
            </div>
          </section>
        </main>
      </div>
      <footer className="api-docs-footer glass-chrome">
        <span>Axiom Payment API</span>
        <Link href="/dashboard/bantuan">Bantuan integrasi</Link>
        <PolicyFooter />
      </footer>
    </div>
  );
}
