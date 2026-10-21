export type User = {
  id: string;
  username: string;
  email: string;
  role: 'customer' | 'admin';
  created_at: string;
};
export type PublicPayment = {
  qris_id: string;
  trx_id: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'EXPIRED';
  expires_at: string;
};
export type Payment = PublicPayment & {
  fee_amount: number;
  fee_rate_bps: number;
  fee_policy: string;
  net_amount: number;
  created_at: string;
  qr_url: string;
  qris_string?: string;
  username?: string;
  customer_id?: string;
};
export type Wallet = {
  earned_amount: number;
  requested_amount: number;
  processing_amount: number;
  reserved_amount: number;
  paid_out_amount: number;
  available_amount: number;
};
export type Withdrawal = {
  id: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_holder: string;
  status: 'REQUESTED' | 'PROCESSING' | 'PAID' | 'REJECTED';
  requested_at: string;
  updated_at: string;
  estimated_start_at: string;
  estimated_end_at: string;
  transfer_reference: string | null;
  rejection_reason: string | null;
  customer_id?: string;
  username?: string;
  email?: string;
};
export type Audit = {
  id: number;
  withdrawal_id?: string;
  actor_username?: string;
  from_status: string | null;
  to_status: string;
  created_at: string;
  transfer_reference: string | null;
  rejection_reason: string | null;
};
export type Key = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};
export type Totals = {
  paid_count: number;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
};
export type Customer = User &
  Totals & {
    available_amount: number;
    reserved_amount: number;
    paid_out_amount: number;
    wallet?: Wallet;
    totals?: Totals;
  };
export type Overview = {
  totals: {
    paid_amount: number;
    paid_fee_amount: number;
    paid_net_amount: number;
    paid_count: number;
    pending_count: number;
    expired_count: number;
    total_count: number;
  };
  charts: {
    timezone: string;
    daily: {
      date: string;
      paid_amount: number;
      fee_amount: number;
      net_amount: number;
      count: number;
    }[];
    status: { status: string; count: number }[];
  };
  wallet: Wallet;
  merchant: { mode: string; ready: boolean };
  user: { username: string };
};
export type Envelope<T> = { success: boolean; data: T; message?: string; code?: string };
