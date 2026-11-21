// Playground · Your picks: the A/B questions waiting on you, in the studio
// layout (Elleta picked B · studio and "Where the A/B opens: A, the Playground
// tab", 22 Nov; /screens/2026-11-22-playground/). Picks on the left with their
// numbers as filters above, the option big on the Stage in the middle with
// your 👍 or 👎 under it and the options strip below (the MediSync strip:
// titled row, ← and → at its right, arrows, keys and swipe move it, the stage
// follows), details and comments on the right, then Ask BELLA.
//
// Real data only: the progress board (localhost:3123) serves the items waiting
// on you (progress.json), the decision cards on each linked review page
// (section.part: its A/B options and their pictures, the same cards
// /screens/decisions/ shows), and what you already answered or noted
// (answers.json). CHIP has no route of its own for them, so nothing shows when
// the board isn't answering: no sample cards.
//
// Sending: your answer and notes go to the board only after "Send to the
// board" shows what will be sent; Ask BELLA opens the run's plan (planRun) and
// nothing runs until you approve it.
//
// HOLES (BELLA has no part yet, not invented here):
// - the tool column beside the stage (zoom in, fit, zoom out, light/dark,
//   mark up, compare): the Stage's own Fit / 100% and a Mark up button stand in.
// - StatCard has no pressed (selected) state, so the card you filter by is not
//   light blue; the "Showing" line under the cards says what is filtered.
// - ListRow has no picture zone, so a pick's row in the list has no thumbnail.
// - VariantTile is the strip's card: its preview corner is 12 and its resting
//   card grey, where the MediSync strip draws white cards at corner 20.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import Drawer from '@bella/components/Drawer/Drawer';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Heading from '@bella/components/Heading/Heading';
import Input from '@bella/components/Input/Input';
import Link from '@bella/components/Link/Link';
import ListRow from '@bella/components/ListRow/ListRow';
import Notification from '@bella/components/Notification/Notification';
import Pin from '@bella/components/Pin/Pin';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Stage from '@bella/components/Stage/Stage';
import StatCard from '@bella/components/StatCard/StatCard';
import TextStack from '@bella/components/TextStack/TextStack';
import VariantTile from '@bella/components/VariantTile/VariantTile';
import Flow from '../templates/Flow.jsx';
import { planRun } from '../templates/RunPlan.jsx';
import useNarrow from '../templates/useNarrow.js';

export const BOARD = 'http://localhost:3123';
const BASE = `${BOARD}/screens/progress/`;
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

/** One decision card (section.part) on a review page, as decide.js reads it. */
function readCard(sec, page, item) {
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
    .map(([full, letter, short]) => ({ letter, answer: full, short, img: figs.find((f) => new RegExp(`^${letter}\\s*·`).test(f.cap))?.img ?? null }));
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
  return {
    id: `c${hash(`${pathOf(page)}|${title}`)}`,
    title,
    page,
    from: item.title,
    thumbs,
    options,
    decide: decide ?? (thumbs ? 'Decide: does it look right?' : `Decide: ${options.map((o) => o.letter).join(options.length > 2 ? ', ' : ' or ').replace(/, ([^,]*)$/, ' or $1')}?`),
    myPick: mine?.nextElementSibling ? text(mine.nextElementSibling) : null,
  };
}

/** The item itself, when its page has no card to read (a picture link, or a page with none). */
function itemCard(item) {
  if (!item.img && !item.picture) return null;
  return {
    id: `i${hash(item.id ?? item.title)}`,
    title: item.title,
    page: item.link,
    from: 'Progress board',
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
      if (c.note) out.comments.push({ id: `a${k}-${c.title}`, text: c.note, on: c.answer ? `with “${c.answer}”` : 'a note', when });
    });
    if (a.type === 'markup' && pathOf(a.url || '') === path) {
      (a.notes ?? []).forEach((n) => {
        const sec = String(n.section ?? '').toLowerCase();
        const mine = single || (sec && (card.title.toLowerCase().includes(sec) || sec.includes(card.title.toLowerCase().slice(0, 24))));
        if (mine && n.note) out.comments.push({ id: `m${k}-${n.n}`, n: n.n, text: n.note, on: n.on ? 'a mark-up pin' : 'the page', when });
      });
    }
  });
  return out;
}

