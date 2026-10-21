import Link from 'next/link';

function Section({ id, title, children }) {
  return <section id={id} className="docs-section"><h2><a href={'#' + id}>{title}</a></h2>{children}</section>;
}

export default function CustomerGuides({ slug }) {
  if (slug === 'account-start') return <>
    <Section id="registration" title="Daftar dengan informasi yang benar">
      <ol><li>Buka <Link href="/account/register">pendaftaran pelanggan</Link>. Isi nama, email yang Anda kendalikan, dan kata sandi unik.</li><li>Nama harus 1–100 karakter. Kata sandi harus 12–128 karakter, maksimal 512 byte; gunakan pengelola kata sandi untuk menyimpannya.</li><li>Baca <Link href="/terms">Ketentuan Layanan</Link> dan <Link href="/privacy">Kebijakan Privasi</Link>, lalu centang penerimaan yang diminta sebelum mengirim formulir.</li></ol>
      <p>Penerimaan ketentuan dan pengakuan telah membaca pemberitahuan privasi bukan persetujuan tanpa batas untuk semua pemrosesan data. Pendaftaran tidak membeli paket atau mengisi saldo. Akun pelanggan berbeda dari akun merchant dan administrator.</p>
      <p>Jika email tidak dapat didaftarkan, periksa apakah Anda sudah memiliki akun dan gunakan halaman masuk. Jika percobaan dibatasi, tunggu sebelum mencoba kembali; jangan mengirim formulir berulang-ulang.</p>
    </Section>
    <Section id="session" title="Login, sesi, dan keluar">
      <p>Gunakan <Link href="/account/login">halaman masuk</Link> dengan email dan kata sandi yang didaftarkan. Sesi pelanggan memakai cookie <code>axiom_customer_session</code> dengan masa berlaku tujuh hari. Sesi situs bukan API key untuk aplikasi Anda.</p>
      <p>Jika halaman akun meminta login kembali, masuk lalu buka tujuan semula. Kegagalan memuat layanan akun tidak selalu berarti kata sandi salah. Gunakan tindakan coba lagi yang tersedia setelah memeriksa koneksi.</p>
      <p>Keluar dari akun setelah memakai perangkat bersama. Keluar menghapus sesi terkait, bukan mencabut API key, menghapus riwayat server, atau mengakhiri seluruh sesi pada perangkat lain. Email verifikasi dan reset kata sandi otomatis belum dikonfigurasi; jangan mengandalkan email pemulihan yang belum tersedia.</p>
    </Section>
    <Section id="first-use" title="Urutan penggunaan pertama">
      <ol><li>Periksa <Link href="/buy">paket yang tersedia</Link>: harga, kuota, masa berlaku, serta pembatasannya.</li><li>Selesaikan pembelian dan periksa invoice sampai aktivasi selesai. Isi saldo saja belum menerbitkan kunci paket.</li><li>Buka <Link href="/account/keys">API keys</Link> dan pastikan kunci siap digunakan.</li><li>Gunakan <Link href="/account/setup">Setup cepat</Link> untuk aplikasi, atau <Link href="/playground">Playground</Link> untuk percobaan melalui akun.</li><li>Jalankan permintaan kecil, lalu lihat <Link href="/account/logs">log penggunaan</Link>. Permintaan nyata memakai kuota.</li></ol>
      <p>Lanjutkan ke <Link href="/docs/billing-wallet">saldo dan pembayaran</Link> atau <Link href="/docs/quick-start">permintaan API pertama</Link>.</p>
    </Section>
  </>;
  if (slug === 'manage-keys') return <>
    <Section id="find-key" title="Temukan kunci dan statusnya">
      <p><Link href="/account/keys">Halaman API keys</Link> menampilkan kunci dari paket akun Anda. Gunakan pencarian nama atau ID, lalu filter Aktif, Kedaluwarsa, Kuota habis, atau Dicabut / nonaktif. Pilih <strong>Perbarui kunci</strong> setelah pembelian atau perubahan status.</p>
      <p>Jika daftar kosong, buka <Link href="/account/billing">tagihan</Link> dan periksa aktivasi paket. Status pembayaran diterima belum selalu berarti penerbitan kunci selesai. Jangan membeli ulang hanya karena kunci belum muncul.</p>
    </Section>
    <Section id="key-secret" title="Tampilkan, salin, dan simpan">
      <ol><li>Temukan kartu kunci yang benar; bedakan ID kunci dari rahasianya.</li><li>Pilih <strong>Tampilkan kunci</strong>, kemudian <strong>Salin kunci</strong>. Jika clipboard tidak tersedia, salin manual dari kolom rahasia yang ditampilkan.</li><li>Simpan di lingkungan privat aplikasi, misalnya variabel lingkungan server. Pilih <strong>Sembunyikan kunci</strong> setelah selesai.</li></ol>
      <p>Jangan letakkan kunci dalam kode browser publik, repositori, URL, prompt, tiket bantuan, atau tangkapan layar. Menyembunyikan tampilan tidak menghapus salinan clipboard maupun berkas konfigurasi yang sudah diunduh.</p>
    </Section>
    <Section id="key-limits" title="Kuota, masa aktif, dan izin model">
      <p>Kartu kunci memisahkan token terpakai, sisa kuota, tanggal kedaluwarsa, RPM (permintaan per menit), dan TPM (token per menit). Label tanpa batas hanya menyatakan konfigurasi batas tersebut; bukan janji semua model atau penyedia selalu tersedia tanpa pembatasan lain.</p>
      <p>Buka <strong>Akses model</strong> untuk melihat daftar diizinkan dan diblokir. Blokir mengalahkan izin, termasuk jika model tercantum pada kedua daftar. Kunci nonaktif atau kedaluwarsa tidak dapat memakai sisa kuotanya. Mengganti nama tidak menambah kuota atau memperpanjang masa berlaku.</p>
      <p>Jika model terlihat di katalog publik tetapi tidak tersedia di Setup, periksa izin kunci dan statusnya. Lihat <Link href="/docs/errors">errors & limits</Link> untuk diagnosis permintaan API.</p>
    </Section>
    <Section id="key-revoke" title="Ubah nama atau cabut akses">
      <p>Buka <strong>Kelola nama & pencabutan</strong>, isi nama yang mudah dikenali, lalu pilih <strong>Simpan nama</strong>. Contoh nama operasional: <code>Backend produksi</code> atau <code>Eksperimen lokal</code>. Nama bukan kredensial dan tidak mengganti rahasia kunci.</p>
      <p><strong>Pencabutan menghentikan integrasi yang memakai kunci tersebut. Kunci tidak dapat diaktifkan kembali dari halaman pelanggan.</strong> Periksa aplikasi yang bergantung padanya sebelum mengonfirmasi. Jika bocor, hentikan penggunaan rahasia tersebut, cabut akses, dan periksa log untuk aktivitas yang tidak dikenali.</p>
      <p>Untuk pindah ke kunci lain yang sudah aktif, perbarui konfigurasi setiap aplikasi dan jangan menganggap pencabutan memindahkan kuota. Halaman ini menyediakan penggantian nama dan pencabutan, bukan kontrol mandiri untuk mengubah kuota atau batas paket.</p>
    </Section>
  </>;
  if (slug === 'billing-wallet') return <>
    <Section id="balance-versus-quota" title="Saldo bukan kuota token">
      <ul><li><strong>Saldo Rupiah</strong> adalah saldo untuk membeli paket melalui dompet.</li><li><strong>Kuota paket</strong> adalah hak penggunaan pada kunci terkait, dengan masa aktif dan batas paket.</li><li><strong>Token input/output</strong> adalah penggunaan model. Token yang dipotong dari kuota dapat berbeda karena perhitungan tarif model dan rasio paket.</li><li><strong>Katalog harga dan kalkulator</strong> membantu membandingkan atau memperkirakan penggunaan, bukan invoice baru atau biaya tambahan otomatis.</li></ul>
      <p>Gunakan <Link href="/pricing">harga model</Link> dan <Link href="/account/calculator">kalkulator</Link> untuk perencanaan; periksa invoice serta log penagihan untuk transaksi nyata. Jangan menyamakan angka biaya pada log dengan debit saldo dompet untuk setiap permintaan.</p>
    </Section>
    <Section id="topup" title="Isi saldo melalui QRIS">
      <ol><li>Buka <Link href="/account/billing">Saldo & tagihan</Link>, pilih <strong>Isi saldo via QRIS</strong>.</li><li>Masukkan Rupiah bulat antara Rp1.000 dan Rp10.000.000, lalu buat invoice. Membuat invoice belum mendebit rekening.</li><li>Di checkout, periksa jenis pesanan, nomor pesanan, akun, nominal, dan penerima sebelum menyetujui pembayaran di aplikasi bank atau dompet digital.</li><li>Bayar hanya nominal pada invoice. Periksa status invoice setelah pembayaran; saldo ditambahkan setelah pembayaran terverifikasi dan pemrosesan selesai.</li><li>Kembali ke mutasi saldo untuk memastikan pencatatannya. Topup tidak menerbitkan API key.</li></ol>
      <p>Jika terdapat bagian <strong>Isi saldo belum selesai</strong>, buka invoice yang sudah ada. Jangan membuat invoice baru untuk melanjutkan pembayaran yang sama.</p>
    </Section>
    <Section id="purchase" title="Beli paket dan periksa aktivasi">
      <p>Di Saldo & tagihan, pilih paket lalu <strong>Tinjau pembelian</strong>. Periksa harga, kuota, masa berlaku, saldo saat ini, dan perkiraan saldo setelah pembelian sebelum menyetujui. Pembelian melalui dompet memotong saldo Rupiah; tidak memerlukan pembayaran QRIS tambahan pada checkout.</p>
      <p>Alternatifnya, pilih paket dari <Link href="/buy">halaman pembelian</Link> dan ikuti metode pembayaran yang ditampilkan. Bedakan invoice paket dari invoice isi saldo.</p>
      <p>Checkout membedakan <strong>Pembayaran diterima</strong> dari <strong>Selesai</strong>. Jika pembayaran diterima tetapi aktivasi sedang diproses, jangan membayar ulang. Untuk pesanan dari saldo, gunakan <strong>Periksa status aktivasi</strong>. Setelah paket aktif, akses kunci melalui checkout atau <Link href="/account/keys">API keys</Link>.</p>
    </Section>
    <Section id="uncertain-payment" title="Jangan mengulang pembayaran yang belum pasti">
      <p><strong>Timeout, koneksi putus, dan kegagalan pemeriksaan status tidak membuktikan pembayaran gagal.</strong> Jika rekening sudah terpotong, simpan bukti pembayaran dan nomor pesanan; jangan mengirim pembayaran kedua.</p>
      <ol><li>Gunakan <strong>Periksa tagihan</strong> atau perbarui daftar tagihan untuk mencari pesanan yang telah tercatat.</li><li>Buka invoice tersebut dan periksa status, nominal, serta sumber dananya. Periksa juga mutasi saldo jika membeli melalui dompet.</li><li>Jika hasil pembuatan invoice belum pasti, jangan membuat ulang. Jika pembelian saldo belum pasti, jangan beralih paket untuk menghindari peringatan; tinjau pembelian sebelumnya.</li><li>Jika invoice tidak aktif tetapi dana terpotong, minta pemeriksaan berdasarkan bukti sebelum membuat pembayaran baru. Lihat <Link href="/docs/legal-support">panduan bantuan</Link>.</li></ol>
      <p>Label Menyiapkan, Perlu diperiksa, atau Menunggu pembayaran bukan bukti aktivasi selesai. Tangkapan layar pembayaran juga tidak menggantikan verifikasi transaksi pada layanan.</p>
    </Section>
    <Section id="billing-history" title="Telusuri mutasi dan tagihan">
      <p>Tab <strong>Mutasi saldo</strong> berisi topup dan pembelian, referensi, waktu, nominal, serta saldo setelah transaksi. Tab <strong>Tagihan</strong> berisi pesanan, status, dan sumber dana; gunakan filter status dan buka detail atau invoice yang relevan.</p>
      <p>Gunakan <strong>Perbarui</strong> untuk memuat ulang data. Daftar menampilkan sepuluh catatan per halaman dari maksimal seratus catatan terbaru; bukan arsip lengkap tanpa batas. Simpan pengenal invoice penting untuk penelusuran, bukan rahasia API key.</p>
    </Section>
  </>;
  if (slug === 'usage-logs') return <>
    <Section id="overview" title="Baca ringkasan akun">
      <p><Link href="/account">Ringkasan akun</Link> menampilkan aktivitas 30 hari terakhir menurut tanggal UTC. Pilih metrik Permintaan API, Token yang dipotong, atau Token input dan output. Buka <strong>Lihat data harian</strong> untuk angka lengkap, bukan hanya tinggi grafik.</p>
      <p>Token input/output berasal dari catatan router; debit kuota berasal dari catatan penagihan. Keduanya bukan ukuran yang dapat dipertukarkan. Sisa kuota mengikuti kunci API berkuota, bukan hasil mengurangi semua angka grafik dari saldo Rupiah. Gunakan <strong>Perbarui ringkasan</strong> setelah aktivitas baru.</p>
    </Section>
    <Section id="log-filters" title="Cari catatan yang relevan">
      <ol><li>Buka <Link href="/account/logs">Log Permintaan</Link>.</li><li>Isi ID model persis seperti pada API, termasuk awalan rutenya, lalu pilih <strong>Terapkan</strong>. Filter model bukan pencarian sebagian nama.</li><li>Pilih status Berhasil / selesai atau Selain berhasil / selesai. Kelompok kedua juga dapat memuat status yang belum tersedia, bukan hanya kegagalan pasti.</li><li>Pilih sumber Router API atau Penagihan untuk memisahkan metadata inferensi dari debit. Gunakan <strong>Reset</strong> untuk kembali ke semua catatan.</li><li>Gunakan navigasi halaman; setiap halaman memuat hingga 25 catatan.</li></ol>
    </Section>
    <Section id="log-rows" title="Arti setiap baris dan angka">
      <p>Tabel memperlihatkan waktu, alias kunci, model, sumber, status, token input, token output, token dipotong, serta biaya Rupiah bila sumber menyediakan nilainya. Tanda <strong>—</strong> berarti data tidak tersedia, bukan nol.</p>
      <p>Router dan penagihan ditampilkan sebagai baris terpisah karena tidak mempunyai ID permintaan bersama yang dapat dipakai untuk menggabungkan keduanya secara terverifikasi. Jumlah catatan bukan jumlah permintaan unik. Dua baris berdekatan bukan bukti otomatis dua debit, dan kesamaan model atau waktu tidak cukup untuk menyatakan keduanya satu permintaan.</p>
      <p>Pilih model pada baris untuk menyorot alurnya. Visualisasi adalah bantuan membaca catatan, bukan pelacakan jaringan langsung. Simpan sumber dan status bersama angka yang Anda laporkan.</p>
    </Section>
    <Section id="log-refresh" title="Pembaruan dan penelusuran masalah">
      <p>Data adalah snapshot dengan waktu <strong>Diperbarui</strong>. Pilih <strong>Perbarui</strong> untuk mengambil data baru, atau atur pembaruan 15/30 detik. Pembaruan otomatis tidak berjalan ketika tab tersembunyi dan tidak menumpuk permintaan saat pemuatan berlangsung. Pilihan sorotan baris dibersihkan ketika data berubah.</p>
      <p>Untuk menyelidiki timeout, catat waktu, ID model, alias kunci, sumber, status, dan debit yang tersedia sebelum mencoba ulang. Permintaan gagal atau stream terputus belum tentu tanpa pemakaian; pengiriman ulang dapat memakai kuota lagi.</p>
      <p><Link href="/account/performance">Performa model</Link> berbeda dari log ini. Data timing yang tersedia tidak mencakup seluruh permintaan baru; peringkat historis bukan benchmark GPU atau jaminan kecepatan model berikutnya.</p>
    </Section>
  </>;
  if (slug === 'playground-guide') return <>
    <Section id="playground-start" title="Persiapan dan percobaan pertama">
      <ol><li>Masuk ke akun lalu buka <Link href="/playground">Playground</Link>. Halaman akan meminta login jika sesi tidak tersedia.</li><li>Pastikan Anda memiliki kunci aktif, belum kedaluwarsa, dan berkuota. Pilihan akses mengikuti kunci milik akun dan model yang diizinkan.</li><li>Pilih model yang tersedia dan mulai dengan pesan singkat tanpa data sensitif, misalnya <q>Jelaskan perbedaan token input dan output dalam dua kalimat.</q></li><li>Periksa hasil, lalu cocokkan penggunaan dengan <Link href="/account/logs">log akun</Link>. Ini permintaan nyata, bukan demo respons statis.</li></ol>
      <p>Login situs menghubungkan Playground ke akses akun Anda; tidak perlu menempelkan rahasia kunci ke isi percakapan. Ketersediaan katalog tidak mengabaikan pembatasan kunci.</p>
    </Section>
    <Section id="playground-usage" title="Konteks dan penggunaan token">
      <p>Pesan terdahulu, instruksi, memori yang diaktifkan, dan isi lampiran yang digunakan dapat ikut menjadi konteks. Karena itu, pesan terakhir yang pendek tidak berarti seluruh input juga pendek. Pengolahan konteks atau pembuatan judul dapat melibatkan permintaan tambahan.</p>
      <p>Mulai percakapan terpisah untuk tugas yang tidak memerlukan konteks lama. Periksa isi yang akan Anda kirim dan kemampuan model sebelum memakai lampiran atau fitur khusus. Jangan menganggap semua model mendukung kemampuan yang sama.</p>
      <p>Mengulang jawaban atau mengirim ulang pesan dapat menambah pemakaian. Berhenti menunggu, menutup tab, atau koneksi terputus tidak otomatis membatalkan proses maupun debit yang sudah terjadi.</p>
    </Section>
    <Section id="playground-history" title="Riwayat dan privasi">
      <p>Riwayat percakapan terhubung ke akun dan dapat disimpan di server untuk dibuka kembali. Jangan memperlakukan Playground sebagai catatan yang hanya tersimpan di perangkat. Pengaturan, instruksi pribadi, atau memori lokal juga dapat diteruskan sebagai konteks saat digunakan.</p>
      <p>Gunakan hanya data yang Anda berhak proses; hapus identitas atau rahasia yang tidak diperlukan sebelum mengirim. Keluaran AI dapat salah dan harus diperiksa sebelum dipakai dalam keputusan penting atau kode produksi.</p>
      <p>Membersihkan cookie, keluar, atau menghapus data browser bukan penghapusan seluruh riwayat server. Penghapusan percakapan melalui kontrol yang tersedia juga bukan jaminan penghapusan log penggunaan, invoice, cadangan, maupun salinan penerima data. Kebijakan retensi dan pelatihan setiap penyedia tidak boleh diasumsikan sama; baca <Link href="/privacy">Kebijakan Privasi</Link>.</p>
    </Section>
    <Section id="playground-errors" title="Jika percakapan gagal">
      <ol><li>Periksa sesi login dan koneksi tanpa langsung mengirim ulang pesan.</li><li>Periksa status kunci, kuota, masa aktif, serta izin model pada <Link href="/account/keys">API keys</Link>.</li><li>Jika katalog atau layanan tidak tersedia, buka <Link href="/account/status">status layanan</Link>.</li><li>Periksa log sebelum mengulang. Catat waktu, model, dan pesan error tanpa membagikan prompt sensitif atau kredensial.</li></ol>
      <p>Riwayat yang gagal dimuat bukan bukti telah dihapus. Jangan menjanjikan pemulihan otomatis; kumpulkan bukti sesuai <Link href="/docs/legal-support">panduan bantuan</Link>.</p>
    </Section>
  </>;
  if (slug === 'client-setup') return <>
    <Section id="setup-export" title="Pilih kunci dan ekspor">
      <ol><li>Buka <Link href="/account/setup">One Click Setup</Link> setelah masuk.</li><li>Pilih aplikasi, kemudian API key yang siap digunakan. Daftar model disaring menurut kebijakan kunci; model diblokir tidak ikut diekspor.</li><li>Periksa jumlah model tersedia, lalu pilih <strong>Unduh konfigurasi</strong> atau <strong>Salin isi</strong>.</li><li>Ikuti petunjuk aplikasi pada halaman tersebut. Unduhan menyiapkan berkas; tidak memasang aplikasi atau otomatis mengubah konfigurasi perangkat Anda.</li></ol>
      <p>Jika tidak ada kunci yang dapat digunakan, periksa paket pada halaman kunci. Jika tidak ada model diizinkan, jangan mengganti ID secara acak untuk melewati batas akses.</p>
    </Section>
    <Section id="setup-targets" title="Isi berkas menurut aplikasi">
      <div className="docs-table-wrap"><table><thead><tr><th scope="col">Aplikasi / berkas</th><th scope="col">Isi dan penggunaan</th></tr></thead><tbody>
        <tr><td>OpenClaw<br/><code>axiom-openclaw.json</code></td><td>Provider axiom dengan API OpenAI completions, daftar model, dan model utama dari model pertama. Gabungkan dengan konfigurasi OpenClaw.</td></tr>
        <tr><td>Cursor<br/><code>axiom-cursor.txt</code></td><td>Petunjuk pengisian OpenAI API Key, Override OpenAI Base URL, dan daftar ID model. Ini berkas instruksi, bukan pemasang pengaturan editor.</td></tr>
        <tr><td>Claude Code<br/><code>axiom-claude.json</code></td><td>Variabel ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL dan pilihan model. Gabungkan ke <code>~/.claude/settings.json</code>; mulai sesi baru.</td></tr>
        <tr><td>Codex<br/><code>axiom-codex.config.toml</code></td><td>Model awal, provider axiom, base URL /v1, <code>wire_api = "responses"</code>, dan header Authorization. Ekspor ini tidak mendefinisikan bagian profile; sesuaikan cara memuat konfigurasi dengan versi Codex Anda.</td></tr>
        <tr><td>Hermes<br/><code>axiom-hermes.yaml</code></td><td>Provider custom dengan mode chat_completions, daftar model eksplisit, dan penemuan model otomatis nonaktif. Gabungkan ke <code>~/.hermes/config.yaml</code>.</td></tr>
        <tr><td>Oh My Pi<br/><code>axiom-omp.models.yml</code></td><td>Provider axiom dengan API openai-completions serta daftar model. Gabungkan provider ke <code>~/.omp/agent/models.yml</code>, lalu pilih model melalui <code>/model</code>.</td></tr>
        <tr><td>Node.js<br/><code>axiom.mjs</code></td><td>Skrip privat Node.js 20.6+. <code>node axiom.mjs --list</code> menampilkan model tanpa inferensi; <code>node axiom.mjs ID_MODEL</code> mengirim pesan Halo! dengan batas output 128 dan stream nonaktif.</td></tr>
      </tbody></table></div>
      <p>Konfigurasi OpenAI-compatible memakai <code>https://ai.axiomcreative.xyz/v1</code>. Ekspor Claude Code memakai origin <code>https://ai.axiomcreative.xyz</code> pada ANTHROPIC_BASE_URL; jangan menyamakan kedua pengaturan hanya karena berasal dari layanan yang sama.</p>
    </Section>
    <Section id="setup-apply" title="Terapkan tanpa menimpa pengaturan">
      <p>Cadangkan konfigurasi aplikasi, lalu gabungkan bagian yang relevan dengan mempertahankan provider atau pengaturan lain. Tinjau model default: beberapa ekspor menggunakan model pertama dalam daftar, bukan pilihan model dokumentasi. Pilih ID model yang memang terdapat pada konfigurasi.</p>
      <p>Untuk Codex, jangan menganggap perintah dengan <code>--profile axiom</code> akan bekerja hanya karena berkas telah diunduh: profil tersebut harus benar-benar dikonfigurasi pada klien. Ekspor menyatakan wire API Responses; keberhasilannya tetap bergantung pada dukungan rute, model, dan versi klien. Panduan ini tidak mengklaim seluruh fitur agent otomatis kompatibel.</p>
      <p>Mulai sesi baru bila aplikasi membutuhkannya. Uji permintaan kecil dan periksa log. Untuk Cursor, lihat <Link href="/docs/cursor">panduan editor</Link>; untuk aplikasi sendiri gunakan <Link href="/docs/python">Python</Link> atau <Link href="/docs/javascript">JavaScript</Link>.</p>
    </Section>
    <Section id="setup-security" title="Rahasia dan pemecahan masalah">
      <p><strong>Setiap berkas ekspor dan teks Salin isi berisi API key nyata.</strong> Ini berbeda dari contoh SDK dokumentasi yang membaca variabel lingkungan. Simpan secara privat, jangan unggah ke repositori, dan batasi akses ke direktori unduhan serta konfigurasi.</p>
      <p>Jika clipboard gagal, gunakan unduhan. Jika pembuatan konfigurasi gagal, periksa sesi, kunci, dan katalog, lalu coba tindakan yang sama setelah masalah teratasi. Jangan mengarang model pengganti. Setelah kunci dicabut, konfigurasi lama tidak memberi akses; pilih kunci aktif lain dan perbarui aplikasi yang menggunakannya.</p>
    </Section>
  </>;
  if (slug === 'service-updates') return <>
    <Section id="health-check" title="Jalankan pemeriksaan kesehatan">
      <p>Buka <Link href="/account/status">Status layanan</Link> dan pilih <strong>Periksa sekarang</strong>. Catat waktu pemeriksaan terakhir, pesan layanan, status HTTP, serta latensi health check untuk Router API dan Layanan pembayaran.</p>
      <p>Pemeriksaan ini memanggil endpoint kesehatan lokal, bukan mengirim inferensi model atau transaksi pembayaran. Jika hasil gagal dimuat, status belum dapat dipastikan; jangan mengartikan data yang tidak tersedia sebagai layanan sehat.</p>
    </Section>
    <Section id="health-meaning" title="Batas makna indikator">
      <ul><li><strong>Sehat:</strong> hasil pemeriksaan tersedia dan berada di bawah ambang latensi yang ditampilkan.</li><li><strong>Respons lambat:</strong> pemeriksaan berhasil tetapi latensi mencapai ambang pada halaman.</li><li><strong>Tidak tersedia / Maintenance:</strong> layanan tidak tersedia menurut pemeriksaan atau maintenance aktif.</li><li><strong>Belum terukur:</strong> data sedang dimuat, latensi belum tersedia, atau status belum diketahui.</li></ul>
      <p>Baterai adalah simbol keadaan saat diperiksa, bukan persentase uptime; segmennya bukan riwayat pemeriksaan. Latensi health check bukan kecepatan menghasilkan token. Router sehat tidak menjamin setiap model, provider, kunci, atau pembayaran tertentu berhasil.</p>
    </Section>
    <Section id="maintenance" title="Maintenance dan pemberitahuan">
      <p>Baca judul, pesan, waktu pembaruan, dan estimasi selesai pada pemberitahuan maintenance. Estimasi bukan jaminan waktu pemulihan. Health check dapat tetap sehat saat inferensi dibatasi oleh maintenance.</p>
      <p>Informasi maintenance diperbarui berkala setiap 30 detik; tombol pemeriksaan juga memuat ulang informasi tersebut. Jika pemuatannya gagal, informasi sebelumnya mungkin telah berubah. Bagian pengumuman menampilkan pemberitahuan aktif yang berlaku bagi akun, beserta waktu mulai atau berakhir bila tersedia.</p>
      <p>Ketika transaksi belum pasti selama gangguan, ikuti <Link href="/docs/billing-wallet#uncertain-payment">pengamanan pembayaran</Link>, bukan membuat invoice atau membayar ulang.</p>
    </Section>
    <Section id="updates" title="Baca pembaruan produk">
      <p>Buka <Link href="/account/updates">Pembaruan akun</Link> untuk pengumuman yang tersedia bagi akun, atau <Link href="/changelog">changelog publik</Link>. Gunakan pencarian judul, isi, atau versi serta filter kategori Baru, Pembaruan, Perbaikan, Pemeliharaan, Harga, dan Keamanan. Pilih <strong>Baca selengkapnya</strong> untuk detail.</p>
      <p>Tanggal publikasi ditampilkan dalam WIB, berbeda dari tanggal UTC pada grafik aktivitas akun. Perhatikan versi, tanggal, dan masa berlaku informasi. Daftar kosong setelah filter tidak membuktikan tidak ada pembaruan; kosongkan filter dan periksa apakah pemuatan berhasil.</p>
      <p>Catatan rilis bukan hasil health check, jaminan ketersediaan, atau pengganti rincian invoice dan dokumen layanan.</p>
    </Section>
  </>;
  if (slug === 'legal-support') return <>
    <Section id="legal-documents" title="Baca dokumen layanan">
      <p><Link href="/terms">Ketentuan Layanan</Link> menjelaskan akun, akses API, paket, pembayaran, hak konsumen, penggunaan yang diperbolehkan, risiko AI, dan penyelesaian sengketa. <Link href="/privacy">Kebijakan Privasi</Link> menjelaskan kategori data, aliran pemrosesan, cookie, riwayat, keterbatasan informasi, dan hak terkait data pribadi.</p>
      <p>Dokumentasi ini membantu menjalankan fitur, bukan mengganti dokumen tersebut atau memberi janji pemulihan baru. Periksa harga, kuota, masa aktif, dan batas paket sebelum menyetujui transaksi. Membaca halaman hukum saja bukan pembelian maupun persetujuan tanpa batas atas pemrosesan data.</p>
    </Section>
    <Section id="support-evidence" title="Siapkan bukti tanpa rahasia">
      <ol><li>Catat halaman yang bermasalah, waktu kejadian beserta zona waktunya, langkah sebelum masalah, dan pesan error persis.</li><li>Untuk pembayaran, simpan nomor invoice, nominal, status, sumber dana, serta bukti pembayaran yang relevan.</li><li>Untuk API, catat ID model, ID atau alias kunci, status HTTP, dan catatan router/penagihan yang tersedia. Jelaskan hasil yang diharapkan dan yang terjadi.</li><li>Samarkan data pribadi yang tidak diperlukan. Jangan kirim kata sandi, cookie sesi, API key lengkap, PIN, atau data pembayaran rahasia.</li><li>Sebutkan penyelesaian yang diminta dan simpan salinan komunikasi untuk penelusuran.</li></ol>
      <p>Jangan mengirim ulang permintaan berbayar hanya untuk menghasilkan bukti tambahan jika hasil sebelumnya belum pasti.</p>
    </Section>
    <Section id="support-limits" title="Saluran bantuan dan pemulihan">
      <p>Informasi operasional yang tersedia belum mencantumkan alamat kontak dukungan atau pengaduan yang dapat diverifikasi. Panduan ini tidak membuat email, nomor telepon, SLA, atau formulir bantuan fiktif. Gunakan hanya saluran yang dapat dipastikan resmi; jangan menyerahkan rahasia kepada pihak yang mengaku dapat memulihkan akun.</p>
      <p>Reset kata sandi otomatis, penutupan akun, dan pengembalian pembayaran tidak boleh diasumsikan tersedia sebagai tombol mandiri. Ketiadaan fitur tidak menghapus hak pengguna. Ketentuan layanan membahas koreksi, pengembalian, dan penyelesaian sengketa berdasarkan transaksi serta hukum Indonesia, bukan kebijakan refund otomatis untuk semua keadaan atau larangan refund mutlak.</p>
      <p>Untuk hak pengaduan dan jalur penyelesaian Indonesia ketika komunikasi layanan tidak tersedia, baca bagian <Link href="/terms#hukum">pengaduan dan penyelesaian sengketa</Link>. Jangan membayar ulang untuk menutupi ketidakpastian status transaksi.</p>
    </Section>
    <Section id="privacy-rights" title="Permohonan terkait data pribadi">
      <p>Siapkan permohonan tercatat yang menjelaskan hak yang hendak digunakan, akun terkait, ruang lingkup data, serta sarana menerima jawaban. Simpan salinan dan bukti penyampaiannya melalui saluran resmi yang dapat diverifikasi. Jangan mengirim kredensial rahasia sebagai bukti identitas.</p>
      <p>Menghapus data browser atau percakapan tidak identik dengan penghapusan invoice, log, cadangan, atau seluruh data penerima. Jadwal retensi lengkap dan seluruh lokasi pemrosesan belum terverifikasi dalam informasi operasional; tidak ada janji bahwa prompt tidak pernah dicatat atau seluruh provider tidak memakai data untuk tujuan tertentu.</p>
      <p>Baca <Link href="/privacy">Kebijakan Privasi</Link> untuk hak, batas yang diatur hukum, dan keterbatasan administratif. Sebelum mengirim data pihak lain ke model, pastikan kewenangan dan kebutuhan pemrosesannya.</p>
    </Section>
  </>;
  return null;
}
