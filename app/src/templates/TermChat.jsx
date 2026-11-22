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
// Talk (Work board, section 8, 22 Nov): "Send it to the agent" brings the plan back in the chat, its
// numbered steps outside the bubble, Later and Start under them on the right. Start runs it (her
// press is the approval of the plan she sees); Later keeps it as a card in Next. "What is being
// worked on?" is answered from the Work board itself (workStatus), never by a model.
// Gaps: no dotted-underline term with a plain-speech card yet (Tooltip would
// carry it; the terms need words from CHIP first); the agent can't ask her a
// question mid-run (runs are headless), so no permission bubbles are drawn.
import { useEffect, useRef, useState, Fragment } from 'react';
import ChatThread, { ChatThreadDelivered, ChatThreadTimestamp } from '@bella/components/ChatThread/ChatThread';
import ChatBubble from '@bella/components/ChatBubble/ChatBubble';
import TypingDots from '@bella/components/TypingDots/TypingDots';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Button from '@bella/components/Button/Button';
import TextStack from '@bella/components/TextStack/TextStack';
import Step from '@bella/components/Step/Step';
import Flow from './Flow.jsx';
import { AnswerLines, NotAnswered, Reply, Ticks, briefOf, shapeReply, useCitations } from './useAsk.jsx';
import { DataAnswer } from './AskField.jsx';
import { STATUS_Q, workStatus } from '../pages/workModel.js';

// Team draws its replies with the same bubble
export { Reply };

const hhmm = (t = new Date()) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const SEND = /^\s*(please\s+)?send (it|this) to the agent\b/i;
// a run's steps as the agent's words: where it is, then what it did
const RUN_WORDS = { starting: 'Starting', running: 'Working', gate: 'Checking through BELLA’s gate', passed: 'Done. The gate passed.', failed: 'Stopped', login: 'I need Claude Code signed in on this Mac' };

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
      <ChatBubble side="received" senderName="Agent · Claude Code">
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
        <ChatBubble side="received" tail disc="A" actions={<ActionChip onClick={() => onOpen({ kind: 'run', id })}>Open the run</ActionChip>}>
          {outcome}
        </ChatBubble>
      )}
    </Flow>
  );
}

/* A plan's steps are the run's own actions, read from the server (GET /runs/plan): check, branch, change,
   gate, your Accept, then specs, docs and Storybook. The answer only says what the change is. */
async function planSteps(answer) {
  const { verdict } = answer.verdict ? { verdict: answer.verdict } : shapeReply(answer.reply ?? '');
  const what = String(verdict).replace(/\*\*|\[\d+\]/g, '').replace(/\s+([.,;:!?])/g, '$1').trim();
  const r = await fetch('/runs/plan');
  if (!r.ok) throw new Error('CHIP couldn’t read what a run does');
  const { steps } = await r.json();
  return steps.map((x) => (x.id === 'change' && what ? { ...x, detail: `The agent works on the brief: ${what}` } : x));
}

/* The plan, back in the chat: one line in BELLA's bubble, the numbered steps on the panel, Later and Start on the right. */
function PlanTurn({ t, onStart, onLater }) {
  return (
    <Flow gap={12}>
      <Reply who="CHIP · no model" disc="C">
        {t.planState === 'later' ? 'Kept in Next on the Work board. Drag it into Now when you want it done.' : 'Here is the plan. Nothing runs until you press Start; Later puts it in Next.'}
      </Reply>
      <Flow as="ol" gap={0} aria-label={`The plan: ${t.plan.title}`}>
        {t.plan.steps.map((x, i) => (
          <Step key={i} layout="vertical" number={i + 1} title={x.title} detail={x.detail} state="pending" showLineAbove={i > 0} showConnector={i < t.plan.steps.length - 1} />
        ))}
      </Flow>
      {t.planState === 'open' || t.planState === 'busy' ? (
        <Flow direction="row" gap={8} justify="end">
          <Button variant="secondary" onClick={t.planState === 'busy' ? undefined : onLater}>
            Later
          </Button>
          <Button variant="primary" busy={t.planState === 'busy'} onClick={t.planState === 'busy' ? undefined : onStart}>
            {t.planState === 'busy' ? 'Starting…' : 'Start'}
          </Button>
        </Flow>
      ) : null}
    </Flow>
  );
}

/* An answer CHIP made from the Work board: no model, so it says where it came from. */
function StatusTurn({ t, last }) {
  const a = t.local;
  return (
    <Flow gap={12}>
      <Flow gap={4}>
        <ChatBubble side="sent" tail>
          {t.text}
        </ChatBubble>
        {last ? <ChatThreadDelivered>{`${t.at} · read`}</ChatThreadDelivered> : null}
      </Flow>
      {a.status === 'thinking' ? <TypingDots name="BELLA" /> : null}
      {a.status === 'answer' ? (
        <Flow gap={4}>
          <Reply who="CHIP · Work board, no model" disc="C">
            <AnswerLines shaped={{ verdict: a.verdict, bullets: a.bullets }} onPin={() => {}} />
          </Reply>
          <TextStack subtitle={a.line} />
        </Flow>
      ) : null}
      {a.status === 'error' ? <Reply who="CHIP · no model" disc="C">{`I can’t say what is being worked on: ${a.error}. Nothing is made up, so there is no answer.`}</Reply> : null}
    </Flow>
  );
}

