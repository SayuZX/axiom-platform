import type { CSSProperties, ReactNode } from 'react';
import { officialIcons } from './openai-icons/index';

// Official Apps SDK UI icons where a matching symbol exists.
// Reference-specific controls and third-party logos remain local fallbacks.
const icons: Record<string, ReactNode> = {
  'mobile-menu': <path d="M5 8h14M5 15h8"/>,
  // Filled active Home silhouette from the supplied desktop reference.
  'home-selected': <path fill="currentColor" stroke="none" d="M10.4 2.7a2.5 2.5 0 0 1 3.2 0l8 6.6a1 1 0 0 1-.64 1.77H20v8.18A1.75 1.75 0 0 1 18.25 21H15v-6a3 3 0 0 0-6 0v6H5.75A1.75 1.75 0 0 1 4 19.25v-8.18h-.96a1 1 0 0 1-.64-1.77l8-6.6Z"/>,
  trash: <><path d="M3.5 6h17M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5.5 6l1 14a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1l1-14M10 10v7M14 10v7"/></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>,
  lightning: <path d="m13.5 2-9 12h7l-1 8 9-12h-7l1-8Z"/>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></>,
  list: <><circle cx="4.5" cy="5" r="1.7"/><circle cx="4.5" cy="12" r="1.7"/><circle cx="4.5" cy="19" r="1.7"/><path d="M10.5 5h10M10.5 12h10M10.5 19h10"/></>,
  computer: <><rect x="4" y="4" width="16" height="12" rx="1.7"/><path d="M2.5 16.5h19v2a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-2Z"/></>,
  sketch: <path d="M3 16.5C7 8.5 14.4 2 17 4.3c2.4 2.1-10.9 14.3-9 16.1 1.8 1.7 10.3-10.1 12.2-7.9 1.8 2.1-6.6 9.1-3.2 9.2 1.5 0 3.5-1.9 4.8-3.1"/>,
  // Preserve the previously approved Plugins asset and its original 27px canvas.
  plugin: <use href="/axiom-chat/plugins-symbol.svg#plugins"/>,
  shield: <><path d="M10.9 2.8a2.3 2.3 0 0 1 2.2 0L19 6a1.9 1.9 0 0 1 1 1.7v5.2c0 3.3-2.5 5.5-6.9 8a2.1 2.1 0 0 1-2.2 0C6.5 18.4 4 16.2 4 12.9V7.7A1.9 1.9 0 0 1 5 6l5.9-3.2Z"/><path d="m8.3 10 2.5 2-2.5 2M13.5 14h2.2"/></>,
  panels: <><rect x="4" y="4" width="16" height="16" rx="2.4"/><path d="m10.5 9 2-1v8M10.5 16h4" strokeWidth="1.3"/></>,
  library: <><rect x="3" y="3.5" width="5" height="17" rx="1.4"/><rect x="8" y="3.5" width="5" height="17" rx="1.4"/><rect x="14" y="3.3" width="5" height="17" rx="1.4" transform="rotate(-10 16.5 12)"/></>,
  goal: <><path d="M20.8 12A8.8 8.8 0 1 1 12 3.2M16.5 3v4.5H21M16.5 7.5 12 12"/><path d="M16 12a4 4 0 1 1-4-4"/></>,
  'window-minimize': <path d="M5 12h14"/>,
  'window-maximize': <rect x="5" y="5" width="14" height="14" rx="1.5"/>,
  'window-restore': <><path d="M8 5V3.8A1.8 1.8 0 0 1 9.8 2h10.4A1.8 1.8 0 0 1 22 3.8v10.4a1.8 1.8 0 0 1-1.8 1.8H19"/><rect x="3" y="7" width="14" height="14" rx="1.7"/></>,
  cloud: <path d="M7 19h11a4 4 0 0 0 1-7.9 6 6 0 0 0-11.7-2A5 5 0 0 0 7 19Z"/>,
};

const aliases: Record<string, string> = { chat: 'comment', chevron: 'down', file: 'page', thumb: 'feedback', menu: 'list' };
const fallback = <><circle cx="12" cy="12" r="9"/><path d="M9.2 8.8a2.8 2.8 0 1 1 4 2.5c-1 .5-1.2 1-1.2 2.2M12 17h.01"/></>;

export const uiIconNames = [...Object.keys(officialIcons), ...Object.keys(icons), 'chrome', 'remotion', 'github', 'document', 'pdf', 'gmail', 'drive', 'brave'];

