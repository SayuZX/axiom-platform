export const changelog = [
  {
    id: 'akses-dan-api-key',
    date: '2026-10-14',
    dateLabel: '14 Oktober 2026',
    label: 'Rilis terkini',
    title: 'Pengelolaan API key dan halaman masuk',
    summary: 'Pembuatan key melalui modal, kontrol cabut dan hapus, batas key, serta tampilan masuk yang diperbarui.',
    sections: [
      {
        title: 'Konfirmasi pembayaran pembeli',
        details: [
          'Pembayaran terverifikasi membuka halaman berhasil dengan nominal asli, animasi centang hijau, dan partikel koin. Preferensi pengurangan gerakan tetap dihormati.',
          'Halaman berhasil memeriksa ulang status server, termasuk saat dimuat ulang. Setelah empat detik, pembeli diarahkan ke halaman terima kasih tanpa rincian transaksi.',
        ],
      },
      {
        title: 'API key',
        details: [
          'Buat API key melalui modal agar pengelolaan key tetap berada dalam satu halaman.',
          'Cabut key untuk menghentikan aksesnya. Hanya key yang sudah dicabut yang dapat dihapus; riwayat audit tetap tersimpan.',
          'Batas awal adalah 10 key aktif per pelanggan. Admin dapat mengatur batas 0–100; batas 0 menghentikan pembuatan key baru. Key yang dicabut tidak dihitung, dan penurunan batas tidak mencabut key yang sudah ada.',
        ],
      },
      {
        title: 'Halaman masuk',
        details: ['Tampilan masuk diperbarui dengan hierarki formulir yang lebih jelas dan tata letak yang menyesuaikan layar ponsel.'],
      },
    ],
  },
  {
    id: 'navigasi-dan-alur-dashboard',
    date: '2026-10-14',
    dateLabel: '14 Oktober 2026',
    label: 'Pembaruan dashboard',
    title: 'Navigasi dan aktivitas lebih terarah',
    summary: 'Sidebar baru, navigasi seluler, ringkasan dana, filter transaksi, dan pengajuan penarikan tiga langkah.',
    sections: [
      {
        title: 'Navigasi dan ringkasan',
        details: [
          'Sidebar dan navigasi seluler ditata ulang agar halaman utama dan aktivitas pembayaran lebih mudah ditemukan.',
          'Dashboard memprioritaskan saldo tersedia, penerimaan pembayaran, dan ringkasan aktivitas. Halaman operasional memisahkan antrean kerja dari konfigurasi dan audit.',
        ],
      },
      {
        title: 'Transaksi dan penarikan',
        details: [
          'Filter transaksi membantu mempersempit daftar pembayaran. Tampilan kartu di ponsel menjaga informasi utama tetap terbaca.',
          'Pengajuan penarikan disusun menjadi tiga langkah: tujuan, nominal, dan tinjau pengajuan.',
          'Penarikan tetap diproses manual dengan estimasi 1–2 hari kalender, bukan transfer otomatis.',
        ],
      },
    ],
  },
  {
    id: 'tujuan-dan-bukti-penarikan',
    date: '2026-10-14',
    dateLabel: '14 Oktober 2026',
    label: 'Pembaruan sebelumnya pada tanggal yang sama',
    title: 'Tujuan penarikan dan bukti pembayaran',
    summary: 'Pilihan bank dan e-wallet untuk penarikan manual, bukti PNG privat, dan caption sukses Telegram yang terformat.',
    sections: [
      {
        title: 'Tujuan penarikan manual',
        details: ['Tujuan penarikan mencakup pilihan bank dan e-wallet. Pilihan tujuan tidak mengubah proses penarikan menjadi transfer otomatis.'],
      },
      {
        title: 'Bukti dan notifikasi',
        details: [
          'Bukti penarikan tersedia dalam format PNG dengan akses privat, bukan tautan publik.',
          'Notifikasi penarikan berhasil di Telegram menggunakan caption terformat agar rincian keberhasilan lebih mudah dibaca.',
        ],
      },
    ],
  },
] as const;
