import assert from 'node:assert/strict';
import { confirmedPaymentAmount } from './payment-success.ts';

const response = { success: true, data: { qris_id: 'invoice-1', status: 'PAID', amount: 12500 } };
assert.equal(confirmedPaymentAmount(response, 'invoice-1'), 12500);
for (const status of ['PENDING', 'EXPIRED', undefined]) {
  assert.equal(confirmedPaymentAmount({ ...response, data: { ...response.data, status } }, 'invoice-1'), null);
}
for (const amount of [0, -1, 1.5, '12500', Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(confirmedPaymentAmount({ ...response, data: { ...response.data, amount } }, 'invoice-1'), null);
}
assert.equal(confirmedPaymentAmount(response, 'another-invoice'), null);
assert.equal(confirmedPaymentAmount({ ...response, success: false }, 'invoice-1'), null);
assert.equal(confirmedPaymentAmount(null, 'invoice-1'), null);
console.log('Payment success validation passed.');