export function UIIcon({ name, size }: { name: string; size?: number }) {
  const resolved = aliases[name] || name;
  const OfficialIcon = officialIcons[resolved];
  if (OfficialIcon) return <OfficialIcon data-icon={resolved} data-icon-source="openai-apps-sdk-ui"
    width={size || 24} height={size || 24}
    style={{ ...(size === undefined ? {} : { width: size, height: size }), fill: 'currentColor', stroke: 'none' }}
    aria-hidden="true" focusable="false"/>;
  let drawing = icons[resolved];
  if (resolved === 'chrome') drawing = <g stroke="none"><path fill="#e64b3c" d="M12 1a11 11 0 0 1 9.5 5.5H12a5.5 5.5 0 0 0-4.8 8.2L2.5 6.5A11 11 0 0 1 12 1Z"/><path fill="#f4ce45" d="M21.5 6.5A11 11 0 0 1 12 23l4.8-8.3A5.5 5.5 0 0 0 12 6.5Z"/><path fill="#55a65b" d="M12 23A11 11 0 0 1 2.5 6.5l4.7 8.2a5.5 5.5 0 0 0 9.6 0Z"/><circle cx="12" cy="12" r="4.5" fill="#56a5e8" stroke="#eee" strokeWidth="1"/></g>;
  if (resolved === 'remotion') drawing = <path fill="currentColor" stroke="none" d="M6.7 4.7C9.1 2.2 20 8.7 20 12S9.1 21.8 6.7 19.3c-2.4-2.6-2.4-12 0-14.6Z"/>;
  if (resolved === 'github') drawing = <path fill="currentColor" stroke="none" d="M12 1.5a10.5 10.5 0 0 0-3.3 20.47c.52.1.72-.23.72-.5v-1.95c-2.92.63-3.54-1.24-3.54-1.24-.48-1.22-1.16-1.54-1.16-1.54-.95-.65.07-.63.07-.63 1.05.07 1.6 1.08 1.6 1.08.93 1.6 2.45 1.13 3.05.87.09-.68.37-1.14.66-1.4-2.33-.26-4.78-1.16-4.78-5.19 0-1.14.41-2.08 1.08-2.81-.11-.26-.46-1.33.1-2.77 0 0 .88-.28 2.87 1.07a10 10 0 0 1 5.22 0c1.99-1.35 2.87-1.07 2.87-1.07.56 1.44.21 2.51.1 2.77.67.73 1.08 1.67 1.08 2.81 0 4.04-2.46 4.92-4.8 5.18.37.33.71.96.71 1.94v2.87c0 .28.19.61.72.5A10.5 10.5 0 0 0 12 1.5Z"/>;
  if (resolved === 'document' || resolved === 'pdf') drawing = <><path fill={resolved === 'pdf' ? '#ac4053' : '#4684cf'} stroke="none" d="M7 2.5h6.2a2 2 0 0 1 1.4.6l4.3 4.3a2 2 0 0 1 .6 1.4V20a1.5 1.5 0 0 1-1.5 1.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5Z"/><path d="M13.5 3v4.2a1.3 1.3 0 0 0 1.3 1.3H19M8 13h8M8 17h6" stroke="#d3e5ff" strokeWidth="1.1"/></>;
  if (resolved === 'gmail') drawing = <g fill="none" strokeWidth="3.4" strokeLinejoin="round"><path stroke="#4285f4" d="M3 20V6.8"/><path stroke="#34a853" d="M21 20V6.8"/><path stroke="#fbbc04" d="m21 6.8-4.5 3.7"/><path stroke="#ea4335" d="m3 6.8 9 7.2 9-7.2"/></g>;
  if (resolved === 'drive') drawing = <g stroke="none"><path fill="#2684fc" d="M2 16.5h20l-3 5H5Z"/><path fill="#00ac47" d="m8.5 2.5 6 1L6 18H1.2Z"/><path fill="#ffba00" d="m8.5 2.5 6 0 9 15.5H17Z"/></g>;
  if (resolved === 'brave') drawing = <><path fill="#fa5a19" stroke="none" d="m6 3 2-1h8l2 1 3 1-1 4v7c0 3-4 5.8-8 8-4-2.2-8-5-8-8V8L3 4l3-1Z"/><path d="m8 7 2-1 2 1 2-1 2 1 1 3-2 2 1 3-4 4-4-4 1-3-2-2 1-3ZM9 9l1.5 1M15 9l-1.5 1M10 14l2 1 2-1M12 12v3" stroke="#fff" strokeWidth="1.3"/></>;
  const style: CSSProperties | undefined = resolved === 'plugin' ? { ...(size === undefined ? {} : { width: size, height: size }), fill: 'currentColor', stroke: 'none' } : size === undefined ? undefined : { width: size, height: size };
  return <svg data-icon={resolved} data-icon-missing={drawing ? undefined : name} width={size || 24} height={size || 24} style={style}
    viewBox={resolved === 'plugin' ? '0 0 27 27' : '0 0 24 24'} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{drawing || fallback}</svg>;
}
