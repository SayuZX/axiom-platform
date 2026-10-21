import { readFileSync } from 'node:fs';
import { requireCustomer } from '../../../../lib/customer-auth.mjs';
import { customerKeys } from '../../../../lib/customer-dashboard.mjs';
import { routerDb } from '../../../../lib/merchant-commerce.mjs';
import { getSiteCatalog } from '../../../../lib/site-catalog.mjs';
import { boundedText, errorResponse, fail, json, requireOrigin } from '../../../../lib/merchant-http.mjs';
import { internalHeaders, keyUsage, scopedKey } from '../../../../lib/axiom-chat-bridge.mjs';
import { fetchPublicCatalog } from '../../../../lib/axiom-public-catalog.mjs';
import modelPolicy from '../../../../lib/model-policy.cjs';
const { policyAllowsModel } = modelPolicy;
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=100;
const ruby='http://127.0.0.1:3090';
const secretFile=process.env.AXIOM_CHAT_SECRET_FILE||'C:/ProgramData/AxiomAi/Chat/internal.key';

async function handle(request,context){
 try{
  if(request.method!=='GET') requireOrigin(request);
  const customer=await requireCustomer(request);
  const {path}=await context.params;
  const route=path.join('/');
  if(request.method==='GET' && route==='catalog'){
   return json(await fetchPublicCatalog(new URL(request.url).searchParams.get('kind')));
  }
  const owned=(await customerKeys(customer)).keys;
  if(request.method==='GET' && route==='session'){
   const catalog=await getSiteCatalog();
   if(!catalog.available) throw fail(503,'Katalog model tidak tersedia.','catalog_unavailable');
   const keys=owned.filter(key=>key.usable).map(key=>({id:key.id,name:key.name,models:catalog.models.filter(model=>policyAllowsModel(key,model.id)).map(model=>model.id)}));
   const allowed=new Set(keys.flatMap(key=>key.models));
   return json({customer:{id:customer.id,name:customer.name,email:customer.email},keys,models:catalog.models.filter(model=>allowed.has(model.id)).map(({id,name})=>({id,name}))});
  }
  if(request.method==='GET' && path[0]==='key' && path[2]==='usage' && path.length===3){
   return json(keyUsage(routerDb(),owned,path[1]));
  }
  if(path[0]==='key' && path[2]==='v1' && path.length>=4){
   const keyId=path[1];
   if(request.method==='GET' && route.endsWith('/models') && path.length===4){
    const key=scopedKey(owned,keyId);
    const catalog=await getSiteCatalog();
    if(!catalog.available) throw fail(503,'Katalog model tidak tersedia.','catalog_unavailable');
    return json({object:'list',data:catalog.models.filter(model=>policyAllowsModel(key,model.id)).map(model=>({id:model.id,object:'model',owned_by:'axiom'}))});
   }
   if(request.method==='POST' && route.endsWith('/chat/completions') && path.length===5){
    const text=await boundedText(request,8*1024*1024);
    let body;try{body=JSON.parse(text)}catch{throw fail(400,'JSON tidak valid.','invalid_json')}
    if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.model!=='string'||!Array.isArray(body.messages)) throw fail(400,'Permintaan chat tidak valid.','invalid_request');
    const catalog=await getSiteCatalog();
    if(!catalog.available) throw fail(503,'Katalog model tidak tersedia.','catalog_unavailable');
    scopedKey(owned,keyId,body.model,catalog.models);
    const key=routerDb().prepare('SELECT key FROM apiKeys WHERE id=?').get(keyId)?.key;
    if(!key) throw fail(404,'API key tidak ditemukan.','key_not_found');
    return forward(request,'/v1/chat/completions',{customerId:customer.id,keyId,key},text);
   }
  }
  if(route==='history' && (request.method==='GET'||request.method==='PUT')){
   const body=request.method==='PUT'?await boundedText(request,2*1024*1024):undefined;
   return forward(request,'/history',{customerId:customer.id},body);
  }
  throw fail(404,'Rute tidak ditemukan.','not_found');
 }catch(error){return errorResponse(error?.status?error:fail(503,'Playground sementara tidak tersedia.','service_unavailable'))}
}
async function forward(request,path,identity,body){
 const headers={...internalHeaders(identity,readFileSync(secretFile))};
 if(body!==undefined) headers['content-type']='application/json';
 const upstream=await fetch(ruby+path,{method:request.method,headers,body,signal:request.signal,cache:'no-store',redirect:'error'});
 const outputHeaders={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
 for(const name of ['content-type','retry-after']){const value=upstream.headers.get(name);if(value)outputHeaders[name]=value}
 return new Response(upstream.body,{status:upstream.status,headers:outputHeaders});
}
export function GET(request,context){return handle(request,context)}
export function POST(request,context){return handle(request,context)}
export function PUT(request,context){return handle(request,context)}
