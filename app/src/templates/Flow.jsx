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
 * a row's items, 'start' keeps each at its own size from the top or left, 'end' lines them up on their foot (a field and its button under a label); span: 12-column cells it takes when it
 * sits in the template's content grid; inset: 16 at the sides, for content in a Drawer body (BELLA's body is 8 at
 * the sides and expects its rows' own 16, so plain text lands on the title's 24 edge; audit 4, item 5); board: the Work board's frame (see
 * useToBottom) (12, 8, 7, 6, 5 or 4; 5 and 7 are
 * History's list and record, as Figma); stretch: it takes its container's
 * full width even where the container centres its child (the System map's
 * steps on the Stage); aside: a side column beside a growing first child,
 * Figma's part card width (240), never squeezed (Components' part card); bullets: a list
 * shows its bullet markers (an answer's bullets, her mock and Figma Flow 12); fit: a list beside its
 * detail that fills the window from where it starts, on the 12 columns, so the page itself never scrolls
 * (History, Elleta 22 Nov: "I don't want to scroll the whole page"); scroll: a column inside fit (or a card)
 * that scrolls on its own.
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
    // something above it can also leave without the page changing size (the shell fills the window):
    // closing the Brief moved the board up 106 and left a band under the lanes (Elleta, 21 Nov: "i dont
    // like the gap at teh bottom of the browser"), so watch what is added or removed, once a frame
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const mo = new MutationObserver(later);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [on]);
  const fit = `calc(100dvh - ${top}px - var(--layout-gutter))`;
  return [ref, on && top != null ? { blockSize: window.innerWidth < 800 ? `max(${fit}, 70dvh)` : fit } : undefined];
}

/* The board's sideways cue (Elleta, 20 Nov at ~1100: the fourth lane was cut
   with no cue): like Tabs (her "B · chevron button"), a chevron at each end
   that has more lanes, over a fade, scrolling the lanes in view that way (two
   at 1100), so the board lands back on the grid's columns (visual study, 22
   Nov); swipe and trackpad still scroll. */
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
    if (!el?.firstElementChild) return;
    const s = getComputedStyle(el);
    const gap = parseFloat(s.columnGap) || 0;
    const lane = el.firstElementChild.getBoundingClientRect().width + gap;
    const view = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + gap;
    const inView = Math.max(1, Math.round(view / lane));
    el.scrollBy({ left: dir * inView * lane, behavior: 'smooth' });
  };
  return [more, step];
}

export default function Flow({ as: Tag = 'div', direction = 'column', gap = 16, wrap = false, fill = false, equal = false, grow, justify = 'start', align, span = 12, board = false, fit = false, scroll = false, stretch = false, aside = false, bullets = false, inset = false, children, ...rest }) {
  const [boardRef, boardSize] = useToBottom(board || fit);
  if (!GAPS.has(gap)) throw new Error(`Flow: gap ${gap} is not on the spacing scale (4, 8, 12, 16, 24)`);
  const cls = ['chip-flow', `chip-flow--${direction}`, board ? 'chip-flow--board' : '', fit ? 'chip-flow--fit' : '', scroll ? 'chip-flow--scroll' : '', `chip-flow--gap-${gap}`, wrap ? 'chip-flow--wrap' : '', fill ? 'chip-flow--fill' : '', equal ? 'chip-flow--equal' : '', grow ? `chip-flow--grow-${grow}` : '', justify !== 'start' ? `chip-flow--${justify}` : '', align === 'center' ? 'chip-flow--center-items' : align === 'start' ? 'chip-flow--start-items' : align === 'end' ? 'chip-flow--end-items' : '', stretch ? 'chip-flow--stretch' : '', aside ? 'chip-flow--aside' : '', bullets ? 'chip-flow--bullets' : '', inset ? 'chip-flow--inset' : '', `chip-span-${span}`]
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
  if (fit)
    return (
      <Tag className={cls} ref={boardRef} style={boardSize} {...rest}>
        {children}
      </Tag>
    );
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
