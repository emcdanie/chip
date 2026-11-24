// A picture you comment on like Figma comments (Elleta, 23 Nov 2026: "i wanted it to be like figma comments"):
// the picture fits the space from the start, a click drops a numbered pin and a small comment box opens beside it
// (Enter sends, Esc cancels, Shift+Enter is a new line), a pin you click shows its note and can be resolved,
// Ctrl/Cmd + scroll or a pinch zooms, Space + drag or a middle-button drag pans, and one small control group
// (zoom out, zoom in, Fit) sits at the picture's corner, unless the page holds the zoom (onZoomChange: the Workbench's
// tool column beside the picture). No Mark up mode. Shared by Playground Picks and the Needs
// you view so both behave alike.
//
// BELLA parts: Stage (the plain stage the picture stands on), Pin, Card, Input (multiline), Button, TextStack.
// BELLA GAPS (named, not drawn here): a Comment popover with a pin (the box is a Card placed by this file); a
// ToolColumn without Light or dark and Compare (so three Buttons); Stage's frame mode keeps about 130px of
// padding and a size row around the picture, so the plain stage carries it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Input from '@bella/components/Input/Input';
import Stage from '@bella/components/Stage/Stage';
import TextStack from '@bella/components/TextStack/TextStack';
import { ZOOM_STEPS } from '@bella/components/ToolColumn/ToolColumn';
import Flow from './Flow.jsx';
import { CommentBubble, CommentPin, NewComment, PIN_AT } from './Comment.jsx';

const MIN = 0.1;
const MAX = 4;
const BOX = 288; // the comment box's width in px, three times the 96 grid

