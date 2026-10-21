// Tauri commands can reject with strings, while browser fetch rejects with Errors.
export function providerErrorMessage(failure: unknown, native: boolean, fallback = 'Permintaan ke penyedia gagal. Coba lagi.'): string {
  const detail = failure instanceof Error ? failure.message : typeof failure === 'string' ? failure : '';
  if (native && /deserializing scope|not a valid URL pattern|url.*not allowed|not allowed.*url|permission.*denied|url.*forbidden|forbidden.*url/i.test(detail)) {
    return 'Izin koneksi aplikasi desktop tidak valid atau memblokir alamat ini. Perbarui aplikasi dengan perbaikan izin koneksi.';
  }
  if (native && /certificate|\btls\b|\bssl\b|cert validation/i.test(detail)) return 'Sertifikat HTTPS penyedia tidak dapat diverifikasi. Periksa alamat API, waktu perangkat, dan sertifikat penyedia.';
  if (native && /timed? out|timeout/i.test(detail)) return 'Koneksi ke penyedia melewati batas waktu. Periksa jaringan dan alamat API.';
  if (failure instanceof Error && !(failure instanceof TypeError)) return failure.message || fallback;
  if (native) return 'Koneksi desktop ke penyedia gagal. Periksa jaringan dan Base URL; koneksi desktop tidak memerlukan izin CORS.';
  if (failure instanceof TypeError) return 'Koneksi ke penyedia gagal. Periksa jaringan dan dukungan CORS untuk aplikasi web.';
  return fallback;
}
