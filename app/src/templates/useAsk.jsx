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
// Gaps (named for the library): no marker part for the key phrase (bold for
// now), no reaction part.
import { useEffect, useRef, useState } from 'react';
import ChatBubble from '@bella/components/ChatBubble/ChatBubble';
import { ChatThreadDelivered } from '@bella/components/ChatThread/ChatThread';
import TypingDots from '@bella/components/TypingDots/TypingDots';
import Notification from '@bella/components/Notification/Notification';
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

// the server prompt's "General knowledge" fallback, cut where it starts (a record's answer never carries it)
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

/** ask(message, page, record?, question?) streams an answer; setLocal(answer) shows one CHIP already knows. */
export default function useAsk() {
  const [answer, setAnswer] = useState(null);
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
              reply: record ? noFallback(reply) : reply,
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
              reply: record ? noFallback(ev.reply || reply) : ev.reply || reply,
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
    clear: () => (turn.current++, setAnswer(null)),
  };
}

/* An answer's words: **key phrase** bold, [n] as her pink pin, no code ticks. */
export function Words({ text, onPin }) {
  return String(text)
    .replace(/`/g, '')
    .split(/(\*\*[^*]+\*\*|\[\d+\])/)
    .filter(Boolean)
    .map((bit, i) =>
      /^\*\*/.test(bit) ? (
        <strong key={i}>{bit.slice(2, -2)}</strong>
      ) : /^\[\d+\]$/.test(bit) ? (
        <Pin key={i} number={bit.slice(1, -1)} variant="red" pinStyle="solid" ariaLabel={`Open source ${bit.slice(1, -1)}`} onClick={onPin ? (e) => onPin(Number(bit.slice(1, -1)), e.currentTarget) : undefined} />
      ) : (
        bit
      ),
    );
}

/* A source opened in place (her mock's Citation open): its pin and title, "n of N · date", previous
   and next, ✕; the findings first, each with its status mark; the exact line folded; where to open it.
   ✕ or Esc closes it and puts focus back on the pin that opened it. */
function Citation({ sources, at, onMove, onClose }) {
  const s = sources[at];
  const box = useRef(null);
  const findings = s.findings ?? (s.passage ? [{ text: String(s.passage).split(/(?<=[.!?])\s/)[0] }] : []);
  // focus moves into the source as it opens (so Tab reads it next), and Esc closes it from anywhere
  useEffect(() => box.current?.focus(), []);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const when = s.when ? `${day(s.when)} ${new Date(s.when).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : null;
  return (
    <Card>
      <Flow gap={16} ref={box} tabIndex={-1} role="region" aria-label={`Source ${s.n ?? at + 1}: ${s.title}`}>
        <Flow direction="row" grow="first" justify="end" wrap align="start" gap={8}>
          <Flow direction="row" gap={8} align="start">
            <Pin number={String(s.n ?? at + 1)} variant="red" pinStyle="solid" ariaLabel={`Source ${s.n ?? at + 1}`} />
            <TextStack title={s.title} subtitle={[`${at + 1} of ${sources.length}`, when].filter(Boolean).join(' · ').replace(/ (?!·)(?<!· )/g, '\u00a0')} />
          </Flow>
          <Flow direction="row" gap={4}>
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
            <TextStack body={s.exact ?? s.passage} />
          </Disclosure>
        ) : null}
        {s.open ? <ListRow layout="inline" title={s.open.label} trailing href={s.open.href} /> : null}
      </Flow>
    </Card>
  );
}

/* A model's reply in the answer's shape: the verdict (first sentence, one short bold phrase) and up to 3 bullets. */
function shapeReply(reply) {
  const lines = String(reply)
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
  return {
    verdict: key ? plainFirst.replace(bold[1], `**${bold[1]}**`) : plainFirst,
    bullets,
  };
}

/**
 * The thread for one question, in the mock's states. answer: from useAsk. onRetry(provider?), onStop,
 * onFollow(question), onFix: optional; followUps: questions to offer under an answer; composer: the field.
 */
