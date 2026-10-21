import { redirect } from 'next/navigation';

export default function LegacyBillingPage() {
  redirect('/manage/billing');
}
