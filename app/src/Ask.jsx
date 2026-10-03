import React, { useEffect, useRef, useState } from 'react';
import Card from '@bella/components/Card/Card';
import Heading from '@bella/components/Heading/Heading';
import Input from '@bella/components/Input/Input';
import Button from '@bella/components/Button/Button';
import Link from '@bella/components/Link/Link';
import Tag from '@bella/components/Tag/Tag';

// POST /ask with stream: true answers in NDJSON: { type: 'sources' },
// then { type: 'token', text } pieces, then { type: 'done' } or { type: 'error' }.
async function* askStream(message, sessionId) {
  const res = await fetch('/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, sessionId, stream: true }),
  });
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line);
      if (ev.type === 'error') throw new Error(ev.error);
      yield ev;
    }
  }
}

export default function Ask({ pending }) {
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState([]);
  const [busy, setBusy] = useState(false);
  const session = useRef(null);
  const handled = useRef(null);

  async function run(q) {
    const id = Date.now();
    setBusy(true);
    setAnswers((a) => [{ id, q, text: '', sources: [], first: null, total: null, error: null }, ...a]);
    const patch = (p) => setAnswers((a) => a.map((x) => (x.id === id ? { ...x, ...p(x) } : x)));
    const t = performance.now();
    try {
      for await (const ev of askStream(q, session.current)) {
        if (ev.type === 'sources') patch(() => ({ sources: ev.sources }));
        if (ev.type === 'token')
          patch((x) => ({ text: x.text + ev.text, first: x.first ?? (performance.now() - t) / 1000 }));
        if (ev.type === 'done') {
          session.current = ev.sessionId ?? session.current;
          patch(() => ({ sources: ev.sources ?? [], total: (performance.now() - t) / 1000 }));
        }
      }
    } catch (err) {
      patch(() => ({ error: err.message }));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (pending && handled.current !== pending.at) {
      handled.current = pending.at;
      run(pending.q);
    }
  }, [pending]);

  function submit(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion('');
    run(q);
  }

  return (
    <div className="view">
      <section id="ask-form" aria-labelledby="ask-h" className="block">
        <Heading tier="section" as="h1" id="ask-h">
          Ask CHIP
        </Heading>
        <p className="block-lead">
          Answers come from your synced sources (BELLA, Notion, docs) with the local model. Nothing leaves this
          machine.
        </p>
        <form className="ask-form" onSubmit={submit}>
          <Input label="Your question" multiline value={question} onChange={setQuestion} />
          <div className="ask-actions">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Answering…' : 'Ask'}
            </Button>
          </div>
        </form>
      </section>

      <section id="answers" aria-labelledby="answers-h" className="block">
        <h2 id="answers-h" className="block-title">This session</h2>
        {answers.length === 0 ? <p className="block-lead">No questions yet.</p> : null}
        <ol className="answers">
          {answers.map((a) => (
            <li key={a.id}>
              <Card>
                <article className="answer" aria-busy={a.total === null && !a.error}>
                  <h3 className="answer-q">{a.q}</h3>
                  {a.error ? (
                    <p className="answer-error" role="alert">
                      {a.error}
                    </p>
                  ) : (
                    <p className="answer-text" aria-live="polite">
                      {a.text || 'Reading your sources…'}
                    </p>
                  )}
                  {a.sources.length ? (
                    <div className="answer-sources">
                      <p className="meta">Sources</p>
                      <ul>
                        {a.sources.map((s) => (
                          <li key={(s.url || s.path) + s.title}>
                            {s.url ? (
                              <Link href={s.url} external>
                                {s.title}
                              </Link>
                            ) : (
                              <>
                                {s.title} <Tag>{s.path}</Tag>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {a.total !== null ? (
                    <p className="meta">
                      First words {a.first?.toFixed(1) ?? 'n/a'} s · total {a.total.toFixed(1)} s
                    </p>
                  ) : null}
                </article>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
