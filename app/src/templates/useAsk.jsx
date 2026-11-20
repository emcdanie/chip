// Ask, one way for every page (Components' Ask BELLA, History's record), as her
// approved mock (screens/2026-11-19-chat-terminal, Ask BELLA panel: Thinking,
// Answer, Citation, Weak answer, Error; Elleta 21 Nov: "its supposed to help me").
//
// Her question is her pink bubble with its time. While it works: typing dots,
// Stop, and her tick list. The answer leads with what to do (one key phrase in
// bold), then at most three bullets, each a bold label, a real count and its
// pin; then "N sources" and "How I got here" folded; copy and ask again on the
// left, Fix on the right; follow-up questions; the composer stays below.
// A weak answer says no source says it and lists the closest; an error keeps
// the question and offers Try again and Ask Claude instead.
//
// A page can hand in an answer it already knows from CHIP's data (setLocal):
// then no model is asked, and How I got here says so.
// A pin opens its source in place: beside the answer where the thread is 800 or
// wider, under the answer's overview below that (her 19 Nov rule).
// Gaps (named for the library): no marker part for the key phrase (bold for
// now), no reaction bar (round 6), no bottom-sheet Drawer for the phone source
// (it opens under the answer), and the finding marks wait on IconWell
// tone=danger small (StatusDot for now). Folded rows keep Disclosure's hairline,
// as Figma Flow 12 draws them.
import { useEffect, useRef, useState } from 'react';
import ChatBubble from '@bella/components/ChatBubble/ChatBubble';
import { ChatThreadDelivered, ThinkingList, ThinkingTick } from '@bella/components/ChatThread/ChatThread';
import { ReactionBar } from '@bella/components/ChatBubble/ChatBubble';
import TypingDots from '@bella/components/TypingDots/TypingDots';
import Step from '@bella/components/Step/Step';
import Pin from '@bella/components/Pin/Pin';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import ListRow from '@bella/components/ListRow/ListRow';
import Button from '@bella/components/Button/Button';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';
import Card from '@bella/components/Card/Card';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import Toast from '@bella/components/Toast/Toast';
import Toasts from './Toasts.jsx';

// a "General knowledge" line, cut where it starts: no answer carries one (it isn't from her sources)
const noFallback = (t) =>
  String(t)
    .split(/\n?\s*General knowledge, not your sources:/i)[0]
    .trim();
const hhmm = (d = new Date()) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const day = (t) =>
  t
    ? new Date(t).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })
    : null;

/* The server's error, in words a reader can act on. */
function plainError(message = '') {
  if (/no index/i.test(message)) return "BELLA's docs aren't indexed on this Mac yet, so there's nothing to answer from.";
  if (/ECONNREFUSED|fetch failed|11434|ollama/i.test(message)) return "The local model isn't running.";
  if (/not signed in|login/i.test(message)) return 'Claude Code is not signed in on this Mac.';
  return 'It stopped before it answered.';
}

/**
 * ask(message, page, record?, question?) streams an answer; setLocal(answer) shows one CHIP already knows.
 * thread: keep the earlier turns (past) when a new question starts, for a chat (the Work panel).
 */
