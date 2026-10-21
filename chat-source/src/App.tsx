import { useCallback,useEffect,useRef,useState,type CSSProperties } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Composer } from './components/Composer';
import { MessageList } from './components/MessageList';
import { ApiSettings } from './components/ApiSettings';
import { ConversationMenu,type ConversationAction } from './components/ConversationMenu';
import { Icon } from './components/Icon';
import { useKeyboard } from './hooks/useKeyboard';
import { answer,readJSON,type ApiConfig,type Chat,type Message } from './lib/chat';
const suggestions=['Bantu merencanakan pekerjaan','Jelaskan sebuah konsep','Tinjau kode yang akan kukirim'];
function useLocal<T,>(key:string,initial:T){const[value,setValue]=useState<T>(()=>readJSON(localStorage,key,initial));useEffect(()=>{localStorage.setItem(key,JSON.stringify(value))},[key,value]);return [value,setValue] as const}
export default function App(){
 const[home,setHome]=useState(true),[mode,setMode]=useState<'Chat'|'Work'>('Chat');
 const[menu,setMenu]=useState(false),[options,setOptions]=useState(false),[focused,setFocused]=useState(false),[temporary,setTemporary]=useState(false);
 const[text,setText]=useState(''),[title,setTitle]=useState('Obrolan baru');
 const[messages,setMessages]=useState<Message[]>([]);
 const[chats,setChats]=useLocal<Chat[]>('reference-chats',[]);
 const[pinned,setPinned]=useLocal<string[]>('reference-pinned',[]);
 const[archived,setArchived]=useLocal<string[]>('reference-archived',[]);
 const[deleted,setDeleted]=useLocal<string[]>('reference-deleted',[]);
 const[projects,setProjects]=useLocal<Record<string,string[]>>('reference-projects',{});
 const[config,setConfig]=useState<ApiConfig|null>(()=>readJSON(sessionStorage,'reference-api',null));
 const[modal,setModal]=useState<string|null>(null),[toast,setToast]=useState(''),[busy,setBusy]=useState(false);
 const[search,setSearch]=useState<string|null>(null),[projectName,setProjectName]=useState('');
 const busyRef=useRef(false),version=useRef(0);
 const {height,keyboard}=useKeyboard(focused);
 const closeOptions=useCallback(()=>setOptions(false),[]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),2600);return()=>clearTimeout(t)},[toast]);
 useEffect(()=>{if(!modal)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setModal(null)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[modal]);
 function newChat(){version.current++;setHome(true);setMessages([]);setTitle('Obrolan baru');setMenu(false);setOptions(false);setSearch(null);setText('');setTemporary(false);setBusy(false);busyRef.current=false}
 function openChat(name:string){version.current++;setTitle(name);setMenu(false);setHome(false);setOptions(false);setSearch(null);setBusy(false);busyRef.current=false;const existing=chats.find(c=>c.title===name);setMessages(existing?.messages||[])}
 function persistConversation(name=title,content=messages){if(temporary)return;setChats(previous=>[{title:name,messages:content},...previous.filter(c=>c.title!==name)])}
 async function send(){
  if(busyRef.current)return;const value=text.trim();if(!value)return setToast('Ketik pesan atau gunakan mikrofon');if(!config){setModal('api');setToast('Konfigurasikan endpoint sebelum mengirim pesan');return}
  const id=version.current;busyRef.current=true;setBusy(true);const name=home?value.slice(0,38):title;setTitle(name);setHome(false);setText('');
  const next:Message[]=[...messages,{role:'user',content:value}];setMessages([...next,{role:'assistant',content:'● ● ●'}]);
  let reply;try{reply=await answer(next,config)}catch(e){reply='Gagal menghubungi API: '+(e instanceof Error?e.message:String(e))}
  if(version.current!==id)return;
  const completed:Message[]=[...next,{role:'assistant',content:reply}];setMessages(completed);persistConversation(name,completed);busyRef.current=false;setBusy(false);
 }
 async function share(){try{const content=messages.map(m=>m.content).join('\n\n');if(navigator.share)await navigator.share({title,text:content});else{await navigator.clipboard.writeText(content);setToast('Percakapan disalin untuk dibagikan')}}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setToast('Tidak dapat membagikan percakapan')}}
 function action(a:ConversationAction){
  setOptions(false);
  if(a==='share'){void share();return}
  if(a==='pin'){persistConversation();setPinned(prev=>prev.includes(title)?prev.filter(t=>t!==title):[title,...prev]);setToast(pinned.includes(title)?'Sematan dilepas':'Percakapan disematkan');return}
  if(a==='search'){setSearch('');return}
  if(a==='archive'){persistConversation();setArchived(prev=>Array.from(new Set([...prev,title])));setPinned(prev=>prev.filter(t=>t!==title));newChat();setToast('Percakapan diarsipkan');return}
  setModal(a);
 }
 function removeChat(){setDeleted(prev=>Array.from(new Set([...prev,title])));setChats(prev=>prev.filter(c=>c.title!==title));setPinned(prev=>prev.filter(t=>t!==title));setArchived(prev=>prev.filter(t=>t!==title));setProjects(prev=>Object.fromEntries(Object.entries(prev).map(([key,items])=>[key,items.filter(t=>t!==title)])));setModal(null);newChat();setToast('Percakapan dihapus')}
 function addProject(name:string){const clean=name.trim();if(!clean)return;persistConversation();setProjects(prev=>({...prev,[clean]:Array.from(new Set([...(prev[clean]||[]),title]))}));setProjectName('');setModal(null);setToast('Ditambahkan ke proyek '+clean)}
 function dictate(){type Recognition={lang:string;start:()=>void;onresult:((e:{results:{0:{0:{transcript:string}}}})=>void)|null;onerror:(()=>void)|null};const w=window as unknown as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};const R=w.SpeechRecognition||w.webkitSpeechRecognition;if(!R)return setToast('Dikte tidak didukung browser ini');const recognition=new R();recognition.lang='id-ID';recognition.onresult=e=>setText(e.results[0][0].transcript);recognition.onerror=()=>setToast('Mikrofon tidak tersedia');recognition.start()}
 const visible=(name:string)=>!archived.includes(name)&&!deleted.includes(name);
 const titles=Array.from(new Set(chats.map(c=>c.title))).filter(visible);
 const hits=search?messages.reduce((count,m)=>count+m.content.toLocaleLowerCase().split(search.toLocaleLowerCase()).length-1,0):0;
 return <div className={['app',home?'home':'',menu?'open':'',keyboard?'keyboard':'',search!==null?'searching':''].join(' ')} style={{'--visible-height':height+'px'} as CSSProperties}>
  <Header home={home} mode={mode} onMode={setMode} onMenu={()=>{setMenu(true);setOptions(false)}} onNew={newChat} onOptions={()=>setOptions(!options)} onTemporary={()=>{setTemporary(!temporary);setToast(temporary?'Obrolan biasa':'Obrolan sementara aktif')}}/>
  {search!==null&&<div className="chat-search"><Icon name="search"/><input autoFocus placeholder="Cari di chat" aria-label="Cari di chat" value={search} onChange={e=>setSearch(e.target.value)}/><small>{search?hits+' hasil':''}</small><button aria-label="Tutup pencarian" onClick={()=>setSearch(null)}>×</button></div>}
  <MessageList messages={messages} query={search||''} notify={setToast} onOptions={()=>setOptions(!options)}/>
  {home&&<div className={'suggestions '+(mode==='Work'?'opacity-60':'')}>{suggestions.map(s=><button key={s} onClick={()=>setText(s)}><Icon name="github"/><span>{s}</span></button>)}</div>}
  <Composer value={text} onChange={setText} onSend={send} home={home} busy={busy} onFocus={setFocused} onDictate={dictate} notify={setToast}/>
  <Sidebar titles={titles} pinnedTitles={pinned.filter(visible)} onOpen={openChat} onNew={newChat} onSection={name=>{setMenu(false);setModal(name)}} onClose={()=>setMenu(false)}/>
  {options&&<ConversationMenu title={title} pinned={pinned.includes(title)} onAction={action} onClose={closeOptions}/>}
  {modal&&<div className="modal" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}><div className="dialog" role="dialog" aria-modal="true" aria-label={modal}>
   {modal==='api'?<><ApiSettings config={config} onSave={c=>{setConfig(c);if(c)sessionStorage.setItem('reference-api',JSON.stringify(c));else sessionStorage.removeItem('reference-api');setModal(null);setToast(c?'Pengaturan disimpan':'Koneksi endpoint dilepas')}}/><button className="mt-3" onClick={()=>setModal('archives')}>Obrolan diarsipkan ({archived.length})</button></>
   :modal==='project'?<><h2 className="text-xl font-semibold mb-4">Tambahkan ke proyek</h2>{Object.keys(projects).map(name=><button className="block mb-3 w-full text-left" key={name} onClick={()=>addProject(name)}>{name}</button>)}<label>Proyek baru<input autoFocus placeholder="Nama proyek" value={projectName} onChange={e=>setProjectName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addProject(projectName)}}/></label><button onClick={()=>addProject(projectName)}>Tambahkan</button></>
   :modal==='files'?<><h2 className="text-xl font-semibold mb-4">File yang diunggah</h2><p className="muted">Belum ada file yang diunggah di percakapan ini. Pemilih lampiran saat ini masih berupa demo dan belum mengunggah file ke server.</p></>
   :modal==='home'?<><h2 className="text-xl font-semibold mb-4">Tambahkan ke beranda</h2><p className="muted">Di Chrome Android, buka menu browser ⋮ lalu pilih “Tambahkan ke layar utama”. Di Safari, tekan Bagikan lalu “Tambahkan ke Layar Utama”.</p></>
   :modal==='delete'?<><h2 className="text-xl font-semibold mb-4">Hapus percakapan?</h2><p className="muted mb-4">“{title}” akan dihapus dari riwayat lokal perangkat ini.</p><button style={{background:'#b63333'}} onClick={removeChat}>Hapus</button></>
   :modal==='archives'?<><h2 className="text-xl font-semibold mb-4">Obrolan diarsipkan</h2>{archived.length?archived.map(name=><div className="mb-4" key={name}><p className="truncate mb-2">{name}</p><button onClick={()=>{setArchived(prev=>prev.filter(t=>t!==name));setModal(null);openChat(name)}}>Pulihkan</button></div>):<p className="muted">Belum ada percakapan diarsipkan.</p>}</>
   :modal==='Proyek'?<><h2 className="text-xl font-semibold mb-4">Proyek</h2>{Object.keys(projects).length?Object.entries(projects).map(([name,items])=><section key={name}><h3 className="font-semibold mb-3">{name}</h3>{items.filter(t=>!deleted.includes(t)).map(t=><button className="block mb-2 w-full text-left truncate" key={t} onClick={()=>{setModal(null);openChat(t)}}>{t}</button>)}</section>):<p className="muted">Belum ada proyek. Tambahkan percakapan lewat menu ⋮.</p>}</>
   :<><h2 className="text-xl font-semibold mb-4">{modal}</h2><p className="muted">Bagian ini merupakan pratinjau tampilan. Gunakan obrolan untuk mencoba percakapan.</p></>}
   <button className="mt-4" onClick={()=>setModal(null)}>Tutup</button>
  </div></div>}
  {toast&&<div className="toast" role="status">{toast}</div>}
 </div>
}
