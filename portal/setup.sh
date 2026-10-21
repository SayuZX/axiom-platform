#!/usr/bin/env bash
set -euo pipefail
node -e "if (+process.versions.node.split('.')[0] < 24) throw Error('Node.js 24 diperlukan')"
ruby --version
umask 077
if [ ! -f .env ]; then
    cp .env.example .env
fi
npm ci --ignore-scripts
npm --prefix apps/merchant-console ci
BUNDLE_GEMFILE=apps/payment-core/Gemfile bundle install
printf '%s\n' 'Isi DATA_DIR absolut yang menunjuk ledger yang benar, API_KEY, merchant, SMTP, dan konfigurasi Telegram opsional.' 'Jangan aktifkan kebijakan sebelum identitas/jadwal/retensi dan pemeriksaan hukum lengkap.' 'Jalankan npm run build, npm test, lalu npm start. Tidak ada deploy otomatis.'
