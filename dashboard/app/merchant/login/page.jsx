import { redirect } from 'next/navigation';

export default function MerchantLogin() {
  redirect('/manage/billing#qris');
}
