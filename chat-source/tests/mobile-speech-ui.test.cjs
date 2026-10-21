const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const {renderToStaticMarkup}=require('react-dom/server');
const built=require('esbuild').buildSync({entryPoints:['src/mobile/MobileSpeech.tsx'],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime']}).outputFiles[0].text;
function fixture(mode){
 const saved={window:global.window,localStorage:global.localStorage,SpeechSynthesisUtterance:global.SpeechSynthesisUtterance};
 let engine,cursor=0,cancels=0;const cells=[],utterances=[],accepted=[],requests=[];
 class Recognition{constructor(){engine=this;}start(){}stop(){this.onend?.();}abort(){}}
 global.window={SpeechRecognition:Recognition,speechSynthesis:{getVoices(){return[];},speak(value){utterances.push(value);},cancel(){cancels++;}}};
 global.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};global.localStorage={getItem(){return null;}};
 const hooks={useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return[cells[i],v=>cells[i]=typeof v==='function'?v(cells[i]):v];},useRef(initial){const i=cursor++;return cells[i]||={current:initial};},useEffect(run){const i=cursor++;if(!cells[i])cells[i]={cleanup:run()};}};
 const mod=new Module(__filename+'.fixture',module);mod.paths=module.paths;mod.require=n=>n==='react'?hooks:require(n);mod._compile(built,__filename);
 const props={mode,onClose(){},onDictation(value){accepted.push(value);},async onReply(value){requests.push(value);return 'Balasan suara';}};
 function render(){cursor=0;return mod.exports.MobileSpeech(props);}
 function find(node,label){if(!node)return;if(Array.isArray(node)){for(const item of node){const result=find(item,label);if(result)return result;}}else if(typeof node==='object'){if(node.props?.['aria-label']===label)return node;return find(node.props?.children,label);}}
 return{render,click(label){const button=find(render(),label);assert.ok(button,label);return button.props.onClick();},get engine(){return engine;},requests,accepted,utterances,get cancels(){return cancels;},unmount(){for(const cell of cells)cell?.cleanup?.();},restore(){this.unmount();for(const [key,value]of Object.entries(saved)){if(value===undefined)delete global[key];else global[key]=value;}}};
}
test('voice opens without capturing audio; only a completed utterance is sent, then spoken and cleaned up',async()=>{
 const app=fixture('voice');try{
  app.render();assert.equal(app.engine,undefined);app.click('Start voice microphone');app.engine.onstart();
  app.engine.onresult({results:[{0:{transcript:'Halo suara'}}]});assert.deepEqual(app.requests,[]);app.engine.onend();await Promise.resolve();await Promise.resolve();
  assert.deepEqual(app.requests,['Halo suara']);assert.equal(app.utterances[0].text,'Balasan suara');assert.match(renderToStaticMarkup(app.render()),/Berbicara/);
  app.unmount();assert.ok(app.cancels>0);assert.equal(app.utterances[0].onend,null);
 }finally{app.restore();}
});
test('dictation previews text; accept inserts text without sending a chat',async()=>{
 const app=fixture('dictation');try{
  app.render();app.engine.onstart();app.engine.onresult({results:[{0:{transcript:'Teks untuk ditinjau'}}]});
  assert.deepEqual(app.accepted,[]);app.click('Accept dictation');await Promise.resolve();await Promise.resolve();
  assert.deepEqual(app.accepted,['Teks untuk ditinjau']);assert.deepEqual(app.requests,[]);
 }finally{app.restore();}
});
