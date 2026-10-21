import { UIIcon } from '../components/UIIcon';

// Mobile reference silhouettes differ from the web SDK's dashed-chat and
// microphone-with-base glyphs. Keep these local to the mobile controls.
export function MobileControlIcon({ name }: { name: string }) {
  if (name === 'paperclip') return <svg data-icon={name} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 9v7a4 4 0 0 0 8 0V6a2.5 2.5 0 0 0-5 0v10a1 1 0 0 0 2 0V8M5 10v6a7 7 0 0 0 14 0V7"/></svg>;
  if (name === 'think-harder') return <svg data-icon={name} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 19a9 9 0 0 1 8-16M19 5a9 9 0 0 1 0 14M14 10l5-6"/><circle cx="12" cy="12" r="2.4"/></svg>;
  if (name === 'camera') return <svg data-icon="camera" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 6l2-3h6l2 3h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/></svg>;
  if (name === 'photo') return <svg data-icon="photo" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></svg>;
  if (name === 'share-android') return <svg data-icon="share-android" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="5" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 10.7 7.4-4.4m-7.4 7 7.4 4.4"/>
  </svg>;
  if (name === 'mic') return <svg data-icon="mic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="8.5" y="2" width="7" height="12" rx="3.5"/><path d="M5 10.5v1a7 7 0 0 0 14 0v-1M12 18.5V22"/>
  </svg>;
  if (name === 'temporary' || name === 'temporary-checked') return <svg data-icon={name} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5.1 5.2A9.5 9.5 0 0 1 19 5.7M21.2 9.5a9.5 9.5 0 0 1-11.4 11.7M6.6 19.9 2.8 21l1.1-3.9a9.5 9.5 0 0 1-1-9.1"/>
    {name === 'temporary-checked' && <path d="m8 11.8 2.7 2.8 5.3-5.4"/>}
  </svg>;
  return <UIIcon name={name}/>;
}