export function AskAnswer({ answer, onRetry, onStop, onFollow, onFix, fixLabel = 'Fix', followUps = [], composer }) {
  // the open source (an index into answer.sources) and the pin that opened it, for focus on close
  const [cite, setCite] = useState(null);
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
  const openPin = (n, el) => {
    const i = (answer?.sources ?? []).findIndex((x, k) => (x.n ?? k + 1) === n);
    if (i < 0) return;
    opener.current = el;
    setCite(i);
  };
  const closeCite = () => {
    setCite(null);
    requestAnimationFrame(() => opener.current?.focus());
  };
  if (!answer) return composer ?? null;
  const a = answer;
  const shaped = a.verdict ? { verdict: a.verdict, bullets: a.bullets ?? [] } : shapeReply(a.reply ?? '');
  // the model cited nothing: its sources show as pins on the verdict, so an answer always says where it came from
  const cited = /\[\d+\]/.test(`${shaped.verdict} ${shaped.bullets.join(' ')}`);
  const stale = (a.sources ?? []).filter((s) => s.stale).length;
  const skipped = (a.path ?? []).filter((s) => s.skipped).length;
  const copy = () => navigator.clipboard?.writeText([shaped.verdict, ...shaped.bullets].join('\n').replace(/\*\*|\[\d+\]/g, ''));
  const open = cite != null && !!a.sources?.[cite];
  const answerBody =
    a.status === 'answer' ? (
      <Flow gap={16}>
        <Flow gap={8}>
          <TextStack
            body={
              <>
                <Words text={shaped.verdict} onPin={openPin} />
                {!cited && a.sources?.length
                  ? a.sources.slice(0, 3).map((s, i) => <Pin key={i} number={String(s.n ?? i + 1)} variant="red" pinStyle="solid" ariaLabel={`Open source ${s.n ?? i + 1}: ${s.title}`} onClick={(e) => openPin(s.n ?? i + 1, e.currentTarget)} />)
                  : null}
              </>
            }
          />
          {shaped.bullets.length ? (
            <Flow as="ul" gap={4} aria-label="What it rests on">
              {shaped.bullets.map((b) => (
                <li key={b}>
                  <TextStack body={<Words text={b} onPin={openPin} />} />
                </li>
              ))}
            </Flow>
          ) : null}
        </Flow>
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
          <Flow direction="row" gap={4}>
            <Button variant="tertiary" size="sm" iconOnly icon="Copy" ariaLabel="Copy the answer" onClick={copy} />
            {onRetry ? <Button variant="tertiary" size="sm" iconOnly icon="RefreshDouble" ariaLabel="Ask again" onClick={() => onRetry()} /> : null}
          </Flow>
          {onFix ? (
            <Button variant="primary" size="sm" onClick={onFix}>
              {fixLabel}
            </Button>
          ) : null}
        </Flow>
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
          <Flow as="ol" gap={4} aria-label="What BELLA is doing">
            {(a.steps ?? []).map((s, i) => (
              <Step key={s.title} title={s.title} detail={s.detail} state={s.state} showConnector={i < a.steps.length - 1} />
            ))}
          </Flow>
          {a.reply ? <TextStack body={<Words text={shapeReply(a.reply).verdict} />} /> : null}
        </Flow>
      ) : null}

      {a.status === 'answer' ? (
        // the source opens in place: beside the answer with room (her mock), above it on a phone.
        // One tree either way, so the answer (and the pin that opened it) stays mounted.
        <Flow ref={frame} direction={wide && open ? 'row' : 'column'} equal={wide && open} align={wide && open ? 'start' : undefined} gap={16}>
          {open ? <Citation sources={a.sources} at={cite} onMove={setCite} onClose={closeCite} /> : null}
          {answerBody}
        </Flow>
      ) : null}

      {a.status === 'weak' ? (
        <Flow gap={16}>
          <Notification tone="attention" title="No source says that" message="Nothing in BELLA's docs is close enough to answer it." action={onRetry ? { label: 'Ask Claude', onClick: () => onRetry('claude') } : undefined} />
          {a.closest?.length ? (
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
      ) : null}

      {a.status === 'error' || a.status === 'stopped' ? (
        <Flow gap={8}>
          <Notification
            tone="danger"
            title={a.status === 'stopped' ? 'Stopped' : `${a.model ?? 'The local model'} didn’t answer`}
            message={`${a.status === 'error' ? `${a.error} ` : ''}Your question is kept.`}
            action={onRetry ? { label: 'Try again', onClick: () => onRetry() } : undefined}
          />
          {onRetry ? (
            <Flow direction="row">
              <Button variant="secondary" size="sm" onClick={() => onRetry('claude')}>
                Ask Claude instead
              </Button>
            </Flow>
          ) : null}
        </Flow>
      ) : null}

      {(a.status === 'answer' || a.status === 'weak') && followUps.length && onFollow ? (
        <Flow direction="row" gap={8} wrap aria-label="Ask next">
          {followUps.map((f) => (
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
