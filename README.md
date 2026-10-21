<h1 align="center">AXIOM CREATIVE</h1>

<p align="center"><strong>Satu ekosistem untuk akses AI, dashboard pelanggan, dan pembayaran.</strong></p>

<p align="center">
  <a href="https://axiomcreative.xyz">Website</a> ·
  <a href="https://ai.axiomcreative.xyz">AXIOM AI</a> ·
  <a href="https://portal.axiomcreative.xyz">Portal pembayaran</a> ·
  <a href="https://ai.axiomcreative.xyz/docs">Dokumentasi API</a>
</p>

<p align="center"><code>OpenAI-compatible API</code> · <code>Next.js</code> · <code>Node.js</code> · <code>Ruby</code> · <code>Windows services</code></p>

AXIOM menghubungkan katalog model AI, kunci API pelanggan, kuota penggunaan, serta portal pembayaran. Dokumen ini menjadi pusat dokumentasi aplikasi yang berjalan di `C:\Sites\axiom`.

> [!IMPORTANT]
> Ini dokumentasi deployment yang sudah ada, bukan installer publik. Jangan menyalin database, secret, atau konfigurasi produksi ke repository publik. Contoh API memakai variabel lingkungan, bukan kunci asli.

## Mulai menggunakan API

1. Masuk ke [dashboard pelanggan](https://ai.axiomcreative.xyz/account) dan siapkan kunci API aktif.
2. Pilih model dari [katalog](https://ai.axiomcreative.xyz/pricing). Gunakan ID API lengkap; prefix `ax/` hanya disembunyikan pada label beranda.
3. Atur base URL dan kunci API di aplikasi kompatibel OpenAI.

```text
Base URL  https://ai.axiomcreative.xyz/v1
API key   AXIOM_API_KEY dari lingkungan Anda
Model     ID lengkap dari katalog, misalnya ax/muse-spark-1.2
```

### Contoh request

```bash
curl https://ai.axiomcreative.xyz/v1/chat/completions \
  -H "Authorization: Bearer $AXIOM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ax/muse-spark-1.2",
    "messages": [{"role": "user", "content": "Halo!"}],
    "stream": false
  }'
```

Ketersediaan model mengikuti provider, izin kunci, kuota, dan konfigurasi tarif. Contoh bukan jaminan kapasitas atau uptime.

## Di dalam AXIOM

### Akses model melalui satu endpoint

Katalog menampilkan model terhubung, kemampuan yang tersedia, serta tarif yang sudah dikonfigurasi. Integrasi mempertahankan ID gateway asli untuk request, salin ID, dan tautan setup.

### Dashboard pelanggan

Kelola kunci API, lihat pemakaian, log permintaan, saldo, dan tagihan. Riwayat kuota habis tersimpan setelah isi ulang; waktu historis yang belum tercatat tidak dibuat-buat. Akses riwayat dibatasi pada kunci milik pelanggan, dengan hanya empat karakter terakhir ditampilkan.

[Buka riwayat kuota](https://ai.axiomcreative.xyz/account/quota-history)

### Portal pembayaran

Portal dan payment core berada dalam satu proyek. Console menyediakan alur tagihan QRIS, status pembayaran, dan pengajuan penarikan. Proses transaksi dijalankan layanan API serta worker terpisah; data finansial tidak dipindahkan bersama source aplikasi.

[Buka portal](https://portal.axiomcreative.xyz)

### Muse dengan tool aplikasi klien

Browser bridge menerjemahkan definisi tool dan hasilnya menjadi siklus `tool_calls` kompatibel OpenAI. Nama tool dan argumen divalidasi. `read` dan `write` dijalankan aplikasi klien sesuai izin workspace, bukan pada filesystem server bridge.

- Mendukung respons JSON dan SSE, termasuk `finish_reason: "tool_calls"`.
- Hasil tool dan riwayat panggilan dipertahankan dalam konteks.
- Konteks terserialisasi dibatasi 16.000 karakter; input lebih besar ditolak, bukan dipotong diam-diam.
- Lampiran nonteks belum didukung adapter ini.
- Isi SSE ditahan sampai teks browser selesai karena draft DOM dapat direvisi.

### Tampilan desktop dan mobile

Dashboard pelanggan menggunakan tipografi Google Sans dan Geist dari referensi MAULA/Oxlyn, tema terang/gelap, dan navbar ringkas. Navigasi tambahan yang tidak diminta tidak disertakan; mobile menggunakan menu yang sudah ada.

## Struktur aplikasi

```text
C:\Sites\axiom\
├── dashboard\          Situs AI dan dashboard pelanggan
├── web\                Website utama
├── portal\             Console portal dan payment core
├── chat\               Layanan chat Ruby
├── chat-source\        Source frontend chat
├── guard\              Layanan guard
├── merchant\           API merchant
├── operations-archive\ Skrip operator lama yang dipertahankan
└── docs\
    └── README.md       Dokumentasi terpadu ini
```

Folder `operations-archive` bukan aplikasi aktif. Periksa isi dan prasyarat skrip sebelum menjalankannya; skrip arsip dapat merujuk path deployment lama.

## Layanan dan penyimpanan

| Aplikasi | Windows service | Port loopback |
|---|---|---:|
| Website utama | `AxiomWeb` | 3000 |
| Situs AI / dashboard | `AxiomAi` | 3001 |
| Guard | `AxiomGuard` | 3013 |
| Merchant API | `AxiomMerchant` | 3082 |
| Payment API | `DjPayment` | 3083 |
| Portal console | `AxiomPaymentConsole` | 3084 |
| Payment workers | `AxiomPaymentWorker` | — |
| Chat | `AxiomChat` | Lihat konfigurasi service |
| Model router | `AxiomRouter` | 20128 |
| Muse browser bridge | `MuseBridge` | 3008 |

Source aplikasi berada di `C:\Sites\axiom`. Database, secret, log, dan konfigurasi service tetap di `C:\ProgramData`. Router dan Muse memiliki runtime tersendiri di luar folder Sites. Caddy menyediakan akses domain publik ke layanan loopback.

### Pemeriksaan layanan

Jalankan di PowerShell server:

```powershell
Get-Service AxiomAi,AxiomWeb,AxiomChat,AxiomGuard,AxiomMerchant,
  AxiomPaymentConsole,AxiomPaymentWorker,DjPayment,AxiomRouter,MuseBridge

Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/site-api/catalog
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3083/health
```

Respons `401` dari endpoint privat tanpa autentikasi bukan bukti layanan mati. Gunakan endpoint health yang tersedia; tidak semua layanan menyediakan `/health`.

## Pengembangan dan deployment

Gunakan runtime dan dependency proyek yang sudah terpasang. Source dashboard:

```powershell
Set-Location C:\Sites\axiom\dashboard
npm run build:webpack
```

> [!WARNING]
> Jangan membangun atau mengganti `.next` yang sedang dilayani produksi. Siapkan build terisolasi, simpan build pemulihan, lakukan pergantian terkontrol, lalu uji HTTP dan alur pengguna. Pemindahan source juga harus memperbarui service, scheduled task, serta referensi path pada hasil build.

Pemeriksaan regresi kuota:

```powershell
Set-Location C:\Sites\axiom\dashboard
node lib/customer-quota-history.check.mjs
```

Pemeriksaan protokol tool Muse:

```powershell
Set-Location C:\ProgramData\MuseBridge
.\Python\python.exe -m unittest -v test_tool_protocol
```

Tes unit tidak menggantikan smoke test aplikasi. Verifikasi read/write menggunakan file sementara milik klien, bukan data pelanggan.

## Backup dan pemulihan

- Konsolidasi aplikasi: `C:\ProgramData\AxiomBackups\sites-consolidation-20261021`.
- Dokumen asli sebelum penggabungan: `C:\ProgramData\AxiomBackups\docs-consolidation-20261021.zip`.
- Manifest perubahan path memuat berkas asal dan checksum; backup source aplikasi tidak mencakup semua dependency atau database.

Jangan menghapus backup terakhir sebelum deployment baru terverifikasi. Arsip source bukan pengganti backup data finansial atau database pelanggan.

## Pemecahan masalah

| Gejala | Pemeriksaan |
|---|---|
| `pricing_unconfigured` | Pastikan ID model lengkap memiliki tarif jual di katalog retail router. |
| Kuota habis meskipun key aktif | Bandingkan `tokensUsed` dengan `tokenLimit`; flag aktif tidak berarti kuota masih tersedia. |
| Muse `empty_prompt` | Akun browser bridge harus memakai transport Chat Completions, bukan body Responses. |
| Tool tidak dijalankan | Klien harus mengirim definisi `tools`, mengeksekusi `tool_calls`, lalu mengirim pesan `role: "tool"`. |
| Konteks Muse terlalu besar | Kurangi riwayat atau baca file bertahap; adapter tidak membuang konteks diam-diam. |
| HTTP 502 setelah deploy | Periksa service, port loopback, path build, dan konfigurasi proxy. |

## Dokumentasi historis

Bagian berikut mempertahankan isi sembilan dokumen sumber. **Jika berbeda, susunan deployment dan batas kemampuan pada bagian utama README ini berlaku.** Path, tarif, dan status pengujian dalam arsip menggambarkan waktu penulisannya, bukan kondisi terbaru.

<details>
<summary>Buka arsip dokumentasi lengkap — 9 dokumen</summary>

# Dokumentasi AXIOM

Dokumen gabungan proyek server. Bagian di bawah mempertahankan isi sumber asli; path deployment historis merupakan arsip, bukan lokasi aktif. Lokasi aktif: `C:\Sites\axiom`. Database/secret/log tetap di ProgramData.

## Daftar dokumen
- [SITES-LAYOUT.md](#dokumen-1)
- [dashboard/README.md](#dokumen-2)
- [dashboard/UPDATES-RELEASE.md](#dokumen-3)
- [dashboard/claude_style_announcement.md](#dokumen-4)
- [web/README.md](#dokumen-5)
- [chat-source/DESKTOP.md](#dokumen-6)
- [chat-source/SETTINGS.md](#dokumen-7)
- [chat-source/src/components/openai-icons/README.md](#dokumen-8)
- [guard/resource/axiom_guard/README.md](#dokumen-9)

---

<a id="dokumen-1"></a>

## Sumber: `SITES-LAYOUT.md`

<!-- source-sha256: b47838a0c2dff150ecdb3de31d225b2bc14e0554438bd7b7dcd91b2b839ab3f7 -->

# Consolidated server applications

Active root: `C:\Sites\axiom`.

- `dashboard`: ai.axiomcreative.xyz, customer dashboard, public AI site; AxiomAi port 3001.
- `web`: axiomcreative.xyz; AxiomWeb port 3000.
- `portal`: portal.axiomcreative.xyz, merchant console and payment-core monorepo; AxiomPaymentConsole 3084, DjPayment 3083, AxiomPaymentWorker.
- `chat`: Ruby chat service, AxiomChat.
- `chat-source`: retained chat frontend sources.
- `guard`: AxiomGuard, port 3013.
- `merchant`: merchant API, AxiomMerchant port 3082.
- `operations-archive`: retained loose operator scripts/documents; not runtime applications.

Persistent databases, secrets and logs remain in ProgramData. Router and Muse runtimes remain outside Sites. Service XMLs, active utility scripts, build references, and AxiomMailCertificateSync scheduled action were migrated. No legacy path junctions created. Build stage references were normalized to active roots; future builds must use new paths.

Recovery: `C:\ProgramData\AxiomBackups\sites-consolidation-20261021` holds changed-file backups with SHA256 manifest, scheduled-task export, latest dashboard build backups, and active application source archive (dependencies/build output excluded). Historical deployment deletion inventory is `removed-folders.json`; original root inventory is `C:\tmp\sites-audit.json`.

Smoke: web/AI/portal HTTP 200; AI catalog HTTP 200; payment /health HTTP 200. Merchant unauthenticated / returns 401, guard / returns 404, matching pre-move baseline. Public browser model catalogue renders; portal login and primary website render. Financial writes and actual payments were not exercised.


---

<a id="dokumen-2"></a>

## Sumber: `dashboard/README.md`

<!-- source-sha256: a30e9514a3b89f50426660a72481e5aa46fa500954ad9c710bf8cbb67a5ba7ad -->

# AXIOM AI

Public homepage: https://ai.axiomcreative.xyz/
Admin entry: https://ai.axiomcreative.xyz/admin
OpenAI-compatible base URL: https://ai.axiomcreative.xyz/v1

## Runtime

- Requested installation: `npm install -g allxd9router` (installed version 0.5.75).
- Node.js 24.21.0 at `C:\Program Files\AxiomRuntime\node-v24.21.0-win-x64`.
- `AxiomRouter` Windows service: native package `app\custom-server.js`, loopback `127.0.0.1:20128`, `NT AUTHORITY\LocalService`, automatic start/restart recovery.
- Router private data: `C:\ProgramData\9router`. SQLite: `db\data.sqlite`.
- `AxiomAi` Windows service: Next.js 16.3.8 / React 19.3.0, `127.0.0.1:3001`, LocalService, automatic start/restart recovery.
- Homepage source: `C:\Sites\axiom-ai`; service config/logs: `C:\ProgramData\AxiomAi`.
- Frontend dev/build explicitly use Turbopack. Production runs `next start`, never the dev server.
- Existing FiveM Coming Soon/health website remains on apex host via `AxiomWeb` port 3000.

## Routing and access

`C:\ProgramData\Caddy\Caddyfile` imports `C:\ProgramData\Caddy\ai.caddy`. The tracked AI host config is `deploy/ai.caddy`.

- Public pages, customer `/account*`, customer APIs, `/manage*` admin pages, `/manage-api/*`, `/wallet-api/*`, `/customer-api/*`, checkout and merchant APIs use the same AXIOM frontend. Caddy overwrites the rate-limit client-IP header.
- `/ai-assets/*` serves frontend assets; native router assets remain under `/_next/*`.
- `/docs/*` and `/provider-logos/*` route to the frontend; native `/providers/*` remains owned by the gateway.
- `/admin` redirects to `/manage/api-sales`; native administrator authentication remains `/login`. Administrator and customer sessions are separate.
- `/v1/*` uses the router and requires an active API key. Admin session does not replace inference key authentication.
- Native admin APIs require a valid session. Public proxy strips `X-9r-cli-token` and overwrites `X-Real-IP` with the actual connection address, preventing loopback/header spoofing.
- Native `/api/billing/*`, `/api/portal/*`, `/portal*` remain retired. Native billing, showcase and pricing entries redirect respectively to `/manage/billing`, `/manage/models`, `/manage/pricing`. Legacy `/merchant` and `/merchant/login` redirect to `/manage/billing#qris`.
- Ports 20128/3001/3082/6379 and Caddy admin 2019 bind loopback only. Merchant API and Redis are not published through Caddy. Database port 3306 has an explicit inbound block rule.
- Native `requireLogin`, `requireApiKey` are enabled. Existing admin bcrypt password and inference keys were preserved; the package's displayed default-password hint does not mean that default was configured.

Caddy obtained a valid Let's Encrypt certificate for `ai.axiomcreative.xyz` and retains automatic certificate management. Temporary DNS validation was not needed after connectivity recovered. No additional TXT record is needed. Certificate renewal still needs working VPS egress to the CA; investigate network/provider reachability if renewal logs show timeouts.

## Migration

Source was macOS 9router 0.5.91. Destination allxd9router 0.5.75 applies additive schema migration 2 / schema-definition 4. A SQLite online backup copied 47 provider connections, one custom provider node, three existing API keys, 69 kv entries, 6,249 usage-history rows and 1,000 retained request-detail rows at snapshot time. Machine identity, JWT signing secret and model metadata caches were copied securely; keys/tokens were never printed.

Platform-dependent runtime, tunnel/PID state and MITM files were not copied. Windows SQLite dependencies were installed. Cloud/tunnel/Tailscale, workstation MITM/DNS helpers and empty inherited proxy configuration were disabled on the destination only.

The local source database and service were retained for the active older session; they are not continuously synchronized. New persistent OMP configurations on the controlling device and VPS point to `https://ai.axiomcreative.xyz/v1`. Local OMP still reads its existing key from the local database; this does not require the local daemon. Restart old OMP sessions before retiring the old router so in-memory endpoint state is refreshed. Do not delete the source database without migrating that local key reference.

The VPS retains 58 OMP model definitions at 1,000,000 local context tokens. Model default and SOUL were not changed. Direct Astra/Atria API calls worked; the full VPS OMP context using the existing SOUL was rejected by Atria with `The request contains sensitive content`. This provider-level refusal is distinct from connectivity.

## Homepage

The public homepage, pricing/catalogue, calculator, package purchase and private checkout retain the bykitsune.com-inspired AXIOM design. Documentation at `/docs` and `/docs/quick-start` uses the Atria documentation layout with AXIOM colors, independent responsive navigation and seven Indonesian API/integration topics. Search, code copying, language switching and model deep links use actual documentation and gateway data. No fabricated API responses or model IDs are supplied. Provider assets are local under `/provider-logos/`; attribution is in `public/provider-logos/SOURCES.txt`. Owner-only QRIS settings remain behind administrator authentication; commerce contracts are unchanged.

Customer `/account/*` workspace now follows the documentation design: compact header, grouped sidebar, system typography, responsive cards/tables, existing light/dark preference. Styles are scoped to `.customer-workspace`; administrator and payment logic are unchanged. Homepage and customer headings use relevant Indonesian questions. Verified real customer registration/session, desktop overview, mobile keys navigation, light-theme billing, wallet HTTP 200, logout and anonymous wallet HTTP 401. The temporary verification account was removed; no purchase or inference was submitted. `node docs-check.mjs` checks public docs, genuine provider assets, unknown-topic 404 and the live catalog.

The customer overview includes daily request/token bars, input/output composition, accented icon statistics and quick actions. `overview.activity` contains exactly 30 ascending UTC calendar dates (today plus 29 prior days), zero-filled only when no retained log exists. `window.since` is midnight UTC on the first day; totals use the same owned-key scope through the captured current instant. Empty accounts show no fabricated bars or percentages. Verified authenticated empty-state API, 30-row daily table, metric toggle, desktop/mobile and light/dark rendering. `node --experimental-vm-modules customer-activity-check.mjs` covers populated SQLite data, UTC boundaries, matching totals, zero-fill and cross-account isolation without touching production records.

Status uses full-width segmented battery strips (24px desktop, 20px mobile), actual health latency/HTTP and no scope panel. Green means available below 1000ms, yellow available at or above 1000ms, red unavailable, gray unmeasured; these are not uptime percentages. Keys include status totals, remaining-quota meters, search/status filtering and expandable model permissions. Existing reveal/rename/revoke endpoints are unchanged. Health and key-state node checks passed; real authenticated status and empty-key mobile UI verified. Populated key filtering and reveal/hide were exercised with browser-only fixtures, never production keys or payments; production rename/revoke were not executed.

Customer dashboard wording now uses formal, direct Indonesian page names and descriptions rather than rhetorical questions or slogans: Ringkasan akun, Saldo dan tagihan, Riwayat permintaan API, Pengaturan integrasi and Pengujian model. Quick actions use Akses cepat and describe supported operations without implying customers can change administrator quota limits. Nine deployed customer page titles were verified over HTTP; UI layout and API behavior are unchanged.

Fonts are self-hosted Antonio and Plus Jakarta Sans; OFL licenses are in `public/fonts`.

The server-only `.env.production.local` contains `ROUTER_CATALOG_KEY`. Do not publish or commit it. `GET /site-api/catalog` fetches fixed loopback `/v1/models`, bounds the response, strips all private fields, caches successful results for 60 seconds and returns 503 rather than fake models on error. Browser cache is disabled.

## Native login and showcase theme

Native login and router operational tools retain their original forms and authentication. Jual API, Billing, Model Showcase, and Model Pricing are separate admin pages in the same AXIOM app and use the shared homepage-styled dashboard shell. Native CSS follows the shared light/dark preference; old native billing UI stays retired.

Normal HTML document requests for `/login` and `/dashboard/*` pass through `app/site-api/native-page/[...segments]/route.js`. It forwards the existing session cookie to the fixed loopback router, preserves its authentication/redirect decisions, and inserts one stylesheet link after the native styles. It returns private, non-cached HTML. Caddy overwrites the client-IP header and does not expose the internal proxy route directly.

`lib/native-theme.mjs` hashes the two remaining theme files; `/native-theme/<hash>.css` is an immutable asset. Existing native CSS caches do not prevent new theme loading. After edits, rebuild/restart AxiomAi; normal reload suffices without removing login cookies.

Non-billing native CSS/JS remain unchanged. React Flight navigation requests normally bypass the HTML theme proxy; billing entry requests redirect to the owned app. Native PG billing/store/API bundles were removed and are no longer served.

Native login/showcase browser checks covered forms, model modals without saving, 320/390px layouts, rejected invalid-password login, and authenticated navigation. Four token packages and seven native showcase entries are retained. The 58-model gateway catalogue is distinct from those curated showcase entries.

The independently versioned native theme preserves admin sessions. Anonymous private pages still redirect to login; protected APIs return 401. Source-backed billing verification is recorded below.

## Maintenance

```powershell
$bin = 'C:\Program Files\AxiomRuntime\node-v24.21.0-win-x64'
$env:Path = "$bin;$env:Path"
$env:NEXT_TELEMETRY_DISABLED = '1'
Set-Location C:\Sites\axiom-ai
# Back up source/build before replacing it. Preserve .env.production.local.
Stop-Service AxiomAi
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; restore backup' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed; restore backup' }
Start-Service AxiomAi
Invoke-RestMethod http://127.0.0.1:3001/site-api/catalog
```

For staged releases with a node_modules junction outside the staging root, use `node node_modules/next/dist/bin/next build --webpack`; Turbopack rejects that junction. Build separately, back up live source/build and Caddy config, stop only AxiomAi for cutover, replace `.next` coherently, then restart and verify public docs and assets. Preserve `.env.production.local` and all application databases.

Before modifying router data, use SQLite backup rather than copying a live DB with WAL pending. Before updating the router package, stop AxiomRouter and save a protected consistent database snapshot; check package/schema compatibility and rerun runtime warm-up with `DATA_DIR=C:\ProgramData\9router`.

## Exercised verification

- Turbopack production build succeeded on Windows; homepage served from actual production app.
- Desktop/mobile 320/390px layout, real 58-model catalogue, search/filter, empty/error/retry states, token sums, no-pricing behavior, code tabs and clipboard.
- Public `/admin` redirect chain: 302 `/dashboard`, 307 `/login`, 200 with visible password form.
- Anonymous/invalid-key inference and admin APIs return 401; public signup/billing paths return 404; spoofed forwarding/CLI headers do not bypass auth.
- Authenticated dashboard/admin APIs return 200 with a short-lived authorized test session.
- Public HTTPS inference: `cx/gpt-6-astra` and `atr/Atria-Dawn-Preview` returned `AXIOM_HTTPS_OK`.
- Public SSE delivered `AXIOM_STREAM_OK` with `finish_reason: stop`; this package closed the stream without a literal `[DONE]` event.
- Local OMP at the migrated endpoint returned `[V] OMP_LOCAL_VPS_OK` with exit 0. The VPS OMP configured key returned the live catalogue at the new URL; its existing full-context Atria prompt was refused as noted above.

## GoPay Merchant and QRIS

- Rust source: `C:\Sites\axiom-merchant`; `AxiomMerchant` runs `target\release\gopaym-api.exe` from `C:\ProgramData\AxiomMerchant`, as LocalService, on `127.0.0.1:3082`. Redis (`AxiomMerchantCache`, authenticated `127.0.0.1:6379`) holds rate-limit counters, not money. MariaDB stores durable orders, sessions and webhook outbox and now binds only `127.0.0.1:3306`, with an additional inbound firewall block. Database/merchant/frontend restart and both API health checks passed after the bind change.
- Backend secrets: protected `C:\ProgramData\AxiomMerchant\.env`. Frontend secrets: `.env.production.local` with `MERCHANT_DATABASE_URL`, `MERCHANT_ENCRYPTION_KEY`, `NINEROUTER_DATA_DIR`, `OWNER_SETUP_KEY` and the existing catalogue key. The independently generated 64-hex `OWNER_SETUP_KEY` is shared only between backend and server-side frontend. Never expose it to browser code/logs. Back up both databases and encryption keys together.
- QRIS setup is inline at **Billing → QRIS**, `/manage/billing#qris`. Connected status is compact; **Hubungkan kembali** expands the existing provider email/phone/OTP flow in place. Explicitly completing verification saves the receiving merchant automatically. On page load there are only read requests: no OTP, no automatic reconnect, no new charge. Interrupted completed verification exposes **Selesaikan koneksi**. Optional **Alat pembayaran** contains existing balance, exact-amount QRIS, status/cancel and history tools. No separate setup page is required; all merchant actions remain native-admin authenticated.
- Only one owner identity is provisioned through private `/api/auth/owner`; missing/wrong `X-Owner-Setup-Key` fails before database access. The normalized email is bound to one fixed owner ID; another email cannot replace it. The old `/api/auth/activate` route and `activation_tokens` table were removed by an additive migration. The selected merchant ID cannot silently be changed. Provider `Wallet:Balance` permission controls balance access only, not buyer checkout.
- Public `/buy` lists existing active packages. Creating an invoice requires an AXIOM customer account at `/account/login` or `/account/register`; neither native admin login nor GoPay Merchant credentials substitute for it. Buyers choose a package, explicitly create an invoice, then pay the site's merchant QRIS. Amounts are integer IDR, 1–10,000,000, without unique-code increments. Login never automatically creates a charge.
- Every provider charge uses a durable order ID. Uncertain replies preserve the order for status checking, never imply payment. Cancellation rechecks provider status; settlement cannot regress. Order, transaction, amount, currency and QRIS type must match before settlement is accepted.
- Webhook endpoint: `/merchant-api/webhook`. HMAC-SHA256 authenticates exact body bytes; durable event IDs deduplicate retries. Old signed deliveries remain valid because retries retain their original timestamp. Each new event independently rechecks provider-backed order status. Payload claims alone never issue API keys.
- Settlement issues one limited router key per package invoice, identified by `qris_<order_id>`. Customer ownership is immutable after login/secret-bound historical claim. Customers reopen invoices in `/account/billing`; topup invoices credit the IDR wallet and never issue keys. Wallet-funded package purchases debit once, then resume deterministic key issuance on retry.
- QR images, when the provider supplies no QR string, are fetched only from the authenticated order's exact `https://api.midtrans.com/v2/qris/<transaction_id>/qr-code` URL. Redirects, alternate hosts, mismatched transaction IDs, SVG and oversized responses are rejected.
- Balance is provider-admin-only. The supplied adapter does not document monetary units; recognized numeric provider fields are labelled **unit unverified**, never silently converted to Rupiah. Unknown responses fail rather than show zero.

### Verification and provider boundary

Production Turbopack build, `node merchant-check.mjs` and `node owner-access-check.mjs` passed. Rust release build and all eight regressions passed. Runtime owner smoke verified missing/wrong setup key denial, normalized same-email reconnection, one-user identity, rejection of another receiver email, and absence of the removed activation route. Temporary smoke users/keys were removed; no provider login or monetary record was created.

Owner pages redirect anonymous visitors to native `/login`; merchant administration APIs return401 `admin_required` without the native session. Buyer catalogue remains public; creating/reading invoices now requires a customer session. Provider-session errors use409 responses, distinct from either site-login failure. In-progress OTP/account state is resumable; owner reconnect can open even if saved provider tokens expire.

Browser verification covered actual production buyer pages without merchant/activation entry points, native admin settings link, owner settings and the existing-account connection form (email, country code, phone only), plus mobile layout. Earlier catalogue/docs/calculator verification remains applicable. Native showcase has seven curated models, separate from the 58-model live catalogue.

Live login discovery, email OTP, account selection, WhatsApp OTP and final token exchange succeeded through the supplied adapter. Provider confirmed merchant `G046900857` with admin and balance permission. The receiver is saved; the backend reports one active QRIS payment point and one registered webhook. Public package readiness returns `configured:true`. Actual IDR10,000 QRIS creation and subsequent status reconciliation are verified; settlement/cancellation, provider balance and paid-key inference remain unverified.

Login discovery uses the bound email alone (email plus phone caused `auth:error:validation`). An explicit `auth:error:need_2fa` is treated as a challenge, never access. The owner requested WhatsApp only: `otp_wa` has no SMS fallback. Successful OTP initiation may include ancillary `fr_token_details`; authentication still requires OTP verification, final token exchange and provider merchant identity. Expired OTP was rejected; a fresh WhatsApp code completed authentication. OTP values and provider tokens are not documented or logged.

### Merchant build and rollback

Rust Windows GNU builds require GCC, not LLVM-mingw (missing `libgcc_eh`). Compiler path must physically avoid spaces: `C:\AxiomBuild\mingw64\bin`; a junction to Program Files still resolves to the broken spaced path. Set `RUSTUP_HOME=C:\ProgramData\AxiomMerchant\rustup`, `CARGO_HOME=C:\ProgramData\AxiomMerchant\cargo`, and target linker/CC/AR to GCC/bin before `cargo test --release` and `cargo build --release`. `Cargo.lock` is retained. Create macOS deployment archives with `COPYFILE_DISABLE=1`; AppleDouble `._*.sql` breaks `sqlx::migrate!`.

Frontend release was built in a separate staging directory before the service swap. Pre-merchant rollback: `C:\Sites\axiom-ai-before-merchant-20261003-002000` and `C:\ProgramData\Caddy\ai.before-merchant-20261003-002000.caddy`. Preserve live `.env.production.local`. Stop only AxiomAi to switch the backed-up directory, validate/reload Caddy, restart AxiomAi, then check `/site-api/catalog` and `/commerce-api/packages`. Do not remove payment records or roll back databases after accepting real money.

Owner-only cutover backups: `C:\Sites\axiom-ai-before-owner-20261003` and `C:\Sites\axiom-merchant-before-owner-20261003`. Keep the owner-only frontend/backend paired. The migration deleting obsolete invitations is forward-only; do not restore the old invitation-based application onto this schema. Deployment retains rollback files but does not restore obsolete public onboarding.

## Source-backed billing cutover

`/merchant/billing` manages summary, token packages (create/edit/delete), source-ledger orders (status/cancel), and customer-key quota/RPM/TPM/expiry/model restrictions/revocation. It reads native `tokenPackages`/`apiKeys` for access configuration and MariaDB `bridge_checkout` for financial truth. Keys are never listed in plaintext. Revocation preserves the record so a paid order cannot reissue a new key. Internal router keys are excluded from billing mutations.

QRIS generation/status/cancel use the adapted Rust backend from the supplied `Downloads/src.zip`, not PG AllxdDev. Native external-gateway settings/test/stats/orders/webhook/store routes and compiled assets have been retired. The `pg.allxddev.com` defaults and settings factory were removed from shared native chunk 3401; its unrelated provider/key modules are preserved. No URL substitution or pretend provider adapter was used. The native `paymentSettings` table was already empty; no credentials or historical payments were discarded.

`deploy/router-server.cjs`, `deploy/native-shared-source-billing.js` and `deploy/retire-native-billing.ps1` retain the native package cutover. The script pins the original bundle SHA256, saves a protected backup, retires only obsolete payment surfaces, installs the amended source entrypoint and restores on startup failure. Package upgrades can reintroduce native PG surfaces; reapply/reverify this cutover before serving a new router version. Backups: `C:\ProgramData\AxiomAi\native-before-source-billing-20261003`, `C:\Sites\axiom-ai-before-source-billing-20261003`, `C:\ProgramData\Caddy\ai.before-source-billing-20261003.caddy`.

Verification: Turbopack build; `billing-check.mjs` (isolated real SQLite package lifecycle and key boundaries), merchant boundary checks, anonymous access checks. Live APIs returned actual zero-order totals, four packages, no customer keys. Browser created an inactive temporary package, edited its exact price/token quota, deleted it, and preserved all four real packages. Direct and public legacy payment endpoints return404; active native JS/HTML/RSC/JSON scan found zero files containing the retired PG hostname. The provider-dependent live payment boundary above remains unchanged.

Live customer-key smoke verified HTTPS `/v1/models` accepts a temporary active key, billing changes total quota/RPM/TPM without resetting usage, and revocation immediately causes HTTP401 while preserving the key row. The temporary key was deleted after the check. Loopback router requests deliberately have different local authentication behavior; revocation evidence uses public HTTPS.

## Invoice ledger decoding repair

MariaDB 13 reports `ascii_bin` text columns with binary protocol metadata. SQLx 0.8.6 rejects decoding those columns as Rust `String`, producing HTTP500 before the provider charge: `order_id` was reported as `VARBINARY`. Migration `202610030003_text_identifiers.sql` changes order IDs, webhook URL/event IDs and key digests to MariaDB's `utf8mb4_uca1400_nopad_as_cs`, preserving case/accent sensitivity and no-padding comparison while returning text metadata. Applied historical migration checksums are unchanged.

The real SQLx row diagnostic reproduced the failure before migration and decoded the same row afterward. Eight existing Rust tests passed; `cargo test --release --locked --test ledger_text -- --ignored` passed against temporary tables using `TEST_DATABASE_URL`. This regression applies the actual migration and checks case-distinct IDs and webhook text without touching permanent data.

The failed reservation `9b0cf2e6-1d64-48b4-9f3d-564a12803eed` was recovered once after provider status explicitly confirmed `404 Transaction doesn't exist.` and the original code path proved no charge had been attempted. Recovery used the same order ID, merchant, POP and IDR10,000 amount. Provider returned201, QR string/image, transaction ID and pending status. The ordinary checkout reconciliation then returned pending with QR data; the same original invoice rendered its real QR in the production browser. No ledger row was deleted, no settlement was fabricated, and no replacement order ID was generated by recovery. One-off recovery source/executable was removed.

## Customer storefront and account login

`app/components/SiteHeader.jsx` is shared by the homepage, buy, customer login/register/account and checkout. It retains the homepage ticker, logo, pill navigation and `+` menu; Escape closes and restores focus, outside clicks close, and mobile uses the same component. Customer pages reuse Antonio/Jakarta, blue heroes, pastel outlined cards, yellow controls and responsive layouts in `app/globals.css`. Owner/merchant pages and native admin retain their separate authorization.

Customer routes: `/account/login`, `/account/register`, `/account`; API `/account-api/session|register|login|logout`. `deploy/customer-accounts.sql` adds separate MariaDB customer/session tables and nullable checkout ownership without changing merchant accounts or assigning existing orders by email. Passwords use async Node scrypt N32768/r8/p1 with random16-byte salts; 12–128-character inputs are bounded before hashing. Random32-byte session secrets are stored only as SHA256 digests. Cookies are Secure, HttpOnly, SameSite=Lax, seven-day fixed lifetime; login rotates sessions and logout revokes them. Signup issues no credits or API key. Mutations require the exact site Origin; login/registration rate limits use trusted client IP and normalized email.

The customer layer authenticates an email/password account; email verification and password-reset delivery are not configured. Never use an unverified email to adopt a historical purchase. New purchases are bound to immutable customer IDs. For a pre-account invoice, the original `X-Checkout-Token` may claim it once under a row lock; the old token is then cleared. Existing paid keys/ledger rows are never regenerated by login. Native admin and customer cookies are not interchangeable.

Verification: production Turbopack build, merchant/billing regression checks, `owner-access-check.mjs` and real HTTP `customer-auth-check.mjs` passed. Browser verified desktop1440, mobile390/320, shared header height, plus/Escape/focus/outside-click, package selection surviving registration, login/logout, rejected password, session persistence after reload, account order list and account-owned checkout without sessionStorage. No horizontal overflow at320px on home/buy/account/checkout.

One approved smoke invoice IDR10,000 verified login-required creation, server-side email binding despite spoofed input, foreign-account404, QRIS status and own-order listing, then provider-confirmed cancellation without payment or key fulfillment. Its cancelled ledger is retained; temporary accounts/sessions were removed. Existing pre-account invoice tokens were preserved. Backups: `C:\Sites\axiom-ai-before-customer-20261003` and `C:\ProgramData\Caddy\ai.before-customer-20261003.caddy`.

## AXIOM dashboard identity and navigation

All customer dashboards and the four administration pages reuse `SiteHeader` from the homepage: the black ticker, logo, outlined pill navigation, circular `+`, theme control and page actions. `DashboardShell` wraps `.axiom-site`; there is no independent SaaS sidebar/header. The blue heading panel, Antonio/Jakarta typography, yellow controls, pastel cards, black borders and hard shadows are the same visual vocabulary as the public homepage. Administration sections remain separate routes, not a second website or billing tabs containing model configuration.

Customer navigation: Ringkasan; Log Permintaan; Peringkat & TPS; Developer (One Click Setup, Kunci API, Playground, Katalog Model, Integrasi Kode, Status Sistem); Saldo & Tagihan (Saldo & Billing, Kalkulator). The customer header has a balance row, Isi Saldo and Log Permintaan. Admin navigation exposes Jual API, Billing, Model Showcase, Model Pricing; QRIS opens its inline Billing panel. Complete route groups remain accessible through `+` on desktop/mobile.

Theme preference uses localStorage `theme` with the native Zustand envelope and supports light/dark/system; previous raw string preferences are migrated. Custom and native pages share the preference. The visual correction removed generic gray/navy sidebar styling and its unused drawer CSS.

Model publication uses existing native `showcaseModels` metadata and `kv(scope='pricing')` tariffs, matched to exact live model IDs. Unknown/unmatched sample records never fabricate public models or rates. Admin model changes invalidate catalogue metadata immediately; published pricing is USD/million tokens, distinct from IDR packages and wallet balance. No automatic foreign-exchange conversion.

Wallet credits are integer IDR. QRIS topup credits require provider-verified settlement, customer ownership and a unique ledger reference. Duplicate webhook/status checks cannot credit twice. Spending locks the wallet, rejects negative balance, debits a durable purchase ID once, and resumes deterministic package-key fulfillment. Cash revenue excludes wallet-funded spend to avoid counting money twice. No signup balance or unlimited test key is created.

Developer pages reveal/manage only keys linked to the current customer's checkout IDs, never by matching email. Logs exclude prompts, secrets and provider connections. Playground uses the customer's actual key on the public authenticated router; quota enforcement is unchanged. Historical request logs lack a verified customer timing link and show TPS unavailable. Playground rankings use real reported output tokens and first-to-last streamed delta arrival times; JSON/single-delta output is not assigned a fake TPS. Setup downloads a private .env and runnable SDK snippets; it does not claim to install software in the browser.

Exercised verification: complete Turbopack build; existing auth/billing/model regressions; real temporary-table wallet duplicate credit/debit and purchase-replay tests. Production customer APIs/status returned actual data, an own paid-key Playground request returned OK with reported usage, cross-customer reveal/rename/Playground returned404, and a QRIS Rp1.000 topup was cancelled with balance remaining zero. No live wallet was artificially credited; actual paid-topup settlement remains to be exercised.

After the visual correction, production Jual API, Billing, Showcase and Pricing all measured the homepage's 68px desktop/66px mobile header, Antonio heading and sky-blue light hero. All four at320px and customer pages at320/390px stayed within viewport. `+` menu/Escape/focus and persisted dark mode were exercised. The QRIS panel loaded saved merchant G046900857, kept the connection form/tools collapsed, and expanded both in Billing without navigating or sending OTP. Backups: `C:\Sites\axiom-ai-before-home-style-20261003` and `C:\ProgramData\Caddy\ai.before-home-style-20261003.caddy`.

## Token packages and IDR calculator — 2026-10-04

Owner-selected affordable range: IDR5,000–300,000. Published new-purchase terms:

| Package | Raw token quota | IDR price | RPM | Validity |
| --- | ---: | ---: | ---: | ---: |
| Starter | 20,000,000 | 10,000 | 60 | 30 days |
| Developer | 45,000,000 | 20,000 | 60 | 30 days |
| Pro | 230,000,000 | 79,000 | 90 | 60 days |
| Enterprise | 1,000,000,000 | 299,000 | 300 | 90 days |

`deploy/update-token-packages.mjs` previews by default; `--apply` updates the four existing IDs transactionally. Set `NINEROUTER_DATA_DIR` to the router root. It preserves validity, TPM, model permissions, activity, sorting and popularity; asserts customer keys are unchanged. Existing QRIS/wallet order snapshots and issued keys retain their purchased terms. No ledger migration, artificial balance, new payment or inference request is needed for this revision.

The shared `TokenCalculator` serves `/`, `/calculator` and `/account/calculator`. It reads the same live packages as checkout. Estimated amortized IDR = package price × (input + output) ÷ package token quota; workload multiplies by request count. This is allocation of the upfront package price, not an extra wallet debit or pay-as-you-go charge. For Starter, 10,000 input + 3,000 output gives 13,000 tokens, IDR6.50 per request, 1,538 complete requests and 19,987,000 remaining tokens. Workload 1,539 exceeds quota by 7,000; no automatic overage purchase. `?package=` persists selection into purchase links. Invalid integers/overflow receive visible errors. Missing catalog/model USD rates do not disable package arithmetic.

Accounting uses normalized prompt + completion, including cache input without a cache discount. Native pricing feeds historical USD estimates only, not quota multipliers. Model permissions use the shared `lib/model-policy.cjs`: case-insensitive model IDs, slash-boundary suffixes and explicit anchored `*` patterns; arbitrary substrings no longer grant access. `allowedModels` null/empty means unrestricted except for `blockedModels`; blocks always win. Invalid policies fail closed. Native TPM is stored but not enforced; plans with TPM0 are unaffected. RPM is a per-key, process-local sliding window; rejected models no longer consume its slots. Usage is recorded after completion; concurrent/in-flight requests can still overshoot quota.

Economics: four OAuth connection records identify `prolite`/`self_serve_business_prolite`, not four proven independent subscriptions or invoices. Six complete historical days contained 1,215,877,944 Codex tokens, 95.18% cached. This does not guarantee future uncached/output-heavy capacity. Actual plan invoices, hosting costs and payment fees are not stored in this website. The owner explicitly chose the lower shared-subscription prices above over the cost-reserve proposal; no guaranteed-profit claim is made. Neither public API tariffs nor a zero historical cost establish actual upstream expense. No fabricated USD rates were published.

Verification commands: `node token-calculator-check.mjs`, `node billing-check.mjs`, `node model-store-check.mjs`, `npm run build`. Calculator and Windows Turbopack build passed; live `/commerce-api/packages` showed all revised terms and QRIS readiness. Browser exercised Starter IDR6.50 arithmetic, workload shortfall, negative-input validation and 390px no-overflow rendering; live buy selection showed Enterprise IDR299,000 and preserved its calculator link. No new charge was created.

Rollback files: `C:\Sites\axiom-ai-before-pricing-20261004`; protected online SQLite backup and original package rows: `C:\ProgramData\AxiomAi\pricing-backup-20261004`. Restore application files only after stopping AxiomAi; never restore the full router database over subsequent real usage/payments. Any price rollback must update package rows only and retain historical order snapshots.

Final Windows release also passed the calculator, billing and model-store checks. Browser verified fractional unit prices (Developer IDR444.44/M, Pro IDR343.48/M), Enterprise IDR3.887 amortization for 13,000 tokens, zero workload, fractional-input rejection and light/dark mobile rendering. A temporary zero-balance customer exercised the actual authenticated account calculator (same Starter IDR6.50 result, no overflow, no browser errors), then logged out; its account/session were removed after asserting zero orders. Blocking the model catalog still left the live package calculation functional. Production transfer archives were removed and rollback DB/files restricted to Administrators and SYSTEM.

## API permissions and token-accounting repair — 2026-10-05

`/manage/api-sales` manages all existing keys, including manual keys, without exposing secrets. Package/key forms separate allowed and blocked model lists. Existing allowlists are never reinterpreted as blocks. Empty block lists block nothing; `*` blocks everything. Key status distinguishes disabled, expired and exhausted. Package changes apply to future purchases; saved QRIS/wallet snapshots and already-issued quotas, usage, expiry and ownership remain unchanged. New snapshots and key issuance preserve both policy fields.

Customer key pages display both lists; setup, playground and calculator exclude models disallowed by the selected key/package. The runtime checks resolved provider identities, aliases and combo members; blocking an underlying model cannot be bypassed through a combo. An explicitly permitted combo grants its permitted members, but never overrides a block. `/v1/models` and service-kind model catalogs require the configured API authentication and filter by the requesting key. Model denials return `model_blocked`/`model_not_allowed`, not `insufficient_quota`; expired, disabled, rate-limited and exhausted keys retain distinct codes.

The deployed router is packaged `allxd9router@0.5.75`; matching original application source is unavailable. Version-specific, readable factory replacements live in `app/.next-cli-build/server/axiom-patches`. The bundled runtime registers these replacements for every route, independent of duplicated factory load order. The middleware error mapping is patched separately. An npm upgrade overwrites this integration: rebuild/port and rerun the regression and HTTP smoke before upgrading; do not silently discard the patches.

Accounting removes the arbitrary 2,000-input-token padding. Late authoritative SSE usage replaces an earlier estimate; JSON reports the same normalized counts as the debit. Missing JSON usage uses a marked estimate. Cache-only input is normalized before the zero-usage check. Distinct equal-count requests are not collapsed by timestamp, and a failed debit rolls back its usage-history transaction. Historical balances are not recalculated. Client-cancel partial-stream charging and fire-and-forget persistence remain existing limitations; this release does not reserve tokens before admission.

Verification: `billing-check.mjs`, `token-calculator-check.mjs` and `wallet-purchase-check.mjs` passed with isolated SQLite and MariaDB temporary tables. The Windows production build passed with `next build --webpack` (Turbopack rejects the isolated dependency junction). Router accounting/policy regressions passed; a real staged HTTP server exercised chat/responses/messages, authenticated filtered catalogs, key edits, expiry/revocation/quota, denied requests without upstream calls, and JSON plus SSE usage debiting exactly 12 + 12 = 24 tokens.

Production verification: allow/block fields saved from the real admin browser; manual/customer keys and exhausted status rendered. Customer key/setup/playground pages loaded live data; setup at390px had no horizontal overflow. Public `bc/js/deepseek-v4-flash-0731` returned `OK` in JSON and SSE; reported totals3,251 and3,267 matched ledger deltas exactly. A denied GPT request returned403/model_blocked with zero debit. The exact `bc/dahlah/deepseek-ai/DeepSeek-V4-Flash-0731` route passed local authorization but its upstream returned503 wrapping429/model_concurrency; it was not silently remapped to another provider. The exhausted real key returned429/quota_exceeded. Model detail/info/count_tokens/embeddings restrictions were exercised.

Rollback backup: `C:\ProgramData\AxiomAi\api-billing-repair-20261005-223326` (Administrators/SYSTEM only). Restore application files after stopping both services; retain the additive nullable `blockedModels` columns and never restore the entire database over subsequent usage/payments. Runtime regression commands from `axiom-patches`: `node policy-check.cjs` and `node accounting-check.cjs`. The production verification key is disabled after the smoke, retaining its usage audit; no real customer's purchased terms were changed.

Account binding (2026-10-11): Jual API > Key pelanggan > Edit batas key > Arahkan API key ke akun provider. Select one active Codex account or Automatic. Existing token usage remains unchanged. Check: node billing-binding-check.mjs. Backup: C:\ProgramData\AxiomAi\binding-editor-backup-20261011.

## Request-count limits — 2026-10-11

Jual API > Key pelanggan > Edit batas key adds editable request caps per 3 hours and per week. Jual API > Akun provider adds a daily request cap per connection shared across keys. Both views show used, remaining and reset times in WIB. Zero means no additional request cap; existing customer settings are not automatically changed.

Three-hour periods start on first admitted inference; weekly resets Monday 00:00 WIB; daily resets 00:00 WIB. Editing a cap retains current usage. Inference attempts count once, including upstream failures, not once per streaming chunk; denied requests do not consume other caps. Token billing remains separate and unchanged. These are local gateway caps, not an official Plus-plan quota or an override of provider limits.

Admin API: POST `/merchant-api/billing/keys/:id` accepts `threeHourRequestLimit`, `weeklyRequestLimit`; POST `/merchant-api/billing/accounts/:id` accepts only `dailyRequestLimit`. Existing admin authentication and same-origin checks protect both. `lib/request-quotas.cjs` shares SQLite `requestQuotas` with router enforcement; deploy both sides together. No package snapshots or paid entitlements are rewritten. Backup: `C:\ProgramData\9router\backups\request-quotas-20261011`; restore application files, never overwrite newer usage/payments with the backup DB.

Verification: webpack production build, existing billing/binding checks, isolated real JSON/SSE and concurrent quota rejection, browser save/reopen of all caps, 390px account editor without horizontal overflow. Runnable router check: `node request-quota-check.cjs` in the installed `axiom-patches` directory.

Public production acceptance saved/reopened key caps, verified real Codex JSON/SSE,429 plus reset metadata and admission after the test window expired. Temporary verification key is disabled; existing customer/account caps stayed0. No customer terms or counters were reset.

## Standalone playground — 2026-10-16

Chat UI now lives at `/playground`, independent of DashboardShell. `/account/playground` redirects; dashboard/model/performance links and login return allowlist use the new route. Existing customer authentication, key ownership, model policy, quotas and JSON chat API remain unchanged. Conversation exists only while the page is open; no streaming-to-browser or persistent chat archive is claimed.

Verified: isolated webpack build; `node app/playground/chat.test.mjs`; public login gate and old-route redirect; genuine temporary customer on desktop dark/mobile light; prompt suggestions/reset; settings expanded without overlap or horizontal overflow at 390px; invalid key rejected with 404. Successful paid inference was not run: temporary account had no API key or credits. Temporary customer and sessions removed. Backup: `C:/Sites/axiom-playground-backup`.

### Onyx visual alignment and inline controls
Reference: onyx-dot-app/onyx docs/assets/onyx-chat-use-cases.png. Neutral sidebar/canvas, narrow centered transcript, bottom composer, right-aligned model control, compact arrow send, and flat message treatment. AXIOM identity retained; unsupported Onyx agents/projects/sharing are not represented as fake controls. Model and API-key selection use inline listboxes; settings expand in document flow; theme uses buttons. Mobile sidebar occupies layout width instead of overlaying chat. No modal dialogs added.
Verified production desktop light/dark and 390px mobile, reset clears draft, expanded selectors sizes 5/3, zero dialog elements, zero horizontal overflow, sidebar right equals main left (156px). Existing conversation assert checks pass. Temporary real customer deleted after verification. Paid inference not exercised. Backup: C:/Sites/axiom-playground-visual-backup.

### Mobile buy package swipe
At widths up to 767px, package cards use a single horizontal CSS grid with 88% card width, native overflow scrolling and mandatory x scroll snap. Next card remains partially visible. Desktop two-column grid and purchase logic unchanged. Production verified at 390px: four cards on same row, fieldset clientWidth 358 / scrollWidth 1282, no page overflow; selecting third card updates radio and package query. At 1440px two columns remain, no grid/page overflow. No invoice or purchase submitted. Backup: C:/Sites/axiom-buy-swipe-backup.

## Lightweight persistent playground
Dedicated bridge_chat tables store customer-scoped history, revisions and instruction presets. History title search/keyset pagination, rename/delete, Markdown/code/tables/copy/export, explicit edit/regenerate, SSE and stop. No polling/indexing/Docker/OS reboot. Gateway ownership/model policy/quotas stay authoritative; partial failures never imply token refunds. Single AxiomAi process required for cancellation registry; orphan runs reconcile on read or stop.
Verified: webpack; chat, progressive framing and Markdown safety assertions; real MariaDB scoped fixtures for isolation/dedup/revisions/recovery/pagination; staged real HTTP sessions and rejected-key SSE persistence. Browser real temporary account verified history refresh/rename/delete, preset persistence, desktop/mobile and light/dark. Buy mobile swipe remains 358px viewport /1282px scroll. Exact fixtures removed.
Not verified: successful paid upstream generation, actual provider cancellation and billable regeneration, because no designated authorized test entitlement was provided. Do not claim these from rejected-key smoke. Backup C:/Sites/axiom-lightweight-backup contains coherent source/build/dependencies. No accounting DB rollback.

### Chat-focused layout / sidebar Settings
Settings opens a dedicated main-content view; chat and draft stay mounted and preserved. Model selector lives in header; composer contains input and send/stop only; edit/regenerate sit in transcript. Mobile navigation replaces chat view rather than pushing it down a long page. Backend/auth/billing unchanged. Verified webpack, existing chat assertions, real-account browser desktop/mobile 390px light/dark, settings scroll, return retains exact draft, no modal/horizontal overflow, composer bottom 795px within 844px viewport. Temporary account removed. Backup C:/Sites/axiom-settings-backup.
`r`nFluent Settings deployed 2026-10-16: native floating dialog, internal navigation, theme switches and searchable radio choices. Backup C:/Sites/axiom-fluent-backup-20261016. Authenticated live verification pending.

Live verification passed: real temporary customer, desktop dark/mobile 390px light, theme persists after reload, system switch disables manual mode, no Settings dropdowns or page overflow, draft retained after Escape, mobile focus returns to Menu. Exact temporary customer removed. No paid inference exercised.
`r`nReference sidebar/composer and model popover deployed 2026-10-16: native floating dialog, internal navigation, theme switches and searchable radio choices. Backup C:/Sites/axiom-reference-backup-20261016. Authenticated live verification pending.

Reference layout verified live: collapsible sidebar, composer model popover, 390px mobile without page overflow, exact draft retained. Real temporary account removed. Model filtering/selection exercised with isolated fixture catalogue; live account has no paid key. Production webpack and chat checks passed. Backup C:/Sites/axiom-reference-backup-20261016.
`r`nCompact composer, SVG send and compact Settings deployed 2026-10-16: native floating dialog, internal navigation, theme switches and searchable radio choices. Backup C:/Sites/axiom-compact-backup-20261016. Authenticated live verification pending.

Compact UI verified live: composer 122px desktop, textarea outline none with wrapper focus indicator, centered SVG send 36px, mobile Settings and draft retention after Escape. Build and chat checks passed. Exact temporary account removed. Paid inference not exercised. Backup C:/Sites/axiom-compact-backup-20261016.

Chat presentation 2026-10-16: content-width user bubbles with shadow; total token count only; Thinking shimmer until first content, then elapsed seconds. Webpack build and origin HTTP 200 verified; CSS browser fixture checked. Authenticated live streaming UI not exercised in this release.
Playground controls: anchored conversation actions, consistent buttons, AXIOM AI branding, display-only provider-prefix removal. Webpack build and browser popup fixture verified; model IDs sent to API unchanged.
Chat Markdown: removed manual history refresh button; improved GFM tables, lists, tasks, quotes, symbols and code-copy header. Existing Markdown safety checks passed; mobile CSS fixture has no page overflow. No LaTeX renderer added.
Playground math/search release: KaTeX with trust=false, multilingual direction, full-screen searchable Settings, session search, response actions and draft-preserving streaming. Real temporary customer browser verified search focus, Settings full viewport and settings filtering, multilingual composer. Exa backend integrated but no Exa credential configured; web search unavailable until configuration. Syadagentic not installed. Full inference/draft transitions not exercised with a funded customer key.
Exa keyless: official https://mcp.exa.ai/mcp transport when no configured credential; default enabled, composer button removed, Settings switch retained. Real server search returned five source URLs without key. Free endpoint rate limits apply.
Settings account/accessibility release: authenticated name/email passed server-side; per-key native token usage and progress, unlimited-key handling; browser-persisted large text, contrast, reduced motion. Build passed; real temporary account verified preferences survive reload and account/empty usage surfaces. No fabricated quota or account values.
Superpower/context release: optional analyst-reviewer-answer, per-call usage aggregation, deterministic first-session title, removed token UI and General category; grouped provider model labels and compact popovers. Conservative UTF8-byte upper estimate uses292000 normal/1000000 Superpower capped live model context; not exact tokenizer capacity. Compaction preserves original turns, saves complete-prefix checkpoints;85s overall run deadline may interrupt long compactions. Migration widened three TEXT columns after chat JSON backup. Context checks passed; real Harbor three-call smoke passed (3110 input,858 output); authenticated plugin switch/removal checks passed. Large real-history compaction not exercised end-to-end.
Follow-up live compaction smoke: found UI omits maxTokens while beginRun required it; fixed server default8192, build/deploy passed. Real large-history compaction reached85s timeout after one completed provider call (9817 input34 output); full compaction not verified. Temporary fixture rows removed in finally. No claim of full1M context verification.
Session titles now use a charged model call after first successful answer for default-title sessions; manual titles preserved. Actual title smoke produced Membuat Skrip Kalkulator Matematika. Sidebar300px, full-width transcript scrollbar at viewport right, centered content. Narrow white Thinking letter sweep left-to-right; reduced motion respected.
Formatter release: all lowlight grammars via rehype-highlight, KaTeX retained; legacy exact-prompt titles eligible on next successful response. Narrow text-clipped shimmer verified with browser animation positions. Footer omits unverified provider no-training claim. Build and origin200 verified. npm audit reported existing/dependency190-tree five findings incl one high; not resolved in this release.
Personalisation release: customer-scoped preferences, managed text memory, style/tone, instructions, formatting, fast answers and suggestions; early title SSE and manual marker; navigation session guards. PDF/text/code upload max2MiB, audio415 and oversized413 verified; text extraction200. Authenticated settings screenshot verified. Title ordering and session-switch during real funded stream not yet exercised end-to-end.

Homepage copy refreshed: direct Indonesian hero and feature headings, clearer SDK/code guidance; pricing/payment logic unchanged. Production webpack passed; live hero copy checked at desktop and 390px mobile. Backup C:/Sites/axiom-copy-backup-20261016.

Admin Fluent deployed: DashboardShell admin navigation, scoped dashboard.css and native/common.css. Fresh production build passed. Authenticated visuals not verified; public protected routes checked. Backup C:/Sites/axiom-admin-fluent-backup-20261016. Router service was not restarted.
CodeBuddy DNS repair: gateway custom-server loads scoped codebuddy-dns.cjs. Windows ENOENT/EAI_AGAIN on www.codebuddy.ai falls back to resolve4; no static IP or chat retries. Regression passed; injected OS DNS failure with real HTTPS returned 200. Backup C:/ProgramData/9router/backups/codebuddy-dns-20261016. Provider inference not exercised.

Admin sales scroll repair 2026-10-16: sidebar width containment, horizontally scrollable package/key/provider/settings tabs, focusable table scroll regions, valid key-model markup. Browser CSS fixture at 1365/768/390px verified page containment and horizontal scrolling; staged and live protected routes return307. Authenticated sales CRUD not exercised: no authorized admin browser session available. Backup C:/Sites/axiom-sales-backup-20261016-scroll.
Billing visual release 2026-10-16: animated metrics, real QRIS trend 7/30 days WIB, clickable status filtering, Transaksi/QRIS tabs, responsive tables and reduced motion. Real aggregation smoke: 25 orders, IDR80000 receipts, 30 days, eight statuses. Component browser smoke verified desktop/mobile, range switching, keyboard filtering and tooltip. Live protected billing returns307; authenticated full billing mutations not exercised. Backup C:/Sites/axiom-billing-visual-backup-20261016.

## Maintenance and unified admin navigation (2026-10-18)
Public preview: /maintenance. Admin settings: /manage/maintenance, linked in native 9router sidebar alongside API sales, billing, showcase, pricing and QRIS. Shared links: lib/admin-navigation.mjs; native integration runs after hydration through lib/native-theme.mjs, without compiled frontend modifications.
Configuration: C:/ProgramData/AxiomAi/maintenance/settings.json, default OFF, atomic writes, LocalService modify access restricted to this directory. Authenticated same-origin POST /manage-api/maintenance updates enabled/title/message/estimatedEnd/retryAfter. Public GET /site-api/maintenance returns sanitized fields.
When enabled, website documents and model APIs return HTTP503 with Retry-After; admin/login and payment callbacks remain accessible. Admin must explicitly acknowledge activation. Estimated end is informational, never auto-disables maintenance.
Verified: production public page desktop/mobile, no overflow or browser errors; staging active website HTTP503 + Retry-After; persistence validation/recovery checks; API guard checks; unauthorized settings POST401; protected page307; production maintenance OFF, homepage200, API catalog200. Authenticated admin visual/save interaction not exercised: no existing authenticated browser session available.
Backup: C:/Sites/axiom-maintenance-backup-20261018.

## Native admin panels correction (2026-10-18)
Admin panels now mount inside the native /dashboard content area, preserving its header/sidebar and original React-owned children. Canonical URLs /dashboard?admin=api-sales|billing|models|pricing|maintenance; QRIS uses billing#qris. Legacy /manage pages redirect; no iframe or independent admin layout is used in this flow.
Build native assets with node build-native-panels.cjs before next build --webpack. Assets /native-panels.js and .css must stay available during maintenance. All backend admin authentication and CSRF remain unchanged. Admin errors/destructive confirmations use native dialog, pending guard, Escape/focus restoration.
Verified bundle and Next compilation; isolated browser panel/error-dialog mounting and Escape, native DOM restoration; unauthenticated native session redirects login; live legacy redirects and public bundle delivery. Authenticated production panel rendering/save not exercised because browser admin session unavailable. Fixture was isolated; no production auth bypass/session was created.
Backup C:/Sites/axiom-native-panels-backup-20261018.

Layout correction: native header now synchronizes Maintenance/Billing/Jual API and restores original title. Official Hugeicons 4.3.5 MIT definitions in lib/admin-icons.mjs. Container focus outline removed only; control focus retained. Dialog explicit fixed inset0 margin:auto overrides native reset. Isolated desktop/mobile measured modal center errors 0px, no horizontal overflow; header controls preserved and original title restored. Production bundle200, protected panels307/login; authenticated live visual unavailable.


---

<a id="dokumen-3"></a>

## Sumber: `dashboard/UPDATES-RELEASE.md`

<!-- source-sha256: 283680fe322f9be8071ea1e2771ee293cb069e2d55508bda7272a42f8968d77c -->

# Legal and customer updates

Homepage model labels hide the leading `ax/` prefix only. Copy ID and model integration links retain exact gateway IDs; pricing-page IDs remain unchanged. Live homepage verified `gpt-6-astra` label and `/docs?model=ax%2Fgpt-6-astra` action.

## Customer quota history — 2026-10-21

Light theme correction: neutral gray canvas (#f5f6f8), white panels/controls, slate text, explicit light success/error tokens, stronger input/button boundaries and visible focus/disabled states. Dark palette and compact navbar unchanged. Measured contrast: muted text 6.34:1 on canvas; control border 3.41:1 on white. Live 1440/390/320 screenshots checked, no horizontal overflow; toggling dark restores #121212.

Global customer navbar correction: MAULA/Oxlyn typography remains across customer dashboards. Removed unrequested primary header links, balance action and mobile bottom tabs. Header is centered, capped at 760px desktop / 520px mobile and 56px high; existing sidebar/hamburger navigation retained. Admin unchanged. Live 1440/390/320 checks passed: no extra navigation groups, no horizontal overflow, mobile menu opens and Escape closes it. Production webpack build passes.

History navigation correction: removed both content links to `/account/keys`. Empty state and refresh stay on `/account/quota-history`; verified on live mobile and desktop. Sidebar retains its separate explicit key-management entry.

Added `/account/quota-history` and authenticated `/customer-api/quota-history?page=N`. SQLite `axiom_quota_history` triggers snapshot exhaustion transitions atomically, preserve history after refill/deletion, and capture renewed exhaustion without duplicate rows for ongoing exhaustion. Existing exhausted keys are seeded with unknown exhaustion time. Customer checkout ownership scopes every query; only four key characters are returned. Deployment must run `installQuotaHistory(routerDb())` before accepting new quota writes.

Reference-derived styling is scoped to quota history and its dashboard frame: MAULA Google Sans content, Geist navigation from MAULA/Oxlyn, charcoal/gold palette, floating rounded navigation and panels. Other dashboard pages remain unchanged. Source fonts reused locally; light/dark, 1440/390/320 widths, pagination, keyboard menu dismissal and reduced motion checked in Chromium. Live isolated customer verified empty state, 26 exhaustion events retained after refill, pagination, no secret disclosure, invalid page 400 and anonymous 401. `node lib/customer-quota-history.check.mjs` passes transition, seed, deletion, pagination and isolation checks; Next production build passes. No existing customer balance or package changed. Backup build: `C:\Sites\axiom-before-quota-history`.

## Dashboard rollback — 2026-10-20

User rejected the visual analytics redesign. Restored production source and complete build from `C:\Sites\axiom-before-20261020-visual-1792468824330`, restored local source, and removed the added Analytics component/styles. AxiomAi restarted successfully; private environment unchanged. No database, balance, billing, or usage-history changes.


Routes: /terms, /privacy, /changelog, /account/updates, /manage/announcements. APIs: /site-api/announcements (public), /account-api/announcements (customer), /manage-api/announcements (admin).

Featured banner and four-entry timeline appear only in customer overview. Homepage has a formal product/resources/legal footer, not an announcement panel.

Data: existing SQLite axiom_notices joined to additive axiom_announcement_details. Legacy notices are not automatically made public without verified publication metadata. Admin creates draft then publishes. Future/expired/draft records are excluded server-side; customer audience excluded publicly. Optional API delivery defaults off and requires public audience and ASCII title/summary for gateway compatibility. Existing billing/inference behavior remains unchanged.

Legal source: lib/legal-content.mjs. Owner confirmation required for identity/contact, effective date, applicable law, retention/backups, subprocessors/transfers, age policy, refunds, content rights, liability, closure/appeals and change notices. Pages explicitly identify unconfirmed terms.

Files: app/page.jsx; app/account/page.jsx; app/account/updates/page.jsx; app/changelog/page.jsx; app/terms/page.jsx; app/privacy/page.jsx; app/manage/announcements/page.jsx; app/components/Updates.jsx, updates.module.css, LegalDocument.jsx, LegalDocument.module.css, CustomerShell.jsx, DashboardShell.jsx; lib/announcements.mjs, legal-content.mjs, admin-navigation.mjs; app/account-api/[...path]/route.js; app/manage-api/[...path]/route.js; app/site-api/announcements/route.js; proxy.js; announcements-check.mjs; Caddy ai.caddy.

Verification: node announcements-check.mjs passes draft/audience isolation, scheduling/expiry, API opt-in, validation, atomic rollback. Next build --webpack exit 0. No lint script configured. Live public routes/feed 200; anonymous customer/admin feeds 401. Chromium desktop/mobile legal, changelog and corrected homepage footer checked. Browser-only fixture tested filtering, safe expanded script text and session dismissal. No fixture content was published. Authenticated admin CRUD and populated customer dashboard have not been verified with a real session.

Deployment: existing Node24/dependencies, no new packages. Build separate stage using node node_modules/next/dist/bin/next build --webpack; preserve private environment. Back up source/build/Caddy, stop AxiomAi for coherent .next replacement, restart, validate/reload Caddy. Database extension is idempotent. Backups: C:\Sites\axiom-before-updates-20261018-124502 and C:\Sites\axiom-before-footer-20261018-125135.

## Indonesian legal revision

Expanded original Indonesian Terms to 23 sections and Privacy to 24 sections, with article-level references to UUD 1945, Indonesian contract law, UU PDP, amended UU ITE, PP 71/2019 and UUPK. Effective upon official publication, without retroactive transaction changes. Unknown operator/contact/provider/retention facts remain explicit, not invented. Repeated owner-approval prompts removed.

Changed: lib/legal-content.mjs; app/components/LegalDocument.jsx; app/components/LegalDocument.module.css. Also tightened lib/announcements.mjs and admin editor validation for IDs and single-line ASCII API notices; expanded announcements-check.mjs.

Current verification: isolated Next webpack build succeeded and production-mode smoke server started on port 3097. Rewritten /terms and /privacy rendered; privacy anchors all resolve; mobile width 390 has no horizontal overflow. announcements-check.mjs and real customer-auth-check.mjs passed. Existing customer-activity-check.mjs needs --experimental-vm-modules and then fails because its fixture lacks axiom_usage_ledger; no billing logic was changed. No lint script exists.

Deployed to production with final webpack build 5Xk87jkqorCEseqgsxqbN, including fullscreen Escape fix. AxiomAi restarted and Running. Previous build preserved by same-volume rename at C:/Sites/axiom-before-production-1792354561114/.next after a duplicate backup hit ENOSPC; the incomplete duplicate and new build cache were removed. Database and private environment unchanged.

## Customer overview and request logs

Overview moves real featured announcements and four-entry timeline into a right sidebar, stacks on mobile, and removes the four statistic cards requested by the owner. Existing activity/composition/tools remain. Files: app/account/page.jsx, overview.css, app/components/Updates.jsx, updates.module.css.

Request logs now show a customer-scoped SVG flow plus recent-record panel, selected path highlighting, zoom/reset/fullscreen with Escape exit, opt-in visible-tab refresh, existing filters/pagination and billing details. Data remains the existing customer logs API; snapshot rows are not advertised as live packets or unique requests. Files: app/account/logs/page.jsx, LogFlow.jsx, logs.module.css, log-flow.mjs, log-flow.check.mjs.

Verification: webpack production build succeeds; node app/account/logs/log-flow.check.mjs, node lib/customer-logs.check.mjs and node announcements-check.mjs pass. Browser fixtures (not production announcements/accounts) exercised populated overview/logs, sidebar composition, removal of four-stat strip, dismiss persistence, selected log, zoom, model-filter query, manual refresh and mobile no-overflow. Native fullscreen Escape defect found and fixed; post-fix dev smoke confirms fullscreen exits. Legal renders 23/24 sections plus reference section, all privacy anchors valid. Authenticated populated production dashboard/admin CRUD not exercised. Rebuild staging after the final one-line Escape fix before deployment.

Production verification: /terms renders 23 content sections plus references; /privacy renders 24 plus references; public JS asset returns 200. /account, /account/logs, /changelog and public announcement feed return 200. Anonymous customer logs and announcement APIs return 401; /account/logs redirects to login. Populated production customer/admin sessions were not exercised. Rollback: stop AxiomAi, preserve current .next, restore backup .next, start AxiomAi.

## Layout refinement deployed

Production build YWA1acND1BjuyCZ6_af50: request-log workspace uses dashboard theme variables, borderless filter/detail sections, larger 560–840px desktop graph, responsive mobile layout. Overview right panel now uses raised AXIOM artwork, separated heading/description/full-width CTA and larger timeline spacing. Token composition and remaining quota are inside the activity-chart panel, not a separate card; input/output composition is not mislabeled remaining quota.

Desktop browser smoke measured 735px log canvas and zero .dash-card wrappers; mobile width 390 had no overflow. Browser screenshot verified combined graph/token panel and reference-style sidebar using isolated fixture data. Final webpack build succeeded; production /account, /account/logs and /terms return 200; anonymous overview API returns 401. Served account JS includes the combined token component. AxiomAi Running. Rollback build: C:/Sites/axiom-before-overview-polish-1792355131809/.next.

## Mobile, registration acknowledgement and SEO

Deployed build qP1fyU2D-C9tVR17P57vs. Concise account/log descriptions; secondary usage explanation collapsed. Public mobile rules isolated in public-mobile.css; customer mobile rules moved to customer-dashboard-mobile.css with touch controls, tablet sizing and fixed navigation drawer. Homepage client moved to Home.jsx so page.jsx provides server metadata. Public titles/descriptions, canonical, OpenGraph/Twitter, factual WebSite JSON-LD, public-only sitemap and robots are included; private application routes send noindex,nofollow. Caddy routes robots.txt/sitemap.xml to the website. Search ranking is not guaranteed.

Registration requires unchecked legalAccepted checkbox with Terms/Privacy links and server boolean validation. Additive nullable bridge_customers.legal_accepted_at and legal_document_version columns applied without backfill. Accepted timestamp/version written by server. Existing accounts unaffected. Migration definition: deploy/customer-accounts.sql.

Verification: final webpack build passes; real customer-auth-check against release server passes missing/false/malformed consent rejection, durable server acceptance, auth/session/CSRF isolation. Browser 390px homepage + menu, registration checkbox and customer log/menu verified without overflow. Production homepage/robots/sitemap/register/logs return 200; private noindex header and rendered consent verified. Backup: C:/Sites/axiom-before-mobile-1792355621798/.next. Deployment preserves database except additive acceptance columns; no billing changes.

## Changelog articles and Hugeicons

Deployed build jzdself2ETjJBV08dLGyj. /changelog now renders monthly editorial listings with search/category filters; /changelog/[slug] provides safe Markdown articles, reading time, canonical metadata and related public updates. Public dashboard announcements link to articles; customer-only announcements remain behind login. Dynamic sitemap includes published public articles; Caddy routes nested changelog paths.

Published eight factual release announcements using idempotent deploy/publish-product-updates.mjs, API delivery disabled. Content covers legal documents, overview, request logs, mobile, signup acknowledgement, SEO, article center and icons/theme. Timestamps are actual publication time, not invented historical release dates.

Added @hugeicons/react 1.1.10 and @hugeicons/core-free-icons 4.3.5. Customer navigation and overview cards use visible SVG icons, including mobile. Moon trigger exposes accessible light/dark/system picker with existing preference persistence. Browser mobile screenshot confirmed 20px navigation icons and zero overflow; theme selection and article detail exercised. Webpack build, announcement checks and public HTTP article/filter/canonical/sitemap checks pass (8 articles in production). Backup: C:/Sites/axiom-before-changelog-1792356085986/.next.

## Markdown formatting and direct theme toggle

Deployed build 2Zl-xgRXS2a_rNbU-rLbK. Shared AnnouncementContent renders safe GFM Markdown in public articles and /account/updates: headings, emphasis, lists, task lists, quotes, code, tables, links and Unicode symbols. Raw HTML skipped; remote images not embedded. Admin help documents supported formatting. Removed obsolete source-text theme test.

Moon control now directly toggles light/dark with no menu, border or background; keyboard focus outline remains for accessibility. Existing system preference is respected until explicitly toggled. Browser smoke confirmed tables/bold/checked task and no script in account updates, plus both theme transitions. Production verified transparent background, 0px border, no dropdown and /account/updates 200. Backup: C:/Sites/axiom-before-format-1792356485684/.next. Disk-pressure build failures resolved by removing generated caches and obsolete assistant staging builds only; production/rollback builds preserved.

Typography refinement deployed: shared article/account updates headings 26/21/17px versus 15px body; mobile 23/19/16px versus 14px body. Unordered lists use 5px circular markers; ordered lists and task checkboxes retain their semantics. Build and browser computed-size verification passed. Previous runtime: C:/Sites/axiom-before-typography-1792356708835/.next.

## Shared loading and empty usage

Customer and public loading surfaces use `app/components/Skeleton` (default export; `rows`, optional `variant` and accessible `label`). Shimmer inherits foreground color for light/dark themes, has no card wrapper, and stops under reduced-motion preferences. Loaded empty account activity keeps a zero chart; empty request logs keep table headers without explanatory empty-state prose or a loading placeholder. Existing errors, retry controls, payment action labels, and backend state transitions remain intact. Build and browser verification delegated to the integration owner.

Deployed build A7FOaw5jabNxQ-bEwUo3Q with redesigned billing and API-key pages. Flat balance/package overview, responsive transaction rows, compact key status/quota/permission controls and Hugeicons. Existing topup/purchase uncertainty guards, reveal/copy/rename/revoke handlers retained. Build, key-state and log-isolation checks passed. Browser fixture smoke at390px verified billing/topup dialog, key masking, no overflow and loaded-empty logs without prose. Production public/account routes200, anonymous key API401. No real payment or revoke performed. Backup: C:/Sites/axiom-before-shimmer-1792357186177/.next.

## Complete documentation release

Deployed build 1AU_Q9tIDxARCCD3-_aBP. Expanded seven existing API/integration topics, added streaming/capabilities and eight account/service guides (17 topics total). Actual runtime contracts checked for quota pricing, model restrictions, errors, billing, sessions, key lifecycle, logs, client setup, playground, legal and health. Provider-specific capabilities remain conditional; Codex generated-profile limitation disclosed. Files: app/docs/Docs.jsx, ApiGuides.jsx, CustomerGuides.jsx, customer-topics.mjs, topics.mjs, page.jsx, docs-check.mjs. Dynamic sidebar/search/TOC/sitemap cover all topics.

Webpack build and all docs HTTP/catalog/unknown-route checks passed on staging and production; initial immediate post-restart request was502, subsequent readiness check passed. Browser billing guide anchors valid, 390px screenshot no overflow. No paid model inference invoked. Rollback: C:/Sites/axiom-before-docs-1792357731837/.next.

Maintenance/register/header release deployed. Maintenance now checks status every30seconds while visible, manual refresh without navigation, request timeout/no overlap, actual enabled state, WIB estimate and stale/error notice; no production maintenance activation performed. Registration-only compact form/benefits layout and show/hide password preserve required acknowledgement/auth flow. Header moon/plus controls measured equal44px height/top; SVG plus replaces text glyph. Moon hover/pressed rotation/scale respects reduced motion and remains borderless/transparent. Final webpack build exit0; browser mobile registration/password/consent and maintenance rendered; production three routes200. Backup C:/Sites/axiom-before-maint-register-1792358562297/.next. Maintenance persistence check passed; router check requires script argument and was not exercised. Staging-only webpack cache disabled due disk pressure; production config unchanged.

## AX shim recovery and maintenance identity (2026-10-19)

AX endpoint remains loopback 127.0.0.1:8182. Existing SYSTEM startup task `ax-shim` had exited with result 1 and no next run; recovery now uses 999 one-minute retries, StartWhenAvailable, no execution timeout, and the pinned AxiomRuntime Node24 executable. Task configuration changed without starting it.

AX credentials retain the caller API key for the internal router hop instead of substituting the discovery key. Shim validates active/unexpired keys before forwarding; router authentication, account binding and maintenance guard still apply. Maintenance exemption remains exclusively active, unexpired Default Key ID 8a2d3170-4eee-40bf-ba95-e7bcdfca4be1, including ax-prefixed models; no arbitrary-key or loopback exemption added. Discovery continues using its dedicated key.

Deployment: restart `AxiomRouter`, then `Start-ScheduledTask -TaskName ax-shim`. Run `node C:/Models/ax-shim/auth.test.cjs`, `node C:/Models/ax-shim/stream-error.test.cjs`, and `node C:/Sites/axiom-ai/maintenance-router-check.cjs "C:/Program Files/AxiomRuntime/node-v24.21.0-win-x64/node_modules/allxd9router/app/custom-server.js"`. These isolated regressions do not toggle live maintenance or expose keys. Confirm shim `/health` and authenticated AX completion after startup. Checks not run during editing.

Nested AX hops now carry a dedicated internal proof checked against the loopback socket and absence of proxy provenance, then removed before downstream handling. Request-local scope skips inner ledger/history and duplicate caller quota; outer request owns billing, while inner provider-account quota and authentication remain enforced. `auth.test.cjs` covers the actual shim caller forwarding through the isolated maintenance guard, forged-hop rejection, and one outer versus zero inner ledger writes. No live maintenance configuration is changed.


---

<a id="dokumen-4"></a>

## Sumber: `dashboard/claude_style_announcement.md`

<!-- source-sha256: 29b33192de3f081f46126c536a869951896940df7dbae8de7f00c719711b2980 -->

**Terbaru.** Dirilis 19 Oktober 2026.

Untuk penalaran komputasi tingkat tinggi, arsitektur software kompleks, dan otomatisasi agen coding skala besar.

**Model Identifier:** `ax/gpt-6-astra` · `cbcn/glm-5.3-flash` · `cbcn/deepseek-v4.1-flash`

**Parameter Utama:** Kapasitas Konteks: **1M token** · Max Output: **128K token** · Tarif Input: **Rp 5.000 / MTok** · Tarif Output: **Rp 10.000 / MTok** (Tier ASTRA — 15x Token Debit)

---

## Overview

Pembaruan infrastruktur gateway AXIOM AI merilis integrasi penuh model-model reasoning dan coding generasi terbaru dari **CodeBuddy CN Series** serta pengenalan skema penetapan tarif khusus untuk model flagship **GPT-6 Astra**. Seluruh model terhubung dapat diakses secara terpadu melalui endpoint kompatibel OpenAI (`https://ai.axiomcreative.xyz/v1/chat/completions`) dengan dukungan fitur reasoning adaptif, multimodal vision, dan tool calling.

Tiga perubahan mendasar yang berlaku pada rilis ini:
1. **Tier Khusus ASTRA (Konsumsi Kuota 15x):** Model `ax/gpt-6-astra` dan `cx/gpt-6-astra` ditetapkan pada tier `ASTRA` dengan tarif Rp 5.000 (input) dan Rp 10.000 (output) per 1 Juta token. Setiap 2.000 raw token (1.000 prompt + 1.000 completion) mendebit saldo kuota sebanyak **30.000 token** (15x multiplier) secara merata untuk akun paket maupun non-paket.
2. **Katalog CodeBuddy CN Generasi Baru:** Tersedia 6 varian model mutakhir termasuk `cbcn/glm-5.3-flash` dan `cbcn/deepseek-v4.1-flash` dengan tarif hemat (Tier LOW_COST: Rp 120 / Rp 240) dan buffer konteks hingga 1 Juta token.
3. **Peningkatan Stabilitas Gateway (Eliminasi Error 524):** Restrukturisasi antrean loopback asinkron internal pada proxy jembatan `ax-shim`, meniadakan potensi deadlock timeout 524 Cloudflare dan otomatis membersihkan parameter `reasoning_effort` pada model yang belum mendukungnya.

---

## How it compares (Perbandingan Model)

| Model | Model ID | Konteks | Max Output | Tarif / 1M Token (IDR) | Bobot Kuota | Thinking / Fitur | Rekomendasi Penggunaan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GPT-6 Astra** *(Flagship)* | `ax/gpt-6-astra` | 1.050K (1M) | 65K | Rp 5.000 / Rp 10.000 | **15x (Ultra Boros)** | Hybrid Reasoning (Always on) | Arsitektur software rumit, riset logika mendalam |
| **GLM-5.3 Flash** *(New)* | `cbcn/glm-5.3-flash` | 1.000K (1M) | 131K | Rp 120 / Rp 240 | **0.6x (Hemat)** | Fast Thinking + Multimodal | Chatbot respons instan, agen otonom real-time |
| **DeepSeek V4.1 Flash** *(New)* | `cbcn/deepseek-v4.1-flash` | 393K | 128K | Rp 120 / Rp 240 | **0.6x (Hemat)** | Ultra-fast Code | Coding harian, automated tests, refactoring |
| **GLM-5.2** | `cbcn/glm-5.2` | 1.000K (1M) | 131K | Rp 350 / Rp 550 | **1.0x (Standar)** | Reasoning + Vision + Tools | Pemecahan logika umum & asistensi programmer |
| **Kimi K3** *(New)* | `cbcn/kimi-k3-1` | 1.048K (1M) | 262K | Rp 350 / Rp 550 | **1.0x (Standar)** | Extreme Context Buffer | Pembacaan basis kode monorepo besar & berkas masif |
| **Qwen 3.8 27B Local** | `axl/qwen3.8-27b-hc-aggressive-q3` | 131K | 16K | Rp 700 / Rp 1.000 | **1.4x - 2.0x (Tinggi)** | On-Premise Llama-server | Pemrosesan internal data sensitif & zero-latency |

---

## Specifications (Spesifikasi Teknis)

### Model IDs

| Platform / Kategori Akses | Model Identifier |
| :--- | :--- |
| **Gateway AXIOM (Rekomendasi)** | `ax/gpt-6-astra` · `ax/glm-5.3-flash` · `ax/deepseek-v4.1-flash` |
| **OpenAI Compatible Client (cURL / Python / Node)** | `ax/gpt-6-astra` *(Header `Authorization: Bearer <API_KEY>`)* |
| **Direct Codex Node** | `cx/gpt-6-astra` |
| **Direct CodeBuddy CN Node** | `cbcn/glm-5.3` · `cbcn/glm-5.3-flash` · `cbcn/deepseek-v4.1-flash` · `cbcn/kimi-k3-1` |
| **Local On-Premise (Llama-server)** | `axl/qwen3.8-27b-hc-aggressive-q3` |

### Pricing (Tabel Skema Harga IDR)

| Kelas / Tier | Tarif Input (per 1M) | Tarif Output (per 1M) | Bobot Pemotongan Kuota | Keterangan Model |
| :--- | :--- | :--- | :--- | :--- |
| **ASTRA** | **Rp 5.000** | **Rp 10.000** | **15x Multiplier** | `ax/gpt-6-astra`, `cx/gpt-6-astra` *(Penalaran komputasi tinggi)* |
| **HIGH_END** | Rp 700 | Rp 1.000 | 1.4x - 2.0x Multiplier | Model lokal on-premise & Atria Dawn |
| **MID_RANGE** | Rp 350 | Rp 550 | 1.0x Multiplier (Base) | GLM-5.2, Kimi K3, MiniMax M3, Hy4-Preview |
| **LOW_COST** | Rp 120 | Rp 240 | 0.6x Multiplier (Hemat) | GLM-5.3 Flash, DeepSeek-V4.1 Flash, GLM-5v Turbo |

*Formula Pemotongan Kuota:*
$$\text{Debit Token} = \left(\frac{\text{Input} \times \text{Tarif Input} + \text{Output} \times \text{Tarif Output}}{1.000.000}\right) \times \left(\frac{\text{Token Paket}}{\text{Harga Paket}}\right)$$
*Pada paket Starter (20M token seharga Rp 10.000), 2.000 raw token Astra (1.000 prompt + 1.000 completion = Rp 15) mendebit tepat 30.000 token kuota (15x lipat).*

### Capabilities (Kapabilitas Teknis)

| Fitur | Model Flagship Astra (`ax/gpt-6-astra`) | Model Flash (`cbcn/glm-5.3-flash`) |
| :--- | :--- | :--- |
| **Kapasitas Konteks (Context window)** | 1.050.000 token (1M) | 1.000.000 token (1M) |
| **Maksimum Output Respons** | 65.536 token | 131.072 token |
| **Dukungan Penalaran (Thinking)** | Hybrid Reasoning adaptif *(always on)* | Fast Thinking adaptif |
| **Modalitas Input → Output** | Teks, Gambar, PDF, Code → Teks & Kode | Teks, Gambar, Video, Code → Teks & Kode |
| **Pemanggilan Alat (Tools / Function Calling)** | Ya *(OpenAI Function Calling schema)* | Ya *(Native Function Calling schema)* |
| **Streaming Response** | Ya *(Server-Sent Events / SSE)* | Ya *(Server-Sent Events / SSE)* |

---

## Good to know (Catatan Penting Penggunaan)

- **Kebijakan 15x Debit Token Astra:** Model Astra dialokasikan untuk pemecahan masalah dengan tingkat kesulitan tertinggi. Konsumsi kuota terbobot 15x berlaku otomatis baik untuk API key paket maupun kuota kunci mandiri (non-paket).
- **Sanitasi Parameter Otomatis:** Gateway otomatis menyaring dan menghapus parameter `reasoning_effort` pada model upstream yang belum mendukungnya, mencegah galat HTTP 400.
- **Bebas Timeout 524 Cloudflare:** Antrean jembatan proxy loopback `ax-shim` telah diisolasi dari antrean publik, memastikan pemanggilan model alias `ax/*` merespons instan tanpa risiko deadlock.
- **Endpoint Terpadu:** Seluruh model dapat dipanggil langsung menggunakan library standar OpenAI (`openai` di Python/Node.js) cukup dengan menetapkan `base_url="https://ai.axiomcreative.xyz/v1"`.

---

## Contoh Integrasi API (Quickstart)

```bash
curl -X POST https://ai.axiomcreative.xyz/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_AXIOM_API_KEY" \\
  -d '{
    "model": "ax/gpt-6-astra",
    "messages": [
      { "role": "system", "content": "You are a senior systems architect." },
      { "role": "user", "content": "Rancang arsitektur microservices terdistribusi dengan toleransi kegagalan tinggi." }
    ],
    "temperature": 0.7
  }'
```


---

<a id="dokumen-5"></a>

## Sumber: `web/README.md`

<!-- source-sha256: d02b021993e907f8e8010e38fe95d9c8ed99cdf87f7ca6a65b568c9ded9c06d6 -->

# Axiom Creative web

Next.js 16.3.8 App Router, React 19.3.0, Node.js 24.21.0 LTS. Coming Soon and server health are React pages, not an embedded static site. Both development and production builds use Turbopack explicitly.

## Routes

- `/`: Coming Soon, transmission dialog, motion preference and copy address.
- `/health`: FiveM and Cfx status, server-rendered initial snapshot with 30-second refresh while the tab is visible and online.
- `/api/health`: JSON snapshot; no browser cache, 30-second server cache with in-flight request sharing.
- `/healthz`: Next application liveness only; `{ "status": "ok" }` does not mean FiveM is online.

## Development and checks

```powershell
npm ci
npm run dev
# Separate terminal, when needed:
npm test
npm run build
npm start
```

`dev` is `next dev --turbopack`; `build` is `next build --turbopack`. Production runs `next start`, not the development server. Both bind loopback. No application secrets are required.

## Status sources and limitations

FiveM uses `FIVEM_BASE_URL` from `.env.production.local` (default `http://127.0.0.1:30120`) and checks `/info.json` plus `/dynamic.json`. The target can only be changed server-side, never by URL query parameters. The current VPS has no running FXServer: Offline with unavailable counts is expected, not a website failure. Configure a different actual connect endpoint if FiveM moves.

- Both probes validate response shapes and player-count bounds. Missing data is `null`, not zero. Partial responses are degraded; unknown responses are not healthy.
- HTTP latency is measured from the VPS, not a player's in-game ping. Successful HTTP probes do not verify UDP gameplay or admission.
- FiveM public output excludes player identities, server variables, resources, internal endpoints and error stacks.
- Cfx data comes from the current official `https://support.rockstargames.com/servicestatus`, to which `status.cfx.re` redirects. The retired Statuspage JSON route is not used.
- `parse5` extracts only the explicit Cfx section and five recognized components: Authentication, FiveM, RedM, Community Servers, Marketplace. Missing, duplicate or unfamiliar structure/labels become Unknown. If Rockstar changes its markup, update the parser against the current source; never assume HTTP 200 means healthy.
- The official page does not provide a separate incident list or trustworthy per-service update timestamp. `incidentsAvailable: false` and `updatedAt: null` preserve that distinction.
- Upstream fetches have a 5-second deadline, reject redirects and cap response bodies (512 KiB info, 32 KiB dynamic, 2 MiB Cfx HTML).
- Refresh errors retain the last snapshot with a stale warning. No invented uptime, historical charts, player totals or opening date.
- Health cards and Cfx component rows use segmented battery-style indicators: green online/operational, red offline/outage, amber degraded/maintenance, gray unknown or stale. Segments encode a categorical snapshot, not a percentage, player capacity or uptime history. Text labels remain available independently of color.

## Windows production deployment

Application: `C:\Sites\axiom-web`.
Runtime: `C:\Program Files\AxiomRuntime\node-v24.21.0-win-x64`.
Service: `AxiomWeb`, automatic start and restart recovery, runs as `NT AUTHORITY\LocalService`.
Wrapper/config/logs: `C:\ProgramData\AxiomWeb` (WinSW 2.12.0).
Caddy config: `C:\ProgramData\Caddy\Caddyfile`, reverse-proxies only to `127.0.0.1:3000`. Port 3000 has no public listener/firewall opening. Caddy's admin API remains `127.0.0.1:2019`. HTTPS and `www` canonical redirects remain managed by Caddy.

Service definitions and Caddy template are in `deploy/`. LocalService has read access to source/runtime and write access only to Next build runtime data and service logs. Never grant it Administrator.

For an update, use an elevated PowerShell, keep a verified backup, and plan the brief service downtime:

```powershell
$bin = 'C:\Program Files\AxiomRuntime\node-v24.21.0-win-x64'
$env:Path = "$bin;$env:Path"
$env:NEXT_TELEMETRY_DISABLED = '1'
Set-Location C:\Sites\axiom-web
Stop-Service AxiomWeb
# Deploy reviewed source here, preserving .env.production.local.
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed; restore backup' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Checks failed; restore backup' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed; restore backup' }
Start-Service AxiomWeb
Invoke-RestMethod http://127.0.0.1:3000/healthz
Invoke-RestMethod https://axiomcreative.xyz/api/health
```

Do not reload Caddy for a source-only release. If changing `deploy/Caddyfile`, validate it before copying and reloading the active configuration.

Original pre-Next rollback files are outside the served tree: `C:\ProgramData\AxiomWeb\before-next-20261002-141800`. To restore the old static site, restore its `index.html` to `C:\Sites\axiomcreative`, restore that backup Caddyfile, validate/reload Caddy, then stop AxiomWeb. Do not expose the backup directory publicly.

## Verified deployment

Production `next build --turbopack` succeeded on Windows, both built-in Node regression checks passed, and the production service returned real local FiveM Offline and canonical Cfx operational components. Public HTTPS homepage/health/API, mobile 320/390px layout, dialog focus/Escape, clipboard, refresh/polling, stale data on network failure, offline/resume and reduced motion were exercised. Cfx/FiveM states may change after these checks.


---

<a id="dokumen-6"></a>

## Sumber: `chat-source/DESKTOP.md`

<!-- source-sha256: f7f7faf8e618f873ce454c4337e9bc07c53e912340cfb265cb3251d27f5d0a0c -->

# SuperGPT desktop UI

## Active experience

The default route opens the newer desktop interface. ChatGPT and Codex are presentation choices in the sidebar selector, not authenticated account tiers or provider/model restrictions. The earlier classic Personal implementation is retained under `src/personal/` but is not reachable through the active shell, including `?view=personal`. The older mobile study remains available at `?mobile=1`.

ChatGPT has distinct Chat/Work presentations. Work uses a stacked composer with project/files/plugins actions. Chat uses the single-row capsule from the reference, the heading "Where should we begin?", an effort-only label and a temporary-chat toggle. The toggle skips local history persistence for that temporary Chat session; it does not configure a remote provider. Codex starts with its own mark, build prompt, bottom composer and project/computer context bar. Switching experiences preserves the active conversation and draft, restoring the destination's last view when one exists; only New chat resets to a home screen. Existing saved local conversations remain available from the sidebar; fresh installs start with empty history.

## Development

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
npm run build
```

The current desktop composition follows a 1920px-wide reference canvas scaled to the browser viewport. Native mobile layouts and packaging require separate work; the desktop reference is not a completed Android/iOS build.

## Local interactions

- Experience selector with descriptions, current selection and keyboard navigation.
- Collapsible Projects/Recents and independently scrolling history with hover previews. ChatGPT rows expose dots + pin; Codex rows expose pin + archive. Open conversation menus are dismissed when switching experiences.
- Navigation pinning from More, saved on this device.
- Tooltips with shortcut labels, anchored in the scaled interface.
- Conversation markers based on user turns, smooth jumps and a scroll-to-latest button.
- Message copy, local editing, hover timestamps and browser-dependent read aloud.
- Full-width Add menu anchored to the composer; file previews, local selection chips and a sketch canvas.
- Local project names and text conversations saved in localStorage.
- Search palette with chat/content filtering, quick actions and navigation; arrows, Enter, Escape and Alt+1 through Alt+9 selection.
- Sidebar collapse preserves scroll position and folded sections; Pinned is available in both experiences.
- Local Back/Forward history and a sliding Chat/Work selection indicator, with reduced-motion support.
- Shared grid composer motion, retained animated sidebar sections and preview cards that stay mounted while changing hover targets. Motion helpers live in `src/desktop/Motion.tsx` and `motion.css`.
- Custom Endpoint settings from Profile/Settings, More and the search palette: add/edit/delete/select profiles, manually choose a model or explicitly fetch `/models`. Metadata persists locally; API keys are session-scoped and never included in persistent profile JSON.

Ctrl+Shift+S toggles the sidebar, Ctrl+N or Ctrl+Shift+O starts a new local conversation, Ctrl+K toggles search, Alt+Left/Right traverses local navigation, and Ctrl+Shift+J opens a temporary Chat session when the browser delivers those shortcuts. Browser-reserved shortcuts may take precedence. Settings and Ctrl+, open General in the searchable Settings page; external integrations in the search palette show their missing prerequisites explicitly. Open folder uses the existing local project chooser.

## First launch and profile

The newer desktop UI requires a local display name on first launch, then offers the existing endpoint editor as an optional second step. Skipping preserves any saved endpoint metadata and session credentials. The form can be revisited through Profile / Custom Endpoint. No automatic connection test is performed. The local name persists under `client-local-profile-v1`; it updates avatar initials and the editable profile menu name, replacing the reference's hardcoded identity. This is not account authentication or cross-device identity.

Setup uses a full-page dark authentication-style presentation outside the scaled desktop canvas: a centered narrow column, rounded outline inputs, pill buttons and a persistent independent Sakelar wordmark. Its name column is 340 CSS px wide and the connection column is 410 CSS px, matching the supplied reference's proportions at 150% display scale rather than treating screenshot pixels as CSS pixels. Name inputs and primary buttons are 52 CSS px high. Widths shrink to fit smaller screens.

Name editing retains its existing responsive dialog. Both use initial focus, Tab containment and hidden/inert inactive steps. The endpoint step first shows a compact connection choice and Skip; activating Custom endpoint reveals the editor and focuses its first field. Kembali collapses it without discarding the draft. Returning to edit the name also retains the endpoint draft. Existing chat state is retained. The rail More menu opens on pointer hover, with a short leave grace while crossing into its panel, and keeps click/touch and keyboard activation. Escape restores focus to its trigger without reopening the panel. Unsupported account actions identify their integration requirements; Invite a coworker is disabled to match the reference.

A recommendation card in setup and endpoint settings links explicitly to `https://sakelar.web.id`; it does not preconfigure a provider or route requests through Sakelar. The startup flow can be reused by future native wrappers, but no APK/EXE packaging is implemented here.

## Functional Settings tabs

The reference recording's settings navigation now has actual pages rather than a shared generic dialog. Appearance, keyboard, dictation/read-aloud, composer behavior, model/effort, prompt personalization, local storage/import/archive and usage reporting are wired to the existing UI/engine. Local agent network/file policies and configured MCP enablement are applied to real runtime sessions. Browser mini chat and local emoji companions are independent client features. See [SETTINGS.md](SETTINGS.md) for the control inventory, privacy, tests and honest native/cloud limitations.

## Endpoint settings theme

Custom Endpoint uses a centered single-column desktop layout with compact saved connections above a flat editor, rounded fields, neutral toggles and pill actions. The Sakelar recommendation is secondary below the form. Model discovery, session-scoped keys and profile add/select/edit/delete keep their existing behavior. Desktop styling is scoped with `.d-endpoint-settings`; onboarding retains its narrow layout.

## Fonts

The default UI and code fonts use the actual OpenAI Apps SDK UI `--font-sans` and `--font-mono` stacks. The SDK supplies platform font fallbacks rather than a proprietary ChatGPT font file. User font preferences remain supported. Assistant text uses the official SDK Markdown/CodeBlock renderer. See [RICH-TEXT.md](RICH-TEXT.md) for sources, integration and verification. Exact appearance depends on platform fonts, DPI and browser rendering.

## Icon and corner geometry

`src/components/UIIcon.tsx` maps 46 shared controls to official MIT-licensed SVG components from [OpenAI Apps SDK UI](https://github.com/openai/apps-sdk-ui), pinned to revision `0f00143c7a639906f1621fe58e1b6be7b5bea46d`. The selected components are copied unchanged under `src/components/openai-icons/`, with source details and license. Filled paths explicitly disable inherited strokes to preserve their original geometry. No global SDK styles or extra runtime dependencies are loaded; existing icon dimensions and layout stay in place.

The previously approved round Plugins symbol is preserved as `public/plugins-symbol.svg` on its original 27px canvas: the upstream Plugin is a different puzzle symbol. Reference-specific controls without matching symbols and third-party logos remain local. `src/desktop/shapes.css` retains the existing rounded controls. The production build includes the OpenAI MIT notice at `/third-party/apps-sdk-ui-LICENSE.txt`.

## Functional limits and verification

AXIOM local Qwen launchers in `C:/Models/llama.cpp/` disable idle sleep (`--sleep-idle-seconds -1`) to avoid multi-minute cold reloads exceeding client timeouts. The 27B runtime uses 16,384 context tokens; 9B uses 32,768 after 20,133-token requests exceeded its previous 16,384 limit. Both public `ax/qwen3.8-27b-hc-aggressive-q3` and `ax/qwen3.5-9b-hc-aggressive-q4` returned HTTP 200 streaming content through the public gateway and completed `[DONE]`. Local short-answer checks returned `OK`. Native macOS interaction and long-prompt generation were not exercised.

Both installed GGUF files declare a 262,144-token training context. A 1,000,000-token context is not enabled or validated: estimated 27B q8 KV storage alone exceeds the server's 32 GiB RAM. A billion-token single response is not supported end-to-end; EOS, context capacity, client timeouts and response-size limits still apply even when the runtime prediction limit is unlimited.

The Codex experience now also has an optional **Agent workspace** connected to an installed Codex app-server in localhost development. It supports custom Responses providers, local command output, file-change/diff views, per-action approvals, stop and read-only planning. See [AGENT-RUNTIME.md](AGENT-RUNTIME.md) for setup, actual test evidence and remaining gaps. See [FEATURE-STATUS.md](FEATURE-STATUS.md) for the functional local collections, attachment bounds, workspace services and remaining integration requirements.

Desktop text chat now calls the selected OpenAI-compatible profile's `/chat/completions`, using its session key and the actual selected model ID. `endpointChat.ts` handles fragmented UTF-8/SSE, JSON fallback and safe errors. Stop aborts the request; retry retains the original user turn; navigation, profile/model changes and logout abort generation and retain partial text in the original conversation. History writes occur at the user turn and completion/cancellation, rather than synchronously on every token. Missing keys/configuration or unsupported attachment types block sending with an actionable error; no demo reply is substituted. Text files and images are resolved from the local IndexedDB library and sent only on Send; provider vision support is required for images. The legacy mobile client remains separate.

`ProviderModelMenu.tsx` lists account key/model groups with search, selected checks and incremental rendering. It remains in the composer; mobile retains its models sheet. There is no separate key/model page, settings tab, or onboarding connection step. The effort popover follows the six-stop reference with a white thumb, dots, lightning/reset controls and a model link. Its values are sent as `reasoning_effort` only when the selected profile supports reasoning; not all models support them.

In localhost development, `scripts/localProviderRelay.mjs` forwards same-origin, loopback-only JSON requests through the Vite process to the configured provider. It does not use a Sakelar relay, save credentials, forward cookies or follow redirects. It enforces request size and timeout limits and limits destination paths to models/chat completions. Vite production builds omit this transport; a static web deployment requires provider CORS or a future explicitly configured native/self-hosted transport. No cloud/backend integration or packaging is included.

`npm run test:providers` covers fragmented SSE, JSON fallback, configured model/auth/effort payloads, safe errors and real local HTTP relay security/forwarding. Additional DOM checks cover provider-derived model selection, streaming/history, retry, stop, navigation cancellation and existing setup/navigation regressions. A public unauthenticated probe confirmed the Sakelar endpoint's OPTIONS preflight returns 401 without CORS headers; the local relay reaches that provider and preserves its unauthenticated 401. A successful paid request with the user's actual key has not been verified.

Production build and read-only server-render smoke checks cover both home variants, disabled classic routing, Add menu, navigation pin labels and user-turn markers. Browser visual QA was blocked by the browser origin permission gate. Pixel identity and exact animation timing are not established. Native window controls are decorative in the browser. The detached header/horizontal-form regression was fixed by scoping legacy mobile `header`/`form` CSS to `.app`; synthetic computed-style tests cover the agent dialog and project form. Official SDK icons do not guarantee that every symbol matches the current ChatGPT desktop application.


---

<a id="dokumen-7"></a>

## Sumber: `chat-source/SETTINGS.md`

<!-- source-sha256: 4b585abd8f4cc9a2c686baee040ee26870fa96cee1d0185372d22f157264ce4d -->

# Functional settings

The supplied three-minute settings recording (`225553`) was inspected locally using sampled video frames. The implementation follows its sidebar/section structure while keeping an independent local client identity. It never copies the recorded person's email, usage balance, account identity or installed services.

Settings now opens a real page with searchable navigation. Ctrl+, opens General. Tabs are loaded on demand so the initial chat bundle does not include the full settings panel.

AXIOM web uses yellow `#ffdf39`, sky blue `#dceeff`, and ink `#101110` accents. Desktop shell scaling is 85% of the reference layout; mobile remains unscaled. Reduced-motion preferences remain respected. Model labels use session catalog names without provider prefixes; requests retain exact model IDs. About displays “Dibuat oleh RAYH4ZE (Raihan Nugroho).” The separate key/model page and all its navigation links are removed; chat retains the composer model/key picker and mobile models sheet. Neither desktop nor mobile sidebar shows Space/Ruang.

| Tab | Functional behavior |
| --- | --- |
| General | Actual agent read-only/workspace access, chosen project folder, close confirmation, dated inactive-chat archiving (pinned chats excluded), suggestions, MCP master switch, send shortcut and browser completion notifications/sound |
| Import | Validated local chat JSON import/export and versioned preferences import/export; existing chats are preserved |
| Profile | Local display-name editing, real saved chat/message counts and activity from recorded message timestamps |
| Appearance | Dark/light/system mode, colors, font and text/code sizes, reduced motion, translucent sidebar, wide pages and optional trailing smart punctuation |
| Account | Actual local identity, provider configuration and logout back to local onboarding; no fabricated authenticated email/plan |
| Archived chats | Search/project filtering, restore and existing delete confirmation |
| Voice | Explicit microphone permission check, dictation language, actual installed speech voices, speaking rate/volume and Play/Stop preview |
| Storage | Browser quota/usage estimate, persistence request, IndexedDB library management/clear confirmation, export/archive and session-key clearing |
| Configuration | Saved provider/model selection, default/visible effort levels, real local sandbox access/network policy and provider-chat timeout |
| Personalization | User instructions, writing style and explicitly saved memory notes used in subsequent model requests; original stored messages remain unchanged |
| Mini & Pets | A genuine compact provider chat window at `?mini=1`, with streaming/stop/history and a local emoji companion that opens a new chat |
| Keyboard shortcuts | Enable/disable, capture/remap with conflict detection, restore defaults; bindings actually drive the application keyboard handler |
| Usage & billing | Progress sisa kuota token dari key yang dipilih dalam composer (key pertama bila belum dipilih); tanpa dropdown, tombol refresh, kartu ringkasan debit/biaya, atau catatan total token terpakai. Nilai tanpa batas tidak digambarkan sebagai persentase. Data dimuat ulang saat key berubah atau chat berhasil. Grafik debit tujuh hari UTC dan rincian permintaan terakhir (termasuk debit dan biaya IDR) berasal dari server; total ledger mencakup penggunaan pasca-cutover. |
| Data controls | Local backup, sandbox network preference, archive/delete-all confirmations, archive management and resetting preferences without deleting providers/history |
| Plugins | Daftar 20 entri aktif dari MCP Registry resmi dan 20 dokumen `SKILL.md` nyata dari repositori `anthropics/skills` di GitHub, di samping konfigurasi lokal tersimpan. Daftar publik hanya untuk dibaca dengan tautan ke sumber; browser AXIOM tidak memasang atau menjalankan plugin/skill. Kegagalan sumber ditampilkan, bukan diganti data contoh. |

## State and request integration

`src/lib/clientSettings.ts` validates versioned preferences under `client-settings-v1`. UI changes persist locally and apply immediately; browser windows receive settings changes through storage events. Appearance uses CSS variables/data attributes. Native agent enablement and Responses confirmation remain explicit per reload.

Instructions and optional user-created memory notes are included in the **next request** to the selected provider. They are not automatically extracted from chat history and do not claim to implement the official Codex memory service. The writing-style preference is added as a request instruction. Neither changes saved original message text. Preferences exports explicitly include these user-written fields; provider API keys are never part of that schema.

MCP enablement filters the actual servers passed to the next private runtime connection. Network access defaults off and is forwarded to the native sandbox policy; Plan-only sandbox commands always disable it. **Gateway requests and explicitly configured MCP server connections are independent from the shell sandbox network switch.** No setting turns on automatic unrestricted approval. File access remains read-only/workspace-write with actual permission requests.

Usage metadata (`client-usage-v1`) stores at most 1,000 entries with provider/model, time, source, status and actual token numbers when supplied. It never stores prompts, answers, keys or fabricated quota/cost estimates. Chat Completions usage is observed only when supplied in JSON/SSE; no unsupported stream-options flag is silently added. Native cumulative token notifications are converted to a delta for each turn. Older chats are not assigned invented token counts. Billing/retention/training policy stays with the provider.

The compact window uses the same selected provider, preferences and session-key mechanism. Its text chats are written to the existing local history; no native desktop sidecar is claimed. Popup permission and browser speech/notification/persistence APIs remain browser-dependent. Removing file blobs makes old attachment contents unavailable for resending; the clear action warns and asks for confirmation.

## Intentional capability boundaries

The recording also shows native startup registration, global OS shortcuts, external editor/shell integration, cloud account sync, account billing/quota, automatic cross-app imports, hosted share links and official pet services. These require an actual desktop host or provider service. This browser client reports their real unavailable/provider-controlled status instead of offering toggles that only save a pretend value. Full filesystem access and silent auto-approval are not exposed. Existing local MCP configuration is available for independent tool integrations.

## Verification

- `npm test`: 53 tests, including settings validation/persistence, prompt augmentation without history mutation, custom shortcuts, punctuation, usage privacy, actual provider usage callbacks, native sandbox network/Plan isolation, per-turn token deltas and provider reasoning streams.
- `npm run test:runtime`: installed Codex runtime executes a harmless local command and local MCP echo through a fake-key loopback Responses gateway. Actual usage notifications also stream through the bridge.
- Synthetic DOM tests exercise every settings tab, stable instruction typing/focus, appearance effects, provider/model/effort, voice selection, shortcut execution, preference persistence, import/archive/restore, destructive-action confirmations, preservation of credentials/history boundaries, and mini chat response/stop/persistence.
- Production build passes. Live browser visual QA remains blocked by the saved origin-access permission; no pixel or native service parity is claimed.


---

<a id="dokumen-8"></a>

## Sumber: `chat-source/src/components/openai-icons/README.md`

<!-- source-sha256: 91bd29f71755040f4d80b75f32e7e491594a45826ca97e21f15f474615244d6d -->

# Official Apps SDK UI icons

Source: https://github.com/openai/apps-sdk-ui
Revision: `0f00143c7a639906f1621fe58e1b6be7b5bea46d` (package version 0.2.2).
Upstream path: `src/components/Icon/svg/`.

The selected React SVG files are copied unchanged. `index.ts` maps the existing
application icon names to them; `UIIcon.tsx` preserves sizes, colors and accessibility.
The SVGs use filled paths, so the wrapper explicitly disables inherited strokes.
No Apps SDK UI global CSS, components or additional runtime dependencies are imported.

Licensed under MIT, copyright 2025 OpenAI. See LICENSE. The same license is shipped
in the production build at `/third-party/apps-sdk-ui-LICENSE.txt`.

Reference-specific symbols without a suitable match (including the approved round
Plugins symbol, approval shield, numbered panels, library, goal, cloud and native
window buttons) remain local. The upstream Plugin is a different puzzle symbol.
Third-party provider logos remain separate. This does not imply OpenAI affiliation.


---

<a id="dokumen-9"></a>

## Sumber: `guard/resource/axiom_guard/README.md`

<!-- source-sha256: b66e11ff3c10d5778e4ed3452b1fcc2ea3277f0223c3f49d5f5caf4eaf94cac7 -->

# Axiom Guard 1.7.1 — server-authoritative security

The FiveM resource owns gameplay policy, connection admission, local bans and Discord logging. Node.js serves the optional dashboard; missing dashboard credentials or transport failure does not disable the Lua backend.

## Layout

- `client/`: 41 individually named detector modules, core/policy/input/transport/loops. Each detector registers its own check and supported mitigation.
- `server/features/`: individually named entity, explosion, weapon, particle, event, money, inventory, statebag, entity-control and sound features.
- `server/storage.lua`, `config.lua`, `admission.lua`, `bans.lua`, `backend.lua`, `webhook.lua`: Lua backend.
- `server/runtime.lua`: native player sessions, enforcement and optional dashboard transport.
- `server/integrations/`: explicitly configured QBCore, ESX, Qbox economy adapters and optional ox_inventory authorization. None is a core dependency.
- `shared/catalog.json`: complete control catalog, defaults, supported actions and unavailable prerequisites. `shared/rules.lua`: policy gates.
- `server/data/`: private persistent two-slot stores. Never list this directory in client/shared `files`; preserve it during updates.

## Dashboard accounts

The Owner creates groups from **Users > Groups > Create group**, then assigns one from **Users > Create user**. Create/Edit opens a focused modal; Cancel closes without saving. Submit validates required fields and matching 8–128-character passwords, prevents duplicate submissions, preserves the draft on API errors, and shows a success notice after refreshing the records. Passwords must be unique because web login uses the password alone. Built-in groups are read-only; account/group management remains Owner-only. Password reset invalidates existing web sessions. Never place web passwords in resources or client configuration.

### FXServer administrator controls

**Server > Resources** gives built-in Owner and Administrator groups native start/stop/restart/ensure/refresh operations. Custom groups with one write permission do not become highest administrators. Each action requires a fresh FXServer session and explicit confirmation, with native before/after receipts. The controller works after stopping axiom_guard; use the external web dashboard to recover. No arbitrary shell/console text endpoint is exposed. txAdmin deliberately erases its token convar, so the fixed `AxiomGuardControl` Windows task refreshes a protected per-boot transport file from FXServer process metadata. Only that fixed helper runs as SYSTEM; Node remains LocalService and can read but not alter the helper/transport directory. `GUARD_TXADMIN_IDENTITY` holds only the master identifier, not administrator passwords. Native console timestamp framing is removed before matching start/refresh receipts. Dependencies may stop transitively; inspect/restart them after deliberate core stops.


## In-game dashboard and auto compact

Run `/axiomguard` in FiveM chat (or `axiomguard` in F8). The server permits the command only for `axiom_guard.dashboard` ACE or a matching configured `Admin identifier list` entry. Verified native administrators enter automatically without a password form. They receive built-in Administrator permissions, not the web Owner account. The server issues a random single-use 30-second ticket through a loopback, ingest-token-authenticated endpoint; the NUI redeems it only from the pinned native origin. The ticket binds the player/server sessions and primary license. The client never receives the web Owner password or ingest token.

```text
set axiom_guard_dashboard_url "https://axiomcreative.xyz/anticheat/"
add_ace group.admin axiom_guard.dashboard allow
```

`Escape` closes the active dialog first, then the navigation drawer, then the dashboard. **Close · Esc** returns input to the game immediately, even when the backend is unreachable. Each reopening obtains a fresh ticket automatically. The NUI uses an in-memory bearer session restricted to `https://cfx-nui-axiom_guard`; no cookie/localStorage token. Disconnect, resource/server session change, expired heartbeat, or lost native administrator permission invalidates access. Failures show status rather than a password fallback. Normal web access still requires an account password. Keep the resource name `axiom_guard` because its CORS origin and native integration names are pinned deliberately.

Auto compact applies at width ≤1100px or height ≤800px; sidebar/spacing/charts shrink without removing controls. Width ≤700px uses the existing drawer; small tables scroll horizontally, dialogs scroll internally. Larger screens return to normal layout automatically. It does not delete or compact logs/data.

Canonical UI source is `public/` in the dashboard project. Run `npm run sync-ui` after UI edits to package the same assets under `resource/axiom_guard/ui/`. The manifest includes only public UI assets. Refresh FiveM resource metadata before restarting after a manifest change. An external `ui_page`/iframe is not used; the live web dashboard retains anti-framing headers. The optional dashboard service must be reachable over HTTPS from the player's PC; Lua anti-cheat continues independently during dashboard outages.


## Installation and policy

OneSync is required. Create `server/data/`, copy the resource, then `ensure axiom_guard`. No framework/database/Node installation is required for the Lua runtime. A new installation defaults to monitor; the approved existing-server migration seeds protect. Run these in the server console:

```text
guard_status
guard_backend status
guard_backend mode protect
guard_backend mode monitor
guard_backend config set "Player max health" 200
guard_backend config json {"Detection settings":{"Anti god mode":{"enabled":true,"action":"cancel"}}}
guard_backend bans
guard_backend unban lua-1
guard_backend whitelist add LICENSE_SUFFIX
guard_selfcheck
```

`Detection settings` replaces its whole object when saved through `config json`. Dashboard edits remain supported. Same/older dashboard config revisions do not overwrite local console changes; a newer dashboard revision does. Changed dashboard base policy is imported independently. Local bans survive dashboard refresh. Dashboard Threats mirrors Lua bans and explicit revocation is synchronized back. Local unban tombstones prevent old dashboard bans reappearing.

Monitor never applies automatic gameplay changes. Protect uses only each rule's declared actions. Boolean control disabled takes precedence over the action. Admin identifier/ACE and coordinate-zone exemptions are computed on the server and sent per player. Client policy leases renew every five seconds; stale or invalid client policy stops mitigation. A client cannot authorize policy by calling its local event.

23 client rules have a local cancellation remedy: god mode variants, health/armour, invisibility, spectate, ragdoll/headshot flags, vision, voice proximity, freecam V3/V5, noclip/fly/super-jump/run-speed/waypoint movement, weapon blacklist, ammo limits/infinite flags and damage multipliers. Movement restoration additionally requires a recent grounded point in the same ped/model/interior; no valid point means observation, not a claimed rollback. Aim/menu/vehicle-attribution heuristics have no invented cancellation action; explicit kick/ban remains an operator policy choice. Client evidence is forgeable or suppressible, not proof of cheating. Missing natives remain diagnostics.

Server engine events cancel synchronously even when evidence is throttled. Sampled entity deletion records a request, not a fabricated completed receipt. Ban storage must verify a durable write before native disconnect. Two alternating checksum-verified JSON slots preserve the previous good copy; restore backups if both are invalid. History is bounded to 2,000 records/20,000 ordinary identities and flushes every five seconds/on stop: an abrupt crash can lose the last unflushed history, not an acknowledged ban/config write.

## Discord webhook

Dashboard **Webhooks** selects automatic connection/disconnection/detection/system categories. The authenticated server-only bridge supplies destinations to Lua. With the Lua capability active, Node does not also send automatic logger events; optional explicit dashboard triggers remain separate.

Without the dashboard, configure a server-only convar (never `setr`/`sets`):

```text
set axiom_guard_webhook "https://discord.com/api/webhooks/ID/TOKEN"
guard_webhook status
guard_webhook categories detection,system
guard_webhook off
guard_webhook retry
```

`guard_webhook set URL categories` also configures a local destination, but console history can retain the secret; the protected server config is preferable. Remove the startup convar if `off` must survive its override on restart. Local destinations and dashboard destinations are separate; dashboard replacement does not erase the local one.

The Lua outbox persists up to 500 deliveries, redacts credentials/identifiers, disables mentions, rejects redirects/noncanonical Discord URLs, retries HTTP 429/network/5xx up to six attempts and retains terminal failures. Dedupe retains 2,048 destination/event keys. Delivery is at-least-once after an ambiguous remote timeout: Discord supplies no idempotency key. Disabling/removing a destination prevents future attempts but cannot recall an HTTP request already sent. No destination means no claimed delivery.

## Standalone integration APIs

Privileged exports accept only a started invoking server resource, never a client net event. Use server-authoritative values. Guard the operation **before** side effects:

```lua
local guard = exports.axiom_guard
if not guard:GuardEvent(source, 'my_resource:purchase') then return end

-- Economy resource: serialize this sequence; do not yield between guard and commit.
if not guard:TrackBalances(source, committed_balances, character_id) then return end
if not guard:GuardBalances(source, proposed_balances, character_id) then return end
-- Commit using the economy resource's own authoritative transaction.
-- After a successful commit:
guard:TrackBalances(source, proposed_balances, character_id)

-- Inventory resource: grant only after its own ownership/permission checks.
if not guard:AuthorizeInventory(source, exact_target_key, 1) then return end
if not guard:GuardInventory(source, exact_target_key) then return end
```

`TrackBalances` reports committed data; it cannot undo a completed transfer. `GuardBalances` requires the same complete account set/identity baseline. Grants are one-use, resource/player-session/target-bound, TTL 0.1–300 seconds. `SetEntityRateLimit(player, limit, windowSeconds, ttlSeconds)` authorizes a temporary per-player entity burst. `ReportDetection` records server integration evidence without granting arbitrary punishment.

### Framework selection

Config > Server Management exposes `Framework integration` = Standalone/QBCore/ESX/Qbox and `Framework money guard` (off by default), plus configurable resource names. Inventory selection is independent: `Inventory integration` = Standalone/ox_inventory, with `Inventory resource`. Standalone installs no framework hooks. Selection changes remove old adapters; missing selected resources appear in `guard_integrations`, never disable core protection. No automatic framework guessing.

```text
guard_backend config json {"Framework integration":"QBCore","Framework money guard":true,"QBCore resource":"qb-core"}
guard_backend config json {"Inventory integration":"ox_inventory","Inventory resource":"ox_inventory"}
guard_integrations
```

For Qbox, the adapter uses official precommit `addMoney`, `removeMoney`, `setMoney` hooks and authoritative postcommit balance tracking. Requires a Qbox release containing those hooks; source: https://github.com/Qbox-project/qbx_core/blob/main/server/player.lua .

ESX uses owner-side player function factories so resource restarts cannot leave dead money callbacks. In the selected ESX resource's `fxmanifest.lua`, add `'@axiom_guard/server/integrations/esx.lua',` to `server_scripts` after `'server/classes/overrides/*.lua',` and before `'server/main.lua',` (after its functions/player classes). Restart ESX during a maintenance window. Then select ESX and enable Framework money guard. Existing sessions need reconnect; status reports protectedPlayers/pendingReconnect/conflictingOverrides instead of claiming coverage. Do not replace other resources' global override selection. Sources: https://github.com/esx-framework/esx_core/blob/main/%5Bcore%5D/es_extended/server/functions.lua and https://github.com/esx-framework/esx_core/blob/main/%5Bcore%5D/es_extended/server/classes/player.lua .


QBCore 1.7 uses an owner-side include `'@axiom_guard/server/integrations/qb_money.lua'` after `server/player.lua`, preserving actual owner methods rather than cross-resource copies. Vehicle callback authorization additionally includes `'@axiom_guard/server/integrations/qb_vehicle.lua'` after `server/events.lua`. Both restore owned wrappers on guard stop. Money proposals check a per-operation limit plus rolling committed positive-gain budget; rejected attempts consume nothing, deductions never refund budget, complete-account atomic transfers remain net-zero. `Money trusted resources` accepts only explicitly audited server payout callers. Direct table/DB/offline mutations remain outside the precommit adapter. Qbox uses its documented native hooks; ESX uses the owner bridge above. ox_inventory authorizes actual server-owned equipped slots before weapon damage/projectile effects.

FiveM has no universal money/inventory/event authorization native. Unintegrated custom resources must call exports; `CancelEvent` alone cannot stop another resource handler's side effects. Known city trigger fixes are applied inside the owning handlers, before inventory, money, world effects or DB writes. Entity provenance absence no longer exempts model/rate checks; only resource-provenance-specific decisions require that evidence.

## Native assembly publication boundary

`guard-integrity.exe` uses GNU Objective-C/Win32 BCrypt SHA-256 plus Windows x64 assembly for digest comparison and bounded public-path policy. `distribution PUBLIC_LIST PRIVATE_LIST` rejects private intersections, server code/secret/backup names, traversal, ADS, device and encoded-alias paths. Literal percent filenames without encoded-byte aliases remain valid. The predeployment list is resolved from manifests/files; the runtime `guard_publication` command exports actual FXServer metadata for `distribution-audit.mjs` and dashboard Integrity reports. Mutable private stores never belong in client packfiles.

Six resource manifests were narrowed; 154 private files no longer belong to public download lists. Seven government webhook assignments moved from shared config into server-only `pemerintah/server_config.lua`; four real formerly published destinations require rotation by their owner. A `.ydr.bak` in stream is quarantined outside resources, not deleted. Caddy private-path probes and Axiom's private resource HTTP endpoint respond `403 YAHA KAMU KENA PRENK`; legitimate `.rpf`, UI and gameplay downloads are unchanged. Direct port30120 remains necessary for FiveM; manifest exclusion, not a proxy slogan, protects server files. Previously downloaded copies cannot be revoked. Client/NUI assets must exist on the player's machine; assembly does not make client memory unreadable. Cfx Asset Escrow is an additional distribution option for supported Lua/model files, requiring the owner's portal workflow; NUI is not supported (https://docs.fivem.net/docs/server-manual/asset-escrow/).

## City trigger cutover

Rewards now use server-issued single-use sessions, minimum progress, identity/bucket/location checks and server catalog prices/counts. Farming/mining/cow/forklift/lumberjack/gathering, drug shops/selling/washing, hacking/CCTV/bollards, robbery and crafting were updated together with their client callers. Client `ax_misc:server:AddXP` is removed; actual server completion uses the AddXP export. Police/medical/mechanic/government handlers validate duty/target/distance/payment before peer effects. Craft queue claims use durable `ax_craft_claims`/`ax_craft_operations`; ambiguous pending awards require manual inventory/bank reconciliation, never blind replay. Native map props without an authoritative coordinate catalog remain bounded claims, not proof of target existence. The development `runcode` resource is intentionally stopped.

Initial money hardening: 1,000,000 positive net gain per 60 seconds, configurable; thresholds are abuse budgets, not proof that every below-budget transaction is legitimate. Standard framework/admin flows remain server-authorized. Checks run in monitor without automatic punishment; protect cancels configured invalid operations. Server platform flags block ScriptHook, phone explosions, networked script entity-state abuse and client replay capture; full strict entity lockdown is not forced on a city with legitimate client spawning.


## External prerequisites still missing

Global ban network, Cfx/Rockstar account creation dates, video rewind, audio relay, private explosion classifier and reliable NUI DevTools blocking are not fabricated. Controls requiring those services remain unavailable with a reason. Provider endpoints, access and documented contracts are needed for the requested private-provider integration. Discord webhook credentials are also required for a real delivery test. VPN checking uses proxycheck.io; optional server-only key: `set axiom_guard_proxycheck_key "KEY"`. Provider failure reports unavailable and does not deny the connection.

## Verification

`lua-standalone.check.py`, `backend-runtime.check.py`, `webhook-runtime.check.py`, `framework-runtime.check.py`, `dashboard-runtime.check.py` require Python3 + `lupa.lua54`; they execute actual modules with isolated native hosts. They cover gameplay state/policy, precommit guards, framework switching, persistence, webhook delivery state, command ACL, ready races and input-focus release. `check.mjs` also covers exact-origin NUI CORS, cookie/bearer separation, CSRF and session revocation. Browser NUI smoke uses the actual dashboard and HTTP backend with a native callback host; it does not prove an attached FiveM client's focus/graphics. Verify `/axiomguard` with a connected player after deployment.

Native auto-login checks: `node nui-auth.check.mjs` covers expiry/replay, identity and native-admin permissions, session revocation and capacity. `dashboard-runtime.check.py` runs actual Lua issuance/client handling with native hosts; `check.mjs` exercises localhost issuance, exact-origin redemption, web/native isolation and eight-character web-password validation. Only `/api/nui-session` is public; `/api/nui-ticket` and `/api/nui-revoke` are blocked by Caddy and require the machine token without proxy/Origin headers.

Production verification: built-in administrator Start/Stop/Restart/Ensure/Refresh exercised through the actual web UI with native completed receipts; protection restored to protect afterward. Native runtime publication audit passed 71,190 public files across 150 resources with zero violations. A previous restart receipt remains unknown as an honest record of the old console-framing parser; later restart/ensure/refresh completed after its fix. Isolated gameplay event tests cover forged rewards/debits/queues/session replay, weapon slots/grants, and remote effects. No attached-player full gameplay playthrough has been performed.


---

## Pemeliharaan dokumentasi

Semua pembaruan dokumentasi proyek ditulis di berkas ini. Dokumen asal telah diarsipkan di `C:\ProgramData\AxiomBackups\docs-consolidation-20261021.zip`. LICENSE dan dokumentasi dependency tidak dipindahkan. Tautan relatif dalam bagian arsip dibaca relatif terhadap lokasi sumber yang tercantum.


</details>

## Lisensi dan atribusi

Lisensi mengikuti masing-masing komponen dan berkas `LICENSE` yang menyertainya; tidak ada klaim satu lisensi untuk seluruh deployment. Atribusi ikon pihak ketiga dipertahankan dalam arsip dan berkas lisensinya.

Susunan README terinspirasi [oh-my-pi](https://github.com/can1357/oh-my-pi); AXIOM bukan fork atau produk yang berafiliasi dengan proyek tersebut.
