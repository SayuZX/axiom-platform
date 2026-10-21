// Node24, sync-ui.mjs: package the canonical dashboard into the FiveM NUI resource.
import {readdirSync,mkdirSync,copyFileSync} from 'node:fs';
import {join,extname} from 'node:path';
const source=join(import.meta.dirname,'public');
const target=join(import.meta.dirname,'resource','axiom_guard','ui');
const extensions=new Set(['.html','.js','.css','.ttf']);
mkdirSync(target,{recursive:true});
for(const entry of readdirSync(source,{withFileTypes:true})){
  if(entry.isFile()&&!entry.name.startsWith('.')&&(extensions.has(extname(entry.name))||entry.name==='Montserrat-OFL.txt')){
    copyFileSync(join(source,entry.name),join(target,entry.name));
  }
}
console.log('Packaged public dashboard assets into resource/axiom_guard/ui; no server credentials included.');
