import { packages, createCheckout, reconcileCheckout, customerOrders } from '../../../lib/merchant-commerce.mjs';
import { rateLimit } from '../../../lib/merchant-store.mjs';
import { requireOrigin, bodyJson, json, errorResponse, fail, clientIp, qrImage } from '../../../lib/merchant-http.mjs';
import { requireCustomer } from '../../../lib/customer-auth.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request,context){
  try{
    const {path}=await context.params;
    const route=path.join('/');
    if(request.method==='POST')requireOrigin(request);
    if(route==='packages'&&request.method==='GET')return json(await packages());
    const customer=await requireCustomer(request);
    if(route==='orders'&&request.method==='GET')return json(await customerOrders(customer));
    if(route==='orders'&&request.method==='POST'){
      await rateLimit('checkout-create:'+clientIp(request),5,300);
      return json(await createCheckout(await bodyJson(request),customer),201);
    }
    if(path[0]==='orders'&&path.length>=2&&/^[a-f0-9-]{36}$/.test(path[1])){
      const legacyToken=request.headers.get('x-checkout-token');
      await rateLimit('checkout-status:'+clientIp(request),60,60);
      if(path.length===2&&request.method==='GET')return json(await reconcileCheckout(path[1],customer,{legacyToken}));
      if(path.length===3&&path[2]==='cancel'&&request.method==='POST')return json(await reconcileCheckout(path[1],customer,{legacyToken,cancel:true}));
      if(path.length===3&&path[2]==='qr'&&request.method==='GET')return await qrImage((await reconcileCheckout(path[1],customer,{legacyToken})).payment);
    }
    throw fail(404,'Halaman tidak ditemukan.','not_found');
  }catch(error){return errorResponse(error);}
}
export function GET(request,context){return handle(request,context);}
export function POST(request,context){return handle(request,context);}
