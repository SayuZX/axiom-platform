import { useEffect, useRef, useState, type ReactNode } from 'react';

// Retain the departing dialog until its exit animation finishes. In particular,
// don't replace sheet content with the next page while it is moving away.
export function MobilePresence({ show, children }: { show: boolean; children: ReactNode }) {
  const [present, setPresent] = useState(show);
  const last = useRef(children);
  if (show) last.current = children;
  useEffect(() => {
    if (show) { setPresent(true); return; }
    const timer = window.setTimeout(() => setPresent(false), 240);
    return () => window.clearTimeout(timer);
  }, [show]);
  if (!show && !present) return null;
  return <div className={`m-presence${show ? '' : ' m-leaving'}`} inert={!show} aria-hidden={!show || undefined}>{show ? children : last.current}</div>;
}