/* One turn: her message, then BELLA's reply (or what it's doing), then the agent's run if she sent it on. */
function Turn({ turn, last, sent, onAgent, onRetry, onStop }) {
  const a = turn.answer;
  // the same sources as Ask: a pin opens its source under the reply, the sources fold under it
  const { openPin, citation, sourcesFold } = useCitations(a?.status === 'answer' ? a : null);
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
          <Flow direction="row" justify="between" align="center" gap={8}>
            <TypingDots name="BELLA" />
            {onStop ? (
              <Button variant="tertiary" size="sm" onClick={onStop}>
                Stop
              </Button>
            ) : null}
          </Flow>
          <Ticks steps={a.steps ?? []} />
        </Flow>
      ) : null}
      {a?.status === 'answer' ? (
        <Reply who={a.model ? `BELLA · ${a.model}` : 'BELLA'} disc="B" extra={!sent && !a.needsConfirm ? <ActionChip onClick={() => onAgent(turn)}>{a.needsAgent ? 'Ask an agent' : 'Send it to the agent'}</ActionChip> : null}>
          <Flow gap={12}>
            <AnswerLines shaped={shaped} onPin={openPin} />
            {a.data?.length ? <DataAnswer data={a.data} /> : null}
          </Flow>
        </Reply>
      ) : null}
      {/* who answered and why, in one line; one click answers it again on the next model (the override CHIP logs).
          Auto never runs a cloud model by itself: it says what it would use and waits for this click. */}
      {a?.status === 'answer' && a.route?.why ? (
        <Flow direction="row" gap={8} align="center" wrap>
          <TextStack subtitle={`${a.route.why}.`} />
          {!onRetry ? null : a.needsConfirm ? (
            <ActionChip onClick={() => onRetry(a.needsConfirm.provider)}>{`Run on ${a.needsConfirm.label}`}</ActionChip>
          ) : a.route.alt ? (
            <ActionChip onClick={() => onRetry(a.route.alt.id)}>{`Ask again on ${a.route.alt.label}${a.route.alt.cost === 'free' ? '' : ' (uses your plan)'}`}</ActionChip>
          ) : null}
        </Flow>
      ) : null}
      {a?.status === 'answer' && !a.data?.length ? citation : null}
      {a?.status === 'answer' && !a.data?.length ? sourcesFold : null}
      {a?.status === 'weak' || a?.status === 'error' || a?.status === 'stopped' ? <NotAnswered a={a} onRetry={onRetry} onAgent={a.plain ? () => onAgent({ ...turn, answer: { ...a, reply: `Look into this error: ${a.plain.what} ${a.plain.why}.${a.plain.file ? ` File: ${a.plain.file}.` : ''}` } }) : undefined} /> : null}
    </Flow>
  );
}

/**
 * asker: a useAsk({ thread: true }) of its own. onOpen(item): what a run opens (WorkDrawer).
 * Returns the thread and `say(text)` for the composer through the ref handed in as `sayRef`.
 */
