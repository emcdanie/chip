// OBI: ask or run, on every page. One input: plain text asks, "/" opens the
// command list (POST /cmd, the same four-command allowlist, one at a time),
// Up recalls history. One thread mixes answers and command output. BELLA data
// questions are answered from data/bella.json with no model call; the rest go
// to the model with retrieval and come back with numbered citations.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Input from '@bella/components/Input/Input';
import Button from '@bella/components/Button/Button';
import Kbd from '@bella/components/Kbd/Kbd';
import Link from '@bella/components/Link/Link';
import Tag from '@bella/components/Tag/Tag';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import DataTable from '@bella/components/DataTable/DataTable';
import { answerFromData, clarify, componentsIn, tokensIn, suggestionsFor } from './answers.js';

const COMMANDS = [
  { cmd: 'status', note: 'model, index size, last sync' },
  { cmd: 'audit', note: 'sync BELLA, scores and failures' },
  { cmd: 'sync', note: 'BELLA and Notion, then re-index' },
  { cmd: 'ask', note: 'ask through the terminal path' },
];

/* ---------- streams ---------- */
async function* lines(res) {
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
      if (line) yield JSON.parse(line);
    }
  }
}

/* ---------- answer text: paragraphs, bullets, bold, [n] citations ---------- */
function Cite({ n, source }) {
  if (!source) return <span>[{n}]</span>;
  const href = source.url ?? `/source?path=${encodeURIComponent(source.path)}`;
  return (
    <span className="cite">
      <Link href={href} external>
        [{n}]<span className="sr-only"> {source.title}</span>
      </Link>
      <span className="cite-card" aria-hidden="true">
        <b>{source.title}</b>
        <span>{source.passage}</span>
      </span>
    </span>
  );
}

