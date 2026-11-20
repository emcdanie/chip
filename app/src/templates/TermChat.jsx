// The terminal chat (CHIP · Dashboard Flow 12, "4 · Terminal: BELLA and the agent",
// 791:264846; her mock 2026-11-19-chat-terminal, Terminal chat): the same
// ChatThread as Ask BELLA, same bubbles, thinking list and composer; only the
// content differs (her 20 Nov "i just want one please"). Her messages are her
// pink bubbles on the right; BELLA answers in a bubble on the left, from CHIP's
// data first, with its pins; "Send it to the agent" hands the last answer to an
// agent run (POST /runs) and the agent's steps come back as its bubbles, read
// from the run (/runs/:id). Reactions are the coloured bar on any reply.
// A real shell still opens from New shell, in its own drawer (the plain text
// fallback, never the chat itself).
// Gaps: no dotted-underline term with a plain-speech card yet (Tooltip would
// carry it; the terms need words from CHIP first); the agent can't ask her a
// question mid-run (runs are headless), so no permission bubbles are drawn.
import { useEffect, useRef, useState } from 'react';
import ChatThread, { ChatThreadDelivered, ChatThreadTimestamp } from '@bella/components/ChatThread/ChatThread';
import ChatBubble, { ReactionBar } from '@bella/components/ChatBubble/ChatBubble';
import TypingDots from '@bella/components/TypingDots/TypingDots';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Button from '@bella/components/Button/Button';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';
import { Ticks, Words, shapeReply } from './useAsk.jsx';

const hhmm = (t = new Date()) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const SEND = /^\s*(please\s+)?send (it|this) to the agent\b/i;
// a run's steps as the agent's words: where it is, then what it did
const RUN_WORDS = { starting: 'Starting', running: 'Working', gate: 'Checking through BELLA’s gate', passed: 'Done. The gate passed.', failed: 'Stopped', login: 'I need Claude Code signed in on this Mac' };

