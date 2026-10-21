'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Existing rich billing/admin dialogs keep their page CSS, outside every card.
export function OverlayPortal({ children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => { setTarget(document.body); }, []);
  return target ? createPortal(children, target) : null;
}

export default function GlobalFeedback({ children, info = false }) {
  const content = useRef(null);
  const previous = useRef('');
  useEffect(() => {
    const message = content.current?.textContent?.trim() || '';
    const signature = `${info}:${message}`;
    if (!message) { previous.current = ''; return; }
    if (signature === previous.current) return;
    const send = () => {
      if (!window.axiomNotify || previous.current === signature) return;
      window.axiomNotify({ kind: info ? 'success' : 'error', message });
      previous.current = signature;
    };
    send();
    window.addEventListener('axiom-feedback-ready', send, { once: true });
    return () => window.removeEventListener('axiom-feedback-ready', send);
  }, [children, info]);
  return <span hidden ref={content}>{children}</span>;
}