function inline(text, sources, key) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\[\d+\])/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<b key={`${key}-${m.index}`}>{t.slice(2, -2)}</b>);
    else {
      const n = +t.slice(1, -1);
      out.push(<Cite key={`${key}-${m.index}`} n={n} source={sources.find((s) => s.n === n)} />);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Rich({ text, sources }) {
  const blocks = [];
  let list = null;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (/^[-*] /.test(line)) {
      list ??= [];
      list.push(<li key={i}>{inline(line.slice(2), sources, i)}</li>);
      return;
    }
    if (list) {
      blocks.push(<ul key={`u${i}`}>{list}</ul>);
      list = null;
    }
    if (line) blocks.push(<p key={i}>{inline(line.replace(/^#+\s*/, ''), sources, i)}</p>);
  });
  if (list) blocks.push(<ul key="u-end">{list}</ul>);
  return <div className="obi-rich">{blocks}</div>;
}

/* ---------- one turn ---------- */
function proposalOf(t) {
  const body = t.data
    ? [t.data.title, '', ...t.data.rows.map((r) => `- ${Object.values(r).join(' · ')}`)].join('\n')
    : t.text;
  const src = (t.sources ?? []).map((s) => `[${s.n}] ${s.title} · ${s.url ?? s.path}`);
  return [`## ${t.q}`, '', `${t.path === 'data' ? 'From BELLA data' : 'From your docs'} (${t.page ?? 'CHIP'})`, '', body, '', ...(src.length ? ['Sources:', ...src] : [])].join('\n');
}

function AskTurn({ t, bella, model, onOpenAtlas, onSandbox, onSave, notify }) {
  const names = t.components ?? [];
  const tokens = tokensIn(t.text ?? '') ;
  const target = names[0] ?? t.page?.match(/^Atlas · (\w+)$/)?.[1];
  const sandboxable = target && (tokens.length || t.data) && bella?.components.find((c) => c.name === target)?.sandbox;
  async function copy() {
    try {
      await navigator.clipboard.writeText(proposalOf(t));
      notify('Copied the answer as a proposal');
    } catch {
      notify('Could not copy');
    }
  }
  const done = t.path !== 'docs' || t.total != null;
  return (
    <li className="turn turn-ask">
      <p className="turn-q">{t.q}</p>
      {t.path === 'clarify' ? (
        <p className="turn-a">{t.text}</p>
      ) : t.path === 'error' ? (
        <p className="turn-a" role="alert">
          {t.text}
        </p>
      ) : t.path === 'weak' ? (
        <div className="turn-a">
          <p>I couldn't find this in your sources. The closest three:</p>
          <ul className="closest">
            {t.closest.map((s) => (
              <li key={s.n}>
                <Link href={s.url ?? `/source?path=${encodeURIComponent(s.path)}`} external>
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : t.path === 'data' ? (
        <div className="turn-a">
          <p className="turn-via">From BELLA data</p>
          <DataTable
            columns={t.data.columns}
            rows={t.data.rows}
            rowKey={t.data.rowKey}
            caption={t.data.title}
            maxHeight="calc(var(--spacing-20) * 3)"
          />
          <p className="meta">data/bella.json, synced from BELLA @ {bella?.source.commit}. No model call.</p>
        </div>
      ) : (
        <div className="turn-a" aria-busy={!done}>
          <p className="turn-via">From your docs · {model}</p>
          {t.text ? <Rich text={t.text} sources={t.sources} /> : <p className="meta">Reading your sources…</p>}
        </div>
      )}

      {done && names.length ? (
        <div className="turn-chips" aria-label="Components in this answer">
          {names.map((n) => (
            <Button key={n} variant="secondary" shape="pill" onClick={() => onOpenAtlas(n)}>
              {n}
            </Button>
          ))}
        </div>
      ) : null}

      {done && (t.path === 'data' || t.path === 'docs') ? (
        <div className="turn-actions">
          {sandboxable ? (
            <Button variant="tertiary" onClick={() => onSandbox(target)}>
              Try in sandbox
            </Button>
          ) : null}
          <Button variant="tertiary" onClick={copy}>
            Copy as proposal
          </Button>
          {target ? (
            <Button variant="tertiary" onClick={() => onSave(target, t)}>
              Save to {target} notes
            </Button>
          ) : null}
        </div>
      ) : null}

      {t.path === 'docs' && t.total != null ? (
        <details className="turn-details">
          <summary>Details</summary>
          <p className="meta">
            First words {t.first?.toFixed(1) ?? '–'} s · total {t.total.toFixed(1)} s · best match {t.top?.toFixed(2)}
          </p>
        </details>
      ) : null}
    </li>
  );
}

function CmdTurn({ t }) {
  const gates = [...(t.text.matchAll(/^\s*([a-z:-]+)\s+(OK|FAIL)\s*$/gm) ?? [])];
  return (
    <li className="turn turn-cmd">
      <p className="turn-q">
        <span className="mono">$ chip {t.cmd}{t.arg ? ` "${t.arg}"` : ''}</span>
        {t.exit == null ? (
          <StatusPill variant="info">running</StatusPill>
        ) : (
          <StatusPill variant={t.exit === 0 ? 'success' : 'info'}>{t.exit === 0 ? 'pass' : `fail (exit ${t.exit})`}</StatusPill>
        )}
      </p>
      {gates.length ? (
        <p className="turn-gates">
          {gates.map((g) => (
            <span key={g[1]} className="gate">
              <span className="mono">{g[1]}</span>
              <StatusPill variant={g[2] === 'OK' ? 'success' : 'info'}>{g[2] === 'OK' ? 'pass' : 'fail'}</StatusPill>
            </span>
          ))}
        </p>
      ) : null}
      <pre className="turn-out" tabIndex={0} aria-label={`Output of chip ${t.cmd}`}>
        {t.text || ' '}
      </pre>
    </li>
  );
}

/* ---------- the panel ---------- */
// The thread outlives the panel: the drawer unmounts its content when it
// closes, and the panel moves between dock and drawer at 1024px.
const memory = { turns: [], history: [], session: null };
export default function Obi({ bella, health, page, queued, onOpenAtlas, onSandbox, onSaved, onClose, notify, inDrawer }) {
  const [turns, setTurns] = useState(memory.turns);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const history = useRef(memory.history);
  const histAt = useRef(-1);
  const session = useRef(memory.session);
  const thread = useRef(null);
  const handled = useRef(null);
  const model = health?.model ?? 'the local model';

  const suggestions = useMemo(() => suggestionsFor(page, bella), [page, bella]);
  const slash = input.startsWith('/') && !input.includes(' ');
  const matches = slash ? COMMANDS.filter((c) => `/${c.cmd}`.startsWith(input)) : [];

  useEffect(() => {
    memory.turns = turns;
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [turns]);
  useEffect(() => () => {
    memory.history = history.current;
    memory.session = session.current;
  }, []);
  useEffect(() => setActive(0), [input]);
  useEffect(() => {
    if (queued && handled.current !== queued.at) {
      handled.current = queued.at;
      send(queued.text);
    }
  });

  const patch = (id, fn) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...fn(t) } : t)));

  async function ask(q) {
    const id = Date.now() + Math.random();
    const base = { id, kind: 'ask', q, page };
    const c = clarify(q, turns, page);
    if (c) return setTurns((ts) => [...ts, { ...base, path: 'clarify', text: c }]);
    const data = answerFromData(q, bella, page);
    if (data) return setTurns((ts) => [...ts, { ...base, path: 'data', data, components: data.components }]);

    setTurns((ts) => [...ts, { ...base, path: 'docs', text: '', sources: [] }]);
    setBusy(true);
    const t0 = performance.now();
    try {
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: q, sessionId: session.current, page, stream: true }),
      });
      if (!res.ok) throw new Error(`The CHIP server answered ${res.status}`);
      for await (const ev of lines(res)) {
        if (ev.type === 'error') throw new Error(ev.error);
        session.current = ev.sessionId ?? session.current;
        if (ev.type === 'weak') patch(id, () => ({ path: 'weak', closest: ev.closest, top: ev.top }));
        if (ev.type === 'sources') patch(id, () => ({ sources: ev.sources, top: ev.top }));
        if (ev.type === 'token') patch(id, (t) => ({ text: t.text + ev.text, first: t.first ?? (performance.now() - t0) / 1000 }));
        if (ev.type === 'done') {
          patch(id, (t) => ({ total: (performance.now() - t0) / 1000, components: componentsIn(t.text, bella) }));
        }
      }
    } catch (err) {
      patch(id, () => ({ path: 'error', text: /fetch/i.test(err.message) ? 'The CHIP server is not answering on 127.0.0.1:3000. Start it with npm start.' : err.message }));
    } finally {
      setBusy(false);
    }
  }

  async function run(cmd, arg) {
    const id = Date.now() + Math.random();
    setTurns((ts) => [...ts, { id, kind: 'cmd', cmd, arg, text: '', exit: null }]);
    setBusy(true);
    try {
      const res = await fetch('/cmd', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(arg ? { cmd, question: arg } : { cmd }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        patch(id, () => ({ text: `chip: ${err.error ?? `server answered ${res.status}`}`, exit: 1 }));
        return;
      }
      const dec = new TextDecoder();
      let text = '';
      for await (const part of res.body) {
        text += dec.decode(part, { stream: true });
        const shown = text.replace(/\n\[exit [^\]]+\]\n?$/, '');
        patch(id, () => ({ text: shown }));
      }
      const m = text.match(/\[exit (\S+)\]\s*$/);
      patch(id, () => ({ exit: m ? (Number.isNaN(+m[1]) ? 1 : +m[1]) : 1 }));
    } catch {
      patch(id, () => ({ text: 'chip: the CHIP server is not answering on 127.0.0.1:3000.', exit: 1 }));
    } finally {
      setBusy(false);
    }
  }

  function send(raw) {
    const text = raw.trim();
    if (!text || busy) return;
    history.current = [...history.current.filter((h) => h !== text), text];
    histAt.current = -1;
    setInput('');
    if (text.startsWith('/')) {
      const [word, ...rest] = text.slice(1).split(' ');
      const arg = rest.join(' ').trim();
      if (word === 'ask') return arg ? ask(arg) : setInput('/ask ');
      if (COMMANDS.some((c) => c.cmd === word)) return run(word);
      return setTurns((ts) => [...ts, { id: Date.now(), kind: 'ask', q: text, path: 'error', text: `Unknown command. Try ${COMMANDS.map((c) => '/' + c.cmd).join(', ')}.` }]);
    }
    return ask(text);
  }

  function pick(c) {
    if (c.cmd === 'ask') setInput('/ask ');
    else send(`/${c.cmd}`);
    requestAnimationFrame(() => document.getElementById('obi-input')?.focus());
  }

  function onKeyDown(e) {
    if (matches.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
    } else if (matches.length && e.key === 'Enter') {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === 'ArrowUp' && !input && history.current.length) {
      e.preventDefault();
      histAt.current = histAt.current < 0 ? history.current.length - 1 : Math.max(0, histAt.current - 1);
      setInput(history.current[histAt.current]);
    } else if (e.key === 'ArrowDown' && histAt.current >= 0) {
      e.preventDefault();
      histAt.current += 1;
      if (histAt.current >= history.current.length) {
        histAt.current = -1;
        setInput('');
      } else setInput(history.current[histAt.current]);
    }
  }

  async function save(component, t) {
    const text = t.data ? [t.data.title, ...t.data.rows.map((r) => Object.values(r).join(' · '))].join('\n') : t.text;
    try {
      const res = await fetch('/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ component, text, question: t.q }),
      });
      if (!res.ok) throw new Error();
      notify(`Saved to ${component} notes`);
      onSaved();
    } catch {
      notify('Could not save the note');
    }
  }

  return (
    <section className="obi" aria-labelledby="obi-h">
      <header className="obi-head">
        <div>
          {/* in the drawer, the drawer's own title names the panel */}
          <h2 id="obi-h" className={inDrawer ? 'sr-only' : 'obi-title'}>
            OBI
          </h2>
          <p className="meta">ask or run</p>
        </div>
        {onClose ? (
          <Button variant="tertiary" onClick={onClose} ariaLabel="Close OBI">
            Close <Kbd keys={['⌘', 'J']} label="Command J" />
          </Button>
        ) : null}
      </header>

      <div className="obi-context">
        <span className="meta">Looking at</span>
        <Tag>{page}</Tag>
      </div>

      {suggestions.length ? (
        <div className="obi-suggest" aria-label="Suggested questions">
          {suggestions.map((s) => (
            <Button key={s} variant="secondary" shape="pill" onClick={() => send(s)} disabled={busy}>
              {s}
            </Button>
          ))}
        </div>
      ) : null}

      <ol className="obi-thread" ref={thread} aria-live="polite" aria-label="OBI thread">
        {turns.length === 0 ? <li className="meta obi-empty">Ask a question, or type / for a command.</li> : null}
        {turns.map((t) =>
          t.kind === 'cmd' ? (
            <CmdTurn key={t.id} t={t} />
          ) : (
            <AskTurn key={t.id} t={t} bella={bella} model={model} onOpenAtlas={onOpenAtlas} onSandbox={onSandbox} onSave={save} notify={notify} />
          )
        )}
      </ol>

      <form
        className="obi-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        onKeyDown={onKeyDown}
      >
        {matches.length ? (
          <ul className="obi-commands" aria-label="Commands">
            {matches.map((c, i) => (
              <li key={c.cmd} data-active={i === active || undefined}>
                <Button variant="tertiary" onClick={() => pick(c)}>
                  /{c.cmd}
                </Button>
                <span className="meta">{c.note}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <Input id="obi-input" label="Ask or run" value={input} onChange={setInput} placeholder="Ask, or / for a command" autoComplete="off" />
      </form>

      <p className="obi-status">
        <span>{health ? health.model : 'model offline'}</span>
        <span>{health ? `${health.chunks.toLocaleString('en')} chunks` : 'no index'}</span>
        <span>BELLA @ {bella?.source.commit ?? '…'}</span>
      </p>
    </section>
  );
}
