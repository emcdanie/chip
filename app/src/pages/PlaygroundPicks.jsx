// Playground · Your picks: the A/B questions waiting on you (Elleta picked B · studio and "Where the A/B opens: A,
// the Playground tab", 22 Nov; /screens/2026-11-22-playground/), laid out as her Workbench A (23 Nov,
// /screens/2026-11-23-workbench/, templates/Workbench.jsx, shared with the Needs you view): the picture big in the
// middle with the tool column fixed beside it, one row under it (the choice, thumbs, one comment box and one Send), the
// comments as a thin panel opened from the count, and the picks as a strip of board cards along the bottom. You
// comment on the picture like Figma comments: a click drops a numbered pin and a small box (templates/PicturePins.jsx).
//
// Real data only: the progress board (localhost:3123) serves the items waiting
// on you (progress.json), the decision cards on each linked review page
// (section.part: its A/B options and their pictures, the same cards
// /screens/decisions/ shows; the page's Last-Modified dates them), and what you
// already answered or noted (answers.json). CHIP has no route of its own for
// them; when the board is down the last reading shows with its time, never
// sample cards. Her notes show with obvious typos corrected (TYPOS), the stored words untouched.
//
// Sending: marks and comments are drafts kept in this browser (a pin's Enter, the thumbs, the words in the comment box);
// the row's Send posts this pick now, and one "n marked · Send all" bar posts every marked pick in ONE request (23 Nov);
// then the cards read Sent. Asking an agent for a change is the Ask panel's job. A pick has its own link:
// #/playground?pick=<id>&option=<n>.
//
// HOLES (BELLA has no part yet, not invented here): a Comment popover that sits at a pin (PicturePins places a
// Card); no Skeleton part, so loading says what it is reading, in words, no spinner.
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import Input from '@bella/components/Input/Input';
import NoResults from '../templates/NoResults.jsx';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Notification from '@bella/components/Notification/Notification';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Select from '@bella/components/Select/Select';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from '../templates/Flow.jsx';
import SendBar from '../templates/SendBar.jsx';
import PicturePins from '../templates/PicturePins.jsx';
import Workbench from '../templates/Workbench.jsx';
import { CommentBubble } from '../templates/Comment.jsx';
import { drawerOf } from '../templates/ReadingDrawer.jsx';
import useNarrow from '../templates/useNarrow.js';
import { markOf } from '../templates/marks.js';
import Loading from '../templates/Loading.jsx';

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
  options.sort((x, y) => x.letter.localeCompare(y.letter)); // A to E, whatever order the page lists them in (second pass, S15)
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

const FILTERS = [
  { id: 'open', title: 'Not answered', test: (p) => !p.answer },
  { id: 'answered', title: 'Answered', test: (p) => !!p.answer },
  { id: 'notes', title: 'With your notes', test: (p) => p.comments.length > 0 },
];

// her words without the "A · pin 1:" prefix a note carries for the agent
const herWords = (s) => String(s ?? '').replace(/(^|·\s*)(?:[A-E]\s*·\s*)?pin \d+:\s*/gi, '$1').replace(/^·\s*/, '');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null);

// the item's name: the card's title without its trailing ": A or B?"
const shortName = (t) => clean(t).replace(/\s*[:·-]\s*(A or B|A, B or C|yes or no)\??$/i, '');

const asked = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');
const linkTo = (id, n) => `#/playground?pick=${encodeURIComponent(id)}${n ? `&option=${n + 1}` : ''}`;

