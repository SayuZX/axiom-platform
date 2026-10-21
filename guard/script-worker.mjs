import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function runScript(code,player){
 const binary=process.env.GUARD_SCRIPT_WORKER||fileURLToPath(new URL(process.platform==='win32'?'./native/guard-script.exe':'./native/guard-script',import.meta.url));
 const p=player.position||{x:0,y:0,z:0};
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,[player.id,player.health??0,player.armor??0,p.x,p.y,p.z,player.name].map(String),{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',size=0,finished=false;
  const timer=setTimeout(()=>{child.kill();finish(new Error('Script worker timeout'));},2000);
  function finish(error,value){if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(value);}
  child.stdout.on('data',part=>{size+=part.length;if(size>65536){child.kill();finish(new Error('Script output limit'));}else output+=part.toString('utf8');});
  child.stderr.resume();child.on('error',error=>finish(error));child.stdin.on('error',()=>{});
  child.on('close',()=>{try{const report=JSON.parse(output);if(!report.ok)throw new Error(report.error||'Script failed');if(!Array.isArray(report.operations)||report.operations.length>16)throw new Error('Invalid script operations');finish(null,report);}catch(error){finish(error);}});
  child.stdin.end(code);
 });
}