/** The picks: every decision card on the items waiting on you, with what you already said. */
function usePicks() {
  const [state, setState] = useState({ picks: null, items: 0, down: false });
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
              return await r.text();
            } catch (e) {
              if (t) throw e;
            }
          }
        };
        const limit = async (list, n, fn) => {
          const out = new Array(list.length);
          let next = 0;
          await Promise.all(Array.from({ length: n }, async () => {
            while (next < list.length) {
              const k = next++;
              out[k] = await fn(list[k]);
            }
          }));
          return out;
        };
        const cards = await limit(
          items,
          3,
          async (it) => {
            const link = it.link ? new URL(it.link, BASE) : null;
            const item = { id: it.id, title: String(it.title ?? '').trim(), link: link?.href ?? null, img: it.img ? new URL(it.img, BASE).href : null, picture: link && PICTURE.test(link.pathname) ? link.href : null };
            if (!link || item.picture) return [itemCard(item)].filter(Boolean);
            try {
              const html = await page(link);
              const doc = new DOMParser().parseFromString(html, 'text/html');
              const at = link.href.split('#')[0];
              const found = [...doc.querySelectorAll('section.part')].map((s) => readCard(s, at, item)).filter(Boolean);
              return found.length ? found : [itemCard(item)].filter(Boolean);
            } catch {
              return [itemCard(item)].filter(Boolean);
            }
          },
        );
        // two board items can link the same review page: each card once
        const seen = new Set();
        const picks = cards
          .flatMap((list) => list.map((c) => ({ ...c, ...remarks(c, answers, list.length === 1) })))
          .filter((c) => !seen.has(c.id) && seen.add(c.id));
        if (live) setState({ picks, items: items.length, down: false });
      } catch {
        if (live) setState({ picks: null, items: 0, down: true });
      }
    })();
    return () => {
      live = false;
    };
  }, [tick]);
  return { ...state, again: () => setTick((t) => t + 1) };
}

/** The picture's own size, so the Stage frames it at its design width and pins sit in its pixels. */
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
// positioned; a template gap, noted in the report)
const HOLD = { position: 'relative' };

