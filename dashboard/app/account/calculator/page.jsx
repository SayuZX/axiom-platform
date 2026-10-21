'use client';
import TokenCalculator from '../../components/TokenCalculator';
import DashboardShell from '../../components/DashboardShell';
export default function AccountCalculator(){
  return <DashboardShell title="Kalkulator token" description="Rencanakan kuota dan nilai pemakaian paket dalam Rupiah. Token input + output dihitung mentah, tanpa pengali harga model."><TokenCalculator/></DashboardShell>;
}
