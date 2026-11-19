// Layout primitive for page content (coordinator, 19 Nov 2026: "layout only
// through the template's layout primitives and tokens"). A page arranges
// BELLA parts with Flow; it never writes its own CSS. Gaps are the 4-point
// spacing tokens only.
import { useLayoutEffect, useRef, useState } from 'react';
import './Screen.css';

const GAPS = new Set([4, 8, 12, 16, 24]);

/**
 * direction: 'column' (stack) or 'row'; gap: 4, 8, 12, 16 or 24;
 * wrap: rows wrap onto the next line; fill: children grow to fill it (cards
 * in a row the same height, guideline 15); equal: children share the row
 * in equal widths (board lanes); grow: 'first' or 'last' lets only that child
 * take the spare room (a search field that fills beside its button); justify: 'between' puts the last
 * group at the right end (control bars: what you look at left, filters and
 * switchers right), 'end' pushes everything right; align: 'center' centres
 * a row's items; span: 12-column cells it takes when it
 * sits in the template's content grid; board: the Work board's frame (see
 * useToBottom) (12, 8, 7, 6, 5 or 4; 5 and 7 are
 * History's list and record, as Figma).
 */
/* board: the Work board's frame (Elleta, 19 Nov: "the work board needs to stay
   in the veiwport.. and scrool horizontal and hten independently in there own
   lanes"). It fills the window from where it starts, scrolls sideways when the
   lanes don't fit, and each lane scrolls on its own. On a phone, where the
   header takes most of the window, it keeps at least 70% of the window. */
function useToBottom(on) {
  const ref = useRef(null);
  const [top, setTop] = useState(null);
  useLayoutEffect(() => {
    if (!on) return undefined;
    const measure = () => {
      const t = ref.current ? Math.max(0, Math.round(ref.current.getBoundingClientRect().top + window.scrollY)) : null;
      setTop((was) => (was === t ? was : t));
    };
    measure();
    // what sits above it (the Brief, a notice) can arrive after the board
    const ro = new ResizeObserver(measure);
    if (ref.current?.parentElement) ro.observe(ref.current.parentElement);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [on]);
  const fit = `calc(100dvh - ${top}px - var(--layout-gutter))`;
  return [ref, on && top != null ? { blockSize: window.innerWidth < 800 ? `max(${fit}, 70dvh)` : fit } : undefined];
}

export default function Flow({ as: Tag = 'div', direction = 'column', gap = 16, wrap = false, fill = false, equal = false, grow, justify = 'start', align, span = 12, board = false, children, ...rest }) {
  const [boardRef, boardSize] = useToBottom(board);
  if (!GAPS.has(gap)) throw new Error(`Flow: gap ${gap} is not on the spacing scale (4, 8, 12, 16, 24)`);
  const cls = ['chip-flow', `chip-flow--${direction}`, board ? 'chip-flow--board' : '', `chip-flow--gap-${gap}`, wrap ? 'chip-flow--wrap' : '', fill ? 'chip-flow--fill' : '', equal ? 'chip-flow--equal' : '', grow ? `chip-flow--grow-${grow}` : '', justify !== 'start' ? `chip-flow--${justify}` : '', align === 'center' ? 'chip-flow--center-items' : '', `chip-span-${span}`]
    .filter(Boolean)
    .join(' ');
  return (
    <Tag className={cls} ref={board ? boardRef : undefined} style={boardSize} {...rest}>
      {children}
    </Tag>
  );
}