const FILTERS = [
  { id: 'open', title: 'Not answered', icon: 'Clock', test: (p) => !p.answer },
  { id: 'answered', title: 'Answered', icon: 'CheckCircle', test: (p) => !!p.answer },
  { id: 'notes', title: 'With your notes', icon: 'ChatBubbleEmpty', test: (p) => p.comments.length > 0 },
];

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function PlaygroundPicks() {
  const { picks, items, down, again } = usePicks();
  // three columns from a 1280 window (the side columns are 240 each, so the stage keeps room);
  // list beside the stage from 800; a phone stacks them, the list one window tall
  const wide = !useNarrow(1280);
  const phone = useNarrow(800);
  const [filter, setFilter] = useState(null);
  const [at, setAt] = useState(null); // the pick on the stage
  const [opt, setOpt] = useState({}); // its option on the stage, per pick
  const [drafts, setDrafts] = useState({}); // your answer, pins and notes, per pick, until sent
  const [marking, setMarking] = useState(false);
  const [zoom, setZoom] = useState('fit');
  const [confirm, setConfirm] = useState(false);
  const [sent, setSent] = useState(null);
  const [ask, setAsk] = useState('');
  const strip = useRef(null);
  const touch = useRef(null);

  const shown = useMemo(() => (picks ?? []).filter((p) => !filter || FILTERS.find((f) => f.id === filter).test(p)), [picks, filter]);
  const pick = shown.find((p) => p.id === at) ?? shown[0] ?? null;
  const i = pick ? Math.min(opt[pick.id] ?? 0, pick.options.length - 1) : 0;
  const option = pick?.options[i] ?? null;
  const size = useSize(option?.img);
  const draft = (pick && drafts[pick.id]) || { thumb: {}, pins: [] };
  const setDraft = (fn) => pick && setDrafts((all) => ({ ...all, [pick.id]: fn(all[pick.id] ?? { thumb: {}, pins: [] }) }));
  const mark = option?.letter ?? `${i + 1}`;

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
    // keys move the focus with the selection, so the next arrow carries on from the new card
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

  if (down)
    return (
      <Notification
        tone="attention"
        title="The progress board"
        message={`It isn’t answering at ${BOARD}, so your picks can’t show. Start it, then try again.`}
        action={{ label: 'Try again', onClick: again }}
      />
    );
  if (!picks) return <EmptyState size="lane" title="Reading your picks from the progress board" />;
  if (!picks.length) return <EmptyState size="page" mark="🎉" title="Nothing waiting on you" line={`The progress board has ${plural(items, 'item')} waiting on you, none with a picture to pick from.`} />;

  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, picks.filter(f.test).length]));
  const thumb = draft.thumb[mark] ?? null;
  const setThumb = (v) => setDraft((d) => ({ ...d, thumb: { ...d.thumb, [mark]: d.thumb[mark] === v ? null : v } }));
  const pinsHere = draft.pins.filter((p) => p.option === mark);
  // a new pin carries on from the pins already on the card, the same number on the stage, the comment and the note sent
  const pinNo = (p) => draft.pins.indexOf(p) + 1 + pick.comments.filter((c) => c.n).length;
  const markers = pinsHere.map((p) => ({ id: p.id, x: p.x, y: p.y, label: pinNo(p) }));
  const ready = Object.values(draft.thumb).some(Boolean) || draft.pins.some((p) => p.note.trim());

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
    const pins = draft.pins.filter((p) => p.note.trim()).map((p) => `${pick.thumbs ? '' : `${p.option} · `}pin ${pinNo(p)}: ${p.note.trim()}`);
    return [...downs, ...pins].join(' · ') || null;
  };
  async function send() {
    const body = { page: `Playground · ${pick.from}`, url: pathOf(pick.page), cards: [{ from: pathOf(pick.page), title: pick.title, answer: answerOf(), note: noteOf() }] };
    try {
      const r = await fetch(`${BOARD}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      setDrafts((all) => ({ ...all, [pick.id]: { thumb: {}, pins: [] } }));
      setConfirm(false);
      setSent('sent');
      again();
    } catch {
      setSent('failed');
    }
  }
  const suggestion = pinsHere.find((p) => p.note.trim())?.note.trim() || pick.comments[pick.comments.length - 1]?.text || '';
  const askBella = (t) => {
    const q = (t || suggestion).trim();
    if (!q) return;
    setAsk('');
    planRun({
      title: `Change ${pick.title}`,
      from: 'Playground',
      brief: `On the review card “${pick.title}” (${pick.page}), option ${mark} · ${option.short}: ${q}\n- Make the change on the review page’s picture source\n- Show it on the progress board as a new card with before and after`,
    }).catch(() => {});
  };

  /* ---------- the parts ---------- */

  const stats = (
    <Flow direction={phone ? "column" : "row"} gap={24} equal={!phone} role="group" aria-label="Filter your picks">
      {FILTERS.map((f) => (
        <StatCard
          key={f.id}
          title={f.title}
          icon={f.icon}
          chart="none"
          value={counts[f.id]}
          context={f.id === 'open' ? `of ${plural(picks.length, 'pick')} on ${plural(items, 'board item')}` : f.id === 'answered' ? 'still on the board, waiting to be picked up' : 'notes and mark-up pins you left'}
          onOpen={() => (setFilter((x) => (x === f.id ? null : f.id)), setAt(null))}
          drawIn={false}
        />
      ))}
    </Flow>
  );

  const list = (
    <Card>
      <Flow gap={8} scroll style={HOLD}>
        <SectionHead title="Your picks" number={shown.length} words={filter ? `of ${picks.length}` : 'waiting on you'} titleLevel={2} />
        <Flow direction="row" gap={8} justify="between" align="center" wrap>
          <TextStack subtitle={filter ? `Showing: ${FILTERS.find((f) => f.id === filter).title.toLowerCase()}` : 'Showing: everything'} />
          {filter ? (
            <Button variant="tertiary" size="sm" onClick={() => setFilter(null)}>
              Show everything
            </Button>
          ) : null}
        </Flow>
        {shown.length ? (
          <Flow as="ul" gap={4} aria-label="Your picks">
            {shown.map((p) => (
              <ListRow
                key={p.id}
                layout="stacked"
                title={p.title}
                meta={[p.thumbs ? '👍 or 👎' : p.options.map((o) => o.letter).join(' or '), p.comments.length ? plural(p.comments.length, 'note') : null, p.answer ? 'answered' : null].filter(Boolean).join(' · ')}
                selected={p.id === pick?.id}
                onClick={() => {
                  setAt(p.id);
                  setMarking(false);
                  if (phone) requestAnimationFrame(() => document.getElementById('pg-stage')?.scrollIntoView({ block: 'start' }));
                }}
              />
            ))}
          </Flow>
        ) : (
          <EmptyState size="lane" mark="🙌" title="None here" line="Nothing matches this filter. Show everything to see the rest." />
        )}
      </Flow>
    </Card>
  );

  const centre = pick ? (
    <Flow gap={16} scroll={wide} style={HOLD} aria-label="The pick on the stage" id="pg-stage">
      <Flow direction="row" gap={12} justify="between" align="center" wrap>
        <Heading tier="subsection" as="h2" after={<TextStack subtitle={pick.decide} />}>
          {pick.title}
        </Heading>
        {/* HOLE: BELLA's tool column (zoom, fit, light/dark, mark up, compare) has no part yet; Mark up stands in */}
        <Button variant="secondary" size="sm" ariaExpanded={marking} onClick={() => setMarking((m) => !m)}>
          {marking ? 'Done marking' : 'Mark up'}
        </Button>
      </Flow>
      <div {...swipe}>
        {option?.img && size?.w ? (
          <Stage
            frameWidth={size.w}
            frameHeight={size.h}
            zoom={zoom}
            onZoomChange={setZoom}
            markers={markers}
            picking={marking}
            onPick={(x, y) => setDraft((d) => ({ ...d, pins: [...d.pins, { id: `p${Date.now()}`, x, y, note: '', option: mark }] }))}
            label={`${pick.thumbs ? option.short : `Option ${mark} · ${option.short}`} on the stage`}
          >
            <img src={option.img} alt={`${pick.title}: ${option.short}`} width={size.w} height={size.h} />
          </Stage>
        ) : (
          <Stage label="No picture">
            <EmptyState size="lane" mark="🖼️" title={size ? 'The picture didn’t load' : 'Loading the picture'} line={size ? 'Open the review page to see it.' : undefined} />
          </Stage>
        )}
      </div>
      <Flow direction="row" gap={8} justify="end" align="center" wrap role="group" aria-label={`Your answer for ${pick.thumbs ? option.short : mark}`}>
        <TextStack subtitle={pick.thumbs ? 'Your answer' : `${mark} · ${thumb === 'up' ? 'your pick' : 'your answer'}`} />
        <FilterChip pressed={thumb === 'up'} onClick={() => setThumb('up')} ariaLabel="Thumbs up">
          👍
        </FilterChip>
        <FilterChip pressed={thumb === 'down'} onClick={() => setThumb('down')} ariaLabel="Thumbs down">
          👎
        </FilterChip>
      </Flow>
      {/* the options strip: a titled row, ← plain and → on a white disc at its right; the current card outlined */}
      <Flow gap={16} role="group" aria-label={`${pick.title} · options`}>
        <Flow direction="row" gap={8} justify="between" align="center">
          <TextStack title={`${pick.from} · ${plural(pick.options.length, 'option')}`} />
          <Flow direction="row" gap={8}>
            <Button variant="tertiary" iconOnly icon="NavArrowLeft" ariaLabel="Previous option" disabled={i === 0} onClick={() => move(-1)} />
            <Button variant="secondary" shape="pill" iconOnly icon="NavArrowRight" ariaLabel="Next option" disabled={i >= pick.options.length - 1} onClick={() => move(1)} />
          </Flow>
        </Flow>
        <div ref={strip} onKeyDown={onKey} {...swipe}>
          <Flow direction="row" gap={16} wrap aria-label="Options: arrow keys move between them">
            {pick.options.map((o, k) => (
              <VariantTile key={`${o.letter ?? ''}${k}`} label={o.letter ? `${o.letter} · ${o.short}` : o.short} selected={k === i} onClick={() => (setOpt((x) => ({ ...x, [pick.id]: k })), setMarking(false))}>
                {o.img ? <img src={o.img} alt="" width={176} height={104} style={{ objectFit: 'cover', objectPosition: 'left top' }} /> : null}
              </VariantTile>
            ))}
          </Flow>
        </div>
      </Flow>
    </Flow>
  ) : null;

  const right = pick ? (
    <Card>
      <Flow gap={16} scroll={wide} style={HOLD}>
        <SectionHead title="Details" titleLevel={2} />
        <Flow as="ul" gap={0} aria-label="Details">
          <ListRow layout="stacked" title="From" description={pick.from} />
          {pick.myPick ? <ListRow layout="stacked" title="Suggested" description={pick.myPick.length > 120 ? `${pick.myPick.slice(0, 119)}…` : pick.myPick} /> : null}
          <ListRow layout="stacked" title="Answer" description={pick.answer ? pick.answer.text : 'Not yet'} />
        </Flow>
        <Flow direction="row">
          <Link href={pick.page} external>
            Open the review page
          </Link>
        </Flow>
        <SectionHead title={pick.thumbs ? 'Comments' : `Comments on ${mark}`} number={pick.comments.length + draft.pins.length || undefined} titleLevel={2} />
        {pick.comments.length || pinsHere.length ? (
          <Flow as="ol" gap={8} aria-label="Comments">
            {pick.comments.map((c, k) => (
              <ListRow key={c.id} layout="stacked" pin={<Pin number={c.n ?? k + 1} pinStyle="solid" variant="red" />} title={c.n ? `Pin ${c.n}` : 'Note'} description={c.text} meta={[c.n ? null : c.on, day(c.when)].filter(Boolean).join(' · ')} />
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
          <TextStack subtitle={marking ? 'Click the picture to drop a pin.' : 'No comments yet. Mark up the picture to add one.'} />
        )}
        <Flow direction="row" justify="end">
          <Button variant="primary" size="sm" disabled={!ready} ariaHaspopup="dialog" onClick={() => setConfirm(true)}>
            Send to the board
          </Button>
        </Flow>
        <SectionHead title="Ask BELLA" titleLevel={2} />
        <Input label="Ask for a change" labelPosition="top" value={ask} onChange={setAsk} placeholder={suggestion ? undefined : `Ask for a change to ${pick.thumbs ? 'this' : mark}`} suggestion={suggestion || undefined} onSend={askBella} sendLabel="Ask BELLA" />
      </Flow>
    </Card>
  ) : null;

  return (
    <>
      {sent === 'sent' ? <Notification tone="success" title="Your answer" message="Sent: it is on the progress board for the team." onClose={() => setSent(null)} /> : null}
      {stats}
      {wide ? (
        // three columns, each the window's height once the page scrolls the stat cards away (History's fit),
        // each scrolling on its own, so the stage, the strip and the comments never move together
        <Flow direction="row" gap={24} fill>
          <Flow aside>
            <Flow fit>
              <Flow span={12}>{list}</Flow>
            </Flow>
          </Flow>
          <Flow fit>
            <Flow span={12}>{centre}</Flow>
          </Flow>
          <Flow aside>
            <Flow fit>
              <Flow span={12}>{right}</Flow>
            </Flow>
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
        // the list beside the stage; details and comments under the strip, in the same scroll
        <Flow direction="row" gap={24} fill>
          <Flow aside>
            <Flow fit>
              <Flow span={12}>{list}</Flow>
            </Flow>
          </Flow>
          <Flow fit>
            <Flow span={12}>
              <Flow gap={24} scroll style={HOLD}>
                {centre}
                {right}
              </Flow>
            </Flow>
          </Flow>
        </Flow>
      )}

      <Drawer
        open={confirm && !!pick}
        onClose={() => setConfirm(false)}
        side="right"
        label="Send to the progress board"
        subtitle={pick ? pick.title : undefined}
        footer={
          <Flow direction="row" gap={8} justify="end">
            <Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>
              Close
            </Button>
            <Button variant="primary" size="sm" onClick={send}>
              Send
            </Button>
          </Flow>
        }
      >
        {pick ? (
          <Flow gap={16} inset>
            <TextStack body="This goes to the progress board, where the team picks it up. Nothing runs." />
            <Flow as="ul" gap={0} aria-label="What will be sent">
              <ListRow layout="inline" title="Answer" valueLabel={answerOf() ?? 'No pick, notes only'} />
              <ListRow layout="stacked" title="Notes" description={noteOf() ?? 'None'} />
            </Flow>
            {sent === 'failed' ? <Notification tone="danger" title="The progress board" message={`It doesn’t answer at ${BOARD}, so nothing was sent. Your answer is still here.`} /> : null}
          </Flow>
        ) : null}
      </Drawer>
    </>
  );
}
