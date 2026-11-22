// Playground · Your picks: the A/B questions waiting on you, in the studio
// layout (Elleta picked B · studio and "Where the A/B opens: A, the Playground
// tab", 22 Nov; /screens/2026-11-22-playground/). Picks on the left, filtered
// by the stat cards above (presets on a phone), the option on the Stage in the
// middle with your 👍 or 👎 beside its question and the options strip under it
// (the MediSync strip: titled row, ← and → at its right; arrows, keys and swipe
// move it, the stage follows), Comments on the option on the right with one
// field and one Send.
//
// Real data only: the progress board (localhost:3123) serves the items waiting
// on you (progress.json), the decision cards on each linked review page
// (section.part: its A/B options and their pictures, the same cards
// /screens/decisions/ shows; the page's Last-Modified dates them), and what you
// already answered or noted (answers.json). CHIP has no route of its own for
// them; when the board is down the last reading shows with its time, never
// sample cards. Her notes show with obvious typos corrected (TYPOS), the stored words untouched.
//
// Sending: one comment box and one Send (23 Nov); it writes the answer and the
// comment to the board in one step and the pane says Saved. Asking an agent for
// a change is the Ask panel's job, not this pane's. A pick has its own link: #/playground?pick=<id>&option=<n>.
//
// HOLES (BELLA has no part yet, not invented here):
// - the tool column beside the stage (zoom in, fit, zoom out, light/dark,
//   mark up, compare): ToolColumn always draws Light or dark and Compare, so
//   zoom, Fit and 100% are Buttons, as in the Needs you view. The picture pans
//   by dragging (usePan, shared with Needs you).
// - StatCard has no selected state and only a strip inside it opens; a filter
//   card is a ListRow (the whole row is the one target, with hover, pressed,
//   focus and selected). BELLA gap for the coordinator: StatCard `selected` +
//   whole-card onOpen.
// - no Splitter part: the comments pane's width is a Slider (keyboard works),
//   and Hide comments / Show comments hides it; both are remembered.
// - no Skeleton part: loading says what it is reading, in words, no spinner.
// - VariantTile is the strip's card: its preview corner is 12 and its resting
//   card grey, where the MediSync strip draws white cards at corner 20.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Heading from '@bella/components/Heading/Heading';
import IconWell from '@bella/components/IconWell/IconWell';
import Input from '@bella/components/Input/Input';
import Link from '@bella/components/Link/Link';
import ListRow from '@bella/components/ListRow/ListRow';
import Notification from '@bella/components/Notification/Notification';
import Pin from '@bella/components/Pin/Pin';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Slider from '@bella/components/Slider/Slider';
import Stage from '@bella/components/Stage/Stage';
import Tag from '@bella/components/Tag/Tag';
import TextStack from '@bella/components/TextStack/TextStack';
import VariantTile from '@bella/components/VariantTile/VariantTile';
import { ZOOM_STEPS } from '@bella/components/ToolColumn/ToolColumn';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';
import usePan from '../templates/usePan.js';

// The progress board. The server knows it as CHIP_REVIEW_URL (lanes.mjs) but no route hands it to the page,
// so this is the same origin the shell's Mark up and Team already post to (Screen.jsx, TeamContent.jsx).
export const BOARD = 'http://localhost:3123';
const BASE = `${BOARD}/screens/progress/`;
const CACHE = 'chip.playground.picks';
const PICTURE = /\.(png|jpe?g|gif|webp|svg)$/i;
const LETTER = /^([A-E])\s*·\s*(.+)$/;

const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const pathOf = (u) => {
  try {
    return new URL(u, BOARD).pathname;
  } catch {
    return '';
  }
};
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
// a heading starts with its keyword: the review page's running number ("6 · ", "1. ") goes
const clean = (t) => t.replace(/^\d+\s*[·.]\s*/, '');
// Her words, spelled right (21 Nov): obvious typos in her notes are corrected word by word from this list,
// the meaning kept, nothing rewritten; a word not on the list shows as she wrote it
const TYPOS = {
  aasked: 'asked', aling: 'align', alittle: 'a little', annimated: 'animated', becasue: 'because', becuase: 'because', beucase: 'because', befroe: 'before', beofre: 'before',
  compoentns: 'components', compoents: 'components', creatin: 'creating', curretn: 'current', desgin: 'design', desing: 'design', drawere: 'drawer', enought: 'enough',
  entore: 'entire', heirachy: 'hierarchy', hierachy: 'hierarchy', hte: 'the', hwere: 'where', hwo: 'how', infigma: 'in Figma', inforamtion: 'information', iputs: 'inputs',
  lareger: 'larger', liek: 'like', litghten: 'lighten', notifaction: 'notification', pdadding: 'padding', porperly: 'properly', recomendation: 'recommendation',
  repetitve: 'repetitive', scrroll: 'scroll', seee: 'see', seperate: 'separate', shadwos: 'shadows', skelteons: 'skeletons', sotry: 'story', sould: 'should', swithc: 'switch',
  taks: 'task', tecnically: 'technically', teh: 'the', tehere: 'there', ther: 'there', thye: 'they', tigehter: 'together', tyr: 'try', understnad: 'understand', unsed: 'unused',
  usefull: 'useful', vicual: 'visual', waht: 'what', withthe: 'with the', wron: 'wrong', wrontg: 'wrong', wuerstion: 'question', wuestions: 'questions', wnat: 'want',
  thign: 'thing', accesible: 'accessible', dont: 'don’t', cant: 'can’t', doesnt: 'doesn’t', isnt: 'isn’t', didnt: 'didn’t', wont: 'won’t', im: 'I’m', ive: 'I’ve', i: 'I',
  figma: 'Figma',
};
const spell = (t) => {
  const fixed = String(t).replace(/[A-Za-z]+/g, (w) => {
    const r = TYPOS[w.toLowerCase()];
    return r == null ? w : w[0] === w[0].toUpperCase() && w.length > 1 ? r[0].toUpperCase() + r.slice(1) : r;
  });
  return fixed.charAt(0).toUpperCase() + fixed.slice(1);
};

