import { createHmac } from 'node:crypto';
import { merchantDb, loadSession, deleteSession, setting, saveSetting, rateLimit } from '../../../lib/merchant-store.mjs';
import { startLogin, continueLogin } from '../../../lib/merchant-auth.mjs';
import { reconcileCheckout } from '../../../lib/merchant-commerce.mjs';
import { billingStats, billingPackages, savePackage, deletePackage, billingOrders, syncBillingOrder, billingKeys, updateBillingKey, updateBillingAccount } from '../../../lib/merchant-billing.mjs';
import { MERCHANT_COOKIE, cookieValue, sessionCookie, requireOrigin, bodyJson, boundedText, json, errorResponse, fail, merchantRequest, routerAdmin, routerSettings, clientIp, sameSecret, qrImage } from '../../../lib/merchant-http.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request, context) {
  try {
    const { path } = await context.params;
    const route = path.join('/');
    const method = request.method;
    if (route === 'webhook' && method === 'POST') {
      const raw = await boundedText(request);
      let payload;
      try { payload = JSON.parse(raw); } catch { throw fail(400,'Webhook tidak valid.','invalid_webhook'); }
      if (payload.event !== 'transaction.received' || typeof payload.event_id !== 'string' || payload.event_id.length > 128 || !payload.transaction?.order_id) throw fail(400,'Webhook tidak lengkap.','invalid_webhook');
      const age = Date.now() - Date.parse(payload.timestamp);
      if (!Number.isFinite(age) || age < -60_000) throw fail(401,'Waktu webhook tidak valid.','invalid_webhook');
      const account = await setting('website_merchant');
      if (!account?.key) throw fail(503,'Merchant belum dihubungkan.','merchant_not_configured');
      const signature = request.headers.get('x-signature');
      const expected = createHmac('sha256',account.key).update(raw).digest('hex');
      if (!sameSecret(signature,expected)) throw fail(401,'Tanda tangan webhook tidak valid.','invalid_signature');
      const [[order]] = await merchantDb().execute('SELECT merchant_user_id FROM bridge_checkout WHERE id=?',[payload.transaction.order_id]);
      if (!order || order.merchant_user_id !== account.userId) return json({received:true});
      const [[seen]] = await merchantDb().execute('SELECT event_id FROM bridge_webhook_events WHERE event_id=?',[payload.event_id]);
      if (seen) return json({received:true});
      // Payload alone never grants tokens; re-query the order through the provider-backed backend.
      await reconcileCheckout(payload.transaction.order_id,null,{trusted:true});
      await merchantDb().execute('INSERT IGNORE INTO bridge_webhook_events(event_id,order_id) VALUES(?,?)',[payload.event_id,payload.transaction.order_id]);
      return json({received:true});
    }
    if (method === 'POST') requireOrigin(request);
    if (!await routerAdmin(request)) throw fail(401,'Login admin situs diperlukan untuk mengatur QRIS.','admin_required');
    if (route === 'router-messages' && (method === 'GET' || method === 'POST')) {
      const result = await routerSettings(request, { method: method === 'POST' ? 'PATCH' : 'GET', body: method === 'POST' ? { apiMessageSettings: await bodyJson(request) } : undefined });
      return json({ apiMessageSettings: result.apiMessageSettings || {} });
    }
    if (path[0] === 'billing') {
      if (method === 'GET' && route === 'billing/stats') return json(await billingStats());
      if (method === 'GET' && route === 'billing/packages') return json(billingPackages());
      if (method === 'POST' && route === 'billing/packages') return json(savePackage(await bodyJson(request)),201);
      if (path[1] === 'packages' && method === 'POST') {
        if (path.length === 3) return json(savePackage(await bodyJson(request),path[2]));
        if (path.length === 4 && path[3] === 'delete') return json(deletePackage(path[2]));
      }
      if (method === 'GET' && route === 'billing/keys') return json(billingKeys());
      if (method === 'POST' && path[1] === 'keys' && path.length === 3) return json(updateBillingKey(path[2],await bodyJson(request)));
      if (method === 'POST' && path[1] === 'accounts' && path.length === 3) return json(updateBillingAccount(path[2],await bodyJson(request)));
      if (method === 'GET' && route === 'billing/orders') {
        const query = new URL(request.url).searchParams;
        return json(await billingOrders(Number(query.get('page') || 1),query.get('status') || ''));
      }
      if (method === 'POST' && path[1] === 'orders' && path.length === 4 && ['sync','cancel'].includes(path[3])) return json(await syncBillingOrder(path[2],path[3]==='cancel'));
      throw fail(404,'Rute billing tidak ditemukan.','not_found');
    }
    const token = cookieValue(request,MERCHANT_COOKIE);
    if (route === 'admin/status' && method === 'GET') {
      const account = await setting('website_merchant');
      return json({isAdmin:true,configured:Boolean(account),accountLabel:account?.accountLabel || null});
    }
    if (route === 'login/start' && method === 'POST') {
      await rateLimit('merchant-start:'+clientIp(request),6,60);
      const result = await startLogin(await bodyJson(request),token);
      const {token:newToken,...view}=result;
      return json(view,200,{'Set-Cookie':sessionCookie(newToken)});
    }
    if (route === 'login/continue' && method === 'POST') {
      await rateLimit('merchant-otp:'+clientIp(request),8,60);
      return json(await continueLogin(token,await bodyJson(request)));
    }
    if (route === 'logout' && method === 'POST') {
      await deleteSession(token);
      return json({ok:true},200,{'Set-Cookie':sessionCookie('',true)});
    }
    const draft = await loadSession(token);
    const account = await setting('website_merchant');
    if (route === 'session' && method === 'GET') {
      if (new URL(request.url).searchParams.get('setup') === '1' && (!draft || draft.phase === 'complete')) return json({authenticated:false,connected:false,role:'pending',can_balance:false,merchant_id:null,phase:'start'});
      const current = draft || (account && {...account,phase:'complete'});
      if (!current) return json({authenticated:false,connected:false,role:'pending',can_balance:false,merchant_id:null,phase:'start'});
      if(current.phase !== 'complete') return json({authenticated:true,connected:false,role:'pending',can_balance:false,merchant_id:null,phase:current.phase,accountLabel:current.accountLabel || current.email,...(current.phase==='method'&&current.methods?.length ? {methods:current.methods} : {}),...(current.phase==='account' ? {accounts:current.accounts.map(a=>({id:a.id,name:a.name}))} : {})});
      const me = await merchantRequest('/api/auth/me',current.key);
      return json({authenticated:true,connected:me.authenticated === true && Boolean(me.merchant_id),role:me.role,can_balance:me.can_balance === true,merchant_id:me.merchant_id,phase:'complete',pending_save:draft?.phase==='complete',accountLabel:current.accountLabel || current.email});
    }
    if (route === 'admin/select' && method === 'POST') {
      if (draft?.phase !== 'complete') throw fail(409,'Selesaikan koneksi merchant milik situs.','login_incomplete');
      const me = await merchantRequest('/api/auth/me',draft.key);
      if (!me.authenticated || !me.merchant_id) throw fail(409,'Merchant situs belum terhubung.','merchant_not_connected');
      if (account && account.merchantId !== me.merchant_id) throw fail(409,'Penerima pembayaran situs sudah terikat ke merchant lain.','owner_merchant_mismatch');
      const session = draft;
      await merchantRequest('/api/webhook/register',session.key,{method:'POST',body:{url:'https://ai.axiomcreative.xyz/merchant-api/webhook',events:['transaction.received'],api_key:session.key}});
      await saveSetting('website_merchant',{key:session.key,userId:session.userId,merchantId:me.merchant_id,email:session.email,accountLabel:session.accountLabel || session.email});
      await deleteSession(token);
      return json({configured:true,accountLabel:session.accountLabel || session.email},200,{'Set-Cookie':sessionCookie('',true)});
    }
    if (!['history','payments','balance'].includes(route) && !(path.length===3&&path[0]==='payments'&&['status','cancel','qr'].includes(path[2]))) throw fail(404,'Halaman tidak ditemukan.','not_found');
    if (!account) throw fail(409,'Hubungkan QRIS merchant milik situs terlebih dahulu.','merchant_not_configured');
    const session = account;
    if (route === 'history' && method === 'GET') {
      const page=Number(new URL(request.url).searchParams.get('page') || 1);
      if(!Number.isSafeInteger(page)||page<1||page>10000) throw fail(400,'Halaman tidak valid.','invalid_page');
      return json(await merchantRequest('/api/payment/list?page='+page+'&limit=20',session.key));
    }
    if (route === 'payments' && method === 'POST') {
      await rateLimit('merchant-generate:'+session.userId,15,60);
      const input=await bodyJson(request);
      if(!Number.isSafeInteger(input.amount)||input.amount<1||input.amount>10000000)throw fail(400,'Nominal harus bilangan bulat Rupiah antara 1 dan 10.000.000.','invalid_amount');
      if(!/^[a-f0-9-]{36}$/.test(input.order_id || ''))throw fail(400,'ID invoice tidak valid.','invalid_order');
      return json(await merchantRequest('/api/payment/generate-qris',session.key,{method:'POST',body:{amount:input.amount,order_id:input.order_id}}),201);
    }
    if (path.length===3&&path[0]==='payments'&&/^[a-zA-Z0-9_-]{1,64}$/.test(path[1])) {
      if(path[2]==='status'&&method==='GET')return json(await merchantRequest('/api/payment/status/'+path[1],session.key));
      if(path[2]==='cancel'&&method==='POST')return json(await merchantRequest('/api/payment/cancel/'+path[1],session.key,{method:'POST',body:{}}));
      if(path[2]==='qr'&&method==='GET')return await qrImage(await merchantRequest('/api/payment/status/'+path[1],session.key));
    }
    if (route==='balance'&&method==='GET') {
      const me=await merchantRequest('/api/auth/me',session.key);
      if(me.can_balance!==true||me.role!=='admin')throw fail(403,'Akun kasir tidak dapat mengakses saldo merchant.','balance_forbidden');
      const balance=await merchantRequest('/api/wallet/balance',session.key);
      const amounts = balance.provider_balance;
      if(balance.currency!=='IDR'||balance.unit!=='unverified'||balance.available!==true||!amounts||!Object.keys(amounts).length||!Object.values(amounts).every(Number.isFinite))throw fail(502,'Format saldo provider belum dapat diverifikasi.','balance_format');
      return json({amount:null,currency:'IDR',available:true,unit:'unverified',provider_balance:amounts,message:'Satuan saldo provider belum terverifikasi.'});
    }
    throw fail(404,'Halaman tidak ditemukan.','not_found');
  } catch(error) {
    const response=errorResponse(error);
    if(error.sessionToken)response.headers.set('Set-Cookie',sessionCookie(error.sessionToken));
    return response;
  }
}

export function GET(request,context){return handle(request,context);}
export function POST(request,context){return handle(request,context);}
