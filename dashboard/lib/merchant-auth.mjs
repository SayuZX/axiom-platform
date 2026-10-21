import { merchantDb, createSession, loadSession, saveSession, setting, saveSetting } from './merchant-store.mjs';
import { fail, merchantRequest, validEmail } from './merchant-http.mjs';

function requireData(result) {
  if (result?.success === false || result?.errors?.length || !result?.data) throw fail(422, 'Verifikasi ditolak provider. Periksa data/OTP atau selesaikan verifikasi melalui aplikasi merchant resmi.', 'provider_verification_required');
  return result.data;
}

export function secondFactorChallenge(result) {
  const expected = result?.success === false && Array.isArray(result.errors) && result.errors.length > 0 && result.errors.every(error => error.code === 'auth:error:need_2fa');
  if (!expected) requireData(result);
  const data = result?.data;
  if (typeof data?.verification_id !== 'string' || !data.verification_id || typeof data['2fa_token'] !== 'string' || !data['2fa_token']) throw fail(422, 'Tantangan verifikasi GoPay tidak lengkap.', 'provider_verification_required');
  const methods = Array.isArray(data.methods) ? data.methods : [];
  const method = methods.includes('otp_wa') ? 'otp_wa' : null;
  if (!method) throw fail(422, 'WhatsApp tidak tersedia untuk verifikasi ini. Selesaikan verifikasi melalui aplikasi merchant resmi.', 'provider_verification_required');
  return { verificationId: data.verification_id, token2: data['2fa_token'], method };
}

export function secondFactorOtpToken(result) {
  const data = requireData(result);
  if (result.success !== true || typeof data.otp_token !== 'string' || !data.otp_token) throw fail(422, 'GoPay belum menerima permintaan OTP WhatsApp.', 'provider_verification_required');
  // Ancillary FR tokens do not grant access; OTP verify and token exchange still decide authentication.
  return data.otp_token;
}
function presented(state) {
  const value = { phase: state.phase, accountLabel: state.accountLabel || state.email };
  if (state.phase === 'method') value.methods = state.methods || [];
  if (state.phase === 'account') value.accounts = (state.accounts || []).map(a => ({ id: a.id, name: a.name }));
  return value;
}
const fields = state => ({ email: state.email });

export async function startLogin(input, existingToken) {
  const email = validEmail(input.email);
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  if (phone && !/^\+?\d{7,16}$/.test(phone)) throw fail(400, 'Nomor telepon tidak valid.', 'invalid_phone');
  const country_code = String(input.country_code || '+62').trim().replace(/^\+?/, '+');
  if (!/^\+\d{1,3}$/.test(country_code)) throw fail(400, 'Kode negara tidak valid.', 'invalid_country');
  const old = await loadSession(existingToken);
  let token = existingToken;
  let state = old?.phase !== 'complete' && old?.email === email ? old : null;
  if (!state) {
    // One existing merchant belongs to this site; buyers never provision accounts.
    let owner = await setting('owner_connection');
    if (owner && owner.email !== email) throw fail(409, 'Pengaturan situs sudah terikat ke email merchant lain.', 'owner_email_mismatch');
    if (!owner) {
      const data = requireData(await merchantRequest('/api/auth/owner', null, { method: 'POST', body: { email } }));
      if (!data.api_key || !data.user_id) throw fail(502, 'Koneksi merchant situs tidak lengkap.', 'upstream_invalid');
      owner = {email,key:data.api_key,userId:data.user_id};
      await saveSetting('owner_connection',owner);
    }
    state = { ...owner, phone, country_code, phase: 'start' };
    token = await createSession(state);
  }
  Object.assign(state, {phone,country_code});
  try {
    const result = requireData(await merchantRequest('/api/auth/login-methods', state.key, { method: 'POST', body: fields(state) }));
    const methods = Array.isArray(result.methods) ? result.methods.filter(m => ['otp_email','otp_sms','otp_wa'].includes(m)) : [];
    if (!result.verification_id || !methods.length) throw fail(422, 'Provider memerlukan verifikasi lain. Gunakan aplikasi merchant resmi untuk menyelesaikannya.', 'provider_verification_required');
    Object.assign(state, { methods, verificationId: result.verification_id, phase: 'method' });
    await saveSession(token, state);
    return { token, ...presented(state) };
  } catch (error) {
    error.sessionToken = token;
    throw error;
  }
}