/** One decision card (section.part) on a review page, as decide.js reads it. */
function readCard(sec, page, item, mod) {
  const h = sec.querySelector('h2');
  if (!h) return null;
  const title = [...h.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim() || text(h);
  const kind = text(h.querySelector('.kind'));
  const dts = [...sec.querySelectorAll('dt')];
  if (/decided/i.test(title) || /decided/i.test(kind) || dts.some((d) => /^decided/i.test(text(d)))) return null;
  const abs = (src) => (src ? new URL(src, page).href : null);
  const figs = [...sec.querySelectorAll('figure')].map((f) => ({ cap: text(f.querySelector('figcaption')), img: abs(f.querySelector('img')?.getAttribute('src')) })).filter((f) => f.img);
  let options = dts
    .map((d) => text(d).match(LETTER))
    .filter(Boolean)
    .map(([full, letter, rest]) => ({ letter, answer: full, short: rest, img: figs.find((f) => new RegExp(`^${letter}\\s*·`).test(f.cap))?.img ?? null }));
  let thumbs = false;
  if (!options.length) {
    // a card with no A/B is answered with 👍 or 👎 on its pictures (decide.js: "Looks right" / "Change it")
    const pics = figs.length ? figs : [...sec.querySelectorAll('img[src]')].map((i) => ({ cap: i.getAttribute('alt') || title, img: abs(i.getAttribute('src')) }));
    if (!pics.length) return null; // nothing to look at and nothing to pick: information, not a decision
    thumbs = true;
    options = pics.map((f, i) => ({ letter: null, answer: null, short: f.cap || `Picture ${i + 1}`, img: f.img }));
  }
  const fallback = figs[0]?.img ?? item.img;
  options = options.map((o) => ({ ...o, img: o.img ?? fallback }));
  const mine = dts.find((d) => /my pick/i.test(text(d)));
  const decide = [...sec.querySelectorAll('p')].map(text).find((t) => /^decide:/i.test(t));
  const letters = options.map((o) => o.letter);
  return {
    id: `c${hash(`${pathOf(page)}|${title}`)}`,
    title,
    page,
    from: item.title,
    mod,
    thumbs,
    options,
    decide: decide ?? (thumbs ? 'Decide: does it look right?' : `Decide: ${letters.length > 2 ? `${letters.slice(0, -1).join(', ')} or ${letters[letters.length - 1]}` : letters.join(' or ')}?`),
    myPick: mine?.nextElementSibling ? text(mine.nextElementSibling) : null,
  };
}

/** The item itself, when its page has no card to read (a picture link, or a page with none). */
function itemCard(item, mod) {
  if (!item.img && !item.picture) return null;
  return {
    id: `i${hash(item.id ?? item.title)}`,
    title: item.title,
    page: item.link,
    from: 'Progress board',
    mod,
    thumbs: true,
    options: [{ letter: null, answer: null, short: item.title, img: item.picture ?? item.img }],
    decide: 'Decide: does it look right?',
    myPick: null,
  };
}

/** Her answers and notes on a card, from answers.json. */
function remarks(card, answers, single) {
  const path = pathOf(card.page);
  const out = { answer: null, comments: [] };
  answers.forEach((e, k) => {
    const a = e?.answers;
    if (!a || typeof a !== 'object') return;
    const when = e.sent ?? null;
    (a.cards ?? []).forEach((c) => {
      if (pathOf(c.from || a.url || '') !== path || c.title !== card.title) return;
      if (c.answer) out.answer = { text: c.answer, when };
      if (c.note) out.comments.push({ id: `a${k}-${c.title}`, text: spell(c.note), on: c.answer ? `with “${c.answer}”` : 'a note', when });
    });
    if (a.type === 'markup' && pathOf(a.url || '') === path) {
      (a.notes ?? []).forEach((n) => {
        const sec = String(n.section ?? '').toLowerCase();
        const mine = single || (sec && (card.title.toLowerCase().includes(sec) || sec.includes(card.title.toLowerCase().slice(0, 24))));
        if (mine && n.note) out.comments.push({ id: `m${k}-${n.n}`, n: n.n, text: spell(n.note), on: n.on ? 'a mark-up pin' : 'the page', when });
      });
    }
  });
  return out;
}

const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? 'null');
  } catch {
    return null;
  }
};

