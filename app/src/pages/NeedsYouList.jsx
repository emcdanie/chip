// Needs you as a page of decisions (Elleta, 24 Nov 2026 morning review: "a full page of decision cards, picture large, why
// in one line, the action already written, Yes / No; she goes Yes, Yes, Yes down the list. Nothing sends her to GitHub or
// another site; a pull request shows what it changes inside CHIP"). Replaces the Work board under the Needs you filter:
// the breadcrumb stays, the board goes, the cards move up.
//
// BELLA parts: Card (media = the picture, footer = what Yes does and the buttons at the right edge), StatusDot (the only
// state mark), TextStack, Button, EmptyState, Flow. Pattern reused: the drawer footer row (helper left, buttons right).
// What each card asks and does comes from workModel.js decisionOf, so the page and its test read one answer.
import { useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Input from '@bella/components/Input/Input';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from '../templates/Flow.jsx';
import { planRun } from '../templates/RunPlan.jsx';
import ReadingDrawer from '../templates/ReadingDrawer.jsx';
import { decisionOf, noQuotes, saveMove } from './workModel.js';
import { answersUrl } from './needsYouModel.js';

const short = (t, n = 180) => (t.length > n ? `${t.slice(0, t.lastIndexOf(' ', n - 3))}…` : t);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* What the decision changes, read inside CHIP: a pull request's picture and its files in plain words (GET /work/pr), a run's
   files (GET /runs/:id). Read only when the card is drawn. */
function useChange(pic) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!pic || pic.kind === 'img') return undefined;
    let live = true;
    const url = pic.kind === 'pr' ? `/work/pr?project=${encodeURIComponent(pic.project)}&number=${pic.number}` : `/runs/${encodeURIComponent(pic.id)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => live && setD(x ?? { failed: true }))
      .catch(() => live && setD({ failed: true }));
    return () => {
      live = false;
    };
  }, [pic?.kind, pic?.id, pic?.project, pic?.number]);
  return d;
}

const partsOf = (files = []) => [...new Set(files.map((f) => String(f).match(/components\/([A-Z]\w+)\//)?.[1]).filter(Boolean))];

/* What a decision says and changes, shared by the Needs you card and a board card's drawer. */
function useDecisionView(card) {
  const d = decisionOf(card);
  const change = useChange(d.picture);
  const lines =
    d.picture?.kind === 'pr' && change?.areas
      ? [`${plural(change.files, 'file')}, ${plural(change.commits, 'commit')}, into ${change.into}`, ...change.areas.slice(0, 4).map((a) => `${a.what} (${plural(a.files, 'file')})`)]
      : d.picture?.kind === 'run' && change?.files?.length
        ? [partsOf(change.files).length ? `Parts it touches: ${partsOf(change.files).join(', ')}` : `${plural(change.files.length, 'file')} changed`, change.summary ? short(noQuotes(change.summary.split('\n')[0])) : null].filter(Boolean)
        : d.facts ?? [];
  const why = d.picture?.kind === 'pr' && change?.why ? noQuotes(change.why) || d.why : d.why;
  const src = d.picture?.kind === 'img' ? d.picture.src : change?.picture;
  const media = src ? <img src={src} alt={`What ${card.title} changes`} loading="lazy" /> : null;
  // what each answer does, written out before she presses it
  const does = [d.yes && `${d.yes.label.replace(/,.*$/, '')}: ${d.yes.does}.`, d.no && `${d.no.label.replace(/,.*$/, '')}: ${d.no.does}.`].filter(Boolean).join(' ');
  const body = (
    <>
      {lines.length ? (
        <Flow as="ul" gap={4} aria-label="What it changes">
          {lines.map((l) => (
            <li key={l}>
              <TextStack subtitle={l} />
            </li>
          ))}
        </Flow>
      ) : change?.failed && d.picture ? (
        <TextStack subtitle="What it changes could not be read just now." />
      ) : null}
    </>
  );
  return { d, why, media, does, body };
}

function Answers({ card, d, onDecide, busy }) {
  if (!d.yes && !d.no) return null;
  return (
    <Flow direction="row" gap={8} justify="end" wrap>
      {d.no ? (
        <Button variant="secondary" disabled={!!busy} onClick={() => onDecide(card, d.no.call, d.no.label)}>
          {busy === 'no' ? 'Working…' : d.no.label}
        </Button>
      ) : null}
      {d.yes ? (
        <Button variant="primary" disabled={!!busy} onClick={() => onDecide(card, d.yes.call, d.yes.label)}>
          {busy === 'yes' ? 'Working…' : d.yes.label}
        </Button>
      ) : null}
    </Flow>
  );
}

/* A review-fix area (24 Nov 10:40, "everything waiting for her look is in Needs you"): the after picture large, the before of
   the same view one click away, each thing that changed as a chip, each width it was checked at, then Accept or Change with a
   note. The answer goes to the review server's POST /answers in the review pages' own shape, so the builder reads it there. */
function FixesDecision({ card, onNotice, framed = true }) {
  const a = card.fixes;
  const [t, setT] = useState(0);
  const [w, setW] = useState(0);
  const [side, setSide] = useState('after');
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const topic = a.topics[t] ?? a.topics[0];
  const view = topic?.views[Math.min(w, (topic?.views.length ?? 1) - 1)];
  const src = side === 'before' && view?.before ? view.before : view?.src;
  const send = async (answer) => {
    setBusy(answer);
    try {
      const path = new URL(a.url).pathname;
      const r = await fetch(answersUrl(a.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: `Review fixes · ${a.title}`, url: path, cards: [{ from: path, title: a.title, answer, thumb: null, note: note.trim() || null }] }),
      });
      if (!r.ok) throw new Error('The review server did not take it');
      onNotice({ tone: 'success', title: answer === 'Accept' ? 'Accepted' : 'Change sent', message: a.title });
      window.dispatchEvent(new Event('chip:changed'));
    } catch (e) {
      onNotice({ tone: 'danger', title: 'Not sent', message: `${e.message}.` });
    } finally {
      setBusy(null);
    }
  };
  const picture = src ? <img src={src} alt={`${a.title}, ${topic.topic}${view.width ? ` at ${view.width}` : ''}, ${side === 'before' ? 'before' : 'after'} the fix`} loading="lazy" /> : null;
  const helper = <TextStack subtitle={noting ? 'Send change posts your note to the builder.' : 'Accept: it looks right and can be handed over. Change: you write what to change, then send it.'} />;
  const actions = (
      <Flow direction="row" gap={8} justify="end" wrap>
        {noting ? (
          <>
            <Button variant="secondary" disabled={!!busy} onClick={() => (setNoting(false), setNote(''))}>
              Back
            </Button>
            <Button variant="primary" disabled={!!busy || !note.trim()} onClick={() => send('Change')}>
              {busy === 'Change' ? 'Sending…' : 'Send change'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" disabled={!!busy} onClick={() => setNoting(true)}>
              Change
            </Button>
            <Button variant="primary" disabled={!!busy} onClick={() => send('Accept')}>
              {busy === 'Accept' ? 'Sending…' : 'Accept'}
            </Button>
          </>
        )}
      </Flow>
  );
  const body = (
    <Flow gap={16}>
      <Flow gap={8}>
        {framed ? <StatusDot tone="attention" label={card.status} /> : null}
        {framed ? <TextStack title={`${a.title}: does it look right?`} titleAs="h2" subtitle={a.line} /> : null}
        {a.topics.length > 1 ? (
          <Flow direction="row" gap={8} wrap aria-label="What changed">
            {a.topics.map((x, i) => (
              <FilterChip key={x.topic} size="compact" pressed={i === t} onClick={() => (setT(i), setW(0), setSide('after'))}>
                {x.topic}
              </FilterChip>
            ))}
          </Flow>
        ) : null}
        <Flow direction="row" gap={8} wrap>
          {topic?.views.length > 1 ? <SegmentedControl label="Width" value={String(w)} onChange={(v) => setW(Number(v))} options={topic.views.map((v, i) => ({ value: String(i), label: v.width ? `${v.width}` : `View ${i + 1}` }))} /> : null}
          {view?.before ? <SegmentedControl label="Before or after" value={side} onChange={setSide} options={[{ value: 'after', label: 'After' }, { value: 'before', label: 'Before' }]} /> : null}
        </Flow>
      </Flow>
      {noting ? <Input label="What should change?" multiline value={note} onChange={setNote} placeholder="One line is enough" /> : null}
      {framed ? helper : null}
      {framed ? actions : null}
    </Flow>
  );
  if (!framed) return { picture, body, helper: noting ? 'Send change posts your note to the builder.' : 'Accept: it looks right. Change: write what to change, then send it.', actions };
  return <Card media={picture ?? undefined}>{body}</Card>;
}

const dotTone = (card) => (card.tone === 'danger' ? 'danger' : card.tone === 'success' ? 'success' : card.tone === 'info' ? 'info' : card.tone === 'neutral' ? 'neutral' : 'attention');

function Decision({ card, onDecide, busy }) {
  const { d, why, media, does, body } = useDecisionView(card);
  return (
    <Card media={media ?? undefined}>
      <Flow gap={16}>
        <Flow gap={8}>
          <StatusDot tone={dotTone(card)} label={card.status ?? 'Needs you'} />
          <TextStack title={d.ask} titleAs="h2" subtitle={why} />
          {body}
        </Flow>
        {/* what the answers do in reading type, then the answers at the right edge (in a card half the page wide the helper and
            two buttons squeezed each other onto one row, so they stack; the drawer keeps them on one footer row) */}
        {does ? <TextStack subtitle={does} /> : null}
        <Answers card={card} d={d} onDecide={onDecide} busy={busy} />
      </Flow>
    </Card>
  );
}

/** A board card's own detail (24 Nov: "every board card is clickable and opens its detail; she can change things inside
 *  it"): the same question, why and what changes as on Needs you, with what each answer does at the left of the footer and
 *  the answers at its right edge (the drawer footer rule). */
export function CardDrawer({ card, onClose, handlers }) {
  if (card.kind === 'fixes') return <FixesDrawer card={card} onClose={onClose} onNotice={handlers.onNotice} />;
  return <DecisionDrawer card={card} onClose={onClose} handlers={handlers} />;
}
function FixesDrawer({ card, onClose, onNotice }) {
  const { picture, body, helper, actions } = FixesDecision({ card, onNotice, framed: false });
  return (
    <ReadingDrawer open onClose={onClose} label={`${card.title}: does it look right?`} status={card.status} answer={card.fixes.line} picture={picture} footer={actions} footerNote={helper}>
      <Flow gap={16} inset>
        {body}
      </Flow>
    </ReadingDrawer>
  );
}
function DecisionDrawer({ card, onClose, handlers }) {
  const { d, why, media, does, body } = useDecisionView(card);
  const { decide, busy } = useDecide({ ...handlers, onDone: onClose });
  return (
    <ReadingDrawer open onClose={onClose} label={card.title} status={card.status} answer={why} picture={media} footer={<Answers card={card} d={d} onDecide={decide} busy={busy?.which} />} footerNote={does || undefined}>
      <Flow gap={16} inset>
        {body}
      </Flow>
    </ReadingDrawer>
  );
}

/** What pressing an answer does, for the page and the drawer alike. onDone runs after an answer that changed something. */
export function useDecide({ onOpen, onReview, onSession, onTerminal, onNotice, onDone }) {
  const [busy, setBusy] = useState(null); // { id, which }
  const decide = async (card, call, label) => {
    if (call.open) return onOpen(card, call.open);
    if (call.review) return onReview(card);
    if (call.session) return onSession(card);
    if (call.terminal) return onTerminal(call.terminal);
    if (call.merge) return onTerminal({ repo: String(call.merge.project).toLowerCase(), command: `gh pr merge ${call.merge.number} --merge`, title: `merge ${card.title}` });
    if (call.again || call.start) {
      try {
        const run = await planRun({ brief: call.again ? card.runBrief : card.brief, title: card.title, from: 'Work', subtitle: call.again ? 'Run again · the same brief, on a new branch' : 'Start it · edit the brief first if you like' });
        if (run) (window.dispatchEvent(new Event('chip:changed')), onDone?.());
      } catch (e) {
        if (!e.shown) onNotice({ tone: 'danger', title: 'Not started', message: `${e.message}.` });
      }
      return undefined;
    }
    if (call.post || call.move) {
      setBusy({ id: card.id, which: /^(Yes|Line|Open)/.test(label) ? 'yes' : 'no' });
      try {
        if (call.move) await saveMove(card.id, call.move);
        else {
          const r = await fetch(call.post, { method: 'POST' });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error ?? 'CHIP did not do it');
        }
        onNotice({ tone: 'success', title: label.replace(/^(Yes|No), /, '').replace(/^\w/, (c) => c.toUpperCase()), message: card.title });
        window.dispatchEvent(new Event('chip:changed'));
        onDone?.();
      } catch (e) {
        onNotice({ tone: 'danger', title: 'Not done', message: `${e.message}.` });
      } finally {
        setBusy(null);
      }
    }
    return undefined;
  };
  return { decide, busy };
}

/** cards: the board's cards that need her. onOpen(card, open) opens a drawer or the review; onNotice({tone,title,message}). */
export default function NeedsYouList({ cards, onOpen, onReview, onSession, onTerminal, onNotice }) {
  const { decide, busy } = useDecide({ onOpen, onReview, onSession, onTerminal, onNotice });
  if (!cards.length) return <EmptyState size="page" mark="🍵" title="Nothing needs you" line="Every decision is made. New ones land here." />;
  return (
    // the page width (24 Nov: cards sat in the left 750 with the right half empty): two columns where two cards of a readable
    // width fit, one on a phone; cards in a row the same height
    <Flow as="ul" direction="row" wrap fill gap={24} aria-label={`Needs you: ${plural(cards.length, 'decision')}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, calc(var(--spacing-64) * 8)), 1fr))' }}>
      {cards.map((c) => (
        <li key={c.id}>
          {c.kind === 'fixes' ? <FixesDecision card={c} onNotice={onNotice} /> : <Decision card={c} onDecide={decide} busy={busy?.id === c.id ? busy.which : null} />}
        </li>
      ))}
    </Flow>
  );
}
