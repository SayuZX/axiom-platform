import { useEffect, useRef, useState, type RefObject } from 'react';
import { B, I } from './Desktop';
import { useHoverPreview } from './Motion';

export { HistoryList } from './HistoryList';

const groups=[[
 ['edit','Rename','Ctrl+Alt+R'],['pin','Pin','Ctrl+Alt+P']],
 [['bubble','New side chat','Ctrl+Alt+S'],['branch','Fork','›'],['clock','Add scheduled task...','']],
 [['upload','Share',''],['copy','Copy','›']],
 [['window','Open in new window','']],
 [['archive','Archive','Ctrl+Shift+A']]];
export function ConversationActions({pinned,onAction}:{pinned:boolean;onAction:(a:string)=>void}){
 const[sub,setSub]=useState('');
 return <div className="d-popover d-conversation-actions" role="menu" aria-label="Conversation options">{groups.map((group,i)=><div className="d-action-group" key={i}>{group.map(([icon,label,key])=><div className="d-action-wrapper" key={label} onMouseEnter={()=>setSub(label==='Copy'||label==='Fork'?label:'')}><button role="menuitem" onClick={()=>{if(label==='Copy'||label==='Fork'){setSub(sub===label?'':label);return}onAction(label)}}><I name={icon}/><span>{label==='Pin'&&pinned?'Unpin':label}</span><small>{key}</small></button>{sub===label&&<div className="d-action-submenu">{(label==='Copy'?['Copy conversation','Copy title']:['Fork chat']).map(a=><button key={a} onClick={()=>a==='Copy title'?(void navigator.clipboard.writeText(document.querySelector('.d-chat-header strong')?.textContent||'')):onAction(a)}>{a}</button>)}</div>}</div>)}</div>)}</div>
}

export function SummaryPanel({files,onOpen,outputs=[],processes=[]}:{files:{name:string;url:string;type?:string}[];onOpen:(s:string)=>void;outputs?:{id:string;title:string;url:string}[];processes?:{id:string;command?:string;status?:string}[]}){return <div className="d-popover d-summary"><section><h3>Outputs <B icon="plus" label="Add output" onClick={()=>onOpen('Add site')}/></h3>{outputs.length?outputs.map(item=><a key={item.id} href={item.url} target="_blank" rel="noreferrer"><I name="globe"/>{item.title}</a>):<p>No saved outputs</p>}</section><section><h3>Background processes</h3>{processes.length?processes.map(item=><p className="d-summary-process" key={item.id}><I name="terminal"/><span>{item.command} · {item.status}</span></p>):<p>No agent commands in this session</p>}</section><section><h3>Sources <B icon="plus" label="Add source" onClick={()=>onOpen('Files')}/></h3>{files.length?files.slice(0,3).map(f=><button className="d-summary-source" key={f.url} onClick={()=>onOpen('Files')}>{f.type?.startsWith('image/')?<img src={f.url} alt=""/>:<I name="page" size={24}/>}<span>{f.name}</span></button>):<p className="d-summary-empty">Open the file library for saved sources</p>}<button className="d-summary-all" onClick={()=>onOpen('Files')}><I name="share"/> View all</button></section></div>}

export function ConversationRail({scrollRef,messages,title}:{scrollRef:RefObject<HTMLDivElement|null>;messages:{role:string;text:string}[];title:string}){
 const[active,setActive]=useState(0);
 const rail=useRef<HTMLElement>(null);
 const preview=useHoverPreview<{index:number;top:number}>(80);
 const turns=messages.flatMap((message,index)=>message.role==='user'?[{title:message.text,reply:messages[index+1]?.role==='assistant'?messages[index+1].text:'',index}]:[]);
 useEffect(()=>{preview.close()},[messages,title]);
 function showPreview(index:number,button:HTMLElement,immediate=false){const nav=rail.current,root=button.closest<HTMLElement>('.d-root'),main=button.closest<HTMLElement>('.d-main');if(!nav||!root||!main)return;const scale=root.getBoundingClientRect().width/root.offsetWidth||1;const navRect=nav.getBoundingClientRect(),mainRect=main.getBoundingClientRect();const offset=(navRect.top-mainRect.top)/scale;const top=Math.max(12-offset,Math.min((button.getBoundingClientRect().top-navRect.top)/scale-45,main.offsetHeight-offset-180));preview.show({index,top},immediate)}
 useEffect(()=>{const el=scrollRef.current;if(!el)return;let frame=0;const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const elements=Array.from(el.querySelectorAll<HTMLElement>('.d-chat-message-user,[data-reference-turn]'));const top=el.getBoundingClientRect().top;let nearest=0;let distance=Infinity;elements.forEach((element,index)=>{const delta=Math.abs(element.getBoundingClientRect().top-top);if(delta<distance){nearest=index;distance=delta}});setActive(nearest)})};update();el.addEventListener('scroll',update,{passive:true});return()=>{cancelAnimationFrame(frame);el.removeEventListener('scroll',update)}},[messages,scrollRef]);
 function jump(index:number){const el=scrollRef.current;if(!el)return;const target=el.querySelectorAll<HTMLElement>('.d-chat-message-user,[data-reference-turn]')[index];if(target)el.scrollTo({top:target.getBoundingClientRect().top-el.getBoundingClientRect().top+el.scrollTop,behavior:'smooth'});setActive(index)}
 const turn=preview.data?turns[preview.data.index]:null;
 return <nav ref={rail} className="d-turn-rail" aria-label="Conversation positions" onMouseLeave={preview.leave} onMouseEnter={preview.keep}>{turns.map((turn,index)=>{const distance=preview.open&&preview.data?Math.abs(index-preview.data.index):-1;return <div className="d-turn-position" key={turn.index}><button aria-label={'Jump to '+turn.title} className={(active===index?'d-current ':'')+(distance===0?'d-preview-active':distance===1?'d-near':distance===2?'d-near-next':'')} onMouseEnter={event=>showPreview(index,event.currentTarget)} onFocus={event=>showPreview(index,event.currentTarget,true)} onBlur={preview.leave} onClick={()=>jump(index)}><span/></button></div>})}{preview.data&&turn&&<div className="d-turn-preview" data-open={preview.open} aria-hidden={!preview.open} style={{top:preview.data.top}}><b>{turn.title}</b><I name="bookmark" size={20}/><p>{turn.reply}</p></div>}</nav>
}