export default function useAsk({ thread = false } = {}) {
  const [answer, setAnswer] = useState(null);
  const [past, setPast] = useState([]);
  const current = useRef(null);
  current.current = answer;
  const turn = useRef(0);
  const stopper = useRef(null);
  const last = useRef(null);
  const ask = async (message, page, record, question, provider) => {
    last.current = { message, page, record, question };
    const mine = ++turn.current;
    const set = (patch) => mine === turn.current && setAnswer((a) => ({ ...a, ...patch }));
    const q = question ?? message;
    const at = hhmm();
    const reading = record ? 'Reading this change' : "Reading BELLA's docs";
    // the turn before goes up the thread, unless it is still working (then the new one replaces it)
    if (thread && current.current && current.current.status !== 'thinking') setPast((p) => [...p, current.current]);
    const started = Date.now();
    setAnswer({
      q,
      at,
      status: 'thinking',
      steps: [{ title: reading, state: 'current' }],
      reply: '',
      sources: [],
      model: null,
    });
    const ctrl = new AbortController();
    stopper.current = ctrl;
    let reply = '';
    let sources = [];
    try {
      const r = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          page,
          auto: !provider,
          provider,
          stream: true,
          record,
        }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) throw new Error(String(r.status));
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines.filter(Boolean)) {
          const ev = JSON.parse(line);
          if (ev.type === 'sources') {
            sources = (ev.sources ?? []).slice(0, 4);
            set({
              sources,
              steps: [
                {
                  title: reading,
                  detail: `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`,
                  state: 'done',
                },
                { title: 'Writing', state: 'current' },
              ],
            });
          } else if (ev.type === 'provider') set({ model: ev.model });
          else if (ev.type === 'token') {
            reply += ev.text;
            set({
              reply: noFallback(reply),
              steps: [
                {
                  title: reading,
                  detail: `${sources.length} sources`,
                  state: 'done',
                },
                {
                  title: 'Writing',
                  detail: `${Math.round((Date.now() - started) / 1000)} s`,
                  state: 'current',
                },
              ],
            });
          } else if (ev.type === 'done') {
            const all = (ev.sources ?? sources).slice(0, 4);
            set({
              status: 'answer',
              next: ev.next ?? [],
              reply: noFallback(ev.reply || reply),
              sources: all,
              model: ev.model ?? null,
              path: [
                {
                  title: reading,
                  detail: `${all.length} ${all.length === 1 ? 'source' : 'sources'}`,
                  state: 'done',
                },
                {
                  title: `Written by ${ev.model ?? 'the model'}`,
                  detail: `${Math.round((Date.now() - started) / 1000)} s`,
                  state: 'done',
                },
              ],
            });
          } else if (ev.type === 'weak') set({ status: 'weak', closest: ev.closest ?? [] });
          else if (ev.type === 'error') throw new Error(ev.error);
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') set({ status: 'stopped' });
      else set({ status: 'error', error: plainError(e.message) });
    }
  };
  return {
    answer,
    ask,
    retry: (provider) => last.current && ask(last.current.message, last.current.page, last.current.record, last.current.question, provider),
    stop: () => stopper.current?.abort(),
    setLocal: (a) => (turn.current++, setAnswer({ at: hhmm(), status: 'answer', ...a })),
    clear: () => (turn.current++, setAnswer(null), setPast([])),
    past,
    // put a cleared chat back (New chat's Undo)
    restore: (kept) => (turn.current++, setPast(kept.past ?? []), setAnswer(kept.answer ?? null)),
  };
}

