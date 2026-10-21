import { redirect } from 'next/navigation';

export default function Merchant() {
  redirect('/manage/billing#qris');
}
