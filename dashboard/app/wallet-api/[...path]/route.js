// JavaScript, wallet API, Next.js16: authenticated site credits, never provider credentials.
import { requireCustomer } from '../../../lib/customer-auth.mjs';
import { walletSummary,purchaseWithWallet } from '../../../lib/customer-wallet.mjs';
import { createTopup } from '../../../lib/merchant-commerce.mjs';
import { rateLimit } from '../../../lib/merchant-store.mjs';
import { requireOrigin,bodyJson,json,errorResponse,fail } from '../../../lib/merchant-http.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request,context){
  try{
    if(request.method==='POST')requireOrigin(request);
    const customer=await requireCustomer(request);
    const route=(await context.params).path.join('/');
    if(request.method==='GET'&&route==='summary')return json(await walletSummary(customer));
    if(request.method==='POST'&&route==='topups'){
      await rateLimit('wallet-topup:'+customer.id,5,300);
      const input=await bodyJson(request);
      return json(await createTopup(input.amount,customer),201);
    }
    if(request.method==='POST'&&route==='purchase'){
      await rateLimit('wallet-purchase:'+customer.id,15,300);
      return json(await purchaseWithWallet(await bodyJson(request),customer),201);
    }
    throw fail(404,'Halaman saldo tidak ditemukan.','not_found');
  }catch(error){return errorResponse(error);}
}
export function GET(request,context){return handle(request,context);}
export function POST(request,context){return handle(request,context);}
