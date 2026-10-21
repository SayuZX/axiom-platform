const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const {renderToStaticMarkup}=require('react-dom/server');
const built=require('esbuild').buildSync({entryPoints:['src/mobile/MobilePresence.tsx'],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime']}).outputFiles[0].text;
test('departing mobile dialog retains content, blocks input and cancels stale removal on reopen',()=>{
 const original=global.window,cells=[],jobs=new Map();let cursor=0,next=0;
 global.window={setTimeout(fn){jobs.set(++next,fn);return next},clearTimeout(id){jobs.delete(id)}};
 const hooks={useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return[cells[i],v=>cells[i]=v]},useRef(initial){const i=cursor++;return cells[i]||=( {current:initial})},useEffect(fn,deps){const i=cursor++,prev=cells[i];if(!prev||deps.some((d,j)=>d!==prev.deps[j])){prev?.cleanup?.();cells[i]={deps,cleanup:fn()}}}};
 const fixture=new Module(__filename+'.fixture',module);fixture.paths=module.paths;fixture.require=n=>n==='react'?hooks:require(n);fixture._compile(built,__filename);
 function render(show,text){cursor=0;return renderToStaticMarkup(fixture.exports.MobilePresence({show,children:text}))}
 try{
  assert.match(render(true,'First dialog'),/First dialog/);
  const leaving=render(false,'Unrelated next content');assert.match(leaving,/m-leaving/);assert.match(leaving,/inert/);assert.match(leaving,/First dialog/);assert.doesNotMatch(leaving,/Unrelated/);
  assert.match(render(true,'Reopened'),/Reopened/);assert.equal(jobs.size,0);
  render(false,'Closed');for(const fn of jobs.values())fn();jobs.clear();assert.equal(render(false,'Closed'),'');
 }finally{global.window=original}
});