function useSize(src) {
  const [size, setSize] = useState(null);
  useEffect(() => {
    setSize(null);
    if (!src) return undefined;
    let live = true;
    const im = new Image();
    im.onload = () => live && setSize({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => live && setSize({ w: 0, h: 0 });
    im.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return size;
}

/**
 * pins: [{ id, x, y, note }] in the picture's own pixels. setPins(fn) takes the list and returns the next one.
 * onCommit(pin): after a new comment is saved (Playground sends it; Needs you keeps it for Send all).
 * numberOf(pin): the pin's number on the picture; the list's order by default.
 */
export default function PicturePins({ src, alt, pins, setPins, onCommit, numberOf, commitLabel = 'Send', summary, zoom: zoomProp, onZoomChange, onFitChange, reserve }) {
  const size = useSize(src);
  const scroller = useRef(null);
  const wrap = useRef(null);
  const inner = useRef(null);
  const [room, setRoom] = useState(null);
  // null = Fit, else frame pixels per picture pixel. With onZoomChange the page holds it (the Workbench's tool column
  // beside the picture, Workbench A 23 Nov); without, the picture keeps it and draws its own corner group (Pages tab)
  const [zoomOwn, setZoomOwn] = useState(null);
  const outside = onZoomChange != null;
  const zoom = outside ? zoomProp ?? null : zoomOwn;
  const setZoom = outside ? onZoomChange : setZoomOwn;
  const [open, setOpen] = useState(null); // { id, x, y, text } : a new comment ('new') or a pin you opened
  const [panning, setPanning] = useState(false);
  const [place, setPlace] = useState(null);
  const [saved, setSaved] = useState(false); // "Saved" for 2 seconds after a comment is saved
  useEffect(() => {
    if (!saved) return undefined;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);
  const space = useRef(false);
  const over = useRef(false);
  const quiet = useRef(false); // a drag just ended: its click is not a new pin
  const anchor = useRef(null);
  const number = numberOf ?? ((p) => (p.isNew ? pins.length + 1 : pins.indexOf(p) + 1));

  // the room the picture has, so Fit fills it
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const measure = () => setRoom({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size?.w]);

  // the room the picture may take: the scroller's width, and a share of the window's height
  const [vh, setVh] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  // reserve: the window height the page keeps for what sits above and below the picture (the Workbench's title, row,
  // strip and Send all bar stay in the first view, as in Workbench A); otherwise 65% of the window
  const avail = reserve != null ? Math.max(288, vh - reserve) : Math.max(384, Math.round(vh * 0.65));
  // whole: the whole picture in view. With the page holding the zoom (the Workbench), Fit fills the stage's width from
  // the start and a tall picture scrolls inside the stage (her rule: "the picture fills the space (Fit) from the start");
  // the tool column's Fit then toggles to the whole picture
  const whole = size?.w && room ? Math.min(2, Math.max(MIN, Math.min(room.w / size.w, avail / size.h))) : 1;
  const fit = outside && size?.w && room ? Math.min(2, Math.max(MIN, room.w / size.w)) : whole;
  const k = zoom ?? fit;
  useEffect(() => {
    onFitChange?.(fit, whole);
  }, [fit, whole]); // eslint-disable-line react-hooks/exhaustive-deps

  // after a zoom, the picture point under the cursor stays under it
  useLayoutEffect(() => {
    const a = anchor.current;
    const sc = scroller.current;
    const im = inner.current;
    if (!a || !sc || !im) return;
    anchor.current = null;
    const s = sc.getBoundingClientRect();
    const i = im.getBoundingClientRect();
    sc.scrollLeft += i.left + a.fx * k - (s.left + a.cx);
    sc.scrollTop += i.top + a.fy * k - (s.top + a.cy);
  }, [k]);

  const zoomTo = (next, at) => {
    const sc = scroller.current;
    const im = inner.current;
    const nk = Math.min(MAX, Math.max(MIN, next));
    if (sc && im) {
      const s = sc.getBoundingClientRect();
      const i = im.getBoundingClientRect();
      const cx = at ? at.x - s.left : sc.clientWidth / 2;
      const cy = at ? at.y - s.top : sc.clientHeight / 2;
      anchor.current = { cx, cy, fx: (s.left + cx - i.left) / k, fy: (s.top + cy - i.top) / k };
    }
    setZoom(nk);
  };
  const step = (dir) => {
    const cur = Math.round(k * 100);
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > cur) : [...ZOOM_STEPS].reverse().find((z) => z < cur);
    if (next) zoomTo(next / 100);
  };

  // pinch (a trackpad sends Ctrl + wheel) and Cmd/Ctrl + scroll zoom; a plain scroll pans, as in Figma
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const wheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(k * Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  // Space + drag pans while the pointer is over the picture
  useEffect(() => {
    const down = (e) => {
      if (e.code !== 'Space' || !over.current || /^(INPUT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) return;
      e.preventDefault();
      space.current = true;
      setPanning(true);
    };
    const up = (e) => {
      if (e.code !== 'Space') return;
      space.current = false;
      setPanning(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  // a drag moves the picture (23 Nov 2026, her ask: "you can still move the board around"), with any button: a press
  // that moves more than 4px pans and drops no comment; Space + drag and the middle button pan at once, as before
  const startPan = (e) => {
    if (e.target.closest?.('[data-comment-box], [data-bella-component="pin"]')) return;
    const at = space.current || e.button === 1;
    if (!at && e.button !== 0) return;
    if (at) e.preventDefault();
    const sc = scroller.current;
    const from = { x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop };
    let moving = at;
    // each press starts fresh: only a drag in this press makes its own click a no-comment click
    quiet.current = at;
    const move = (m) => {
      if (!moving && Math.hypot(m.clientX - from.x, m.clientY - from.y) > 4) {
        moving = true;
        quiet.current = true;
        setPanning(true);
      }
      if (!moving) return;
      sc.scrollLeft = from.left - (m.clientX - from.x);
      sc.scrollTop = from.top - (m.clientY - from.y);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      if (moving && !space.current) setPanning(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };

  // the comment box sits beside its pin; it follows the pin through zoom and scroll
  useLayoutEffect(() => {
    if (!open || !inner.current || !wrap.current) {
      setPlace(null);
      return;
    }
    const at = () => {
      const w = wrap.current.getBoundingClientRect();
      const i = inner.current.getBoundingClientRect();
      const px = i.left - w.left + open.x * k;
      const py = i.top - w.top + open.y * k;
      if (w.width < 460) return setPlace({ inline: true }); // a narrow picture: the box sits under it, the pin stays in view
      const bw = Math.min(BOX, w.width - 16);
      const tall = 272; // the box's height, about
      const down = Math.min(Math.max(8, py - 24), Math.max(8, w.height - tall));
      if (px + 24 + bw <= w.width) setPlace({ left: px + 24, top: down });
      else if (px - 24 - bw >= 8) setPlace({ left: px - 24 - bw, top: down });
      else setPlace({ left: Math.min(Math.max(8, px - bw / 2), w.width - bw - 8), top: py + 24 + tall <= w.height ? py + 24 : py - 24 - tall >= 8 ? py - 24 - tall : Math.max(8, w.height - tall) });
    };
    at();
    const sc = scroller.current;
    sc.addEventListener('scroll', at, { passive: true });
    return () => sc.removeEventListener('scroll', at);
  }, [open?.id, open?.x, open?.y, k, size?.w, room?.w]);
  useEffect(() => {
    if (open) wrap.current?.querySelector('[data-comment-box] input, [data-comment-box] textarea')?.focus();
  }, [open?.id, !!place]);
  useEffect(() => setOpen(null), [src]);

  if (!src) return <EmptyState size="lane" mark="🖼" title="No picture on this card" />;
  if (!size) return <EmptyState size="lane" mark="⏳" title="Loading the picture" />;
  if (!size.w) return <EmptyState size="lane" mark="🖼" title="The picture didn’t load" />;

  const drop = (e) => {
    if (quiet.current) {
      quiet.current = false;
      return;
    }
    // a comment is open: this click closes it, keeping what she wrote as a draft (as Figma does), and drops nothing
    if (open) {
      if (open.id === 'new' && (open.text ?? '').trim()) commit();
      else setOpen(null);
      return;
    }
    const r = inner.current.getBoundingClientRect();
    setOpen({ id: 'new', x: Math.round((e.clientX - r.left) / k), y: Math.round((e.clientY - r.top) / k), text: '' });
  };
  const commit = () => {
    const text = (open?.text ?? '').trim();
    if (!text) return;
    const pin = { id: `p${Date.now()}`, x: open.x, y: open.y, note: text };
    setPins((all) => [...all, pin]);
    setOpen(null);
    setSaved(true);
    onCommit?.(pin);
  };
  const onKeys = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === '+' || e.key === '=') step(1);
    else if (e.key === '-') step(-1);
    else if (e.key === '0') setZoom(null);
    else if (e.key === 'Enter') {
      const sc = scroller.current;
      const r = inner.current.getBoundingClientRect();
      const s = sc.getBoundingClientRect();
      setOpen({ id: 'new', x: Math.round((s.left + sc.clientWidth / 2 - r.left) / k), y: Math.round((s.top + sc.clientHeight / 2 - r.top) / k), text: '' });
    }
  };
  const now = open && open.id !== 'new' ? pins.find((p) => p.id === open.id) : null;
  const label = (p) => number(p);
  const nextNo = number({ id: 'new', isNew: true });

  return (
    <Stage grid="none" label={summary ?? alt}>
      <div
        ref={wrap}
        style={{ position: 'relative', inlineSize: '100%' }}
        onPointerEnter={() => (over.current = true)}
        onPointerLeave={() => (over.current = false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(null);
          }
        }}
      >
        <div
          ref={scroller}
          tabIndex={0}
          role="group"
          aria-label={`${alt}. Enter adds a comment at the centre, plus and minus zoom, 0 fits, hold Space and drag to pan.`}
          onKeyDown={onKeys}
          onPointerDownCapture={startPan}
          style={{ display: 'flex', overflow: 'auto', blockSize: zoom == null ? Math.min(avail, Math.ceil(size.h * fit)) : avail, inlineSize: '100%', cursor: panning ? 'grabbing' : 'crosshair' }}
        >
          <div ref={inner} onClick={drop} style={{ position: 'relative', margin: 'auto', flexShrink: 0, inlineSize: size.w * k, blockSize: size.h * k }}>
            <img src={src} alt={alt} draggable={false} style={{ display: 'block', inlineSize: '100%', blockSize: '100%' }} />
            {pins.map((p) => (
              <span key={p.id} style={{ position: 'absolute', insetInlineStart: p.x * k, insetBlockStart: p.y * k, translate: PIN_AT }} onClick={(e) => e.stopPropagation()}>
                <CommentPin n={label(p)} sent={p.sent} onClick={() => setOpen({ id: p.id, x: p.x, y: p.y, text: p.note })} />
              </span>
            ))}
            {open?.id === 'new' ? (
              <span style={{ position: 'absolute', insetInlineStart: open.x * k, insetBlockStart: open.y * k, translate: PIN_AT }} onClick={(e) => e.stopPropagation()}>
                <CommentPin n={nextNo} />
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ position: 'absolute', insetBlockEnd: 'var(--spacing-16)', insetInlineEnd: 'var(--spacing-16)' }}>
          <Flow direction="row" gap={4} align="center" role="toolbar" aria-label="Picture zoom">
            {outside ? null : (
              <>
            <Flow role="status" gap={0}>
              {saved ? <TextStack body="Saved" /> : null}
            </Flow>
              <>
                <Button variant="secondary" size="sm" iconOnly icon="ZoomOut" ariaLabel="Zoom out" onClick={() => step(-1)} />
                <Button variant="secondary" size="sm" iconOnly icon="ZoomIn" ariaLabel="Zoom in" onClick={() => step(1)} />
                <Button variant="secondary" size="sm" ariaPressed={zoom == null} onClick={() => setZoom(null)}>
                  {zoom == null ? `Fit ${Math.round(fit * 100)}%` : `${Math.round(k * 100)}%`}
                </Button>
              </>
              </>
            )}
          </Flow>
        </div>
        {open && place ? (
          <div
            data-comment-box
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'TEXTAREA' && !now) {
                e.preventDefault();
                commit();
              }
            }}
            style={place.inline ? { marginBlockStart: 'var(--spacing-8)' } : { position: 'absolute', insetInlineStart: place.left, insetBlockStart: place.top, inlineSize: BOX, maxInlineSize: 'calc(100% - var(--spacing-16))', zIndex: 2 }}>
            {now ? (
              <CommentBubble
                when={now.sent ? 'Sent' : 'Draft, not sent yet'}
                actions={
                  <>
                    <Button variant="tertiary" size="sm" onClick={() => setOpen(null)}>
                      Close
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => (setPins((all) => all.filter((x) => x.id !== now.id)), setOpen(null))}>
                      Resolve
                    </Button>
                  </>
                }
              >
                <TextStack body={now.note} />
              </CommentBubble>
            ) : (
              <NewComment n={nextNo} value={open.text} onChange={(v) => setOpen((o) => ({ ...o, text: v }))} onSend={commit} />
            )}
          </div>
        ) : null}
      </div>
    </Stage>
  );
}
