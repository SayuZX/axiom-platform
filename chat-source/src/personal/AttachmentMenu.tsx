import { useEffect, useRef } from 'react';
const entries=[
 ['upload','Add photos & files','Upload from computer'],
 ['library','Add from library','Browse and search your files'],
 ['image','Create image','Visualize anything'],
 ['tabs','Add browser tabs','Use open tabs'],
 ['web','Web search','Find real-time news and info'],
 ['research','Deep research','Get a detailed report'],
 ['sketch','Sketch','Draw and attach an image'],
];
export function AttachmentMenu({onSelect}:{onSelect:(action:string)=>void}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{ref.current?.querySelector('button')?.focus()},[]);
 return <div className="p-popover p-attach-menu p-tools-menu" role="menu" aria-label="Add tools and attachments" ref={ref} onKeyDown={e=>{const buttons=Array.from(ref.current?.querySelectorAll('button')||[]);const current=buttons.indexOf(document.activeElement as HTMLButtonElement);let next=current;if(e.key==='ArrowDown')next=(current+1)%buttons.length;else if(e.key==='ArrowUp')next=(current-1+buttons.length)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;e.preventDefault();buttons[next]?.focus()}}>{entries.map(([icon,label,description])=><button role="menuitem" key={icon} onClick={()=>onSelect(icon)}><svg viewBox="0 0 32 32" aria-hidden="true"><use href={'/axiom-chat/attachment-icons.svg#attach-'+icon}/></svg><span>{label}</span><small>{description}</small></button>)}</div>
}
