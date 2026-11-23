// Playground · Your picks: the A/B questions waiting on you (Elleta picked B · studio and "Where the A/B opens: A,
// the Playground tab", 22 Nov; /screens/2026-11-22-playground/). Picks on the left, filtered by the FilterChip row
// above. The picture fills the room and you comment on it like Figma comments (23 Nov): a click drops a numbered pin
// and a small box (templates/PicturePins.jsx, shared with the Needs you view); the options, your thumb, Send and the
// comment count sit in one row above it; the comments list is a thin panel opened from the count.
//
// Real data only: the progress board (localhost:3123) serves the items waiting
// on you (progress.json), the decision cards on each linked review page
// (section.part: its A/B options and their pictures, the same cards
// /screens/decisions/ shows; the page's Last-Modified dates them), and what you
// already answered or noted (answers.json). CHIP has no route of its own for
// them; when the board is down the last reading shows with its time, never
// sample cards. Her notes show with obvious typos corrected (TYPOS), the stored words untouched.
//
// Sending: marks and comments are drafts kept in this browser; one "n marked · Send all" bar posts every marked pick in ONE
// request (23 Nov), then the cards read Sent. A comment's Enter saves it as a draft. Asking an agent for a change is the Ask panel's job. A pick has its own link: #/playground?pick=<id>&option=<n>.
//
// HOLES (BELLA has no part yet, not invented here): a Comment popover that sits at a pin (PicturePins places a
// Card); a ToolColumn without Light or dark and Compare (three Buttons stand in); no Skeleton part, so loading says
// what it is reading, in words, no spinner.
import { useEffect, useMemo, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import NoResults from '../templates/NoResults.jsx';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Heading from '@bella/components/Heading/Heading';
import Link from '@bella/components/Link/Link';
import ListRow from '@bella/components/ListRow/ListRow';
import Notification from '@bella/components/Notification/Notification';
import Pin from '@bella/components/Pin/Pin';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from '../templates/Flow.jsx';
import SendBar from '../templates/SendBar.jsx';
import PickList from '../templates/PickList.jsx';
import PicturePins from '../templates/PicturePins.jsx';
import useNarrow from '../templates/useNarrow.js';

// The progress board. The server knows it as CHIP_REVIEW_URL (lanes.mjs) but no route hands it to the page,
// so this is the same origin the shell's Mark up and Team already post to (Screen.jsx, TeamContent.jsx).
export const BOARD = 'http://localhost:3123';
const BASE = `${BOARD}/screens/progress/`;
const CACHE = 'chip.playground.picks';
const DRAFTS = 'chip.playground.drafts';
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
  // a card with no picture of its own shows the page's first one (a card's, then any on the page), then the board item's
  const fallback = figs[0]?.img ?? abs(sec.querySelector('img[src]')?.getAttribute('src')) ?? abs(sec.ownerDocument.querySelector('img[src]')?.getAttribute('src')) ?? item.img;
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

const norm = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Her answers and notes on a card, from answers.json. */
function remarks(card, answers, single) {
  const path = pathOf(card.page);
  const out = { answer: null, comments: [] };
  answers.forEach((e, k) => {
    const a = e?.answers;
    if (!a || typeof a !== 'object') return;
    const when = e.sent ?? null;
    (a.cards ?? []).forEach((c) => {
      // a card's from is a path, or a page's bare folder name (data-src, 23 Nov tertiary): then the page's own url counts
      if (pathOf(/^(\/|https?:)/.test(c.from ?? '') ? c.from : a.url || '') !== path || c.title !== card.title) return;
      if (c.answer) out.answer = { text: c.answer, when };
      if (c.note) out.comments.push({ id: `a${k}-${c.title}`, text: spell(c.note), on: c.answer ? `with “${c.answer}”` : 'a note', when });
    });
    // the progress board's own shape (22 Nov): { <item title>: { title, answers: [{ q, a }], note } }, no cards list and no page
    if (!a.cards && !a.type) {
      const same = (t) => {
        const x = norm(t);
        const y = norm(card.title);
        const z = norm(card.from);
        return !!x && (x === y || x === z || (x.length > 12 && (y.includes(x) || x.includes(y) || (z && (z.includes(x) || x.includes(z))))));
      };
      Object.entries(a).forEach(([key, v]) => {
        if (!v || typeof v !== 'object' || !(same(v.title ?? key) || same(key))) return;
        const said = [...new Set((v.answers ?? []).map((r) => r?.a).filter(Boolean))].join(', ');
        if (said) out.answer = { text: said, when };
        if (v.note) out.comments.push({ id: `p${k}-${key}`, text: spell(v.note), on: said ? `with “${said}”` : 'a note', when });
      });
    }
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
        // waiting on her, plus her calls already answered but not done (23 Nov: an answered pick stays in the list and reads Answered)
        const waiting = (prog.items ?? []).filter((i) => i.stage === 'Waiting on you');
        const items = (prog.items ?? []).filter((i) => i.stage === 'Waiting on you' || (i.track === 'you' && i.stage !== 'Done'));
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
          .flatMap((list, k) =>
            list.map((c) => {
              const r = remarks(c, answers, list.length === 1);
              // the board's own record of a one-card item ("Answered 22 Nov: A, C and B. …") counts when answers.json saved it under another title
              const m = list.length === 1 && !r.answer ? String(items[k]?.detail ?? '').match(/^Answered\s+([^:]+):\s*([^.]+)/i) : null;
              return { ...c, ...r, ...(m ? { answer: { text: m[2].trim(), when: m[1].trim() } } : null) };
            }),
          )
          .filter((c) => !seen.has(c.id) && seen.add(c.id))
          .sort((x, y) => Number(x.thumbs) - Number(y.thumbs));
        const lastAnswer = answers.reduce((m, e) => ((e?.answers?.cards ?? []).some((c) => c.answer) && e.sent > (m ?? '') ? e.sent : m), null);
        const next = { picks, items: waiting.length, down: false, at: new Date().toISOString(), lastAnswer, cached: false };
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

// a scroll column holds its own floating bits (a field's ghost text, a button's label copy): without a
// positioned box they hang off the page's own scroll and stretch it far past the window (Flow scroll is not
// positioned; a template gap)
const HOLD = { position: 'relative' };

const FILTERS = [
  { id: 'open', title: 'Not answered', test: (p) => !p.answer },
  { id: 'answered', title: 'Answered', test: (p) => !!p.answer },
  { id: 'notes', title: 'With your notes', test: (p) => p.comments.length > 0 },
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

const asked = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');
const linkTo = (id, n) => `#/playground?pick=${encodeURIComponent(id)}${n ? `&option=${n + 1}` : ''}`;

export default function PlaygroundPicks() {
  const { picks, items, down, at: readAt, lastAnswer, cached, again } = usePicks();
  // three columns from a 1280 window: the list, then the stage and the comments in halves, so comments read at
  // 45 characters or more; list beside the stage from 800; a phone stacks them
  const wide = !useNarrow(1280);
  const phone = useNarrow(800);
  // opens on what waits on you: the picks not answered yet, unless a link names a pick
  const [filter, setFilter] = useState(() => (asked().get('pick') ? null : 'open'));
  const [at, setAt] = useState(() => asked().get('pick'));
  const [opt, setOpt] = useState(() => {
    const id = asked().get('pick');
    const n = Number(asked().get('option'));
    return id && n > 0 ? { [id]: n - 1 } : {};
  });
  // your answer, pins and notes per pick are drafts kept in this browser (they survive a reload) until Send all
  const [drafts, setDrafts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DRAFTS) ?? '{}') || {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(DRAFTS, JSON.stringify(drafts));
    } catch {}
  }, [drafts]);
  const [batch, setBatch] = useState({ sending: false, result: null, failed: null });
  const [notes, setNotes] = useState(false); // the thin comments panel, opened from the comment count
    const shown = useMemo(() => (picks ?? []).filter((p) => !filter || FILTERS.find((f) => f.id === filter).test(p)), [picks, filter]);
  const pick = shown.find((p) => p.id === at) ?? shown[0] ?? null;
  const i = pick ? Math.max(0, Math.min(opt[pick.id] ?? 0, pick.options.length - 1)) : 0;
  const option = pick?.options[i] ?? null;
  const draft = (pick && drafts[pick.id]) || { thumb: {}, pins: [] };
  const setDraft = (fn) => pick && setDrafts((all) => ({ ...all, [pick.id]: fn(all[pick.id] ?? { thumb: {}, pins: [] }) }));
  const mark = option?.letter ?? `${i + 1}`;

  // the selected pick has its own link, so a view can be shared
  useEffect(() => {
    if (!pick) return;
    const want = linkTo(pick.id, i);
    if (window.location.hash !== want) window.history.replaceState(null, '', want);
  }, [pick?.id, i]);

  const choose = (id) => {
    setAt(id);
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
  // a new pin carries on from the pins already on the card, the same number on the picture, the panel and the note sent
  const pinNoIn = (pk, d, p) => (p.isNew ? d.pins.length + 1 : d.pins.indexOf(p) + 1) + pk.comments.filter((c) => c.n).length;
  const pinNo = (p) => pinNoIn(pick, draft, p);
  const unsent = (d) => d.pins.filter((p) => !p.sent && p.note.trim());
  const marked = (d) => !!d && (Object.values(d.thumb ?? {}).some(Boolean) || unsent(d).length > 0);

  // what goes to the board, in decide.js's shape: one card answer, notes beside it
  const answerOf = (pk, d) => {
    const ups = Object.entries(d.thumb).filter(([, v]) => v === 'up').map(([k]) => k);
    const downs = Object.entries(d.thumb).filter(([, v]) => v === 'down').map(([k]) => k);
    if (pk.thumbs) return ups.length && !downs.length ? '👍 Looks right' : downs.length ? '👎 Change it' : null;
    const o = pk.options.find((x) => x.letter === ups[ups.length - 1]);
    return o ? o.answer : null;
  };
  const noteOf = (pk, d) => {
    const downs = Object.entries(d.thumb).filter(([, v]) => v === 'down').map(([k]) => (pk.thumbs ? null : `👎 ${k}`)).filter(Boolean);
    const pins = unsent(d).map((p) => `${pk.thumbs ? '' : `${p.option} · `}pin ${pinNoIn(pk, d, p)}: ${p.note.trim()}`);
    return [...downs, ...pins].join(' · ') || null;
  };
  // ONE Send all: every marked pick's answer and notes in one POST (one message to the agent, not one per pick)
  const markedPicks = picks.filter((p) => marked(drafts[p.id]));
  async function sendAll() {
    if (!markedPicks.length || batch.sending) return;
    setBatch({ sending: true, result: null, failed: null });
    const n = markedPicks.length;
    const body = { type: 'batch', page: `Playground · ${n} answers`, url: '/playground', cards: markedPicks.map((p) => ({ from: pathOf(p.page), title: p.title, answer: answerOf(p, drafts[p.id]), note: noteOf(p, drafts[p.id]) })) };
    try {
      const r = await fetch(`${BOARD}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      const at = new Date().toISOString();
      setDrafts((all) => Object.fromEntries(Object.entries(all).map(([id, d]) => (markedPicks.some((p) => p.id === id) ? [id, { thumb: {}, pins: d.pins.map((x) => ({ ...x, sent: true })), sentAt: at }] : [id, d]))));
      setBatch({ sending: false, result: { n, at: clock(at) }, failed: null });
      again();
    } catch {
      setBatch({ sending: false, result: null, failed: `Not sent: the progress board doesn’t answer at ${BOARD}. Your marks are kept here.` });
    }
  }

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

  // filters: the FilterChip row History and Work use (23 Nov: "just use the filter chips like we have already"):
  // All first, one filter on at a time, counts beside the name
  const filters = (
    <Flow direction="row" gap={8} wrap role="group" aria-label="Filter your picks">
      <FilterChip size="compact" pressed={!filter} onClick={() => (setFilter(null), setAt(null))}>
        {`All ${picks.length}`}
      </FilterChip>
      {FILTERS.map((f) => (
        <FilterChip key={f.id} size="compact" pressed={filter === f.id} onClick={() => (setFilter(f.id), setAt(null))}>
          {`${f.title} ${counts[f.id]}`}
        </FilterChip>
      ))}
    </Flow>
  );

  const list = (
    <Card>
      <Flow gap={8} scroll style={HOLD} aria-label="Picks, scrolls on its own" tabIndex={0}>
        <SectionHead title="Picks" number={shown.length} titleLevel={2} />
        {freshness}
        {shown.length ? (
          // the Work board's cards: the item's name, where it comes from, its status; the whole card is the button
          <PickList
            label={`Your picks, ${shown.indexOf(pick) + 1} of ${shown.length} selected`}
            currentId={pick?.id}
            onPick={choose}
            items={shown.map((p) => {
              const d = drafts[p.id];
              const mine = marked(d);
              const count = p.comments.length + (d?.pins.filter((x) => !x.sent).length ?? 0);
              return {
                id: p.id,
                title: shortName(p.title),
                line: [p.from, count ? plural(count, 'comment') : null].filter(Boolean).join(' · '),
                status: mine ? 'Marked' : d?.sentAt ? 'Sent' : p.answer ? 'Answered' : 'Not answered',
                tone: mine ? 'attention' : d?.sentAt || p.answer ? 'success' : 'neutral',
              };
            })}
          />
        ) : (
          <NoResults noun="picks" what={filter ? FILTERS.find((f) => f.id === filter)?.title.toLowerCase() : null} on={filter ? [{ key: 'f', label: FILTERS.find((f) => f.id === filter)?.title, would: picks.length, onRemove: () => (setFilter(null), setAt(null)) }] : []} />
        )}
      </Flow>
    </Card>
  );

  // a filter with nothing in it (23 Nov: every pick answered, so Not answered is empty) says so and keeps the chips to switch back
  if (!pick)
    return (
      <>
        {highlights}
        {filters}
        <EmptyState size="page" mark="🎉" title={filter === 'open' ? 'Every pick is answered' : filter === 'notes' ? 'No picks have your notes' : 'Nothing here'} line="Pick another filter above to see the rest." />
      </>
    );
  const total = pick.comments.length + draft.pins.length;
  const centre = (
    <Flow gap={16} scroll={wide} style={HOLD} aria-label="The pick" id="pg-stage">
      <Heading tier="subsection" as="h2" after={<TextStack subtitle={pick.decide} />}>
        {clean(pick.title)}
      </Heading>
      {/* one row above the picture: the options, your answer, Send and the comment count (23 Nov: like Figma comments) */}
      <Flow direction="row" gap={12} align="center" wrap role="group" aria-label={`Your answer for ${pick.thumbs ? option.short : mark}`}>
        {pick.options.length > 1 ? (
          <SegmentedControl
            label="Option"
            value={String(i)}
            onChange={(v) => setOpt((x) => ({ ...x, [pick.id]: Number(v) }))}
            options={pick.options.map((o, n) => ({ value: String(n), label: o.letter ?? String(n + 1), ariaLabel: o.letter ? `${o.letter} · ${o.short}` : o.short }))}
          />
        ) : null}
        <TextStack subtitle={pick.thumbs ? option.short : `${mark} · ${option.short}`} />
        <FilterChip pressed={thumb === 'up'} onClick={() => setThumb('up')} ariaLabel="Thumbs up">
          👍
        </FilterChip>
        <FilterChip pressed={thumb === 'down'} onClick={() => setThumb('down')} ariaLabel="Thumbs down">
          👎
        </FilterChip>
        <Flow role="status" gap={0}>
          {marked(draft) ? <TextStack body="Saved · not sent yet" /> : draft.sentAt ? <TextStack body="Sent" /> : null}
        </Flow>
        <Button variant="tertiary" size="sm" ariaExpanded={notes} onClick={() => setNotes((n) => !n)}>
          {plural(total, 'comment')}
        </Button>
        <Link href={pick.page} external>
          Review page
        </Link>
      </Flow>
      <PicturePins
        key={`${pick.id}-${i}`}
        src={option?.img}
        alt={`${pick.title}: ${option.short}`}
        pins={pinsHere}
        setPins={(next) =>
          setDraft((d) => {
            const mine = d.pins.filter((p) => p.option === mark);
            const out = (typeof next === 'function' ? next(mine) : next).map((p) => (p.option ? p : { ...p, option: mark }));
            return { ...d, pins: [...d.pins.filter((p) => p.option !== mark), ...out] };
          })
        }
        numberOf={pinNo}
        commitLabel="Save"
      />
    </Flow>
  );

  // the comments: a thin panel opened from the comment count and closed again; saved notes first, then pins not sent yet
  const right = notes ? (
    <Card>
      <Flow gap={12}>
        <Flow direction="row" gap={8} align="center" justify="between">
          <SectionHead title="Comments" number={total || undefined} titleLevel={2} />
          <Button variant="tertiary" size="sm" iconOnly icon="Xmark" ariaLabel="Close comments" onClick={() => setNotes(false)} />
        </Flow>
        {total ? (
          <Flow as="ol" gap={12} aria-label="Comments">
            {pick.comments.map((c) => (
              <Flow as="li" key={c.id} gap={4}>
                <Flow direction="row" gap={8} align="center" wrap>
                  {c.n ? <Pin number={c.n} pinStyle="solid" variant="red" /> : <TextStack title="Note" />}
                  <TextStack meta={[c.n ? null : c.on, day(c.when)].filter(Boolean).join(' · ')} />
                </Flow>
                <TextStack body={c.text} />
              </Flow>
            ))}
            {draft.pins.filter((p) => !p.sent).map((p) => (
              <Flow as="li" key={p.id} gap={4}>
                <Flow direction="row" gap={8} align="center" wrap>
                  <Pin number={pinNo(p)} pinStyle="solid" variant="red" label="not sent" />
                </Flow>
                <TextStack body={p.note} />
              </Flow>
            ))}
          </Flow>
        ) : (
          <TextStack subtitle="No comments yet. Click the picture where something should change." />
        )}
      </Flow>
    </Card>
  ) : null;

  return (
    <>
      {highlights}
      {filters}
      {wide ? (
        // the list, then the picture (it takes the room) and, only when asked for, the thin comments panel
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
              <Flow fit="rest" style={{ inlineSize: 'calc(var(--spacing-4) * 80)', flexShrink: 0 }}>
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
        // the list beside the picture; the comments under it, in the same scroll
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
      <SendBar count={markedPicks.length} onSend={sendAll} sending={batch.sending} result={batch.result} failed={batch.failed} onBack={() => (window.location.hash = '#/health/work')} onDismiss={() => setBatch({ sending: false, result: null, failed: null })} />
    </>
  );
}