/** The picks: every decision card on the items waiting on you, with what you already said. */
function usePicks() {
  const [state, setState] = useState({ picks: null, items: 0, down: false, at: null, lastAnswer: null, cached: false });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const get = (p) => fetch(new URL(p, BASE), { cache: 'no-store' });
        const prog = await (await get('progress.json')).json();
        let answers = [];
        try {
          answers = await (await get('answers.json')).json();
        } catch {
          answers = [];
        }
        if (!Array.isArray(answers)) answers = [];
        const items = (prog.items ?? []).filter((i) => i.stage === 'Waiting on you');
        // the board's small server resets connections past a handful at once: three pages at a time, one retry
        const page = async (u) => {
          for (let t = 0; ; t++) {
            try {
              const r = await fetch(u, { cache: 'no-store' });
              if (!r.ok) throw new Error(String(r.status));
              return { html: await r.text(), mod: r.headers.get('Last-Modified') };
            } catch (e) {
              if (t) throw e;
            }
          }
        };
        const limit = async (list, n, fn) => {
          const out = new Array(list.length);
          let next = 0;
          await Promise.all(
            Array.from({ length: n }, async () => {
              while (next < list.length) {
                const k = next++;
                out[k] = await fn(list[k]);
              }
            }),
          );
          return out;
        };
        const cards = await limit(items, 3, async (it) => {
          const link = it.link ? new URL(it.link, BASE) : null;
          const item = { id: it.id, title: String(it.title ?? '').trim(), link: link?.href ?? null, img: it.img ? new URL(it.img, BASE).href : null, picture: link && PICTURE.test(link.pathname) ? link.href : null };
          if (!link || item.picture) return [itemCard(item, null)].filter(Boolean);
          try {
            const { html, mod } = await page(link);
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const at = link.href.split('#')[0];
            const found = [...doc.querySelectorAll('section.part')].map((s) => readCard(s, at, item, mod)).filter(Boolean);
            return found.length ? found : [itemCard(item, mod)].filter(Boolean);
          } catch {
            return [itemCard(item, null)].filter(Boolean);
          }
        });
        // two board items can link the same review page: each card once; A/B questions first, then the 👍/👎 ones
        const seen = new Set();
        const picks = cards
          .flatMap((list) => list.map((c) => ({ ...c, ...remarks(c, answers, list.length === 1) })))
          .filter((c) => !seen.has(c.id) && seen.add(c.id))
          .sort((x, y) => Number(x.thumbs) - Number(y.thumbs));
        const lastAnswer = answers.reduce((m, e) => ((e?.answers?.cards ?? []).some((c) => c.answer) && e.sent > (m ?? '') ? e.sent : m), null);
        const next = { picks, items: items.length, down: false, at: new Date().toISOString(), lastAnswer, cached: false };
        try {
          localStorage.setItem(CACHE, JSON.stringify(next));
        } catch {}
        if (live) setState(next);
      } catch {
        // the board is down: the last reading, with its time, if this browser has one
        const old = readCache();
        if (live) setState(old?.picks ? { ...old, down: true, cached: true } : { picks: null, items: 0, down: true, at: null, lastAnswer: null, cached: false });
      }
    })();
    return () => {
      live = false;
    };
  }, [tick]);
  return { ...state, again: () => setTick((t) => t + 1) };
}

/** The picture's own size, so pins sit in its pixels and the stage can fit it. */
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

// a scroll column holds its own floating bits (a field's ghost text, a button's label copy): without a
// positioned box they hang off the page's own scroll and stretch it far past the window (Flow scroll is not
// positioned; a template gap)
const HOLD = { position: 'relative' };

const FILTERS = [
  { id: 'open', title: 'Not answered', chip: 'Open', icon: 'Clock', test: (p) => !p.answer },
  { id: 'answered', title: 'Answered', chip: 'Answered', icon: 'CheckCircle', test: (p) => !!p.answer },
  { id: 'notes', title: 'With your notes', chip: 'Notes', icon: 'ChatBubbleEmpty', test: (p) => p.comments.length > 0 },
];

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null);
const age = (ms) => {
  const h = Math.floor(ms / 3600000);
  return h >= 48 ? `${Math.floor(h / 24)} days` : h >= 1 ? plural(h, 'hour') : 'under an hour';
};

// the item's name: the card's title without its trailing ": A or B?"
const shortName = (t) => clean(t).replace(/\s*[:·-]\s*(A or B|A, B or C|yes or no)\??$/i, '');

/** How many rows sit below the fold of a scrolling box, so a cut row always says there is more. */
function useBelow(ref, rows, deps) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const count = () => {
      const foot = el.getBoundingClientRect().bottom;
      setN([...el.querySelectorAll(rows)].filter((r) => r.getBoundingClientRect().bottom > foot + 1).length);
    };
    count();
    el.addEventListener('scroll', count, { passive: true });
    const ro = new ResizeObserver(count);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', count);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return n;
}