async function complete(state) {
  const me = await merchantRequest('/api/auth/me', state.key);
  if (!me.authenticated || !me.merchant_id || !['admin','cashier'].includes(me.role)) throw fail(422, 'Merchant belum terhubung atau izin akun belum dapat diverifikasi.', 'merchant_not_connected');
  state.phase = 'complete';
  state.merchantId = me.merchant_id;
  state.role = me.role;
  delete state.methods; delete state.accounts; delete state.verificationId; delete state.otpToken; delete state.token1; delete state.token2;
  return state;
}

export async function continueLogin(token, input) {
  const db = await merchantDb().getConnection();
  try {
    await db.beginTransaction();
    const state = await loadSession(token, db, true);
    if (!state) throw fail(409, 'Sesi pengaturan berakhir. Hubungkan kembali merchant situs.', 'session_expired');
    const post = (route, body) => merchantRequest('/api/auth/' + route, state.key, { method: 'POST', body: { ...fields(state), ...body } });
    if (state.phase === 'method') {
      if (!state.methods?.includes(input.method)) throw fail(400, 'Metode OTP tidak tersedia.', 'invalid_method');
      const data = requireData(await post('otp-initiate', { verification_id: state.verificationId, method: input.method, ...(input.method !== 'otp_email' ? { phone: state.phone } : {}) }));
      if (!data.otp_token) throw fail(502, 'Provider tidak mengirim token OTP.', 'upstream_invalid');
      Object.assign(state, { method: input.method, otpToken: data.otp_token, phase: 'otp1' });
    } else if (state.phase === 'otp1') {
      if (!/^\d{4,8}$/.test(input.otp || '')) throw fail(400, 'Kode OTP harus 4–8 digit.', 'invalid_otp');
      const verified = requireData(await post('otp-verify', { verification_id: state.verificationId, otp_token: state.otpToken, otp_code: input.otp, method: state.method }));
      if (!verified.verification_token) throw fail(422, 'Verifikasi lanjutan diperlukan di aplikasi merchant resmi.', 'provider_verification_required');
      const accounts = requireData(await post('account-list', { verification_token: verified.verification_token }));
      const list = accounts.account_list || accounts.accounts;
      if (!accounts['1fa_token'] || !Array.isArray(list) || !list.length) throw fail(502, 'Daftar akun merchant tidak tersedia.', 'upstream_invalid');
      state.accounts = list.map(a => ({ id: a.account_id || a.id, name: a.name || a.account_id || a.id })).filter(a => typeof a.id === 'string');
      state.token1 = accounts['1fa_token'];
      state.phase = 'account';
      delete state.otpToken;
    } else if (state.phase === 'account') {
      const selected = state.accounts?.find(a => a.id === input.account_id);
      if (!selected) throw fail(400, 'Akun merchant tidak tersedia.', 'invalid_account');
      const exchanged = await post('exchange-1fa', { account_id: selected.id, token_1fa: state.token1 });
      state.accountId = selected.id; state.accountLabel = selected.name;
      if (exchanged.success === true && !exchanged.errors?.length && exchanged.data?.access_token && exchanged.data?.refresh_token) await complete(state);
      else {
        // need_2fa is a challenge, never authenticated access. Use only its offered OTP methods.
        const challenge = secondFactorChallenge(exchanged);
        const otpToken = secondFactorOtpToken(await post('initiate-2fa-otp', { verification_id: challenge.verificationId, method: challenge.method }));
        Object.assign(state, challenge, { otpToken, phase: 'otp2' });
      }
    } else if (state.phase === 'otp2') {
      if (!/^\d{4,8}$/.test(input.otp || '')) throw fail(400, 'Kode OTP harus 4–8 digit.', 'invalid_otp');
      const verified = requireData(await post('verify-2fa-otp', { verification_id: state.verificationId, otp_token: state.otpToken, otp_code: input.otp, method: state.method }));
      if (!verified.verification_token) throw fail(502, 'Verifikasi OTP tidak lengkap.', 'upstream_invalid');
      requireData(await post('exchange-2fa', { account_id: state.accountId, token_2fa: state.token2, verification_token: verified.verification_token }));
      await complete(state);
    } else if (state.phase !== 'complete') throw fail(409, 'Urutan login tidak valid.', 'invalid_phase');
    await saveSession(token, state, db);
    await db.commit();
    return presented(state);
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
