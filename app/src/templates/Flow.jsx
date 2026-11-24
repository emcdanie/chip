// Layout primitive for page content (coordinator, 19 Nov 2026: "layout only
// through the template's layout primitives and tokens"). A page arranges
// BELLA parts with Flow; it never writes its own CSS. Gaps are the 4-point
// spacing tokens only.
import { useLayoutEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import './Screen.css';

// 0: rows that join themselves (a Step list, whose line runs from one row into the next)
const GAPS = new Set([0, 4, 8, 12, 16, 24]);

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
 * that scrolls on its own; sticky: stays at the top of the box it scrolls in while the rest moves under it
 * (a walk-through step over the code it explains); cards: its children are cards laid out as one grid of two
 * columns (one on a phone; cards="bento": three, the first card two rows tall), so a row's cards take the row's height and their titles, numbers, bars, captions and
 * footers line up across it; an odd last card takes the whole row (Elleta, 23 Nov: cards that don't align and leave
 * white space); head: a row as tall as a card's head row (28, a title's line), so a card whose first
 * row is a Tag still has its title row level with the card beside it; strip: a row of cards you pick from that scrolls
 * sideways and snaps, each card a set width, the next one peeking (Elleta's Workbench A, 23 Nov: "the cards maybe can be
 * on the bottom and scroll across and i can pick them"); grid: the page's 12 columns inside the block, each child
 * placing itself with style gridColumn 'span n' (its edges on the page's columns, visual study 22 Nov).
 */
/* fit: as tall as the page's own scroll box shows, less its padding and a foot where card shadows fade,
   so a list and its detail get the whole height under the tabs once the content scrolls them to the top
   (independent check, 22 Nov: at 1100 by 800 the panes were about 250 tall when they filled only what was
   left under the search). Watches the box, so it follows the window. */
/* fit="rest": from where it starts to the box's foot, so nothing above it scrolls away (the Playground's
   stage under its control bar; her note, 22 Nov: "I can scroll the whole page"). */
// never under 360 (a head and about two cards): in a short window the page scrolls instead of a list shrinking to a strip
// that scrolls on its own (23 Nov, the page could not be scrolled to its end; Playground's Picks list was 290 of 1832 tall)
const FIT_MIN = 360;
// fitKey: measure again when it changes (what sits inside grew), without remounting the content (a remount reloads a
// Storybook frame on the Components stage, about a second each time)
function useFull(on, fitKey) {
  const ref = useRef(null);
  const [h, setH] = useState(null);
  useLayoutEffect(() => {
    if (!on) return undefined;
    const sc = ref.current?.closest('.chip-screen__content');
    if (!sc) return undefined;
    const measure = () => {
      const cs = getComputedStyle(sc);
      // a scroll column reaches 8 past its box (room for focus rings), so a rest box stops 8 short of the padding
      const eight = on === 'rest' ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--spacing-8')) || 8 : 0;
      const foot = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--spacing-16')) || 16;
      const v =
        on === 'rest'
          ? Math.max(0, Math.round(sc.clientHeight - parseFloat(cs.paddingBottom) - eight - (ref.current.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop)))
          : Math.max(FIT_MIN, Math.round(sc.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - foot));
      // rest: never shorter than its content needs, so a short window scrolls the page and the padding below holds
      // (bottom gap 24, Elleta 23 Nov); read at the window's height so it can shrink again
      let need = 0;
      if (on === 'rest') {
        const was = ref.current.style.blockSize;
        ref.current.style.blockSize = `${v}px`;
        need = ref.current.scrollHeight;
        ref.current.style.blockSize = was;
      }
      const next = Math.max(v, need - eight, FIT_MIN); // the 8 a scroll column reaches past is not content
      setH((was) => (was === next ? was : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sc);
    if (on === 'rest') ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => (ro.disconnect(), window.removeEventListener('resize', measure));
  }, [on, fitKey]);
  return [ref, on && h != null ? { blockSize: `${h}px`, ...(on === 'rest' ? { marginBlockEnd: 'var(--spacing-8)' } : {}) } : undefined];
}

/* board: the Work board's frame (Elleta, 19 Nov: "the work board needs to stay
   in the veiwport.. and scrool horizontal and hten independently in there own
   lanes"). It fills the window from where it starts, scrolls sideways when the
   lanes don't fit, and each lane scrolls on its own. On a phone, where the
   header takes most of the window, it keeps at least 70% of the window. */
/* the least height the lanes get: about a lane head and two cards; on a phone 70% of the window */
const boardMin = () => (window.innerWidth < 800 ? Math.round(window.innerHeight * 0.7) : 480);
function useToBottom(on) {
  const ref = useRef(null);
  const [top, setTop] = useState(null);
  useLayoutEffect(() => {
    if (!on) return undefined;
    const measure = () => {
      // where it starts on the page, whatever the page's own scroll (the content scrolls, not the window, since 22 Nov)
      const sc = ref.current?.closest('.chip-screen__content');
      const t = ref.current ? Math.max(0, Math.round(ref.current.getBoundingClientRect().top + (sc ? sc.scrollTop : window.scrollY))) : null;
      setTop((was) => (was === t ? was : t));
      // the board fills the window, and the page still scrolls 64 past the lanes (Elleta, 22 Nov: every scrolling page leaves
      // 64 after its last content, so it scrolls clear of the window's foot; the page's keys PageDown and End move it
      // too). The content element says so for the CSS; the attribute stays on while a board is drawn.
      sc?.setAttribute('data-board-tight', '');
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
      ref.current?.closest('.chip-screen__content')?.removeAttribute('data-board-tight');
    };
  }, [on]);
  const fit = `calc(100dvh - ${top}px - var(--layout-gutter))`;
  return [ref, on && top != null ? { blockSize: `max(${fit}, ${boardMin()}px)` } : undefined];
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

export default function Flow({ as: Tag = 'div', direction = 'column', gap = 16, wrap = false, swipe = false, fill = false, equal = false, grow, justify = 'start', align, span = 12, board = false, fit = false, fitKey, scroll = false, sticky = false, stretch = false, aside = false, bullets = false, inset = false, cards = false, head = false, strip = false, grid = false, children, ...rest }) {
  const [boardRef, boardSize] = useToBottom(board);
  const [fitRef, fitSize] = useFull(fit, fitKey);
  if (!GAPS.has(gap)) throw new Error(`Flow: gap ${gap} is not on the spacing scale (0, 4, 8, 12, 16, 24)`);
  const cls = ['chip-flow', `chip-flow--${direction}`, board ? 'chip-flow--board' : '', fit ? 'chip-flow--fit' : '', scroll ? 'chip-flow--scroll' : '', sticky ? 'chip-flow--sticky' : '', `chip-flow--gap-${gap}`, wrap ? 'chip-flow--wrap' : '', swipe ? 'chip-flow--swipe' : '', fill ? 'chip-flow--fill' : '', equal ? 'chip-flow--equal' : '', grow ? `chip-flow--grow-${grow}` : '', justify !== 'start' ? `chip-flow--${justify}` : '', align === 'center' ? 'chip-flow--center-items' : align === 'start' ? 'chip-flow--start-items' : align === 'end' ? 'chip-flow--end-items' : '', stretch ? 'chip-flow--stretch' : '', aside ? 'chip-flow--aside' : '', bullets ? 'chip-flow--bullets' : '', inset ? 'chip-flow--inset' : '', cards ? 'chip-flow--cards' : '', cards === 'bento' ? 'chip-flow--bento' : '', head ? 'chip-flow--head' : '', strip ? 'chip-flow--strip' : '', grid ? 'chip-flow--grid' : '', `chip-span-${span}`]
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
      <Tag className={cls} ref={fitRef} style={fitSize} tabIndex={scroll ? 0 : undefined} {...rest}>
        {children}
      </Tag>
    );
  // a box that scrolls on its own is reachable by keyboard (WCAG 2.1.1): focusable, unless the page gave it its own tabIndex
  return (
    <Tag className={cls} tabIndex={scroll ? 0 : undefined} {...rest}>
      {children}
    </Tag>
  );
}
