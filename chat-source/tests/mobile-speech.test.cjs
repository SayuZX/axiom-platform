const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const built = require('esbuild').buildSync({entryPoints:['src/mobile/speechCapture.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const mod = new Module(__filename+'.fixture',module);mod._compile(built,__filename);
const {captureSpeech} = mod.exports;
function fixture() {
 const previous = global.window, events = [], text = [], errors = [], ended = [];
 let engine;
 class Recognition { constructor(){engine=this;} start(){events.push('start');} stop(){events.push('stop');} abort(){events.push('abort');} }
 global.window = {SpeechRecognition:Recognition};
 const capture = captureSpeech({language:'id-ID',continuous:true,onStart(){events.push('listening');},onText(value){text.push(value);},onError(error){errors.push(error);},onEnd(value){ended.push(value);}});
 return {capture,get engine(){return engine;},events,text,errors,ended,restore(){capture.cancel();if(previous===undefined)delete global.window;else global.window=previous;}};
}
function results(...values){return {results:values.map(transcript=>({0:{transcript}}))};}
test('speech does not claim listening until start; stop waits for final text rather than duplicating interim text',async()=>{
 const f=fixture();try{
  assert.deepEqual(f.events,['start']);assert.equal(f.engine.lang,'id-ID');assert.equal(f.engine.interimResults,true);
  f.engine.onstart();assert.deepEqual(f.events,['start','listening']);
  f.engine.onresult(results('Halo','dun'));f.engine.onresult(results('Halo','dunia'));
  const done=f.capture.stop();f.engine.onresult(results('Halo dunia!'));f.engine.onend();
  assert.equal(await done,'Halo dunia!');assert.deepEqual(f.ended,['Halo dunia!']);assert.equal(f.engine.onresult,null);
  assert.deepEqual(f.text,['Halo dun','Halo dunia','Halo dunia!']);
 }finally{f.restore();}
});
test('cancel resolves pending stop without accepting audio; late callbacks are ignored',async()=>{
 const f=fixture();try{
  const late=f.engine.onresult;f.engine.onresult(results('Jangan kirim'));const done=f.capture.stop();f.capture.cancel();late(results('Late audio'));
  assert.equal(await done,'');assert.deepEqual(f.ended,[]);assert.deepEqual(f.text,['Jangan kirim']);assert.ok(f.events.includes('abort'));
 }finally{f.restore();}
});
test('permission denial reports an error and never sends an utterance',async()=>{
 const f=fixture();try{
  f.engine.onerror({error:'not-allowed'});assert.match(f.errors[0],/Izin mikrofon ditolak/);assert.deepEqual(f.ended,[]);assert.equal(await f.capture.stop(),'');
 }finally{f.restore();}
});
test('unsupported speech engine is an explicit unavailable state',()=>{
 const previous=global.window;global.window={};try{assert.throws(()=>captureSpeech({}),/belum didukung/);}finally{if(previous===undefined)delete global.window;else global.window=previous;}
});
