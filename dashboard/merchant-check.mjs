// JavaScript, merchant-check.mjs, Node.js 24: payment trust-boundary regression checks.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { requireOrigin, bodyJson, qrImage, sameSecret } from './lib/merchant-http.mjs';
import { seal, unseal, hashToken } from './lib/merchant-store.mjs';
import { secondFactorChallenge, secondFactorOtpToken } from './lib/merchant-auth.mjs';
import { authorizeCheckout, createCheckout } from './lib/merchant-commerce.mjs';

const request = (origin, body) => new Request('https://ai.axiomcreative.xyz/merchant-api/payments', {method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body});
assert.throws(() => requireOrigin(request('https://evil.example','{}')), {code:'origin_denied'});
assert.deepEqual(await bodyJson(request('https://ai.axiomcreative.xyz','{"amount":12345}')), {amount:12345});
await assert.rejects(bodyJson(request('https://ai.axiomcreative.xyz','null')), {code:'invalid_json'});
await assert.rejects(bodyJson(request('https://ai.axiomcreative.xyz','x'.repeat(65537))), {code:'body_too_large'});
assert.equal(sameSecret('', ''), false);
assert.equal(sameSecret('abc', 'abcd'), false);
const key = process.env.MERCHANT_ENCRYPTION_KEY;
try {
  process.env.MERCHANT_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const sealed = seal({role:'cashier',userId:'operator'});
  assert.deepEqual(unseal(sealed),{role:'cashier',userId:'operator'});
  const changed = Buffer.from(sealed,'base64'); changed[15] ^= 1;
  assert.throws(() => unseal(changed.toString('base64')));
} finally { if(key === undefined)delete process.env.MERCHANT_ENCRYPTION_KEY;else process.env.MERCHANT_ENCRYPTION_KEY=key; }
for(const url of ['http://127.0.0.1:3082/health','https://api.midtrans.com.evil.example/v2/qris/tx/qr-code','https://user@api.midtrans.com/v2/qris/tx/qr-code','https://api.midtrans.com/v2/qris/other/qr-code','https://api.midtrans.com/v2/qris/tx/qr-code?redirect=1']) {
  await assert.rejects(qrImage({status:'pending',transaction_id:'tx',qr_image_url:url}), {code:'qr_invalid'});
}
await assert.rejects(qrImage({status:'settlement',transaction_id:'tx',qr_image_url:'https://api.midtrans.com/v2/qris/tx/qr-code'}), {code:'qr_unavailable'});
const challenge = { success:false, errors:[{code:'auth:error:need_2fa'}], data:{verification_id:'challenge-id','2fa_token':'challenge-token',methods:['fr','otp_sms','otp_wa']} };
assert.equal(secondFactorChallenge(challenge).method,'otp_wa');
assert.equal(secondFactorChallenge({...challenge,data:{...challenge.data,methods:['otp_wa']}}).method,'otp_wa');
for(const denied of [
  {...challenge,errors:[{code:'auth:error:invalid_token'}]},
  {...challenge,errors:[...challenge.errors,{code:'auth:error:denied'}]},
  {...challenge,data:{...challenge.data,methods:['fr']}},
  {...challenge,data:{...challenge.data,methods:['otp_sms']}},
  {...challenge,data:{...challenge.data,'2fa_token':null}},
]) assert.throws(()=>secondFactorChallenge(denied),{code:'provider_verification_required'});
const initiated = {success:true,data:{otp_token:'otp-token',fr_token_details:{challenge_token:'additional-challenge',user_token:'additional-user'}}};
assert.equal(secondFactorOtpToken(initiated),'otp-token');
for (const rejected of [{...initiated,success:false},{...initiated,errors:[{code:'verification_required'}]},{success:true,data:{fr_token_details:{challenge_token:'only-fr'}}}]) assert.throws(()=>secondFactorOtpToken(rejected),{code:'provider_verification_required'});
const customer={id:'customer-a',email:'buyer@example.invalid'};
const otherCustomer={id:'customer-b',email:customer.email};
const legacyToken=randomBytes(32).toString('base64url');
const historical={customer_id:null,token_hash:hashToken(legacyToken),email:customer.email};
assert.throws(()=>authorizeCheckout(historical,null,legacyToken),{code:'customer_login_required'});
assert.throws(()=>authorizeCheckout(historical,customer,null),{code:'not_found'});
assert.throws(()=>authorizeCheckout(historical,customer,randomBytes(32).toString('base64url')),{code:'not_found'});
assert.equal(authorizeCheckout(historical,customer,legacyToken),true);
assert.equal(authorizeCheckout({...historical,customer_id:customer.id},customer,null),false);
assert.throws(()=>authorizeCheckout({...historical,customer_id:customer.id},otherCustomer,legacyToken),{code:'not_found'});
await assert.rejects(createCheckout({package_id:'any',email:customer.email},null),{code:'customer_login_required'});
console.log('PASS: origin, JSON, encrypted sessions, provider OTP boundaries, authenticated checkout ownership and secret-bound legacy invoice migration.');
