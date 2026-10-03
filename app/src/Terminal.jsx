// Terminal: the four chip commands, run by the local server (POST /cmd) and
// streamed here as they print. No shell: the server only knows these four.
import React, { useEffect, useRef, useState } from 'react';
import Heading from '@bella/components/Heading/Heading';
import Eyebrow from '@bella/components/Eyebrow/Eyebrow';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import StatusPill from '@bella/components/StatusPill/StatusPill';

const COMMANDS = [
  { cmd: 'status', note: 'model, index size, last sync' },
  { cmd: 'audit', note: 'sync BELLA, station scores and failures' },
  { cmd: 'sync', note: 'sync BELLA and Notion, then re-index' },
];

export default function Terminal() {
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(null);
  const [question, setQuestion] = useState('');
  const out = useRef(null);

  useEffect(() => {
    if (out.current) out.current.scrollTop = out.current.scrollHeight;
  }, [log]);

  async function run(cmd, q) {
    if (busy) return;
    const line = cmd === 'ask' ? `chip ask "${q}"` : `chip ${cmd}`;
    setBusy(cmd);
    setLog((l) => [...l, { line, text: '' }]);
    const append = (t) =>
      setLog((l) => {
        const next = [...l];
        next[next.length - 1] = { ...next[next.length - 1], text: next[next.length - 1].text + t };
        return next;
      });
    try {
      const res = await fetch('/cmd', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cmd === 'ask' ? { cmd, question: q } : { cmd }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        append(`chip: ${err.error ?? `server answered ${res.status}`}\n`);
      } else {
        const dec = new TextDecoder();
        for await (const part of res.body) append(dec.decode(part, { stream: true }));
      }
    } catch {
      append('chip: the CHIP server is not answering on 127.0.0.1:3000. Start it with npm start.\n');
    } finally {
      setBusy(null);
    }
  }

  function ask(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    run('ask', q);
    setQuestion('');
  }

  return (
    <div className="view terminal">
      <header className="spec-head">
        <Eyebrow>Terminal</Eyebrow>
        <Heading tier="section" as="h1">
          chip, from here
        </Heading>
        <p className="block-lead">The same four commands as the terminal. The local server runs them; nothing else is allowed.</p>
      </header>

      <div className="term-controls">
        {COMMANDS.map(({ cmd, note }) => (
          <div key={cmd} className="term-cmd">
            <Button variant="secondary" onClick={() => run(cmd)} disabled={Boolean(busy)}>
              chip {cmd}
            </Button>
            <p className="meta">{note}</p>
          </div>
        ))}
        <form className="term-ask" onSubmit={ask}>
          <Input
            label="chip ask"
            value={question}
            onChange={setQuestion}
            placeholder="Which BELLA components have no story?"
            autoComplete="off"
          />
          <Button type="submit" variant="secondary" disabled={Boolean(busy) || !question.trim()}>
            Run ask
          </Button>
        </form>
      </div>

      <div className="term-status">
        {busy ? <StatusPill variant="info">running chip {busy}</StatusPill> : <StatusPill variant="success">ready</StatusPill>}
      </div>

      <pre className="term-out" ref={out} role="log" aria-live="polite" aria-label="Command output" tabIndex={0}>
        {log.length
          ? log.map((e, i) => (
              <React.Fragment key={i}>
                <span className="term-prompt">$ {e.line}</span>
                {'\n'}
                {e.text}
                {'\n'}
              </React.Fragment>
            ))
          : 'No commands run yet.'}
      </pre>
    </div>
  );
}