/* What the agent gets: the question, the answer it rests on, and its sources. Nothing to type. */
function briefOf(turn) {
  const { verdict, bullets } = turn.answer.verdict ? { verdict: turn.answer.verdict, bullets: turn.answer.bullets ?? [] } : shapeReply(turn.answer.reply ?? '');
  const clean = (t) => String(t).replace(/\*\*|\[\d+\]/g, '').trim();
  return [
    `Do this in BELLA: ${clean(verdict)}`,
    ...bullets.map((b) => `- ${clean(b)}`),
    turn.answer.sources?.length ? `Sources: ${turn.answer.sources.map((s) => s.title).join('; ')}` : null,
    `Asked in CHIP: ${turn.answer.q}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/* One agent run, as the agent's bubbles: its steps so far, then its outcome; polled while it works. */
function AgentRun({ id, onOpen }) {
  const [run, setRun] = useState(null);
  useEffect(() => {
    let live = true;
    let t;
    const load = () =>
      fetch(`/runs/${id}`)
        .then((r) => r.json())
        .then((r) => {
          if (!live) return;
          setRun(r);
          if (['starting', 'running', 'gate'].includes(r.status)) t = setTimeout(load, 3000);
        })
        .catch(() => live && (t = setTimeout(load, 5000)));
    load();
    return () => ((live = false), clearTimeout(t));
  }, [id]);
  if (!run) return <TypingDots name="the agent" />;
  const working = ['starting', 'running', 'gate'].includes(run.status);
  const said = (run.steps ?? []).filter((s) => s.claude).slice(-3);
  const outcome = run.status === 'passed' ? (run.summary?.split('\n')[0] ?? RUN_WORDS.passed) : run.error ?? RUN_WORDS[run.status];
  return (
    <Flow gap={8}>
      <ChatBubble side="received" senderName="Agent">
        {`On it: ${run.title}.`}
      </ChatBubble>
      {said.map((s, i) => (
        <ChatBubble key={`${s.endedAt}-${i}`} side="received">
          {s.step}
        </ChatBubble>
      ))}
      {working ? (
        <Flow direction="row" gap={8} align="center">
          <TypingDots name="the agent" />
          <TextStack subtitle={run.step ?? RUN_WORDS[run.status]} />
        </Flow>
      ) : (
        <ChatBubble side="received" tail actions={<ActionChip onClick={() => onOpen({ kind: 'run', id })}>Open the run</ActionChip>}>
          {outcome}
        </ChatBubble>
      )}
    </Flow>
  );
}

/* One turn: her message, then BELLA's reply (or what it's doing), then the agent's run if she sent it on. */
function Turn({ turn, last, sent, onAgent, onRetry }) {
  const [react, setReact] = useState(false);
  const [reaction, setReaction] = useState(null);
  const a = turn.answer;
  const shaped = a && (a.verdict ? { verdict: a.verdict, bullets: a.bullets ?? [] } : shapeReply(a.reply ?? ''));
  return (
    <Flow gap={12}>
      <Flow gap={4}>
        <ChatBubble side="sent" tail>
          {turn.text}
        </ChatBubble>
        {last ? <ChatThreadDelivered>{`${turn.at} · ${a?.status === 'thinking' ? 'sent' : 'read'}`}</ChatThreadDelivered> : null}
      </Flow>
      {a?.status === 'thinking' ? (
        <Flow gap={8}>
          <TypingDots name="BELLA" />
          <Ticks steps={a.steps ?? []} />
        </Flow>
      ) : null}
      {a?.status === 'answer' ? (
        <Flow gap={8}>
          <ChatBubble
            side="received"
            tail
            senderName="BELLA"
            reactions={reaction ? [reaction] : undefined}
            actions={
              <Flow direction="row" gap={8} wrap>
                <Button variant="tertiary" size="sm" iconOnly icon="EmojiTalkingHappy" ariaLabel={reaction ? `Your reaction: ${reaction}. Change it` : 'React'} ariaExpanded={react} onClick={() => setReact((r) => !r)} />
                {!sent ? <ActionChip onClick={() => onAgent(turn)}>Send it to the agent</ActionChip> : null}
              </Flow>
            }
          >
            <Words text={[shaped.verdict, ...shaped.bullets].join(' ')} />
          </ChatBubble>
          {react ? (
            <Flow direction="row">
              <ReactionBar
                label="React to BELLA’s reply"
                selected={reaction ? [reaction] : []}
                onReact={(r) => {
                  setReaction((was) => (was === r ? null : r));
                  setReact(false);
                }}
              />
            </Flow>
          ) : null}
        </Flow>
      ) : null}
      {a?.status === 'weak' || a?.status === 'error' || a?.status === 'stopped' ? (
        <ChatBubble
          side="received"
          tail
          senderName="BELLA"
          actions={
            onRetry ? (
              <Flow direction="row" gap={8} wrap>
                {a.status === 'weak' ? <ActionChip onClick={() => onRetry('claude')}>Ask Claude</ActionChip> : null}
                <ActionChip onClick={() => onRetry()}>Try again</ActionChip>
              </Flow>
            ) : undefined
          }
        >
          {a.status === 'weak' ? 'No source in BELLA says that.' : a.status === 'stopped' ? 'Stopped. Your message is kept.' : `${a.error} Your message is kept.`}
        </ChatBubble>
      ) : null}
    </Flow>
  );
}

/**
 * asker: a useAsk({ thread: true }) of its own. onOpen(item): what a run opens (WorkDrawer).
 * Returns the thread and `say(text)` for the composer through the ref handed in as `sayRef`.
 */
export default function TermChat({ asker, provider, onOpen, sayRef, onNotice }) {
  // each turn: her words, when, and the run she sent it to; BELLA's answer comes from asker
  const [turns, setTurns] = useState([]);
  const end = useRef(null);
  const answers = [...asker.past, asker.answer].filter(Boolean);
  const startRun = async (turn) => {
    const at = hhmm();
    setTurns((t) => [...t, { text: 'Send it to the agent.', at, agentFor: turn.i }]);
    try {
      const r = await fetch('/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: briefOf(turn), title: String(turn.answer.q).slice(0, 90), from: 'Work panel' }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? String(r.status));
      setTurns((t) => t.map((x) => (x.agentFor === turn.i && !x.run ? { ...x, run: d.id } : x)));
      onNotice?.({ tone: 'success', text: 'Sent to the agent. Its card is in the Agent lane.' });
    } catch (e) {
      setTurns((t) => t.map((x) => (x.agentFor === turn.i && !x.run ? { ...x, runError: `I couldn’t start: ${e.message}` } : x)));
      onNotice?.({ tone: 'danger', text: `Not sent: ${e.message}` });
    }
  };
  // the composer's words: "send it to the agent" sends the last answer on; anything else asks BELLA
  sayRef.current = (text) => {
    const lastAsked = turns.filter((t) => t.agentFor == null).length - 1;
    if (SEND.test(text) && answers[lastAsked]?.status === 'answer') return startRun({ i: lastAsked, answer: answers[lastAsked] });
    setTurns((t) => [...t, { text, at: hhmm() }]);
    asker.ask(text, window.location.hash || '#/work', undefined, undefined, provider);
  };
  useEffect(() => end.current?.scrollIntoView?.({ block: 'nearest' }), [turns.length, asker.answer?.status]);
  // her questions pair with BELLA's answers in order; "send it to the agent" turns carry their run
  let k = -1;
  const rows = turns.map((t) => (t.agentFor == null ? { ...t, i: ++k, answer: answers[k] } : { ...t, answer: null }));
  return (
    <ChatThread label="BELLA and the agent">
      {rows.length ? <ChatThreadTimestamp boldWord="Today">{rows[0].at}</ChatThreadTimestamp> : null}
      {rows.map((t, n) =>
        t.agentFor == null ? (
          <Turn key={n} turn={t} last={n === rows.length - 1} sent={rows.some((x) => x.agentFor === t.i)} onAgent={startRun} onRetry={n === rows.length - 1 ? (p) => asker.retry(p ?? provider) : undefined} />
        ) : (
          <Flow key={n} gap={12}>
            <Flow gap={4}>
              <ChatBubble side="sent" tail>
                {t.text}
              </ChatBubble>
              {n === rows.length - 1 ? <ChatThreadDelivered>{`${t.at} · read`}</ChatThreadDelivered> : null}
            </Flow>
            {t.run ? <AgentRun id={t.run} onOpen={onOpen} /> : t.runError ? <ChatBubble side="received" senderName="Agent">{t.runError}</ChatBubble> : <TypingDots name="the agent" />}
          </Flow>
        ),
      )}
      <span ref={end} />
    </ChatThread>
  );
}
