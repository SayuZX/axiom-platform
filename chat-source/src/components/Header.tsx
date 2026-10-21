import { Icon } from './Icon';
type Props={home:boolean;mode:'Chat'|'Work';onMode:(mode:'Chat'|'Work')=>void;onMenu:()=>void;onNew:()=>void;onOptions:()=>void;onTemporary:()=>void};
export function Header({home,mode,onMode,onMenu,onNew,onOptions,onTemporary}:Props){return <header>
 <button className="round icon-button" aria-label="Buka menu" onClick={onMenu}><Icon name="menu"/></button>
 {home?<><div className="tabs" role="tablist" aria-label="Mode"><button role="tab" aria-selected={mode==='Chat'} className={mode==='Chat'?'active':''} onClick={()=>onMode('Chat')}>Chat</button><button role="tab" aria-selected={mode==='Work'} className={mode==='Work'?'active':''} onClick={()=>onMode('Work')}>Work</button></div><button className="round home-action" aria-label="Obrolan sementara" onClick={onTemporary}><Icon name="chat"/></button></>:<div className="pill"><button aria-label="Obrolan baru" onClick={onNew}><Icon name="edit"/></button><button aria-label="Menu lainnya" onClick={onOptions}><Icon name="dots"/></button></div>}
 </header>}