export default function PlaygroundPicks() {
  const { picks, items, down, at: readAt, cached, again } = usePicks();
  const phone = useNarrow(640);
  // opens on what waits on you, always: the picks not answered yet (her note, 23 Nov 22:05: "why am I shown old answered
  // ones"; something answered never asks again). Answered sits behind its chip for looking back.
  const [filter, setFilter] = useState('open');
  const [at, setAt] = useState(() => asked().get('pick'));
  const [opt, setOpt] = useState(() => {
    const id = asked().get('pick');
    const n = Number(asked().get('option'));
    return id && n > 0 ? { [id]: n - 1 } : {};
  });
  // your answer, pins, notes and the comment box per pick are drafts kept in this browser (they survive a reload) until sent
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
  const [zoom, setZoom] = useState(null); // the picture's zoom, held here for the tool column; null = Fit
  const shown = useMemo(() => (picks ?? []).filter((p) => !filter || FILTERS.find((f) => f.id === filter).test(p)), [picks, filter]);
  // a link that names an answered pick opens it under Answered, as a record
  const named = useRef(asked().get('pick'));
  useEffect(() => {
    const id = named.current;
    if (!picks || !id) return;
    named.current = null;
    const p = picks.find((x) => x.id === id);
    if (p?.answer) setFilter('answered');
  }, [picks]);
  // "Change my answer" turns an answered pick back into a question, for this visit
  const [changing, setChanging] = useState({});
  const pick = shown.find((p) => p.id === at) ?? shown[0] ?? null;
  const i = pick ? Math.max(0, Math.min(opt[pick.id] ?? 0, pick.options.length - 1)) : 0;
  const option = pick?.options[i] ?? null;
  const draft = (pick && drafts[pick.id]) || { thumb: {}, pins: [] };
  const setDraft = (fn) => pick && setDrafts((all) => ({ ...all, [pick.id]: fn(all[pick.id] ?? { thumb: {}, pins: [] }) }));
  const mark = option?.letter ?? `${i + 1}`;

  // the selected pick has its own link, so a view can be shared; a new picture opens fitted
  useEffect(() => {
    setZoom(null);
    if (!pick) return;
    // an open comments panel stays open in the address (?drawer=comments)
    const want = `${linkTo(pick.id, i)}${drawerOf() === 'comments' ? '&drawer=comments' : ''}`;
    if (window.location.hash !== want) window.history.replaceState(null, '', want);
  }, [pick?.id, i]);

  const choose = (id) => {
    setAt(id);
    if (phone) requestAnimationFrame(() => document.getElementById('pg-stage')?.scrollIntoView({ block: 'start' }));
  };

  if (down && !cached)
    return <Notification tone="attention" title="The progress board" message={`It isn’t answering at ${BOARD}, so your picks can’t show. Start it, then try again.`} action={{ label: 'Try again', onClick: again }} />;
  // no Skeleton part in BELLA: the wait says what it is reading, no spinner
  if (!picks) return <Loading title="Reading your picks" what="the progress board" />;
  if (!picks.length) return <EmptyState size="page" {...markOf('🎉')} title="Nothing waiting on you" line={`The progress board has ${plural(items, 'item')} waiting on you, none with a picture to pick from.`} />;

  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, picks.filter(f.test).length]));

  const thumb = draft.thumb[mark] ?? null;
  const setThumb = (v) => setDraft((d) => ({ ...d, thumb: { ...d.thumb, [mark]: d.thumb[mark] === v ? null : v } }));
  const pinsHere = draft.pins.filter((p) => p.option === mark);
  // a new pin carries on from the pins already on the card, the same number on the picture, the panel and the note sent
  const pinNoIn = (pk, d, p) => (p.isNew ? d.pins.length + 1 : d.pins.indexOf(p) + 1) + pk.comments.filter((c) => c.n).length;
  const pinNo = (p) => pinNoIn(pick, draft, p);
  const unsent = (d) => d.pins.filter((p) => !p.sent && p.note.trim());
  const marked = (d) => !!d && (Object.values(d.thumb ?? {}).some(Boolean) || unsent(d).length > 0 || !!(d.comment ?? '').trim());

  // what goes to the board, in decide.js's shape: one card answer, notes beside it
  const answerOf = (pk, d) => {
    const ups = Object.entries(d.thumb).filter(([, v]) => v === 'up').map(([k]) => k);
    const downs = Object.entries(d.thumb).filter(([, v]) => v === 'down').map(([k]) => k);
    if (pk.thumbs) return ups.length && !downs.length ? '👍 Looks right' : downs.length ? '👎 Change it' : null;
    const o = pk.options.find((x) => x.letter === ups[ups.length - 1]);
    return o ? o.answer : null;
  };
  // the answer in one word: the letter chosen here, else the one already sent to the board
  const sentAnswer = pick?.answer?.text ?? null;
  const chosen = pick ? answerOf(pick, draft) : null;
  const yourAnswer = (chosen ?? sentAnswer)?.match(/^(?:[A-Z]\b|👍|👎)/u)?.[0] ?? (chosen ?? sentAnswer);
  const noteOf = (pk, d) => {
    const downs = Object.entries(d.thumb).filter(([, v]) => v === 'down').map(([k]) => (pk.thumbs ? null : `👎 ${k}`)).filter(Boolean);
    const pins = unsent(d).map((p) => `${pk.thumbs ? '' : `${p.option} · `}pin ${pinNoIn(pk, d, p)}: ${p.note.trim()}`);
    const said = (d.comment ?? '').trim();
    return [...downs, ...pins, said || null].filter(Boolean).join(' · ') || null;
  };
  // one POST for the picks given: the row's Send (this pick) or Send all (every marked pick), one message to the agent
  const markedPicks = picks.filter((p) => marked(drafts[p.id]));
  async function post(list) {
    if (!list.length || batch.sending) return;
    setBatch({ sending: true, result: null, failed: null });
    const n = list.length;
    const body = { type: 'batch', page: `Playground · ${plural(n, 'answer')}`, url: '/playground', cards: list.map((p) => ({ from: pathOf(p.page), title: p.title, answer: answerOf(p, drafts[p.id]), note: noteOf(p, drafts[p.id]) })) };
    try {
      const r = await fetch(`${BOARD}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      const sentAt = new Date().toISOString();
      setDrafts((all) => Object.fromEntries(Object.entries(all).map(([id, d]) => (list.some((p) => p.id === id) ? [id, { thumb: {}, pins: d.pins.map((x) => ({ ...x, sent: true })), comment: '', sentAt }] : [id, d]))));
      setBatch({ sending: false, result: { n, at: clock(sentAt) }, failed: null });
      again();
    } catch {
      setBatch({ sending: false, result: null, failed: `Not sent: the progress board doesn’t answer at ${BOARD}. Your marks are kept here.` });
    }
  }

  /* ---------- the parts ---------- */

  // one status line in her words (Workbench A: "16 to answer"); the tools row beside it: the filter chips, and when the
  // board was read with Check again, as Work has it (her note, 23 Nov 22:05: "the whole Picks board is hard to understand")
  const top = (
    <Flow direction="row" gap={12} align="center" justify="between" wrap>
      <TextStack title={counts.open ? `${counts.open} to answer` : 'All answered'} />
      <Flow direction="row" gap={8} align="center" wrap>
        {/* filters: the FilterChip row History and Work use, one on at a time, counts beside the name; on a phone the
            same choice as one Select, so the picture stays near the top (Workbench A at 320 has no chip rows) */}
        {phone ? (
          <Select label="Show" value={filter ?? 'all'} onChange={(v) => (setFilter(v === 'all' ? null : v), setAt(null))} options={[...FILTERS.map((f) => ({ value: f.id, label: `${f.title} ${counts[f.id]}` })), { value: 'all', label: `All ${picks.length}` }]} />
        ) : (
          <Flow direction="row" gap={8} wrap role="group" aria-label="Filter your picks">
            {FILTERS.map((f) => (
              <FilterChip key={f.id} size="compact" pressed={filter === f.id} onClick={() => (setFilter(f.id), setAt(null))}>
                {`${f.title} ${counts[f.id]}`}
              </FilterChip>
            ))}
            <FilterChip size="compact" pressed={!filter} onClick={() => (setFilter(null), setAt(null))}>
              {`All ${picks.length}`}
            </FilterChip>
          </Flow>
        )}
        <Flow direction="row" gap={8} align="center">
          <TextStack subtitle={cached ? `Board down · checked ${clock(readAt)}` : `Checked ${clock(readAt)}`} />
          <Button variant="tertiary" size="sm" icon="RefreshDouble" leadingIcon onClick={again}>
            Check again
          </Button>
        </Flow>
      </Flow>
    </Flow>
  );
  const bar = <SendBar count={markedPicks.length} onSend={() => post(markedPicks)} sending={batch.sending} result={batch.result} failed={batch.failed} onBack={() => (window.location.hash = '#/work')} onDismiss={() => setBatch({ sending: false, result: null, failed: null })} inFlow />;

  // nothing waits: one line says so (her note, 23 Nov 22:05), with no picture, no A to E row and no strip; Answered sits
  // behind its chip. Another filter with nothing in it says which filter and how to take it off.
  if (!pick)
    return (
      <Flow gap={16}>
        {top}
        {filter === 'open' ? (
          <EmptyState
            size="page"
            {...markOf('🙆‍♀️')}
            title="Nothing to answer"
            line="Every pick is answered."
            actions={counts.answered ? <Button variant="secondary" onClick={() => (setFilter('answered'), setAt(null))}>{`See your ${plural(counts.answered, 'answer')}`}</Button> : undefined}
          />
        ) : (
          <NoResults noun="picks" what={filter ? FILTERS.find((f) => f.id === filter)?.title.toLowerCase() : null} on={filter ? [{ key: 'f', label: FILTERS.find((f) => f.id === filter)?.title, would: picks.length, onRemove: () => (setFilter(null), setAt(null)) }] : []} />
        )}
        {bar}
      </Flow>
    );
  const total = pick.comments.length + draft.pins.filter((p) => !p.sent).length;

  // the feedback sits after Send (Workbench A): what this pick holds that is not sent, or when it was sent; on a phone
  // on its own line under the row, so the comment box keeps its width
  const saidHere = (
    <Flow role="status" gap={0}>
      {marked(draft) ? <TextStack body="Saved, not sent yet" /> : draft.sentAt ? <TextStack body={`Sent ${clock(draft.sentAt)}`} /> : null}
    </Flow>
  );
  // an answered pick reads as a record, not a question: what she picked and when, her notes, and one way to change it
  // (her note, 23 Nov 22:05; something answered never asks again)
  const record = !!pick.answer && !changing[pick.id];
  const when = pick.answer ? day(pick.answer.when) ?? pick.answer.when : null;
  const notesSaid = pick.comments.filter((c) => !c.n);
  const recordRow = record ? (
    <Flow gap={12} role="group" aria-label="Your answer">
      <TextStack title={`You picked ${pick.answer.text}`} subtitle={when ?? undefined} />
      {/* her words, without the stored "A · pin 1:" prefix the note carries for the agent */}
      {/* her note shows as her comment (avatar, name, when), never loose text under the answer (her review, 24 Nov) */}
      {notesSaid.map((c) => (
        <CommentBubble key={c.id} when={day(c.when) ?? c.when}>
          <TextStack body={herWords(c.text)} />
        </CommentBubble>
      ))}
      <Flow direction="row" justify="end">
        <Button variant="secondary" onClick={() => setChanging((x) => ({ ...x, [pick.id]: true }))}>
          Change my answer
        </Button>
      </Flow>
    </Flow>
  ) : null;
  // one row under the picture: the choice, thumbs, one comment box and one Send for this pick (Workbench A)
  const row = (
    <Flow direction="row" gap={12} align="end" wrap grow="last" role="group" aria-label={`Your answer for ${pick.thumbs ? option.short : `${mark} · ${option.short}`}`}>
      {pick.options.length > 1 ? (
        <SegmentedControl
          label="Option"
          stretch={phone}
          value={String(i)}
          onChange={(v) => setOpt((x) => ({ ...x, [pick.id]: Number(v) }))}
          options={pick.options.map((o, n) => ({ value: String(n), label: o.letter ?? String(n + 1), ariaLabel: o.letter ? `${o.letter} · ${o.short}` : o.short }))}
        />
      ) : null}
      <Flow direction="row" gap={8} align="center">
        <Button variant="secondary" iconOnly icon="ThumbsUp" ariaLabel={`Looks right: ${pick.thumbs ? option.short : mark}`} ariaPressed={thumb === 'up'} onClick={() => setThumb('up')} />
        <Button variant="secondary" iconOnly icon="ThumbsDown" ariaLabel={`Change it: ${pick.thumbs ? option.short : mark}`} ariaPressed={thumb === 'down'} onClick={() => setThumb('down')} />
      </Flow>
      <Flow as="form" direction="row" gap={8} align="end" grow="first" onSubmit={(e) => (e.preventDefault(), post([{ ...pick }]))}>
        <Input label="Comment" labelPosition={phone ? 'top' : 'inline'} value={draft.comment ?? ''} onChange={(v) => setDraft((d) => ({ ...d, comment: v }))} placeholder="Say what you think…" />
        <Button variant="primary" type="submit" busy={batch.sending} disabled={!marked(draft)}>
          Send
        </Button>
        {phone ? null : saidHere}
      </Flow>
      {phone ? saidHere : null}
    </Flow>
  );

  // the comments: a thin panel opened from the comment count and closed again; saved notes first, then pins not sent yet
  const panel = (close) => (
    <Card>
      <Flow gap={12}>
        <Flow direction="row" gap={8} align="center" justify="between">
          <SectionHead title="Comments" number={total || undefined} titleLevel={2} />
          <Button variant="tertiary" size="sm" iconOnly icon="Xmark" ariaLabel="Close comments" onClick={close} />
        </Flow>
        {total ? (
          <Flow as="ol" gap={16} aria-label="Comments">
            {/* each comment as Figma lists them: her avatar, name and when, then her words (templates/Comment.jsx) */}
            {pick.comments.map((c) => (
              <li key={c.id}>
                <CommentBubble flat when={[day(c.when) ?? c.when, c.n ? 'on the picture' : null].filter(Boolean).join(' · ')}>
                  <TextStack body={herWords(c.text)} />
                </CommentBubble>
              </li>
            ))}
            {draft.pins.filter((p) => !p.sent).map((p) => (
              <li key={p.id}>
                <CommentBubble flat when="Draft, not sent yet">
                  <TextStack body={p.note} />
                </CommentBubble>
              </li>
            ))}
          </Flow>
        ) : (
          <TextStack subtitle="No comments yet. Click the picture where something should change." />
        )}
      </Flow>
    </Card>
  );

  return (
    <Workbench
      id="pg-stage"
      top={top}
      title={clean(pick.title)}
      subtitle={record ? `Answered${when ? ` ${when}` : ''}` : [pick.decide, yourAnswer ? `Your answer: ${yourAnswer}` : null].filter(Boolean).join(' · ')}
      count={total}
      notes={panel}
      picture={
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
          zoom={zoom}
          onZoomChange={setZoom}
          reserve={phone ? 360 : 580}
        />
      }
      row={record ? recordRow : row}
      strip={{
        title: 'Picks',
        currentId: pick.id,
        onPick: choose,
        items: shown.map((p) => {
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
        }),
      }}
      bar={bar}
    />
  );
}
