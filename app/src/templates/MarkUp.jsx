// Mark up, on every page (Elleta, 23 Nov 2026: "a markup button directly in the dashboard so I can go through it and
// send all my notes"). The top bar's Mark up opens a floating toolbar at the foot of the screen, as Figma's (24 Nov
// 15:20). With its comment tool on, a click in the page's content drops a numbered pin with a small comment box (Enter
// saves, Esc cancels); with it off, the page works as usual and the pins stay. She moves between pages and keeps marking;
// every note stays a draft on her machine with a visible count. Send all posts every note as ONE message to POST
// /answers (type "markup", the shape markupBody in needsYouModel.js and the :3123 pages send), then says "Sent n notes".
//
// Like Figma comments (23 Nov 23:00): the side menu, the tabs and the header keep working with the tool on, Shift+click
// uses a control in the content, selecting words and scrolling work as ever, and a click away from an open comment keeps
// what she wrote as a draft and drops nothing. One message about the whole page goes in the toolbar's field.
//
// BELLA parts: Pin (comment), Card, Avatar, Input, Button, TextStack, Notification, Tooltip. BELLA GAP (named, not drawn):
// PicturePins takes one picture and pixel coordinates, so it cannot mark a live page; this file reuses its parts and
// comment-box pattern, and a Comment popover with a pin is still the gap PicturePins names.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import Input from '@bella/components/Input/Input';
import Notification from '@bella/components/Notification/Notification';
import TextStack from '@bella/components/TextStack/TextStack';
import Tooltip from '@bella/components/Tooltip/Tooltip';
import Flow from './Flow.jsx';
import useNarrow from './useNarrow.js';
import { CommentBubble, CommentPin, NewComment, PIN_AT } from './Comment.jsx';

const KEY = 'chip.markup.drafts';
const BOARD = 'http://localhost:3123';
const BOX = 288;

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
};
const write = (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* kept in memory only */
  }
};

