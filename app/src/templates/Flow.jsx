// Layout primitive for page content (coordinator, 19 Nov 2026: "layout only
// through the template's layout primitives and tokens"). A page arranges
// BELLA parts with Flow; it never writes its own CSS. Gaps are the 4-point
// spacing tokens only.
import { useLayoutEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
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
 * a row's items, 'start' keeps each at its own size from the top or left; span: 12-column cells it takes when it
 * sits in the template's content grid; board: the Work board's frame (see
 * useToBottom) (12, 8, 7, 6, 5 or 4; 5 and 7 are
 * History's list and record, as Figma); stretch: it takes its container's
 * full width even where the container centres its child (the System map's
 * steps on the Stage); aside: a side column beside a growing first child,
 * Figma's part card width (240), never squeezed (Components' part card).
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
    // what sits above it (the Brief, a notice, the header's fonts) can arrive
    // after the board and push it down without changing the board's own frame,
    // so watch the whole page, not the board (20 Nov audit: it measured before
    // the Brief settled and ran 24 past the window at every size)
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [on]);
  const fit = `calc(100dvh - ${top}px - var(--layout-gutter))`;
  return [ref, on && top != null ? { blockSize: window.innerWidth < 800 ? `max(${fit}, 70dvh)` : fit } : undefined];
}

/* The board's sideways cue (Elleta, 20 Nov at ~1100: the fourth lane was cut
   with no cue): like Tabs (her "B · chevron button"), a chevron at each end
   that has more lanes, over a fade, scrolling one lane that way; swipe and
   trackpad still scroll. */
function useMore(ref, on) {
  const [more, setMore] = useState({ start: false, end: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el) return undefined;
    const check = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore((m) => (m.start === start && m.end === end ? m : { start, end }));
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [ref, on]);
  const step = (dir) => {
    const el = ref.current;
    const lane = el?.firstElementChild?.getBoundingClientRect().width ?? 240;
    el?.scrollBy({ left: dir * lane, behavior: 'smooth' });
  };
  return [more, step];
}

export default function Flow({ as: Tag = 'div', direction = 'column', gap = 16, wrap = false, fill = false, equal = false, grow, justify = 'start', align, span = 12, board = false, stretch = false, aside = false, children, ...rest }) {
  const [boardRef, boardSize] = useToBottom(board);
  if (!GAPS.has(gap)) throw new Error(`Flow: gap ${gap} is not on the spacing scale (4, 8, 12, 16, 24)`);
  const cls = ['chip-flow', `chip-flow--${direction}`, board ? 'chip-flow--board' : '', `chip-flow--gap-${gap}`, wrap ? 'chip-flow--wrap' : '', fill ? 'chip-flow--fill' : '', equal ? 'chip-flow--equal' : '', grow ? `chip-flow--grow-${grow}` : '', justify !== 'start' ? `chip-flow--${justify}` : '', align === 'center' ? 'chip-flow--center-items' : align === 'start' ? 'chip-flow--start-items' : '', stretch ? 'chip-flow--stretch' : '', aside ? 'chip-flow--aside' : '', `chip-span-${span}`]
    .filter(Boolean)
    .join(' ');
  const [more, step] = useMore(boardRef, board);
  if (board)
    return (
      <div className="chip-board" style={boardSize}>
        <Tag className={cls} ref={boardRef} {...rest}>
          {children}
        </Tag>
        {more.start ? (
          <div className="chip-board__more chip-board__more--start">
            <Button variant="secondary" size="sm" iconOnly icon="NavArrowLeft" ariaLabel="Earlier lanes" onClick={() => step(-1)} />
          </div>
        ) : null}
        {more.end ? (
          <div className="chip-board__more chip-board__more--end">
            <Button variant="secondary" size="sm" iconOnly icon="NavArrowRight" ariaLabel="More lanes" onClick={() => step(1)} />
          </div>
        ) : null}
      </div>
    );
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
