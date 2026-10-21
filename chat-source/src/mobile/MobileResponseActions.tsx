import { useEffect, useRef, useState } from 'react';
import { UIIcon } from '../components/UIIcon';
import { MobileControlIcon } from './MobileControlIcon';
import { speakText } from '../lib/clientSettings';

export async function shareMobileResponse(text: string, onNotice: (text: string) => void) {
  try {
    if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); onNotice('Teks disalin untuk dibagikan.'); }
  } catch (error) {
    if (!(error instanceof Error && error.name === 'AbortError')) onNotice('Berbagi belum tersedia. Coba salin teks.');
  }
}

export function MobileResponseActions({ text, onNotice, onMore }: {
  text: string; onNotice: (text: string) => void; onMore: (article: HTMLElement | null) => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current++; clearTimeout(timer.current); }, []);
  async function copy() {
    const current = ++attempt.current;
    clearTimeout(timer.current);
    setCopied(false);
    try {
      await navigator.clipboard.writeText(text);
      if (current !== attempt.current) return;
      setCopied(true);
      // Recovered CopyButtonImpl feedback duration: two seconds.
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      if (current === attempt.current) onNotice('Penyalinan tidak tersedia.');
    }
  }
  return <div className="m-message-actions" role="group" aria-label="Response actions">
    <button type="button" aria-label={copied ? 'Response copied' : 'Copy response'} onClick={() => void copy()}>
      <span key={copied ? 'copied' : 'copy'} className="m-copy-feedback"><UIIcon name={copied ? 'check' : 'copy'} size={24}/></span>
      <span className="m-action-announcement" role="status">{copied ? 'Disalin' : ''}</span>
    </button>
    <button type="button" aria-label="Read response aloud" onClick={() => { try { speakText(text); } catch (error) { onNotice((error as Error).message); } }}><UIIcon name="sound" size={24}/></button>
    <button type="button" aria-label="Share response" onClick={() => void shareMobileResponse(text, onNotice)}><MobileControlIcon name="share-android"/></button>
    <button type="button" aria-label="More response actions" onClick={event => onMore(event.currentTarget.closest('article'))}><UIIcon name="dots" size={24}/></button>
  </div>;
}