/** A path that finds the element again: tag and position, up to the nearest id. */
function pathOf(el) {
  const parts = [];
  for (let n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
    if (n.id) {
      parts.unshift(`#${CSS.escape(n.id)}`);
      break;
    }
    const same = [...n.parentElement.children].filter((c) => c.tagName === n.tagName);
    parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${same.indexOf(n) + 1})`);
  }
  return parts.join(' > ');
}
const find = (path) => {
  try {
    return path ? document.querySelector(path) : null;
  } catch {
    return null;
  }
};
const routeOf = () => window.location.hash || '#/';
const wordsOf = (el) => (el?.innerText ?? el?.getAttribute?.('aria-label') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** The notes, the toolbar, its comment tool and the send; one store for the top bar's button and the layer. */
// Like Figma's bottom toolbar (her app review, 24 Nov 15:20: she had to scroll to the top to turn Mark up on and off, and
// could click nothing on the board while marking): the top bar's Mark up only opens a floating toolbar at the foot of the
// screen; the toolbar holds the comment tool (on: a click in the page drops a comment; off: the page works as usual), a
// field for the whole page, Send all and Close. Open or closed, and the tool on or off, stay the same from page to page
// (each page draws its own screen, so both are kept here and in this tab's session).
const OPEN_KEY = 'chip.markup.on';
const TOOL_KEY = 'chip.markup.tool';
const readKey = (k, dflt) => {
  try {
    const v = sessionStorage.getItem(k);
    return v == null ? dflt : v === '1';
  } catch {
    return dflt;
  }
};
const keep = (k, v) => {
  try {
    sessionStorage.setItem(k, v ? '1' : '0');
  } catch {}
};
export function useMarkUp() {
  const [open, setOpenState] = useState(() => readKey(OPEN_KEY, false));
  const [tool, setToolState] = useState(() => readKey(TOOL_KEY, true));
  const setOpen = (v) => (keep(OPEN_KEY, v), setOpenState(v));
  const setTool = (next) =>
    setToolState((was) => {
      const v = typeof next === 'function' ? next(was) : next;
      keep(TOOL_KEY, v);
      return v;
    });
  // the top bar's button only opens the toolbar, with the comment tool picked, as Figma's comment shortcut does
  const openBar = () => (setOpen(true), setTool(true));
  // a click in the page drops a comment only while the toolbar is open and its comment tool is on
  const on = open && tool;
  const [notes, setNotes] = useState(read);
  const [sent, setSent] = useState(null); // { n, at } | { failed }
  const [sending, setSending] = useState(false);
  useEffect(() => write(notes), [notes]);
  const send = async () => {
    if (sending || !notes.length) return;
    setSending(true);
    const byRoute = notes.reduce((m, p) => ((m[p.route] ??= []).push(p), m), {});
    const markups = Object.entries(byRoute).map(([route, list]) => ({
      type: 'markup',
      page: `CHIP ${route}`,
      url: route,
      viewport: list[0].viewport,
      notes: list.map((p, i) => ({ n: i + 1, note: p.note, on: p.on, section: p.path, x: p.x ?? null, y: p.y ?? null })),
    }));
    try {
      const r = await fetch(new URL('/answers', BOARD).href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'batch', page: `Mark up · ${notes.length} notes`, url: '/markup', cards: [], markups }) });
      if (!r.ok) throw new Error('refused');
      setSent({ n: notes.length, at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) });
      setNotes([]);
    } catch {
      setSent({ failed: true });
    }
    setSending(false);
  };
  return { on, open, setOpen, openBar, tool, setTool, notes, setNotes, sent, setSent, sending, send };
}

/** The layer: pins for this page, the comment box, and the Send all bar. Rendered once in Screen. */
export default function MarkUp({ markup }) {
  const { on, open: barOpen, setOpen: setBarOpen, tool, setTool, notes, setNotes, sent, setSent, sending, send } = markup;
  const [route, setRoute] = useState(routeOf());
  const [open, setOpen] = useState(null); // { id, ax, ay, text, ... }
  const [, tick] = useState(0);
  const box = useRef(null);
  useEffect(() => {
    const go = () => (setRoute(routeOf()), setOpen(null));
    const move = () => tick((n) => n + 1);
    window.addEventListener('hashchange', go);
    window.addEventListener('resize', move);
    document.addEventListener('scroll', move, true);
    return () => {
      window.removeEventListener('hashchange', go);
      window.removeEventListener('resize', move);
      document.removeEventListener('scroll', move, true);
    };
  }, []);
  useEffect(() => {
    if (!on) setOpen(null);
  }, [on]);

  // the open comment, read by the page-wide click listener without re-binding it on every keystroke
  const openRef = useRef(open);
  openRef.current = open;
  const commitRef = useRef(null);
  // a click on the page's words or space is a new comment; a control keeps its job unless Shift is held; a selection or
  // a drag is not a comment; a click away from an open comment keeps it (as a draft, if written) and drops nothing
  useEffect(() => {
    if (!on) return undefined;
    const CONTROL = 'button, a[href], input, textarea, select, label, summary, [role="button"], [role="tab"], [role="link"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], [contenteditable="true"]';
    const drop = (e) => {
      const t = e.target;
      if (t.closest?.('[data-markup-own]')) return;
      // a picture with its own pins (Playground, Needs you review cards) takes the click itself: the pin goes on the picture
      if (t.closest?.('[data-picture-pins]')) return;
      const cur = openRef.current;
      if (cur) {
        e.preventDefault();
        e.stopPropagation();
        if (cur.id === 'new' && (cur.text ?? '').trim()) commitRef.current?.();
        else setOpen(null);
        return;
      }
      if (String(window.getSelection?.() ?? '').trim()) return; // she is selecting words
      // the menu, tabs and header (outside the page's content) keep their jobs; in the content Shift+click uses a control
      if (!t.closest?.('.chip-screen__content')) return;
      if (e.shiftKey && t.closest?.(CONTROL)) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = t.getBoundingClientRect();
      setOpen({ id: 'new', path: pathOf(t), on: wordsOf(t), fx: (e.clientX - rect.left) / (rect.width || 1), fy: (e.clientY - rect.top) / (rect.height || 1), text: '' });
    };
    const key = (e) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('click', drop, true);
    document.addEventListener('keydown', key);
    document.documentElement.style.cursor = 'crosshair';
    return () => {
      document.removeEventListener('click', drop, true);
      document.removeEventListener('keydown', key);
      document.documentElement.style.cursor = '';
    };
  }, [on]);

  // where a pin sits now: its element's box and the fraction inside it (so it follows scrolling and resizing)
  const at = (p) => {
    const el = find(p.path);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left + p.fx * r.width, top: r.top + p.fy * r.height };
  };
  const here = notes.filter((p) => p.route === route);
  const shown = open?.id === 'new' ? at(open) : null;
  const commit = () => {
    const cur = openRef.current;
    const text = (cur?.text ?? '').trim();
    if (!text) return;
    const p = at(cur);
    setNotes((all) => [...all, { id: `m${Date.now()}`, route, path: cur.path, on: cur.on, fx: cur.fx, fy: cur.fy, x: Math.round(p?.left ?? 0), y: Math.round(p?.top ?? 0), viewport: `${window.innerWidth}x${window.innerHeight}`, note: text }]);
    setSent(null);
    setOpen(null);
  };
  commitRef.current = commit;
  // one message about the whole page, with no spot: it goes with Send all like the rest
  const [said, setSaid] = useState('');
  const sayPage = (text) => {
    const words = (text ?? '').trim();
    if (!words) return;
    setNotes((all) => [...all, { id: `m${Date.now()}`, route, path: null, on: 'the page', fx: 0, fy: 0, x: null, y: null, viewport: `${window.innerWidth}x${window.innerHeight}`, note: words }]);
    setSaid('');
    setSent(null);
  };
  const number = (p) => notes.indexOf(p) + 1;
  const place = open ? (open.id === 'new' ? shown : at(notes.find((p) => p.id === open.id) ?? {})) : null;
  const boxLeft = place ? Math.max(8, Math.min(place.left + 16, window.innerWidth - BOX - 8)) : 0;
  const boxTop = place ? Math.max(8, Math.min(place.top + 16, window.innerHeight - 280)) : 0;
  const now = open && open.id !== 'new' ? notes.find((p) => p.id === open.id) : null;

  // the toolbar's parts: the comment tool (on, a click in the page drops a comment; off, the page works as usual) and one
  // message about the whole page (Enter or the field's Send adds it to the notes); its label is for screen readers only
  const phone = useNarrow(640);
  const barRef = useRef(null);
  const commentTool = (
    <Tooltip label={tool ? 'Comment tool on: click the page to comment. Press to click as usual' : 'Comment tool: press, then click the page to comment'} placement="top">
      <Button variant="tertiary" iconOnly icon="ChatBubbleEmpty" ariaLabel="Comment tool" ariaPressed={tool} onClick={() => setTool((t) => !t)} />
    </Tooltip>
  );
  const field = <Input label={<span className="sr-only">About this page</span>} labelPosition="inline" value={said} onChange={setSaid} onSend={sayPage} sendLabel="Add to my notes" placeholder="Say what you’d change here" />;
  // opened from the top bar, the toolbar takes focus in its field (so the button's tooltip does not stay over the page);
  // a toolbar still open from the last page does not take focus
  const wasOpen = useRef(barOpen);
  useEffect(() => {
    if (barOpen && !wasOpen.current) barRef.current?.querySelector('input')?.focus({ preventScroll: true });
    wasOpen.current = barOpen;
  }, [barOpen]);

  useLayoutEffect(() => {
    // the field takes focus without scrolling the page (24 Nov: the page jumped about 300px, so the pin landed away from the
    // click); the box is fixed beside the pin, so it is already in view
    if (open && box.current) box.current.querySelector('input, textarea')?.focus({ preventScroll: true });
  }, [open?.id]);

  return (
    <>
      {barOpen || here.length ? (
        <div data-markup-own style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
          {here.map((p) => {
            const w = at(p);
            return w ? (
              <span key={p.id} style={{ position: 'fixed', insetInlineStart: w.left, insetBlockStart: w.top, translate: PIN_AT, pointerEvents: 'auto' }}>
                <CommentPin n={number(p)} onClick={() => setOpen({ id: p.id })} />
              </span>
            ) : null;
          })}
          {open?.id === 'new' && shown ? (
            <span style={{ position: 'fixed', insetInlineStart: shown.left, insetBlockStart: shown.top, translate: PIN_AT }}>
              <CommentPin n={notes.length + 1} />
            </span>
          ) : null}
          {open && place ? (
            <div
              ref={box}
              data-markup-own
              style={{ position: 'fixed', insetInlineStart: boxLeft, insetBlockStart: boxTop, inlineSize: `calc(var(--spacing-4) * ${BOX / 4})`, maxInlineSize: '100%', pointerEvents: 'auto' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'TEXTAREA' && !now) {
                  e.preventDefault();
                  commit();
                }
              }}
            >
              {now ? (
                <CommentBubble
                  when="Draft, not sent yet"
                  actions={
                    <>
                      <Button variant="tertiary" size="sm" onClick={() => setOpen(null)}>Close</Button>
                      <Button variant="secondary" size="sm" onClick={() => (setNotes((all) => all.filter((x) => x.id !== now.id)), setOpen(null))}>Remove</Button>
                    </>
                  }
                >
                  <TextStack body={now.note} />
                </CommentBubble>
              ) : (
                <NewComment n={notes.length + 1} value={open.text} onChange={(v) => setOpen((o) => ({ ...o, text: v }))} onSend={commit} />
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {barOpen || sent ? (
        // the floating toolbar at the foot of the screen, as Figma's: it stays in reach wherever she has scrolled, and it
        // follows her from page to page until she closes it
        <div data-markup-own style={{ position: 'fixed', insetInline: 'var(--spacing-16)', insetBlockEnd: 'var(--spacing-16)', zIndex: 21, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <Flow gap={8} style={{ inlineSize: '100%', maxInlineSize: 'calc(var(--size-60) * 13)', pointerEvents: 'auto' }}>
            <div role="status">
              {sent?.failed ? (
                <Notification tone="danger" message="Not sent: the review server on localhost:3123 did not answer. Your notes are kept here." action={{ label: 'Try again', onClick: send }} />
              ) : sent ? (
                <Notification tone="success" message={`Sent ${sent.n} notes · ${sent.at}`} onClose={() => setSent(null)} closeLabel="Close" />
              ) : null}
            </div>
            {barOpen ? (
              <Card>
                {/* one row on a wide screen (the tool and the field, then what is marked, Send all and Close at the right
                    edge); on a phone Send and Close sit under them, at the right edge */}
                <div ref={barRef} role="toolbar" aria-label="Mark up">
                  <Flow direction={phone ? 'column' : 'row'} gap={phone ? 8 : 12} align={phone ? undefined : 'center'} grow={phone ? undefined : 'first'}>
                    <Flow direction="row" gap={8} align="center" grow="last">
                      {commentTool}
                      {field}
                    </Flow>
                    <Flow direction="row" gap={8} align="center" justify={phone ? 'end' : 'start'} style={phone ? undefined : { marginInlineStart: 'auto' }}>
                      <Flow direction="row" gap={8} align="center">
                        {notes.length ? (
                          // on a phone the count rides in the button ("Send 2 notes"): beside it, "2 marked" broke letter by letter at 320
                          phone ? (
                            <Button variant="primary" busy={sending} onClick={send}>
                              {`Send ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
                            </Button>
                          ) : (
                            <>
                              <TextStack body={`${notes.length} marked`} />
                              <Button variant="primary" busy={sending} onClick={send}>
                                Send all
                              </Button>
                            </>
                          )
                        ) : null}
                        <Tooltip label="Close Mark up (your drafts are kept)" placement="top">
                          <Button variant="tertiary" iconOnly icon="Xmark" ariaLabel="Close Mark up" onClick={() => setBarOpen(false)} />
                        </Tooltip>
                      </Flow>
                    </Flow>
                  </Flow>
                </div>
              </Card>
            ) : null}
          </Flow>
        </div>
      ) : null}
    </>
  );
}
