export function confirmedPaymentAmount(value: unknown, id: string): number | null {
  if (!value || typeof value !== 'object' || !('success' in value) || value.success !== true || !('data' in value)) return null;
  const payment = value.data;
  if (!payment || typeof payment !== 'object' || !('qris_id' in payment) || payment.qris_id !== id || !('status' in payment) || payment.status !== 'PAID' || !('amount' in payment)) return null;
  return typeof payment.amount === 'number' && Number.isSafeInteger(payment.amount) && payment.amount > 0 ? payment.amount : null;
}
