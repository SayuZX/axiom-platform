const test=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const Module=require('node:module');
const path=require('node:path');
test('key restricted models never appear in another key picker',async()=>{
 const saved={window:global.window,location:global.location,localStorage:global.localStorage,fetch:global.fetch};
 const store=new Map();
 global.window=new EventTarget();window.location={origin:'https://ai.axiomcreative.xyz'};global.location=window.location;
 global.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 global.fetch=async url=>url.endsWith('/session')?Response.json({customer:{id:'c1',name:'Name',email:'name@example.com'},keys:[{id:'one',name:'Limited',models:['ax/model-one']},{id:'two',name:'Full',models:['ax/model-one','ax/model-two']}],models:[{id:'ax/model-one',name:'One'},{id:'ax/model-two',name:'Two'}]}):Response.json({version:0,titles:[],content:{}});
 try{
  const code=buildSync({stdin:{contents:"export { initializeAxiom } from './src/lib/axiom'; export { loadEndpointStore, saveEndpointStore } from './src/lib/endpointProfiles';",resolveDir:path.resolve(__dirname,'..'),sourcefile:'scope.ts',loader:'ts'},bundle:true,write:false,format:'cjs',platform:'node',external:['react']}).outputFiles[0].text;
  const mod=new Module(__filename+'.fixture',module);mod.paths=module.paths;mod._compile(code,__filename);
  await mod.exports.initializeAxiom();
  const data=mod.exports.loadEndpointStore();
  assert.deepEqual(data.profiles.find(p=>p.id==='one').models,['ax/model-one']);
  assert.deepEqual(data.profiles.find(p=>p.id==='two').models,['ax/model-one','ax/model-two']);
  assert.throws(()=>mod.exports.saveEndpointStore({...data,profiles:data.profiles.map(p=>p.id==='one'?{...p,model:'ax/model-two'}:p)},{}),/tidak tersedia/);
 }finally{for(const [key,val] of Object.entries(saved)){if(val===undefined)delete global[key];else global[key]=val}}
});
