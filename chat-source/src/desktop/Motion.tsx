import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

export function Disclosure({ open, children }: { open: boolean; children: ReactNode }) {
  return <div className="d-disclosure" data-open={open} aria-hidden={!open} inert={!open}>
    <div>{children}</div>
  </div>;
}

// Keep the preview mounted while moving between targets or fading out.
export function useHoverPreview<T>(delay = 100) {
  const [preview, setPreview] = useState<{ data: T | null; open: boolean }>({ data: null, open: false });
  const visible = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancel() { if (timer.current) clearTimeout(timer.current); timer.current = null; }
  function show(data: T, immediate = false) {
    cancel();
    const commit = () => { visible.current = true; setPreview({ data, open: true }); };
    if (immediate || visible.current) commit(); else timer.current = setTimeout(commit, delay);
  }
  function leave() { cancel(); timer.current = setTimeout(() => { visible.current = false; setPreview(previous => ({ ...previous, open: false })); }, 100); }
  function close() { cancel(); visible.current = false; setPreview({ data: null, open: false }); }
  useEffect(() => () => cancel(), []);
  return { ...preview, show, leave, keep: cancel, close };
}

export function useComposerMotion(mode: boolean, textarea: RefObject<HTMLTextAreaElement | null>) {
  const before = useRef<{ left: number; top: number; width: number } | null>(null);
  const animation = useRef<Animation | null>(null);
  const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function measure() {
    const element = textarea.current, root = element?.closest<HTMLElement>('.d-root');
    if (!element || !root) return null;
    const rect = element.getBoundingClientRect(), bounds = root.getBoundingClientRect();
    const scale = bounds.width / root.offsetWidth || 1;
    return { left: (rect.left - bounds.left) / scale, top: (rect.top - bounds.top) / scale, width: rect.width / scale };
  }
  function prepare() { before.current = reducedMotion() ? null : measure(); animation.current?.cancel(); }
  useLayoutEffect(() => {
    const previous = before.current, next = measure(), element = textarea.current;
    before.current = null;
    if (!previous || !next || !element?.animate || reducedMotion()) return;
    animation.current = element.animate([
      { transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px)`, width: `${previous.width}px` },
      { transform: 'translate(0, 0)', width: `${next.width}px` },
    ], { duration: 260, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  }, [mode]);
  useEffect(() => () => animation.current?.cancel(), []);
  return prepare;
}
