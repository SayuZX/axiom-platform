import { cache } from 'react';
import { routerDb } from '../../lib/merchant-commerce.mjs';
import { initializeAnnouncements, listAnnouncements } from '../../lib/announcements.mjs';

export const categoryLabels = { NEW: 'Baru', UPDATE: 'Pembaruan', FIX: 'Perbaikan', MAINTENANCE: 'Pemeliharaan', PRICING: 'Harga', SECURITY: 'Keamanan' };
export const publicUpdates = cache(() => {
  const db = routerDb();
  initializeAnnouncements(db);
  return listAnnouncements(db, 'public');
});
export const dateLabel = value => new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
export const monthLabel = value => new Date(value).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
