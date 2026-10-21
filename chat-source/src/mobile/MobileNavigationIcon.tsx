import type { ReactNode } from 'react';
import { UIIcon } from '../components/UIIcon';

const shapes: Record<string, ReactNode> = {
  'document-file': <><rect x="4" y="2.5" width="16" height="19" rx="3"/><path d="M8 9h8M8 14h5"/></>,
  'video-file': <><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 9h20M9 3 5 9M16 3l-4 6M22 3l-3 6"/></>,
  'image-file': <><rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m3 19 6-6 4 4 4-7 5 9"/></>,
  'audio-file': <><path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="5.5" cy="18.5" rx="3.5" ry="2.5"/><ellipse cx="16.5" cy="16.5" rx="3.5" ry="2.5"/></>,
  profile: <><circle cx="12" cy="6.5" r="4"/><path d="M3.5 22a8.5 8.5 0 0 1 17 0"/></>,
  personal: <><circle cx="12" cy="12" r="9"/><path d="M7.5 13.5a5 5 0 0 0 9 0"/></>,
  memory: <><path d="M12 20c-2.5-2.1-5.5-2.5-9-2.5V4.5c3.5 0 6.5.4 9 2.5 2.5-2.1 5.5-2.5 9-2.5v13c-3.5 0-6.5.4-9 2.5ZM12 7v13"/><path d="M7 3v12"/></>,
  'settings-plugins': <>{[6, 18].flatMap(x => [6, 18].map(y => <circle key={x + '-' + y} cx={x} cy={y} r="3.5"/>))}</>,
  work: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 7.1 6a2 2 0 0 0 2.8 0l7.1-6"/></>,
  phone: <path d="m5 3 4 3-2 3c1.5 3 3 4.5 6 6l3-2 4 3c1 1.5-1 5-3 5C11 21 3 13 3 7c0-2 1-4 2-4Z"/>,
  bars: <><rect x="3" y="11" width="5" height="10" rx=".5"/><rect x="9.5" y="3" width="5" height="18" rx=".5"/><rect x="16" y="8" width="5" height="13" rx=".5"/></>,
  sun: <><circle cx="12" cy="12" r="5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></>,
  paint: <><path d="m13 3 8 8-4 4-8-8 4-4ZM11 9 5 15c-2 2-2 4-2 6 2 0 4 0 6-2l6-6M6 14l4 4"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  bug: <><path d="M8 5 6 2M16 5l2-3M7 10H3M21 10h-4M7 16H3M21 16h-4M7 20l-3 2M17 20l3 2"/><rect x="7" y="6" width="10" height="15" rx="5"/><path d="M12 10v10"/></>,
  codex: <><path d="M7 3c2-2 4-1 5 0 3-2 6-1 6 2 3 0 4 4 2 6 2 3 0 6-3 6 0 4-4 5-6 3-3 2-6 0-6-3-4-1-4-5-1-7-2-3 0-6 3-7Z"/><path d="m8 9 3 3-3 3M13 15h3"/></>,
};
export function MobileNavigationIcon({ name, size = 24 }: { name: string; size?: number }) {
  if (!shapes[name]) return <UIIcon name={name} size={size}/>;
  return <svg data-icon={name} width={size} height={size} style={{ width: size, height: size }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}
