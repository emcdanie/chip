// The Needs you view: a card that needs her opens its review page inside CHIP, over the board (Elleta, 23 Nov
// 2026, picked A: "i thought we were going to be able to select in needs you and mark up from the work board..
// also be able to select all and mark up in bulk"). Picture large, A and B, thumbs, a comment and Mark up, then
// Next and Back through the whole Needs you list, and one Send all that posts every answer to the review
// server's own POST /answers (the shape decide.js and markup.js send), so nothing sends her out of CHIP.
//
// BELLA parts: PicturePins (Stage, Pin, Card; the picture and its comment boxes), Button (thumbs, options), Slider (the side pane's width),
// PickList (TaskCard, as the board), FilterChip (select), SegmentedControl (A / B picture), Input multiline, Card, TextStack, Tag, Pin
// EmptyState, Notification.
// BELLA GAPS (named for the coordinator, none drawn here): a checkbox for choosing rows; a Splitter to drag the
// side pane (Slider stands in, keyboard works); see PicturePins for the comment popover gap.
import { useEffect, useMemo, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Input from '@bella/components/Input/Input';
import Notification from '@bella/components/Notification/Notification';
import Slider from '@bella/components/Slider/Slider';
import Tag from '@bella/components/Tag/Tag';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from '../templates/Flow.jsx';
import SendBar from '../templates/SendBar.jsx';
import PickList from '../templates/PickList.jsx';
import useNarrow from '../templates/useNarrow.js';
import PicturePins from '../templates/PicturePins.jsx';
import { answersUrl, countAnswers, decisionBody, isPicture, markupBody, parseReview, picturePage } from './needsYouModel.js';

const KEEP = 'chip:needs-you';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEEP) || '{}');
  } catch {
    return {};
  }
};
const keep = (v) => {
  try {
    localStorage.setItem(KEEP, JSON.stringify(v));
  } catch {
    /* a private window keeps nothing: the answers still send */
  }
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* the picture: fits the room, a click drops a pin and its comment box, like Figma comments (PicturePins, shared with
   Playground); a comment here is kept for Send all */
function Picture({ card, shot, pins, onPins }) {
  if (!shot) return <EmptyState size="lane" mark="🖼" title="No picture on this card" line="The decision is in the side pane." />;
  return (
    <PicturePins
      key={shot.src}
      src={shot.src}
      alt={shot.alt || shot.caption || card.title}
      pins={pins.filter((p) => p.shot === shot.src)}
      numberOf={(p) => (p.isNew ? pins.length + 1 : pins.indexOf(p) + 1)}
      commitLabel="Save"
      setPins={(next) =>
        onPins((all) => {
          const here = all.filter((p) => p.shot === shot.src);
          const out = (typeof next === 'function' ? next(here) : next).map((p) => (p.shot ? p : { ...p, shot: shot.src, on: shot.caption || card.title, section: card.title }));
          return [...all.filter((p) => p.shot !== shot.src), ...out];
        })
      }
    />
  );
}

/* one card: its decision in the side pane */
function Decision({ card, state, set, bulk }) {
  const { A = {}, T = {}, N = {} } = state;
  const toggle = (map, key, v) => set((s) => ({ ...s, [map]: { ...s[map], [key]: s[map]?.[key] === v ? undefined : v } }));
  return (
    <Flow gap={16}>
      <TextStack title={card.title} titleAs="h3" subtitle={card.line || undefined} />
      <Flow gap={8} role="group" aria-label={`Options for ${card.title}`}>
        {card.options.map((o) => (
          <Flow key={o.label} gap={4}>
            <Button variant="secondary" ariaPressed={A[card.id] === o.label} onClick={() => toggle('A', card.id, o.label)}>
              {o.pick ? `${o.label} · recommended` : o.label}
            </Button>
          </Flow>
        ))}
      </Flow>
      {card.change ? <TextStack overline="What changes" body={card.change} /> : null}
      <Flow direction="row" gap={8} justify="end" role="group" aria-label={`Thumbs for ${card.title}`}>
        <Button variant="secondary" iconOnly icon="ThumbsDown" ariaLabel="Thumbs down" ariaPressed={T[card.id] === 'down'} onClick={() => toggle('T', card.id, 'down')} />
        <Button variant="secondary" iconOnly icon="ThumbsUp" ariaLabel="Thumbs up" ariaPressed={T[card.id] === 'up'} onClick={() => toggle('T', card.id, 'up')} />
      </Flow>
      <Input label="Comment" multiline value={N[card.id] ?? ''} onChange={(v) => set((s) => ({ ...s, N: { ...s.N, [card.id]: v } }))} placeholder="What should change?" />
      {bulk}
    </Flow>
  );
}

export default function NeedsYouView({ cards, startId, onBack, onOpenOther, onNotice }) {
  const narrow = useNarrow(1100);
  const [at, setAt] = useState(Math.max(0, cards.findIndex((c) => c.id === startId)));
  const [pages, setPages] = useState({}); // href -> { page } | { error }
  const [answers, setAnswers] = useState(() => load()); // page path -> { A, T, N, pins }
  const [picked, setPicked] = useState(() => new Set());
  const [shotAt, setShotAt] = useState({}); // card id -> picture index
  const [cardAt, setCardAt] = useState({}); // page path -> which of its cards shows
  const [wide, setWide] = useState(320);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sentAt, setSentAt] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`${KEEP}:sent`) || '{}');
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`${KEEP}:sent`, JSON.stringify(sentAt));
    } catch {}
  }, [sentAt]);

  const current = cards[Math.min(at, cards.length - 1)];
  const href = current?.open?.kind === 'page' ? current.open.href : null;
  // read this card's page, then the rest quietly so a Next is instant
  const links = cards.map((c) => (c.open?.kind === 'page' ? `${c.id}=${c.open.href}` : '')).join('\n'); // the board refreshes: only a changed list reads again
  useEffect(() => {
    const todo = [href, ...cards.map((c) => (c.open?.kind === 'page' ? c.open.href : null))].filter((h, i, all) => h && all.indexOf(h) === i && !pages[h]);
    let live = true;
    todo.forEach((h) =>
      (isPicture(h) ? Promise.resolve(null) : fetch(h).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`)))))
        .then((html) => live && setPages((p) => ({ ...p, [h]: { page: html == null ? picturePage(h, cards.find((c) => c.open?.href === h)?.title ?? h) : parseReview(html, h) } })))
        .catch(() => live && setPages((p) => ({ ...p, [h]: { error: true } }))),
    );
    return () => {
      live = false;
    };
  }, [href, links, pages]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => keep(answers), [answers]);

  const read = href ? pages[href] : null;
  const page = read?.page;
  const state = (page && answers[page.src]) || {};
  const setState = (next) => setAnswers((a) => ({ ...a, [page.src]: typeof next === 'function' ? next(a[page.src] ?? {}) : next }));
  const shownCard = page ? page.cards[Math.min(cardAt[page.src] ?? 0, page.cards.length - 1)] : null;
  const shots = shownCard?.shots ?? [];
  const shot = shots[Math.min(shotAt[shownCard?.id] ?? 0, shots.length - 1)];
  const pins = state.pins ?? [];

  const pageOf = (c) => (c.open?.kind === 'page' ? pages[c.open.href]?.page : null);
  const touched = useMemo(() => Object.entries(answers).filter(([, s]) => countAnswers(s) > 0), [answers]);
  const total = touched.reduce((n, [, s]) => n + countAnswers(s), 0);
  const go = (d) => setAt((i) => Math.min(cards.length - 1, Math.max(0, i + d)));

  // one pass for the ones she chose: a thumb, or one comment, on every card of every chosen page
  const reviewCards = cards.filter((c) => c.open?.kind === 'page');
  const chosen = reviewCards.filter((c) => picked.has(c.id) && pageOf(c));
  const allIn = reviewCards.length > 0 && reviewCards.every((c) => picked.has(c.id));
  const bulkSet = (patch) =>
    setAnswers((a) => {
      const out = { ...a };
      chosen.forEach((c) => {
        const p = pageOf(c);
        const s = out[p.src] ?? {};
        out[p.src] = { ...s, ...Object.fromEntries(Object.entries(patch).map(([m, v]) => [m, { ...s[m], ...Object.fromEntries(p.cards.map((k) => [k.id, v])) }])) };
      });
      return out;
    });
  const [bulkNote, setBulkNote] = useState('');
  const bulk = chosen.length ? (
    <Card>
      <Flow gap={12} role="group" aria-label="Mark up the chosen cards in one pass">
        <TextStack overline={plural(chosen.length, 'card') + ' chosen'} title="Mark up all at once" subtitle="Applies to every picture on each chosen card" titleAs="h3" />
        <Flow direction="row" gap={8} wrap>
          <Button variant="secondary" icon="ThumbsUp" leadingIcon onClick={() => bulkSet({ T: 'up' })}>
            Thumbs up all
          </Button>
          <Button variant="secondary" icon="ThumbsDown" leadingIcon onClick={() => bulkSet({ T: 'down' })}>
            Thumbs down all
          </Button>
        </Flow>
        <Input label="One comment for all" multiline value={bulkNote} onChange={setBulkNote} />
        <Flow direction="row" justify="end">
          <Button variant="secondary" disabled={!bulkNote.trim()} onClick={() => (bulkSet({ N: bulkNote.trim() }), setBulkNote(''))}>
            Add the comment to all
          </Button>
        </Flow>
      </Flow>
    </Card>
  ) : null;

  // ONE Send all: every answer and pin note on every page goes in one POST, so the agent gets one message
  async function sendAll() {
    if (sending || !touched.length) return;
    setSending(true);
    setMsg(null);
    const byPath = new Map(Object.values(pages).filter((p) => p.page).map((p) => [p.page.src, p]));
    const first = reviewCards.find((c) => touched.some(([src]) => pageOf(c)?.src === src));
    const cardsOut = [];
    const markups = [];
    for (const [src, s] of touched) {
      const p = byPath.get(src);
      if (!p) continue;
      if (Object.keys({ ...s.A, ...s.T }).length || Object.values(s.N ?? {}).some((n) => (n ?? '').trim())) cardsOut.push(...decisionBody(p.page, s).cards.filter((c) => c.answer || c.thumb || c.note));
      if ((s.pins ?? []).some((x) => x.note.trim())) markups.push(markupBody(p.page, s.pins.filter((x) => x.note.trim()), `${window.innerWidth}x${window.innerHeight}`));
    }
    const n = total;
    try {
      const r = await fetch(answersUrl(first.open.href), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'batch', page: `Needs you · ${plural(n, 'answer')}`, url: '/needs-you', cards: cardsOut, markups }) });
      if (!r.ok) throw new Error('refused');
      const at = new Date();
      setSentAt((m) => ({ ...m, ...Object.fromEntries(touched.map(([src]) => [src, true])) }));
      setAnswers({});
      setPicked(new Set());
      setMsg({ result: { n, at: at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) } });
      onNotice?.({ tone: 'success', title: 'Sent', message: `${plural(n, 'answer')} on ${plural(touched.length, 'page')} reached the coordinator in one message.` });
    } catch {
      setMsg({ failed: 'Not sent: the review server on localhost:3123 did not answer. Your marks are kept here.' });
    }
    setSending(false);
  }

  const list = (
    <PickList
      label="Everything that needs you"
      currentId={current?.id}
      onPick={(id) => setAt(Math.max(0, cards.findIndex((c) => c.id === id)))}
      items={cards.map((c) => {
        const p = pageOf(c);
        const n = p ? countAnswers(answers[p.src]) : 0;
        return c.open?.kind === 'page' ? { id: c.id, title: c.title, line: [picked.has(c.id) ? 'Chosen for mark-up' : 'Review page', n ? plural(n, 'mark') : null].filter(Boolean).join(' · '), status: n ? 'Marked' : p && sentAt[p.src] ? 'Sent' : 'Not answered', tone: n ? 'attention' : p && sentAt[p.src] ? 'success' : 'neutral' } : { id: c.id, title: c.title, line: c.line, status: c.status ?? 'Needs you', tone: c.tone };
      })}
    />
  );

  if (!current) return <EmptyState size="page" mark="✅" title="Nothing needs you" line="Every review is answered." actions={<Button variant="secondary" onClick={onBack}>Back to the board</Button>} />;

  const isReview = !!href;
  const side = (
    <Flow gap={16} style={narrow ? undefined : { inlineSize: `calc(var(--spacing-4) * ${wide / 4})`, flexShrink: 0 }}>
      {isReview && page ? (
        <>
          {page.cards.length > 1 ? (
            <Flow gap={8}>
              <TextStack overline={`${Math.min(cardAt[page.src] ?? 0, page.cards.length - 1) + 1} of ${page.cards.length} on this page`} />
              <Flow direction="row" gap={8} wrap role="group" aria-label="Cards on this page">
                {page.cards.map((k, i) => (
                  <FilterChip key={k.id} pressed={k === shownCard} onClick={() => setCardAt((m) => ({ ...m, [page.src]: i }))}>
                    {String(i + 1)}
                  </FilterChip>
                ))}
              </Flow>
            </Flow>
          ) : null}
          <FilterChip pressed={picked.has(current.id)} onClick={() => setPicked((x) => (x.has(current.id) ? new Set([...x].filter((y) => y !== current.id)) : new Set([...x, current.id])))}>
            {picked.has(current.id) ? 'Chosen for mark-up' : 'Choose for mark-up'}
          </FilterChip>
          {shownCard ? <Decision card={shownCard} state={state} set={setState} /> : null}
          {pins.length ? (
            <Flow gap={12} aria-label="Mark-up notes">
              <TextStack overline="Mark-up notes" subtitle="Numbered as the pins on the picture" />
              {pins.map((p, i) => (
                <Flow key={p.id} direction="row" gap={8} align="start">
                  <Tag variant="index">{i + 1}</Tag>
                  <Flow grow="first" gap={4}>
                    <Input label={`Note ${i + 1}`} multiline value={p.note} onChange={(v) => setState((s) => ({ ...s, pins: s.pins.map((x) => (x.id === p.id ? { ...x, note: v } : x)) }))} />
                  </Flow>
                  <Button variant="tertiary" size="sm" iconOnly icon="Xmark" ariaLabel={`Remove note ${i + 1}`} onClick={() => setState((s) => ({ ...s, pins: s.pins.filter((x) => x.id !== p.id) }))} />
                </Flow>
              ))}
            </Flow>
          ) : null}
          {bulk}
        </>
      ) : null}
      {!narrow ? <Slider label="Side pane width" value={wide} onChange={setWide} min={280} max={640} step={20} unit="px" hint="Drag, or use the arrow keys" /> : null}
    </Flow>
  );

  const centre = !isReview ? (
    <Card>
      <Flow gap={16}>
        <TextStack overline={current.status} title={current.title} titleAs="h3" subtitle={current.line} />
        <Flow direction="row" justify="end">
          <Button variant="primary" onClick={() => onOpenOther(current)}>Open it</Button>
        </Flow>
      </Flow>
    </Card>
  ) : read?.error ? (
    <Notification tone="danger" title="The review page didn’t load" message="The review server on localhost:3123 did not answer." />
  ) : !page ? (
    <EmptyState size="lane" mark="⏳" title="Reading the review page" line={current.title} />
  ) : (
    <Flow gap={12}>
      {shots.length > 1 ? (
        <Flow gap={8}>
          <Flow direction="row" gap={8} wrap role="group" aria-label="Pictures on this card">
            {shots.map((sh, i) => (
              <FilterChip key={sh.src} pressed={sh === shot} ariaLabel={`Picture ${i + 1}${sh.caption ? `: ${sh.caption}` : ''}`} onClick={() => setShotAt((m) => ({ ...m, [shownCard.id]: i }))}>
                {shots.length <= 3 ? sh.caption.split('·')[0].trim().slice(0, 24) || String(i + 1) : String(i + 1)}
              </FilterChip>
            ))}
          </Flow>
          <TextStack body={shot?.caption} />
        </Flow>
      ) : null}
      <Picture card={shownCard} shot={shot} pins={pins} onPins={(next) => setState((s) => ({ ...s, pins: typeof next === 'function' ? next(s.pins ?? []) : next }))} />
    </Flow>
  );

  return (
    <Flow gap={16}>
      <Flow direction="row" gap={8} align="center" justify="between" wrap>
        <Flow direction="row" gap={8} align="center" wrap>
          <Button variant="tertiary" icon="NavArrowLeft" leadingIcon onClick={onBack}>
            Work board
          </Button>
          <TextStack title="Needs you" titleAs="h2" subtitle={`${at + 1} of ${cards.length}`} />
        </Flow>
        <Flow direction="row" gap={8} align="center" wrap>
          <FilterChip pressed={allIn} onClick={() => setPicked(allIn ? new Set() : new Set(reviewCards.map((c) => c.id)))}>
            {allIn ? 'All chosen' : `Choose all ${reviewCards.length}`}
          </FilterChip>
          <Button variant="secondary" size="sm" iconOnly icon="NavArrowLeft" ariaLabel="Previous" disabled={at === 0} onClick={() => go(-1)} />
          <Button variant="secondary" size="sm" iconOnly icon="NavArrowRight" ariaLabel="Next" disabled={at >= cards.length - 1} onClick={() => go(1)} />
        </Flow>
      </Flow>
      <Flow direction={narrow ? 'column' : 'row'} gap={24} align={narrow ? undefined : 'start'}>
        {narrow ? (
          <Disclosure title="Everything that needs you" summary={`${at + 1} of ${cards.length}`}>
            {list}
          </Disclosure>
        ) : (
          <Flow gap={12} style={{ inlineSize: 'calc(var(--spacing-4) * 56)', flexShrink: 0 }}>
            {list}
          </Flow>
        )}
        <Flow gap={12} grow="first">
          {centre}
        </Flow>
        {side}
      </Flow>
      <SendBar count={touched.length} onSend={sendAll} sending={sending} result={msg?.result} failed={msg?.failed} onBack={onBack} onDismiss={() => setMsg(null)} />
    </Flow>
  );
}
