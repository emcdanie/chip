// Mark up, on every page (Elleta, 23 Nov 2026: "a markup button directly in the dashboard so I can go through it and
// send all my notes"). One toggle in the top bar. On: a click anywhere drops a numbered pin with a small comment box
// (Enter saves, Esc cancels), she moves between pages and keeps marking, and every note stays a draft on her machine
// with a visible count. One "n marked · Send all" bar posts every note as ONE message to POST /answers (type
// "markup", the shape markupBody in needsYouModel.js and the :3123 pages send), then says "Sent n notes · time".
//
// BELLA parts: Pin, Card, Input (multiline), Button, TextStack, Notification, Tooltip. BELLA GAP (named, not drawn):
// PicturePins takes one picture and pixel coordinates, so it cannot mark a live page; this file reuses its parts and
// comment-box pattern, and a Comment popover with a pin is still the gap PicturePins names.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import Input from '@bella/components/Input/Input';
import Notification from '@bella/components/Notification/Notification';
import Pin from '@bella/components/Pin/Pin';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';

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

/** The notes, the on/off switch and the send; one store for the toggle button and the layer. */
export function useMarkUp() {
  const [on, setOn] = useState(false);
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
      notes: list.map((p, i) => ({ n: i + 1, note: p.note, on: p.on, section: p.path, x: p.x, y: p.y })),
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
  return { on, setOn, notes, setNotes, sent, setSent, sending, send };
}

/** The layer: pins for this page, the comment box, and the Send all bar. Rendered once in Screen. */
export default function MarkUp({ markup }) {
  const { on, notes, setNotes, sent, setSent, sending, send } = markup;
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

  // a click anywhere on the page (not on Mark up's own parts, not on the top bar's Mark up button) is a new pin
  useEffect(() => {
    if (!on) return undefined;
    const drop = (e) => {
      const t = e.target;
      if (t.closest?.('[data-markup-own]')) return;
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
    const text = open.text.trim();
    if (!text) return;
    const p = at(open);
    setNotes((all) => [...all, { id: `m${Date.now()}`, route, path: open.path, on: open.on, fx: open.fx, fy: open.fy, x: Math.round(p?.left ?? 0), y: Math.round(p?.top ?? 0), viewport: `${window.innerWidth}x${window.innerHeight}`, note: text }]);
    setSent(null);
    setOpen(null);
  };
  const number = (p) => notes.indexOf(p) + 1;
  const place = open ? (open.id === 'new' ? shown : at(notes.find((p) => p.id === open.id) ?? {})) : null;
  const boxLeft = place ? Math.max(8, Math.min(place.left + 16, window.innerWidth - BOX - 8)) : 0;
  const boxTop = place ? Math.max(8, Math.min(place.top + 16, window.innerHeight - 280)) : 0;
  const now = open && open.id !== 'new' ? notes.find((p) => p.id === open.id) : null;

  useLayoutEffect(() => {
    if (open && box.current) box.current.querySelector('textarea')?.focus();
  }, [open?.id]);

  return (
    <>
      {on || here.length ? (
        <div data-markup-own style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
          {here.map((p) => {
            const w = at(p);
            return w ? (
              <span key={p.id} style={{ position: 'fixed', insetInlineStart: w.left, insetBlockStart: w.top, translate: '-50% -50%', pointerEvents: 'auto' }}>
                <Pin number={number(p)} variant="red" pinStyle="solid" ariaLabel={`Note ${number(p)}`} onClick={() => setOpen({ id: p.id })} />
              </span>
            ) : null;
          })}
          {open?.id === 'new' && shown ? (
            <span style={{ position: 'fixed', insetInlineStart: shown.left, insetBlockStart: shown.top, translate: '-50% -50%' }}>
              <Pin number={notes.length + 1} variant="red" pinStyle="solid" />
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
              <Card>
                <Flow gap={8}>
                  {now ? (
                    <>
                      <Flow direction="row" gap={8} align="center">
                        <Pin number={number(now)} variant="red" pinStyle="solid" />
                        <TextStack subtitle="Draft, not sent yet" />
                      </Flow>
                      <TextStack body={now.note} />
                      <Flow direction="row" gap={8} justify="end">
                        <Button variant="tertiary" size="sm" onClick={() => setOpen(null)}>Close</Button>
                        <Button variant="secondary" size="sm" onClick={() => (setNotes((all) => all.filter((x) => x.id !== now.id)), setOpen(null))}>Remove</Button>
                      </Flow>
                    </>
                  ) : (
                    <>
                      <Input label={`Note ${notes.length + 1}`} multiline value={open.text} onChange={(v) => setOpen((o) => ({ ...o, text: v }))} placeholder="What should change?" />
                      <Flow direction="row" gap={8} justify="end">
                        <Button variant="tertiary" size="sm" onClick={() => setOpen(null)}>Cancel</Button>
                        <Button variant="primary" size="sm" disabled={!open.text.trim()} onClick={commit}>Save</Button>
                      </Flow>
                    </>
                  )}
                </Flow>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}
      {notes.length || sent ? (
        <div data-markup-own role="status" style={{ position: 'fixed', insetInline: 'var(--spacing-16)', insetBlockEnd: 'var(--spacing-16)', zIndex: 21, display: 'flex', justifyContent: 'center' }}>
          <div style={{ inlineSize: '100%', maxInlineSize: 'calc(var(--size-60) * 10)' }}>
          {sent?.failed ? (
            <Notification tone="danger" message="Not sent: the review server on localhost:3123 did not answer. Your notes are kept here." action={{ label: 'Try again', onClick: send }} />
          ) : notes.length ? (
            <Notification tone="info" message={`${notes.length} marked`} action={{ label: sending ? 'Sending' : 'Send all', onClick: send }} />
          ) : (
            <Notification tone="success" message={`Sent ${sent.n} notes · ${sent.at}`} onClose={() => setSent(null)} closeLabel="Close" />
          )}
          </div>
        </div>
      ) : null}
    </>
  );
}
