import { useEffect, useRef, useState, type CSSProperties } from 'react';

export function HistoryTitle({ title, onOpen }: { title: string; onOpen: () => void }) {
  const clip = useRef<HTMLSpanElement>(null), text = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useEffect(() => {
    const measure = () => setDistance(Math.max(0, (text.current?.scrollWidth || 0) - (clip.current?.clientWidth || 0)));
    const observer = new ResizeObserver(measure);
    if (clip.current) observer.observe(clip.current);
    if (text.current) observer.observe(text.current);
    measure();
    return () => observer.disconnect();
  }, [title]);
  return <button className="d-history-open" onClick={onOpen} aria-label={title}>
    <span ref={clip} className="d-history-title-clip" data-overflow={distance > 0} style={{ '--history-travel': `-${distance}px`, '--history-duration': `${Math.max(4, distance / 32 + 2)}s` } as CSSProperties}>
      <span ref={text} className="d-history-title-text">{title}</span>
    </span>
  </button>;
}