export default function TermChat({ asker, turns, setTurns, provider, onOpen, sayRef, onNotice }) {
  // turns (her words, when, and the run she sent it to) live with the Work panel, so switching
  // tabs keeps the chat (audit 21 Nov); BELLA's answers come from asker
  const end = useRef(null);
  const answers = [...asker.past, asker.answer].filter(Boolean);
  // "Send it to the agent": the plan comes back in the chat; Start runs it, Later keeps it in Next
  const patch = (agentFor, p) => setTurns((t) => t.map((x) => (x.agentFor === agentFor && !x.run ? { ...x, ...p } : x)));
  const startRun = async (turn) => {
    const at = hhmm();
    setTurns((t) => [...t, { text: 'Send it to the agent.', at, agentFor: turn.i }]);
    try {
      const plan = { title: String(turn.answer.q).slice(0, 90), brief: briefOf(turn.answer), steps: await planSteps(turn.answer) };
      patch(turn.i, { plan, planState: 'open' });
    } catch (e) {
      patch(turn.i, { runError: `${e.message}, so there is no plan to show. Nothing ran.` });
    }
  };
  const start = async (t) => {
    patch(t.agentFor, { planState: 'busy' });
    try {
      const r = await fetch('/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: t.plan.brief, title: t.plan.title, from: 'Talk', approved: true }) });
      const run = await r.json().catch(() => ({}));
      if (!r.ok || run.error) throw new Error(run.error || 'CHIP did not answer');
      if (run.status === 'login' || run.status === 'failed') throw new Error(run.error || 'The agent could not start');
      patch(t.agentFor, { planState: 'started', run: run.id });
      window.dispatchEvent(new Event('chip:changed'));
      onNotice?.({ tone: 'success', text: `Started: ${t.plan.title.replace(/[.?!]$/, '')}. Its card is in Now on the Work board.` });
    } catch (e) {
      patch(t.agentFor, { planState: 'open', runError: `I couldn’t start: ${e.message}` });
      onNotice?.({ tone: 'danger', text: `Not started: ${e.message}` });
    }
  };
  const later = async (t) => {
    patch(t.agentFor, { planState: 'busy' });
    try {
      const r = await fetch('/work/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t.plan.title, brief: t.plan.brief, lane: 'next' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'CHIP did not save it');
      patch(t.agentFor, { planState: 'later' });
      window.dispatchEvent(new CustomEvent('chip:board', { detail: d.board }));
      onNotice?.({ tone: 'success', text: `In Next: ${t.plan.title.replace(/[.?!]$/, '')}.` });
    } catch (e) {
      patch(t.agentFor, { planState: 'open' });
      onNotice?.({ tone: 'danger', text: `Not kept: ${e.message}` });
    }
  };
  // "what is being worked on": read from the Work board, shown as CHIP's own answer
  const status = async (text) => {
    const at = hhmm();
    setTurns((t) => [...t, { text, at, local: { status: 'thinking' } }]);
    const set = (local) => setTurns((t) => t.map((x) => (x.at === at && x.text === text && x.local ? { ...x, local } : x)));
    try {
      set({ status: 'answer', ...(await workStatus()) });
    } catch (e) {
      set({ status: 'error', error: e.message });
    }
  };
  // the composer's words: "send it to the agent" sends the last answer on; anything else asks BELLA
  sayRef.current = (text) => {
    const lastAsked = turns.filter((t) => t.agentFor == null && !t.local).length - 1;
    if (SEND.test(text) && answers[lastAsked]?.status === 'answer') return startRun({ i: lastAsked, answer: answers[lastAsked] });
    if (STATUS_Q.test(text)) return status(text);
    setTurns((t) => [...t, { text, at: hhmm() }]);
    asker.ask(text, window.location.hash || '#/work', undefined, undefined, provider);
  };
  // her new message brings the chat to its foot; an answer arriving never pulls her down if she scrolled up
  // braces: newer Chromium returns a Promise from scrollIntoView, and an effect that returns
  // anything but a function crashes React when the chat unmounts (Ask BELLA, then Needs you)
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns.length]);
  // her questions pair with BELLA's answers in order; "send it to the agent" turns carry their run
  let k = -1;
  const rows = turns.map((t) => (t.agentFor == null && !t.local ? { ...t, i: ++k, answer: answers[k] } : { ...t, answer: null }));
  return (
    <Flow gap={16}>
    {/* no head of its own: the Work drawer's status line names the chat and the composer the model (one chat, one head; audit 3) */}
    <ChatThread label="BELLA and the agent">
      {rows.map((t, n) => (
        <Fragment key={n}>
        {/* each exchange under its own time (ChatThread's stamp), not one stamp for the whole chat; a turn
            in the same minute as the last shares its stamp */}
        {n === 0 || rows[n - 1].at !== t.at ? <ChatThreadTimestamp boldWord={n === 0 ? 'Today' : undefined}>{t.at}</ChatThreadTimestamp> : null}
        {t.local ? (
          <StatusTurn t={t} last={n === rows.length - 1} />
        ) : t.agentFor == null ? (
          <Turn turn={t} last={n === rows.length - 1} sent={rows.some((x) => x.agentFor === t.i)} onAgent={startRun} onRetry={n === rows.length - 1 ? (p) => asker.retry(p ?? provider) : undefined} onStop={n === rows.length - 1 ? asker.stop : undefined} />
        ) : (
          <Flow gap={12}>
            <Flow gap={4}>
              <ChatBubble side="sent" tail>
                {t.text}
              </ChatBubble>
              {n === rows.length - 1 ? <ChatThreadDelivered>{`${t.at} · read`}</ChatThreadDelivered> : null}
            </Flow>
            {t.plan ? <PlanTurn t={t} onStart={() => start(t)} onLater={() => later(t)} /> : null}
            {t.run ? <AgentRun id={t.run} onOpen={onOpen} /> : t.runError ? <ChatBubble side="received" senderName="Agent · Claude Code">{t.runError}</ChatBubble> : t.plan ? null : <TypingDots name="the agent" />}
          </Flow>
        )}
        </Fragment>
      ))}
      <span ref={end} />
    </ChatThread>
    </Flow>
  );
}
