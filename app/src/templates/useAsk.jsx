// Ask, one way for every page (Components' Ask BELLA, History's record): the
// question goes to CHIP's /ask as a stream, local model first (Auto), and the
// page shows the work as it happens, her tick list ("thinking is her sheet's
// tick list", 20 Nov): read BELLA's docs, then write the answer, each a BELLA
// Step that ticks when its stream event arrives. The answer streams in; an
// error is a plain sentence, never the server's words.
import { useRef, useState } from 'react';
import Notification from '@bella/components/Notification/Notification';
import Step from '@bella/components/Step/Step';
import Pin from '@bella/components/Pin/Pin';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Flow from './Flow.jsx';

/* The server's error, in words a reader can act on. */
function plainError(message = '') {
  if (/no index/i.test(message)) return "BELLA's docs aren't indexed on this Mac yet, so there's nothing to answer from. Run chip sync once, then ask again.";
  if (/ECONNREFUSED|fetch failed|11434|ollama/i.test(message)) return "The local model isn't running. Start Ollama, then ask again.";
  if (/not signed in|login/i.test(message)) return 'Claude Code is not signed in on this Mac. Sign in, then ask again.';
  return "The answer didn't come back. Try again in a moment.";
}

// what it reads: BELLA's docs, or only the change being asked about (History)
const ticks = (read, write, reading) => [
  { title: reading, state: read },
  { title: 'Writing the answer', state: write },
];

/** ask(message, page, record?) streams an answer (record: { id, title, text }, the thing asked about, read as a source); `answer` is { steps, reply, error, done } or null. */
export default function useAsk() {
  const [answer, setAnswer] = useState(null);
  const turn = useRef(0);
  const ask = async (message, page, record) => {
    const mine = ++turn.current;
    const reading = record ? 'Reading this change' : "Reading BELLA's docs";
    const tk = (r, w) => ticks(r, w, reading);
    const set = (a) => mine === turn.current && setAnswer(a);
    let reply = '';
    set({ steps: tk('current', 'pending'), reply: '' });
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
          if (ev.type === 'sources' || ev.type === 'provider') set({ steps: tk('done', 'current'), reply });
          else if (ev.type === 'token') {
            reply += ev.text;
            set({ steps: tk('done', 'current'), reply });
          } else if (ev.type === 'done') set({ steps: tk('done', 'done'), reply: ev.reply || reply, done: true });
          else if (ev.type === 'weak') {
            const near = (ev.closest ?? []).map((s) => s.title).filter(Boolean);
            set({ steps: tk('done', 'done'), reply: `Nothing in BELLA's docs is close enough to answer that.${near.length ? ` Nearest: ${near.join('; ')}.` : ''} Try asking it another way.`, done: true });
          } else if (ev.type === 'error') throw new Error(ev.error);
        }
      }
    } catch (e) {
      set({ steps: null, reply: plainError(e.message), error: true, done: true });
    }
  };
  return { answer, ask, clear: () => (turn.current++, setAnswer(null)) };
}

/* An answer's words as she reads them: **key phrase** bold, [n] as her pink pin, no code ticks. */
function Words({ text }) {
  return String(text)
    .replace(/`/g, '')
    .split(/(\*\*[^*]+\*\*|\[\d+\])/)
    .filter(Boolean)
    .map((bit, i) =>
      /^\*\*/.test(bit) ? (
        <strong key={i}>{bit.slice(2, -2)}</strong>
      ) : /^\[\d+\]$/.test(bit) ? (
        <Pin key={i} number={bit.slice(1, -1)} variant="pink" ariaLabel={`Source ${bit.slice(1, -1)}`} />
      ) : (
        bit
      ),
    );
}

/* Verdict first, detail folded (her rule: a verdict line with the bold key phrase, at most 3 bullets, detail closed until asked). */
function Answer({ reply }) {
  const lines = String(reply).split('\n').map((l) => l.trim()).filter(Boolean);
  // the verdict is the first sentence only; any other sentence joins the detail, ahead of the bullets
  const prose = lines.filter((l) => !/^[-*•]\s/.test(l)).join(' ');
  const [first = '', ...more] = prose.split(/(?<=[.!?](?:\s*\[\d+\])*)\s+(?=[A-Z])/);
  const bullets = [...more, ...lines.filter((l) => /^[-*•]\s/.test(l)).map((l) => l.replace(/^[-*•]\s+/, ''))].slice(0, 3);
  // one key phrase in bold, never the whole line: the first bold span, and none when it covers most of the sentence
  const bold = first.match(/\*\*([^*]+)\*\*/);
  const plainFirst = first.replace(/\*\*/g, '');
  const verdict = bold && bold[1].length < plainFirst.length * 0.6 ? plainFirst.replace(bold[1], `**${bold[1]}**`) : plainFirst;
  return (
    <Flow gap={8}>
      <span>
        <Words text={verdict} />
      </span>
      {bullets.length ? (
        <Disclosure flush title="Detail">
          <Flow as="ul" gap={4}>
            {bullets.map((b) => (
              <li key={b}>
                <Words text={b} />
              </li>
            ))}
          </Flow>
        </Disclosure>
      ) : null}
    </Flow>
  );
}

/** The tick list while it works, then the answer: no label on an answer, "No answer" on an error. */
export function AskAnswer({ answer }) {
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
      {answer.reply ? (
        <Notification tone={answer.error ? 'danger' : 'info'} showIcon={false} title={answer.error ? 'No answer' : undefined} message={answer.error ? answer.reply : <Answer reply={answer.reply} />} />
      ) : null}
    </Flow>
  );
}
