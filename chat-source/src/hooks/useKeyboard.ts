import { useEffect, useState } from 'react';
export function useKeyboard(focused:boolean){
 const [viewport,setViewport]=useState({height:window.visualViewport?.height||window.innerHeight,keyboard:false});
 useEffect(()=>{let baseline=window.innerHeight;const sync=()=>{const height=window.visualViewport?.height||window.innerHeight;if(!focused)baseline=Math.max(baseline,window.innerHeight,height);setViewport({height,keyboard:focused&&baseline-height>110})};sync();window.visualViewport?.addEventListener('resize',sync);window.addEventListener('resize',sync);return ()=>{window.visualViewport?.removeEventListener('resize',sync);window.removeEventListener('resize',sync)}},[focused]);
 return viewport;
}