const PANE = 'chip.playground.pane';
const readPane = () => {
  try {
    const v = JSON.parse(localStorage.getItem(PANE) ?? '{}');
    return { hidden: !!v.hidden, w: Math.min(640, Math.max(280, Number(v.w) || 360)) };
  } catch {
    return { hidden: false, w: 360 };
  }
};

const asked = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');
const linkTo = (id, n) => `#/playground?pick=${encodeURIComponent(id)}${n ? `&option=${n + 1}` : ''}`;

export default function PlaygroundPicks({ onTry }) {
  const { picks, items, down, at: readAt, lastAnswer, cached, again } = usePicks();
  // three columns from a 1280 window: the list, then the stage and the comments in halves, so comments read at
  // 45 characters or more; list beside the stage from 800; a phone stacks them
  const wide = !useNarrow(1280);
  const phone = useNarrow(800);
  // the stat cards (160 tall) only where the window is tall enough to keep the question, the stage and the strip
  // in the first view under them; on a laptop-height or phone window the same filters are presets in one row
  const [tall, setTall] = useState(() => window.innerHeight >= 1000);
  useEffect(() => {
    const on = () => setTall(window.innerHeight >= 1000);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const presets = phone || !tall;
  // opens on what waits on you: the picks not answered yet, unless a link names a pick
  const [filter, setFilter] = useState(() => (asked().get('pick') ? null : 'open'));
  const [at, setAt] = useState(() => asked().get('pick'));
  const [opt, setOpt] = useState(() => {
    const id = asked().get('pick');
    const n = Number(asked().get('option'));
    return id && n > 0 ? { [id]: n - 1 } : {};
  });
  const [drafts, setDrafts] = useState({}); // your answer, pins and notes, per pick, until sent
  const [marking, setMarking] = useState(false);
  const [zoom, setZoom] = useState(null); // null = fitted, else percent
  const pan = usePan();
  const [pane, setPane] = useState(readPane);
  const setPaneKeep = (fn) =>
    setPane((p) => {
      const n = typeof fn === 'function' ? fn(p) : fn;
      try {
        localStorage.setItem(PANE, JSON.stringify(n));
      } catch {}
      return n;
    });
  const [sent, setSent] = useState(null);
  const [say, setSay] = useState('');
  const strip = useRef(null);
  const stageBox = useRef(null);
  const stripBox = useRef(null);
  const headBox = useRef(null);
  const touch = useRef(null);
  const [room, setRoom] = useState(null);
  const notesBox = useRef(null); // the stage's room: width, and height in the wide layout

  const shown = useMemo(() => (picks ?? []).filter((p) => !filter || FILTERS.find((f) => f.id === filter).test(p)), [picks, filter]);
  const pick = shown.find((p) => p.id === at) ?? shown[0] ?? null;
  const i = pick ? Math.max(0, Math.min(opt[pick.id] ?? 0, pick.options.length - 1)) : 0;
  const option = pick?.options[i] ?? null;
  const size = useSize(option?.img);
  const draft = (pick && drafts[pick.id]) || { thumb: {}, pins: [] };
  const setDraft = (fn) => pick && setDrafts((all) => ({ ...all, [pick.id]: fn(all[pick.id] ?? { thumb: {}, pins: [] }) }));
  const mark = option?.letter ?? `${i + 1}`;

  const notesMore = useBelow(notesBox, 'ol[aria-label="Comments"] > li', [picks, at, filter, wide, phone, opt]);

  // the selected pick has its own link, so a view can be shared
  useEffect(() => {
    if (!pick) return;
    const want = linkTo(pick.id, i);
    if (window.location.hash !== want) window.history.replaceState(null, '', want);
  }, [pick?.id, i]);

  // the stage fits the room it has: in the wide layout the whole column (question, stage, strip) stays in view
  useLayoutEffect(() => {
    const box = stageBox.current;
    if (!box) return undefined;
    const measure = () => {
      const col = box.closest('.chip-flow--scroll');
      const w = box.clientWidth;
      let h = null;
      if (!phone && col) {
        // the column less the question, the strip, the two gaps between them and the column's own padding
        const padY = parseFloat(getComputedStyle(col).paddingTop) + parseFloat(getComputedStyle(col).paddingBottom);
        h = Math.max(120, Math.floor(col.clientHeight - padY - (headBox.current?.offsetHeight ?? 0) - (stripBox.current?.offsetHeight ?? 0) - 32));
      }
      setRoom((r) => (r && r.w === w && r.h === h ? r : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    const col = box.closest('.chip-flow--scroll');
    if (col) ro.observe(col);
    if (stripBox.current) ro.observe(stripBox.current);
    if (headBox.current) ro.observe(headBox.current);
    return () => ro.disconnect();
  }, [wide, phone, pick?.id, size]);
  // the plain stage pads its content on each side; the picture is never drawn larger than itself
  const pad = 64;
  const scale = size?.w && room ? Math.max(0.1, Math.min(1, (room.w - pad) / size.w, room.h ? (room.h - pad) / size.h : (window.innerHeight * 0.6) / size.h)) : 1;

  const move = useCallback(
    (d) => {
      if (!pick) return;
      const n = Math.max(0, Math.min(pick.options.length - 1, i + d));
      setOpt((o) => ({ ...o, [pick.id]: n }));
      setMarking(false);
    },
    [pick, i],
  );
  // the focus follows the selection inside the strip
  useEffect(() => {
    const cur = strip.current?.querySelector('[aria-pressed="true"]');
    if (cur && strip.current.contains(document.activeElement) && document.activeElement !== cur) cur.focus();
  }, [i, pick?.id]);

  const onKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') (e.preventDefault(), move(-1));
  };
  const swipe = {
    onTouchStart: (e) => (touch.current = e.touches[0]?.clientX ?? null),
    onTouchEnd: (e) => {
      const x = e.changedTouches[0]?.clientX;
      if (touch.current != null && x != null && Math.abs(x - touch.current) > 40) move(x < touch.current ? 1 : -1);
      touch.current = null;
    },
  };
  const choose = (id) => {
    setAt(id);
    setZoom(null);
    setMarking(false);
    setSay('');
    if (phone) requestAnimationFrame(() => document.getElementById('pg-stage')?.scrollIntoView({ block: 'start' }));
  };

  if (down && !cached)
    return <Notification tone="attention" title="The progress board" message={`It isn’t answering at ${BOARD}, so your picks can’t show. Start it, then try again.`} action={{ label: 'Try again', onClick: again }} />;
  // no Skeleton part in BELLA: the wait says what it is reading, no spinner
  if (!picks) return <EmptyState size="lane" title="Reading your picks from the progress board" />;
  if (!picks.length) return <EmptyState size="page" mark="🎉" title="Nothing waiting on you" line={`The progress board has ${plural(items, 'item')} waiting on you, none with a picture to pick from.`} />;

  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, picks.filter(f.test).length]));
  const open = picks.filter((p) => !p.answer);
  const dated = open.map((p) => Date.parse(p.mod)).filter((t) => !Number.isNaN(t));
  const fresh = lastAnswer ? open.filter((p) => Date.parse(p.mod) > Date.parse(lastAnswer)).length : null;
  const oldest = dated.length ? age(Date.now() - Math.min(...dated)) : null;

  const thumb = draft.thumb[mark] ?? null;
  const setThumb = (v) => setDraft((d) => ({ ...d, thumb: { ...d.thumb, [mark]: d.thumb[mark] === v ? null : v } }));
  const pinsHere = draft.pins.filter((p) => p.option === mark);
  // a new pin carries on from the pins already on the card, the same number on the stage, the comment and the note sent
  const pinNo = (p) => draft.pins.indexOf(p) + 1 + pick.comments.filter((c) => c.n).length;
  // a zoomed or marked picture is drawn as a frame in its own pixels (k frame pixels per picture pixel); pins are kept in picture pixels
  const framed = marking || zoom != null;
  const k = zoom ? zoom / 100 : 1;
  const markers = pinsHere.map((p) => ({ id: p.id, x: framed ? p.x * k : p.x, y: framed ? p.y * k : p.y, label: pinNo(p) }));
  const stepTo = (dir) => {
    const cur = zoom ?? Math.round(scale * 100);
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > cur) : [...ZOOM_STEPS].reverse().find((z) => z < cur);
    if (next) setZoom(next);
  };
  const ready = Object.values(draft.thumb).some(Boolean) || draft.pins.some((p) => p.note.trim()) || !!say.trim();

  // what goes to the board, in decide.js's shape: one card answer, notes beside it
  const answerOf = () => {
    const ups = Object.entries(draft.thumb).filter(([, v]) => v === 'up').map(([k]) => k);
    const downs = Object.entries(draft.thumb).filter(([, v]) => v === 'down').map(([k]) => k);
    if (pick.thumbs) return ups.length && !downs.length ? '👍 Looks right' : downs.length ? '👎 Change it' : null;
    const o = pick.options.find((x) => x.letter === ups[ups.length - 1]);
    return o ? o.answer : null;
  };
  const noteOf = () => {
    const downs = Object.entries(draft.thumb).filter(([, v]) => v === 'down').map(([k]) => (pick.thumbs ? null : `👎 ${k}`)).filter(Boolean);
    const typed = say.trim() ? [`${pick.thumbs ? '' : `${mark} · `}${say.trim()}`] : [];
    const pins = draft.pins.filter((p) => p.note.trim()).map((p) => `${pick.thumbs ? '' : `${p.option} · `}pin ${pinNo(p)}: ${p.note.trim()}`);
    return [...downs, ...typed, ...pins].join(' · ') || null;
  };
  async function send() {
    const body = { page: `Playground · ${pick.from}`, url: pathOf(pick.page), cards: [{ from: pathOf(pick.page), title: pick.title, answer: answerOf(), note: noteOf() }] };
    try {
      const r = await fetch(`${BOARD}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      setDrafts((all) => ({ ...all, [pick.id]: { thumb: {}, pins: [] } }));
      setSay('');
      setSent('saved');
      again();
    } catch {
      setSent('failed');
    }
  }
  const pickFilter = (id) => {
    setFilter((x) => (x === id ? null : id));
    setAt(null);
  };

  /* ---------- the parts ---------- */

  // highlights, top left: what changed and what to do, from the board's dates and her last answer
  const showing = filter ? FILTERS.find((f) => f.id === filter).title : 'Everything';
  const highlights = (
    <Flow gap={4}>
      <TextStack
        title={[fresh != null ? `${plural(fresh, 'pick')} new since your last answer` : null, oldest ? `oldest waiting ${oldest}` : null, `${counts.open} to answer`].filter(Boolean).join(' · ')}
      />
      <TextStack subtitle={`Showing: ${showing} · ${plural(shown.length, 'pick')}`} />
    </Flow>
  );
  // how fresh it is: the time it was read, and Refresh; the last reading with its time when the board is down
  const freshness = (
    <Flow direction="row" gap={8} align="center" justify="between" wrap>
      <TextStack subtitle={cached ? `board down, read ${clock(readAt)}` : `read ${clock(readAt)}`} />
      <Button variant="tertiary" size="sm" icon="RefreshDouble" leadingIcon onClick={again}>
        Refresh
      </Button>
    </Flow>
  );

  // filters: the stat cards (approved), presets in one row on a phone so they never fill the first screen
  const filters = presets ? (
    <Flow direction="row" gap={8} wrap role="group" aria-label="Filter your picks">
      {FILTERS.map((f) => (
        <FilterChip key={f.id} pressed={filter === f.id} onClick={() => pickFilter(f.id)} size="compact">
          {`${phone ? f.chip : f.title} · ${counts[f.id]}`}
        </FilterChip>
      ))}
    </Flow>
  ) : (
    <Flow direction="row" gap={24} equal role="group" aria-label="Filter your picks">
      {FILTERS.map((f) => (
        <ListRow
            key={f.id}
            as="div"
            layout="stacked"
            selected={filter === f.id}
            iconWell={<IconWell icon={f.icon} tone="neutral" />}
            title={f.title}
            value={counts[f.id]}
            description={f.id === 'open' ? `of ${plural(picks.length, 'pick')} on ${plural(items, 'board item')}` : f.id === 'answered' ? 'on the board, to be picked up' : 'notes and pins you left'}
            onClick={() => pickFilter(f.id)}
          />
      ))}
    </Flow>
  );

  const list = (
    <Card>
      <Flow gap={8} scroll style={HOLD} aria-label="Picks, scrolls on its own" tabIndex={0}>
        <SectionHead title="Picks" number={shown.length} titleLevel={2} />
        {freshness}
        {filter ? (
          <Flow direction="row">
            <Button variant="tertiary" onClick={() => pickFilter(filter)}>
              Show everything
            </Button>
          </Flow>
        ) : null}
        {shown.length ? (
          // one short line a row, its status a Tag; the full question is the stage's heading
          <Flow as="ul" gap={0} aria-label={`Your picks, ${shown.indexOf(pick) + 1} of ${shown.length} selected`}>
            {shown.map((p) => (
              <ListRow
                key={p.id}
                layout="stacked"
                divider
                selected={p.id === pick?.id}
                title={shortName(p.title)}
                tag={p.answer ? <Tag tone="success" showDot>Answered</Tag> : <Tag variant="outline">Open</Tag>}
                onClick={() => choose(p.id)}
              />
            ))}
          </Flow>
        ) : (
          <EmptyState size="lane" mark="🙌" title="None here" line="Nothing matches this filter. Show everything to see the rest." />
        )}
        {/* Parts and pages: the mock's flow has no second tab, so trying a part or a page is the list's last row */}
        {onTry ? (
          <Flow as="ul" gap={0} aria-label="More to try">
            <ListRow layout="stacked" title="Parts and pages" description="Try a BELLA part, or mark up a page" trailing onClick={onTry} />
          </Flow>
        ) : null}
      </Flow>
    </Card>
  );

  const stageLabel = `${pick.thumbs ? option.short : `Option ${mark} · ${option.short}`} on the stage`;
  const centre = (
    <Flow gap={16} scroll={wide} style={HOLD} aria-label="The pick on the stage" id="pg-stage">
      <div ref={headBox}>
      <Flow gap={8}>
        <Heading tier="subsection" as="h2" after={<TextStack subtitle={pick.decide} />}>
          {clean(pick.title)}
        </Heading>
        {/* your answer sits with the question, so it is in view with the option */}
        <Flow direction="row" gap={8} align="center" wrap role="group" aria-label={`Your answer for ${pick.thumbs ? option.short : mark}`}>
          <TextStack subtitle={pick.thumbs ? 'Your answer' : `${mark} · ${thumb === 'up' ? 'your pick' : thumb === 'down' ? 'not this one' : 'your answer'}`} />
          <FilterChip pressed={thumb === 'up'} onClick={() => setThumb('up')} ariaLabel="Thumbs up">
            👍
          </FilterChip>
          <FilterChip pressed={thumb === 'down'} onClick={() => setThumb('down')} ariaLabel="Thumbs down">
            👎
          </FilterChip>
          <Button variant="secondary" size="sm" ariaExpanded={!pane.hidden} onClick={() => setPaneKeep((p) => ({ ...p, hidden: !p.hidden }))}>
            {pane.hidden ? `Show comments${pick.comments.length + pinsHere.length ? ` · ${pick.comments.length + pinsHere.length}` : ''}` : 'Hide comments'}
          </Button>
          <Link href={pick.page} external>
            Review page
          </Link>
        </Flow>
      </Flow>
      </div>
      <div ref={stageBox} {...swipe}>
        {option?.img && size?.w ? (
          <Flow gap={8} onKeyDown={(e) => (e.key === '+' || e.key === '=' ? stepTo(1) : e.key === '-' ? stepTo(-1) : null)}>
            <Flow direction="row" gap={8} align="center" wrap role="toolbar" aria-label="Picture tools">
              <Button variant="secondary" size="sm" iconOnly icon="ZoomOut" ariaLabel="Zoom out" onClick={() => stepTo(-1)} />
              <Button variant="secondary" size="sm" iconOnly icon="ZoomIn" ariaLabel="Zoom in" onClick={() => stepTo(1)} />
              <Button variant="secondary" size="sm" ariaPressed={zoom == null && !marking} onClick={() => setZoom(null)}>
                Fit
              </Button>
              <Button variant="secondary" size="sm" ariaPressed={zoom === 100} onClick={() => setZoom(100)}>
                100%
              </Button>
              <Tag variant="outline">{zoom ? `${zoom}%` : 'Fit'}</Tag>
              {/* HOLD: BELLA's tool column (light/dark, compare) has no job here; Mark up stands in */}
              <Button variant="secondary" size="sm" icon="EditPencil" leadingIcon ariaPressed={marking} onClick={() => setMarking((m) => !m)}>
                {marking ? 'Done marking' : 'Mark up'}
              </Button>
            </Flow>
            {framed ? (
              // marking and zoom need the frame: a click lands in the picture's own pixels, and a drag pans it
              <Stage
                grid="none"
                frameWidth={Math.round(size.w * k)}
                frameHeight={Math.round(size.h * k)}
                zoom={zoom ? 'actual' : 'fit'}
                markers={markers}
                picking={marking}
                onPick={(x, y) => setDraft((d) => ({ ...d, pins: [...d.pins, { id: `p${Date.now()}`, x: Math.round(x / k), y: Math.round(y / k), note: '', option: mark }] }))}
                label={`${stageLabel}, ${zoom ? `${zoom}%` : 'fitted'}`}
              >
                <Flow gap={0} {...pan}>
                  <img src={option.img} alt={`${pick.title}: ${option.short}`} width={size.w} height={size.h} draggable={false} />
                </Flow>
              </Stage>
            ) : (
              <Stage scale={scale} markers={markers} label={stageLabel}>
                <img src={option.img} alt={`${pick.title}: ${option.short}`} width={size.w} height={size.h} />
              </Stage>
            )}
          </Flow>
        ) : (
          <Stage label="No picture">
            <EmptyState size="lane" mark="🖼️" title={size ? 'The picture didn’t load' : 'Loading the picture'} line={size ? 'Open the review page to see it.' : undefined} />
          </Stage>
        )}
      </div>
      {/* the options strip: a titled row, ← plain and → on a white disc at its right; the current card outlined */}
      <div ref={stripBox}>
        <Flow gap={16} role="group" aria-label="Options">
          <Flow direction="row" gap={8} justify="between" align="center">
            <TextStack title={`Options · ${pick.options.length}`} />
            <Flow direction="row" gap={8}>
              <Button variant="tertiary" iconOnly icon="NavArrowLeft" ariaLabel="Previous option" disabled={i === 0} onClick={() => move(-1)} />
              <Button variant="secondary" shape="pill" iconOnly icon="NavArrowRight" ariaLabel="Next option" disabled={i >= pick.options.length - 1} onClick={() => move(1)} />
            </Flow>
          </Flow>
          <div ref={strip} onKeyDown={onKey} {...swipe}>
            <Flow direction="row" gap={16} wrap aria-label="Options: arrow keys move between them">
              {pick.options.map((o, k) => (
                <VariantTile key={`${o.letter ?? ''}${k}`} label={o.letter ? `${o.letter} · ${o.short}` : o.short} selected={k === i} onClick={() => (setOpt((x) => ({ ...x, [pick.id]: k })), setMarking(false))}>
                  {o.img ? <img src={o.img} alt="" width={144} height={72} style={{ objectFit: 'cover', objectPosition: 'left top' }} /> : null}
                </VariantTile>
              ))}
            </Flow>
          </div>
        </Flow>
      </div>
    </Flow>
  );

  // Comments on the option: her notes scroll inside the card; the comment box and Send stay at its foot
  const right = pane.hidden ? null : (
    <Card>
      <Flow direction="row" gap={8} align="center" justify="between" wrap>
        <SectionHead title={pick.thumbs ? 'Comments' : `Comments on ${mark}`} number={pick.comments.length + pinsHere.length || undefined} titleLevel={2} />
        <Button variant="tertiary" size="sm" ariaExpanded onClick={() => setPaneKeep((p) => ({ ...p, hidden: true }))}>
          Hide
        </Button>
      </Flow>
      {wide ? <Slider label="Comments width" value={pane.w} onChange={(w) => setPaneKeep((p) => ({ ...p, w }))} min={280} max={640} step={20} unit="px" hint="Drag, or use the arrow keys" /> : null}
      <Flow gap={16} scroll={wide} style={HOLD}>
        {notesMore ? <TextStack subtitle={`${notesMore} more below: scroll the comments`} /> : null}
        <Flow gap={8} scroll={wide} style={HOLD} aria-label="Comments, scrolls on its own" tabIndex={wide ? 0 : undefined} ref={notesBox}>
          {pick.comments.length || pinsHere.length ? (
            <Flow as="ol" gap={8} aria-label="Comments">
              {/* the note runs the card's full width under its pin, so it reads at 45 characters or more a line */}
              {pick.comments.map((c) => (
                <Flow as="li" key={c.id} gap={4}>
                  <Flow direction="row" gap={8} align="center" wrap>
                    {c.n ? <Pin number={c.n} pinStyle="solid" variant="red" /> : <TextStack title="Note" />}
                    <TextStack meta={[c.n ? null : c.on, day(c.when)].filter(Boolean).join(' · ')} />
                  </Flow>
                  <TextStack body={c.text} />
                </Flow>
              ))}
              {pinsHere.map((p) => {
                const n = pinNo(p);
                return (
                  <Flow as="li" key={p.id} gap={8}>
                    <Flow direction="row" gap={8} align="center" wrap>
                      <Pin number={n} pinStyle="solid" variant="red" label="new" />
                      <Button variant="tertiary" size="sm" ariaLabel={`Remove pin ${n}`} onClick={() => setDraft((d) => ({ ...d, pins: d.pins.filter((x) => x.id !== p.id) }))}>
                        Remove
                      </Button>
                    </Flow>
                    <Input label={`Note for pin ${n}`} value={p.note} placeholder="What should change?" onChange={(v) => setDraft((d) => ({ ...d, pins: d.pins.map((x) => (x.id === p.id ? { ...x, note: v } : x)) }))} />
                  </Flow>
                );
              })}
            </Flow>
          ) : (
            <TextStack subtitle={marking ? 'Click the picture to drop a pin.' : 'No comments yet. Write one below, or mark up the picture.'} />
          )}
        </Flow>
        {/* one box and one Send (23 Nov): Enter sends, Shift+Enter is a new line; the answer and the comment go to the board in one step */}
        <Flow
          gap={12}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'TEXTAREA') {
              e.preventDefault();
              if (ready) send();
            }
          }}
        >
          <Input label={pick.thumbs ? 'Your comment' : `Your comment on ${mark}`} multiline value={say} onChange={(v) => (setSay(v), setSent(null))} placeholder="What should change?" hint="Enter sends, Shift+Enter is a new line" />
          <Flow direction="row" gap={12} align="center" justify="end" wrap>
            <Flow role="status" gap={0}>{sent === 'saved' ? <TextStack body="Saved" /> : null}</Flow>
            {sent === 'failed' ? <Flow role="alert" gap={0}><TextStack body={`Not sent: the progress board doesn’t answer at ${BOARD}. Your answer is still here.`} /></Flow> : null}
            <Button variant="primary" size="sm" disabled={!ready} onClick={send}>
              Send
            </Button>
          </Flow>
        </Flow>
      </Flow>
    </Card>
  );

  return (
    <>
      {presets && !phone ? (
        <Flow direction="row" gap={16} justify="between" align="center" wrap>
          {highlights}
          {filters}
        </Flow>
      ) : (
        <>
          {highlights}
          {filters}
        </>
      )}
      {wide ? (
        // the list, then the stage and the comments in halves; each column runs to the window's foot and scrolls
        // on its own, so the question, the stage, the strip, the field and Post are all in the first view
        <Flow direction="row" gap={24} fill>
          <Flow aside>
            <Flow fit="rest">
              <Flow span={12}>{list}</Flow>
            </Flow>
          </Flow>
          <Flow direction="row" gap={24} grow="first">
            <Flow fit="rest">
              <Flow span={12}>{centre}</Flow>
            </Flow>
            {right ? (
              <Flow fit="rest" style={{ inlineSize: `calc(var(--spacing-4) * ${pane.w / 4})`, flexShrink: 0 }}>
                <Flow span={12}>{right}</Flow>
              </Flow>
            ) : null}
          </Flow>
        </Flow>
      ) : phone ? (
        <Flow gap={24}>
          <Flow fit>
            <Flow span={12}>{list}</Flow>
          </Flow>
          {centre}
          {right}
        </Flow>
      ) : (
        // the list beside the stage; the comments under the strip, in the same scroll
        <Flow direction="row" gap={24} fill>
          <Flow aside>
            <Flow fit="rest">
              <Flow span={12}>{list}</Flow>
            </Flow>
          </Flow>
          <Flow fit="rest">
            <Flow span={12}>
              <Flow gap={24} scroll style={HOLD}>
                {centre}
                {right}
              </Flow>
            </Flow>
          </Flow>
        </Flow>
      )}

    </>
  );
}
