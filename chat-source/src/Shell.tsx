import { useEffect, useState } from 'react';
import { MobileApp } from './mobile/MobileApp';
import { isNativeMobile } from './lib/nativeDesktop';
import { Desktop } from './desktop/Desktop';

export function Shell(){
 const [mobile, setMobile] = useState(() => matchMedia('(max-width: 767px)').matches);
 useEffect(()=>{document.title='AXIOM AI';const query=matchMedia('(max-width: 767px)');const resize=()=>setMobile(query.matches);query.addEventListener('change',resize);return()=>query.removeEventListener('change',resize)},[]);
 if(mobile || isNativeMobile() || import.meta.env.MODE==='mobile' || new URLSearchParams(location.search).get('mobile')==='1')return <MobileApp/>;
 return <Desktop/>;
}
