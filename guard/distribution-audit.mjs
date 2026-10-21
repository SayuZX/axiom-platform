// Node24, distribution-audit.mjs, Windows server-only resolved download audit.
import {readFile,mkdir,writeFile,readdir,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile);
function glob(pattern){
  if(typeof pattern!=='string'||pattern.length>2048)throw Error('Invalid resource metadata pattern');
  pattern=pattern.replaceAll('\\','/');
  if(pattern.startsWith('/')&&!pattern.startsWith('//'))pattern=pattern.slice(1);
  if(pattern.startsWith('/')||pattern.includes(':')||pattern.split('/').some(x=>x==='..'||x==='.')||pattern.includes('\0'))throw Error('Unsafe resource metadata pattern: '+pattern);
  let out='^';
  for(let i=0;i<pattern.length;i++){
    if(pattern.slice(i,i+3)==='**/'){out+='(?:.*/)?';i+=2;}
    else if(pattern.slice(i,i+2)==='**'){out+='.*';i++;}
    else if(pattern[i]==='*')out+='[^/]*';
    else if(pattern[i]==='?')out+='[^/]';
    else out+=pattern[i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }
  return new RegExp(out+'$','i');
}
export async function auditDistribution({metadataPath,executable,outputDir}){
  const metadata=JSON.parse(await readFile(metadataPath,'utf8'));
  if(metadata.version!==1||!Array.isArray(metadata.resources)||metadata.resources.length>4096)throw Error('Invalid native publication metadata');
  const resources=new Map(),publicFiles=new Set(),privateFiles=new Set();let total=0;
  for(const row of metadata.resources){
    if(!row||typeof row.name!=='string'||!row.name.length||row.name.length>128||/[\\/\x00-\x1f]/.test(row.name)||typeof row.root!=='string'||!row.metadata||resources.has(row.name))throw Error('Invalid/duplicate resource identity');
    const root=resolve(row.root),files=[];
    async function walk(directory,prefix=''){
      for(const entry of await readdir(directory,{withFileTypes:true})){
        const relative=prefix+entry.name;
        if(++total>500000)throw Error('Resource tree exceeds audit limit');
        if(entry.isSymbolicLink())throw Error('Reparse/symlink resource publication requires explicit review: '+row.name+'/'+relative);
        if(entry.isDirectory())await walk(join(directory,entry.name),relative+'/');
        else if(entry.isFile())files.push(relative);
      }
    }
    if((await lstat(root)).isSymbolicLink())throw Error('Reparse resource root denied');
    await walk(root);
    resources.set(row.name,{...row,files});
  }
  function matches(row,patterns){
    if(!Array.isArray(patterns)||patterns.length>10000)throw Error('Invalid resource metadata entries');
    const results=new Set();
    for(let pattern of patterns){
      let target=row;
      if(typeof pattern!=='string')throw Error('Non-string resource metadata entry');
      if(pattern.startsWith('@')){
        const slash=pattern.indexOf('/');
        target=resources.get(pattern.slice(1,slash));pattern=pattern.slice(slash+1);
        if(!target)continue;
      }
      const matcher=glob(pattern);
      for(const path of target.files)if(matcher.test(path))results.add(target.name+'/'+path);
    }
    return results;
  }
  const shared=new Set();
  for(const row of resources.values()){
    for(const path of matches(row,[...(row.metadata.client_script||[]),...(row.metadata.shared_script||[])]))shared.add(path);
    for(const path of matches(row,[...(row.metadata.file||[]),...(row.metadata.client_script||[]),...(row.metadata.shared_script||[])]))publicFiles.add(path);
    for(const path of row.files)if(path.toLowerCase().startsWith('stream/'))publicFiles.add(row.name+'/'+path);
    for(const path of matches(row,row.metadata.server_script||[]))privateFiles.add(path);
  }
  for(const path of shared)privateFiles.delete(path);
  await mkdir(outputDir,{recursive:true});
  const publicPath=join(outputDir,'distribution-public.list'),privatePath=join(outputDir,'distribution-private.list');
  const lines=items=>[...items].sort().join('\n')+(items.size?'\n':'');
  await writeFile(publicPath,lines(publicFiles),'utf8');await writeFile(privatePath,lines(privateFiles),'utf8');
  let result;
  try{result=await execute(executable,['distribution',publicPath,privatePath],{timeout:60000,maxBuffer:8*1024*1024,windowsHide:true});}
  catch(error){if((error.code===1||error.code===2)&&error.stdout)result=error;else throw error;}
  const report=JSON.parse(result.stdout);
  if(typeof report.ok!=='boolean'||!Array.isArray(report.violations)||!Number.isInteger(report.checked))throw Error('Invalid native publication result');
  return {...report,resources:resources.size,privateFiles:privateFiles.size,metadataPath,checkedAt:new Date().toISOString()};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const result=await auditDistribution({metadataPath:process.argv[2],executable:process.argv[3],outputDir:process.argv[4]});console.log(JSON.stringify(result));process.exitCode=result.ok?0:2;}
  catch(error){console.error(error.message);process.exitCode=1;}
}