/* An answer's words: **key phrase** bold, [n] as her pink pin, no code ticks. */
export function Words({ text, onPin }) {
  const bits = String(text)
    .replace(/`/g, '')
    // a pin before the full stop would leave the stop on its own ("pairs ① ."): the stop goes first
    .replace(/\s*((?:\s*\[\d+\])+)\s*([.,;:])/g, '$2 $1')
    .split(/(\*\*[^*]+\*\*|\[\d+\])/)
    .filter(Boolean);
  const pin = (bit, i) => <Pin key={i} number={bit.slice(1, -1)} variant="red" pinStyle="solid" ariaLabel={`Open source ${bit.slice(1, -1)}`} onClick={onPin ? (e) => onPin(Number(bit.slice(1, -1)), e.currentTarget, text) : undefined} />;
  const word = (bit, i) => (/^\*\*/.test(bit) ? <strong key={i}>{bit.slice(2, -2)}</strong> : bit);
  const out = [];
  for (let i = 0; i < bits.length; i++) {
    if (!/^\[\d+\]$/.test(bits[i])) {
      out.push(word(bits[i], i));
      continue;
    }
    // a pin never starts a line on its own: it holds on to the word before it (and any pins after it)
    const pins = [];
    while (i < bits.length && /^\s*$|^\[\d+\]$/.test(bits[i])) {
      if (/^\[\d+\]$/.test(bits[i])) pins.push(pin(bits[i], i));
      i++;
    }
    i--;
    const before = out.pop();
    let lead = null;
    if (typeof before === 'string') {
      const m = before.match(/^([\s\S]*?)(\S+\s*)$/);
      if (m) {
        if (m[1]) out.push(m[1]);
        lead = m[2];
      } else out.push(before);
    } else if (before != null) lead = before;
    out.push(
      <span key={`hold-${i}`} className="chip-hold">
        {lead}
        {pins}
      </span>,
    );
  }
  return out;
}

/**
 * An answer's words, one shape in every chat (audit 21 Nov: "One chat: same answer shape"):
 * the verdict line, then its bullets, each with its bold label and pins. extra: pins after the
 * verdict (the answer's sources when the model cited none).
 */
export function AnswerLines({ shaped, onPin, extra }) {
  return (
    <Flow gap={8}>
      <TextStack
        body={
          <>
            <Words text={shaped.verdict} onPin={onPin} />
            {extra}
          </>
        }
      />
      {shaped.bullets.length ? (
        <Flow as="ul" gap={4} bullets aria-label="What it rests on">
          {shaped.bullets.map((b) => (
            <li key={b}>
              <TextStack body={<Words text={b} onPin={onPin} />} />
            </li>
          ))}
        </Flow>
      ) : null}
    </Flow>
  );
}

// a claim, as words only: to match the line it came from on the server
const plainClaim = (t) => String(t ?? '').replace(/\*\*|\[\d+\]/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* A source opened in place (her mock's Citation open): its pin and title, "n of N · date", previous
   and next, ✕; the findings first, each with its status mark; the exact line folded; where to open it.
   ✕ or Esc closes it and puts focus back on the pin that opened it. */
function Citation({ sources, at, claim, onMove, onClose }) {
  const s = sources[at];
  const box = useRef(null);
  // the line that backs the claim first (the server picks it from the source's own text), never the source's heading
  // per claim: the pin she opened names its line, and the server matched that line to a sentence of this source
  const mine = plainClaim(claim);
  const forClaim = mine ? (s.backsFor ?? []).find((b) => { const c = plainClaim(b.claim); return c && (mine.includes(c) || c.includes(mine)); })?.line : null;
  const lead = forClaim ?? s.backs;
  const findings = s.findings ?? (lead ? [{ text: lead }] : s.passage ? [{ text: String(s.passage).split(/(?<=[.!?])\s/)[0] }] : []);
  // the title without its file path in brackets (it broke alone at 320); the path is under Exact line
  const title = String(s.title).replace(/\s*\([^()]*[/.][^()]*\)\s*$/, '') || s.title;
  // focus moves into the source as it opens (so Tab reads it next), and Esc closes it from anywhere
  useEffect(() => box.current?.focus(), []);
  // Esc closes the source only: caught first (window, capture) and stopped, so a Drawer the
  // thread sits in (the Work panel) never closes with it; focus goes back to the pin
  useEffect(() => {
    const esc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  const when = s.when ? `${day(s.when)} ${new Date(s.when).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : null;
  return (
    <Card>
      <Flow gap={16} ref={box} tabIndex={-1} role="region" aria-label={`Source ${s.n ?? at + 1}: ${s.title}`}>
        <Flow direction="row" grow="first" justify="end" wrap align="start" gap={8}>
          <Flow direction="row" gap={8} align="start">
            <Pin number={String(s.n ?? at + 1)} variant="red" pinStyle="solid" ariaLabel={`Source ${s.n ?? at + 1}`} />
            <TextStack title={title} subtitle={[`${at + 1} of ${sources.length}`, when].filter(Boolean).join(' · ').replace(/ (?!·)(?<!· )/g, '\u00a0')} />
          </Flow>
          {/* 12 apart: each 32 button keeps its full 44 target (32 + 12), none takes a neighbour's strip */}
          <Flow direction="row" gap={12}>
            <Button variant="tertiary" size="sm" iconOnly icon="NavArrowLeft" ariaLabel="Previous source" disabled={at === 0} onClick={() => onMove(at - 1)} />
            <Button variant="tertiary" size="sm" iconOnly icon="NavArrowRight" ariaLabel="Next source" disabled={at === sources.length - 1} onClick={() => onMove(at + 1)} />
            <Button variant="tertiary" size="sm" iconOnly icon="Xmark" ariaLabel="Close the source" onClick={onClose} />
          </Flow>
        </Flow>
        {findings.length ? (
          <Flow as="ul" gap={8} aria-label="What it says">
            {findings.map((f) => (
              <Flow as="li" key={f.text} direction="row" gap={8} align="center">
                {f.ok == null ? null : <StatusDot tone={f.ok ? 'success' : 'danger'} showLabel={false} label={f.ok ? 'Passes' : 'Fails'} />}
                <TextStack body={<Words text={f.text} />} />
              </Flow>
            ))}
          </Flow>
        ) : null}
        {(s.exact ?? s.passage) ? (
          <Disclosure title="Exact line">
            <TextStack subtitle={s.path ?? s.url} body={s.exact ?? s.passage} />
          </Disclosure>
        ) : null}
        {s.open ? <ListRow layout="inline" title={s.open.label} trailing href={s.open.href} /> : null}
      </Flow>
    </Card>
  );
}

/* What BELLA is doing, as her sheet's tick list (20 Nov "one chat"): the ChatThread part's
   ThinkingList, a tick per step done and a dot for the one in hand. Every chat uses this one. */
export function Ticks({ steps, label = 'What BELLA is doing' }) {
  return (
    <ThinkingList label={label}>
      {steps.map((s) => (
        <ThinkingTick key={s.title} state={s.state === 'done' ? 'done' : 'working'} label={s.title} meta={s.detail} />
      ))}
    </ThinkingList>
  );
}

/**
 * A reply in any CHIP chat (Ask, Terminal, Team): the received bubble, its sender's name over
 * the first of a run, a disc for who is talking, and the smiley that opens the coloured reaction
 * bar; the badge stays on the bubble. extra: more actions after the smiley.
 * disc: one or two letters ("B" for BELLA, her mock), drawn as the bubble's initial disc on the
 * last bubble of a run (ChatBubble c1ae6fc).
 */
export function Reply({ who, disc, tail = true, extra, children }) {
  const [react, setReact] = useState(false);
  const [reaction, setReaction] = useState(null);
  return (
    <Flow gap={8}>
      <ChatBubble
        side="received"
        tail={tail}
        senderName={who}
        disc={tail ? disc : undefined}
        reactions={reaction ? [reaction] : undefined}
        actions={
          <Flow direction="row" gap={8} wrap align="center">
            <Button variant="tertiary" size="sm" iconOnly icon="EmojiTalkingHappy" ariaLabel={reaction ? `Your reaction: ${reaction}. Change it` : 'React'} ariaExpanded={react} onClick={() => setReact((r) => !r)} />
            {extra}
          </Flow>
        }
      >
        {children}
      </ChatBubble>
      {react ? (
        <Flow direction="row">
          <ReactionBar
            label={`React to ${who ?? 'this reply'}`}
            selected={reaction ? [reaction] : []}
            onReact={(r) => {
              setReaction((was) => (was === r ? null : r));
              setReact(false);
            }}
          />
        </Flow>
      ) : null}
    </Flow>
  );
}

/**
 * Not answered, one way in every chat (audit 21 Nov): BELLA says so in her bubble, with the
 * next step as chips: the bigger model (the model menu's other choice, never "Ask Claude"),
 * and Try again; a weak answer lists the closest sources under it.
 */
export function NotAnswered({ a, onRetry }) {
  const words = a.status === 'weak' ? 'No source in BELLA says that.' : a.status === 'stopped' ? 'Stopped. Your question is kept.' : `${a.error ?? 'It stopped before it answered.'} Your question is kept.`;
  const bigger = onRetry && a.model !== 'claude' && !/claude/i.test(a.model ?? '');
  return (
    <Flow gap={12}>
      <Reply
        who="BELLA"
        disc="B"
        extra={
          onRetry ? (
            <>
              {bigger ? <ActionChip onClick={() => onRetry('claude')}>Try the bigger model</ActionChip> : null}
              <ActionChip onClick={() => onRetry()}>Try again</ActionChip>
            </>
          ) : null
        }
      >
        {words}
      </Reply>
      {a.status === 'weak' && a.closest?.length ? (
        <Flow gap={8}>
          <TextStack title="Closest" subtitle="match · 1.00 is exact" />
          <Flow as="ul" gap={4} aria-label="Closest sources">
            {a.closest.map((s, i) => (
              <ListRow key={i} layout="inline" title={s.title} value={Number(s.score ?? 0).toFixed(2)} />
            ))}
          </Flow>
        </Flow>
      ) : null}
    </Flow>
  );
}

/* What the agent gets: the question, the answer it rests on, and its sources. Nothing to type. */
export function briefOf(answer) {
  const { verdict, bullets } = answer.verdict ? { verdict: answer.verdict, bullets: answer.bullets ?? [] } : shapeReply(answer.reply ?? '');
  const clean = (t) => String(t).replace(/\*\*|\[\d+\]/g, '').trim();
  return [`Do this in BELLA: ${clean(verdict)}`, ...bullets.map((b) => `- ${clean(b)}`), answer.sources?.length ? `Sources: ${answer.sources.map((s) => s.title).join('; ')}` : null, `Asked in CHIP: ${answer.q}`]
    .filter(Boolean)
    .join('\n');
}
/** Fix: hands an answer to an agent run (POST /runs); resolves to the run's id, or throws with the reason. */
export async function sendToAgent(answer, from = 'Work panel') {
  const r = await fetch('/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: briefOf(answer), title: String(answer.q).slice(0, 90), from }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? String(r.status));
  return d.id;
}

/* A model's reply in the answer's shape: the verdict (first sentence, one short bold phrase) and up to 3 bullets. */
export function shapeReply(reply) {
  // the prompt's last line, "Next: question | question": the follow-ups, never part of the answer
  const nextLine = String(reply).match(/^\s*Next:\s*(.+)$/im);
  const next = nextLine ? nextLine[1].split('|').map((q) => q.replace(/\*\*/g, '').trim()).filter((q) => q.length > 3 && q.length < 80).slice(0, 2) : [];
  const lines = String(reply)
    .replace(/^\s*Next:.*$/gim, '')
    .replace(/([.!?\]])\s+[-•]\s+(?=[A-Z*])/g, '$1\n- ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const prose = lines.filter((l) => !/^[-*•]\s/.test(l)).join(' ');
  const [first = '', ...more] = prose.split(/(?<=[.!?](?:\s*\[\d+\])*)\s+(?=[A-Z])/);
  const bullets = [...more, ...lines.filter((l) => /^[-*•]\s/.test(l)).map((l) => l.replace(/^[-*•]\s+/, ''))].slice(0, 3);
  const bold = first.match(/\*\*([^*]+)\*\*/);
  const plainFirst = first.replace(/\*\*/g, '');
  const key = bold && bold[1].length <= 40 && bold[1].length <= plainFirst.length * 0.4;
  // no bold from the model: the verdict's lead (to its first "to", "by", comma or colon) is the key phrase
  const lead = plainFirst.match(/^(.{3,40}?)(?=\s(?:to|by|for|in)\s|[,:])/)?.[1];
  return {
    verdict: key ? plainFirst.replace(bold[1], `**${bold[1]}**`) : lead ? `**${lead}**${plainFirst.slice(lead.length)}` : plainFirst,
    bullets,
    next,
  };
}

/**
 * The thread for one question, in the mock's states. answer: from useAsk. onRetry(provider?), onStop,
 * onFollow(question), onFix: optional; followUps: questions to offer under an answer; composer: the field.
 */
export function AskAnswer({ answer, onRetry, onStop, onFollow, onFix, fixLabel = 'Fix', fixBusy = false, followUps = [], composer }) {
  // the open source (an index into answer.sources) and the pin that opened it, for focus on close
  const [cite, setCite] = useState(null);
  // copy says so on the button and in a toast (her rule: feedback on the control plus a toast)
  const [copied, setCopied] = useState(false);
  // a reaction, as in the chat (her 18 Nov "like an imessage"): the smiley opens the coloured bar
  const [reacting, setReacting] = useState(false);
  const [reaction, setReaction] = useState(null);
  const opener = useRef(null);
  // beside the answer when the answer's own column has room for two at her mock's widths (800 or more), above it otherwise
  const [wide, setWide] = useState(false);
  const frame = useRef(null);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 800));
    ro.observe(el);
    return () => ro.disconnect();
  });
  useEffect(() => setCite(null), [answer?.q, answer?.status]);
  useEffect(() => (setReaction(null), setReacting(false)), [answer?.q]);
  const [claim, setClaim] = useState(null);
  const openPin = (n, el, line) => {
    const i = (answer?.sources ?? []).findIndex((x, k) => (x.n ?? k + 1) === n);
    if (i < 0) return;
    opener.current = el;
    setClaim(line ?? null);
    setCite(i);
  };
  const closeCite = () => {
    setCite(null);
    requestAnimationFrame(() => opener.current?.focus());
  };
  if (!answer) return composer ?? null;
  const a = answer;
  const shaped = a.verdict ? { verdict: a.verdict, bullets: a.bullets ?? [], next: [] } : shapeReply(a.reply ?? '');
  // the page's own follow-ups first (from CHIP's data), else the two the model offered
  const follow = followUps.length ? followUps : a.next?.length ? a.next : shaped.next ?? [];
  // the model cited nothing: its sources show as pins on the verdict, so an answer always says where it came from
  const cited = /\[\d+\]/.test(`${shaped.verdict} ${shaped.bullets.join(' ')}`);
  const stale = (a.sources ?? []).filter((s) => s.stale).length;
  const skipped = (a.path ?? []).filter((s) => s.skipped).length;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText([shaped.verdict, ...shaped.bullets].join('\n').replace(/\*\*|\[\d+\]/g, ''));
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };
  const open = cite != null && !!a.sources?.[cite];
  // the source opens in place: beside the answer where the thread has room for both (800 or
  // more), under the answer's overview at middle widths and on phones (her rule, 19 Nov: "beside
  // the panel when wide, under the answer at middle widths, a half-height sheet on phones";
  // the phone sheet waits on a bottom-sheet Drawer, so a phone has it under the answer too)
  const citation = open ? <Citation sources={a.sources} at={cite} claim={claim} onMove={setCite} onClose={closeCite} /> : null;
  const answerBody =
    a.status === 'answer' ? (
      <Flow gap={16}>
        <AnswerLines
          shaped={shaped}
          onPin={openPin}
          extra={
            !cited && a.sources?.length
              ? a.sources.slice(0, 3).map((s, i) => <Pin key={i} number={String(s.n ?? i + 1)} variant="red" pinStyle="solid" ariaLabel={`Open source ${s.n ?? i + 1}: ${s.title}`} onClick={(e) => openPin(s.n ?? i + 1, e.currentTarget)} />)
              : null
          }
        />
        {wide ? null : citation}
        <Flow gap={8}>
          {a.sources?.length ? (
            <Disclosure title={`${a.sources.length} ${a.sources.length === 1 ? 'source' : 'sources'}`} summary={stale ? `${stale} out of date` : undefined}>
              <Flow as="ul" gap={4} aria-label="Sources">
                {a.sources.map((s, i) => (
                  <ListRow
                    key={i}
                    layout="stacked"
                    pin={<Pin number={String(s.n ?? i + 1)} variant="red" pinStyle="solid" ariaLabel={`Source ${s.n ?? i + 1}`} />}
                    title={s.title}
                    description={[s.when ? day(s.when) : null, s.stale ? 'out of date' : null].filter(Boolean).join(' · ') || undefined}
                  />
                ))}
              </Flow>
            </Disclosure>
          ) : null}
          {a.path?.length ? (
            <Disclosure title="How I got here" summary={skipped ? `${skipped} skipped` : undefined}>
              <Flow as="ol" gap={4} aria-label="How I got here">
                {a.path.map((s, i) => (
                  <Step key={s.title} title={s.title} detail={s.detail} state={s.skipped ? 'pending' : 'done'} showConnector={i < a.path.length - 1} />
                ))}
              </Flow>
            </Disclosure>
          ) : null}
        </Flow>
        <Flow direction="row" justify="between" align="center" wrap gap={8}>
          <Flow direction="row" gap={12}>
            <Button variant="tertiary" size="sm" iconOnly icon={copied === 'done' ? 'Check' : 'Copy'} ariaLabel={copied === 'done' ? 'Copied' : 'Copy the answer'} onClick={copy} />
            {onRetry ? <Button variant="tertiary" size="sm" iconOnly icon="RefreshDouble" ariaLabel="Ask again" onClick={() => onRetry()} /> : null}
            <Button variant="tertiary" size="sm" iconOnly icon="EmojiTalkingHappy" ariaLabel={reaction ? `Your reaction: ${reaction}. Change it` : 'React'} ariaExpanded={reacting} onClick={() => setReacting((r) => !r)} />
          </Flow>
          {onFix ? (
            <Button variant="primary" size="sm" busy={fixBusy} onClick={onFix}>
              {fixBusy ? 'Starting…' : fixLabel}
            </Button>
          ) : null}
        </Flow>
        {reacting || reaction ? (
          <Flow direction="row">
            <ReactionBar
              label="React to BELLA’s answer"
              selected={reaction ? [reaction] : []}
              // the bar stays, so the picked one keeps its colour wash in view; the smiley folds it
              onReact={(r) => setReaction((was) => (was === r ? null : r))}
            />
          </Flow>
        ) : null}
        {copied ? (
          <Toasts>
            <Toast tone={copied === 'done' ? 'success' : 'danger'} onClose={() => setCopied(false)}>
              {copied === 'done' ? 'Answer copied' : 'Couldn’t copy. The browser said no.'}
            </Toast>
          </Toasts>
        ) : null}
      </Flow>
    ) : null;
  const note = a.status === 'thinking' ? 'sent' : a.status === 'error' || a.status === 'stopped' ? 'not answered' : null;
  return (
    <Flow gap={16} aria-live="polite">
      <Flow gap={4}>
        <ChatBubble side="sent" tail>
          {a.q}
        </ChatBubble>
        <ChatThreadDelivered>{note ? `${a.at} · ${note}` : a.at}</ChatThreadDelivered>
      </Flow>

      {a.status === 'thinking' ? (
        <Flow gap={8}>
          <Flow direction="row" justify="between" align="center">
            <Flow direction="row" gap={8} align="center">
              <TypingDots name="BELLA" />
              <TextStack subtitle="Reading your sources" />
            </Flow>
            {onStop ? (
              <Button variant="tertiary" size="sm" onClick={onStop}>
                Stop
              </Button>
            ) : null}
          </Flow>
          <Ticks steps={a.steps ?? []} />
          {a.reply ? <TextStack body={<Words text={shapeReply(a.reply).verdict} />} /> : null}
        </Flow>
      ) : null}

      {a.status === 'answer' ? (
        // one tree either way, so the answer (and the pin that opened it) stays mounted
        <Flow ref={frame} direction={wide && open ? 'row' : 'column'} equal={wide && open} align={wide && open ? 'start' : undefined} gap={16}>
          {answerBody}
          {wide ? citation : null}
        </Flow>
      ) : null}

      {a.status === 'weak' || a.status === 'error' || a.status === 'stopped' ? <NotAnswered a={a} onRetry={onRetry} /> : null}

      {(a.status === 'answer' || a.status === 'weak') && follow.length && onFollow ? (
        <Flow direction="row" gap={8} wrap aria-label="Ask next">
          {follow.map((f) => (
            <ActionChip key={f} onClick={() => onFollow(f)}>
              {f}
            </ActionChip>
          ))}
        </Flow>
      ) : null}

      {composer ?? null}
    </Flow>
  );
}
