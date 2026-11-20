// Ask, one way for every page (Components' Ask BELLA, History's record): the
// question goes to CHIP's /ask as a stream, local model first (Auto), and the
// page shows the work as it happens, her tick list ("thinking is her sheet's
// tick list", 20 Nov): read BELLA's docs, then write the answer, each a BELLA
// Step that ticks when its stream event arrives. The answer streams in; an
// error is a plain sentence, never the server's words.
import { useRef, useState } from 'react';
import Notification from '@bella/components/Notification/Notification';
import Step from '@bella/components/Step/Step';
import Flow from './Flow.jsx';

/* The server's error, in words a reader can act on. */
function plainError(message = '') {
  if (/no index/i.test(message)) return "BELLA's docs aren't indexed on this Mac yet, so there's nothing to answer from. Run chip sync once, then ask again.";
  if (/ECONNREFUSED|fetch failed|11434|ollama/i.test(message)) return "The local model isn't running. Start Ollama, then ask again.";
  if (/not signed in|login/i.test(message)) return 'Claude Code is not signed in on this Mac. Sign in, then ask again.';
  return "The answer didn't come back. Try again in a moment.";
}

const ticks = (read, write) => [
  { title: "Reading BELLA's docs", state: read },
  { title: 'Writing the answer', state: write },
];

/** ask(message, page, record?) streams an answer (record: { id, title, text }, the thing asked about, read as a source); `answer` is { steps, reply, error, done } or null. */
export default function useAsk() {
  const [answer, setAnswer] = useState(null);
  const turn = useRef(0);
  const ask = async (message, page, record) => {
    const mine = ++turn.current;
    const set = (a) => mine === turn.current && setAnswer(a);
    let reply = '';
    set({ steps: ticks('current', 'pending'), reply: '' });
    try {
      const r = await fetch('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, page, auto: true, stream: true, record }) });
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
          if (ev.type === 'sources' || ev.type === 'provider') set({ steps: ticks('done', 'current'), reply });
          else if (ev.type === 'token') {
            reply += ev.text;
            set({ steps: ticks('done', 'current'), reply });
          } else if (ev.type === 'done') set({ steps: ticks('done', 'done'), reply: ev.reply || reply, done: true });
          else if (ev.type === 'weak') {
            const near = (ev.closest ?? []).map((s) => s.title).filter(Boolean);
            set({ steps: ticks('done', 'done'), reply: `Nothing in BELLA's docs is close enough to answer that.${near.length ? ` Nearest: ${near.join('; ')}.` : ''} Try asking it another way.`, done: true });
          } else if (ev.type === 'error') throw new Error(ev.error);
        }
      }
    } catch (e) {
      set({ steps: null, reply: plainError(e.message), error: true, done: true });
    }
  };
  return { answer, ask, clear: () => (turn.current++, setAnswer(null)) };
}

/** The tick list while it works, then the answer. `who` titles the answer. */
export function AskAnswer({ answer, who }) {
  if (!answer) return null;
  return (
    <Flow gap={8} aria-live="polite">
      {answer.steps && !answer.done ? (
        <Flow as="ol" gap={4} aria-label="What the agent is doing">
          {answer.steps.map((s, i) => (
            <li key={s.title}>
              <Step title={s.title} state={s.state} showConnector={i < answer.steps.length - 1} />
            </li>
          ))}
        </Flow>
      ) : null}
      {answer.reply ? <Notification tone={answer.error ? 'danger' : 'info'} showIcon={false} title={answer.error ? 'No answer' : who} message={answer.reply} /> : null}
    </Flow>
  );
}
