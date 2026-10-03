// OBI: ask or run. useObi holds the thread and the two paths (BELLA data
// questions answered from data/bella.json with no model call; the rest
// retrieved and sent to the model, back with numbered citations) and the
// four commands (POST /cmd, one at a time). OneInput is CHIP's only field;
// ObiPanel shows the thread and floats over the right edge.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Kbd from '@bella/components/Kbd/Kbd';
import Link from '@bella/components/Link/Link';
import Tag from '@bella/components/Tag/Tag';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import DataTable from '@bella/components/DataTable/DataTable';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Combobox from '@bella/components/Combobox/Combobox';
import { answerFromData, clarify, componentsIn, tokensIn, suggestionsFor, routeFor, soundsUnsure, tidyCitations, isMiss } from './answers.js';
import Select from '@bella/components/Select/Select';

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
// a data row as text: only the columns the table shows
const rowText = (data, r) => data.columns.map((c) => r[c.key]).join(' · ');

function proposalOf(t) {
  const body = t.data ? [t.data.title, '', ...t.data.rows.map((r) => `- ${rowText(t.data, r)}`)].join('\n') : tidyCitations(t.text);
  const src = (t.sources ?? []).map((s) => `[${s.n}] ${s.title} · ${s.url ?? s.path}`);
  return [`## ${t.q}`, '', `${t.path === 'data' ? 'From BELLA data' : 'From your docs'} (${t.page ?? 'CHIP'})`, '', body, '', ...(src.length ? ['Sources:', ...src] : [])].join('\n');
}

// a miss is honest and useful: what was searched, and the three nearest sources with their scores
function Closest({ sources }) {
  return (
    <ul className="closest">
      {sources.slice(0, 3).map((s) => (
        <li key={s.n}>
          <Link href={s.url ?? `/source?path=${encodeURIComponent(s.path)}`} external>
            {s.title}
          </Link>{' '}
          <span className="label">match {s.score?.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}

function AskTurn({ t, bella, page, claudeOk, budget, onOpenAtlas, onSandbox, onSave, onCompare, onIncludePrivate, notify }) {
  // no chip for the component you are already looking at
  const here = page?.match(/^Atlas · (\w+)$/)?.[1];
  const names = (t.components ?? []).filter((n) => n !== here);
  const tokens = tokensIn(t.text ?? '') ;
  const target = (t.components ?? [])[0] ?? t.page?.match(/^Atlas · (\w+)$/)?.[1];
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
          {t.compareTo ? <p className="turn-via">The same question, asked of Claude.</p> : null}
          {t.route ? <p className="turn-via">{t.route}</p> : null}
          {t.heldBack ? (
            <p className="turn-note">
              {t.heldBack} Notion source{t.heldBack === 1 ? ' was' : 's were'} held back: private sources are not sent to Anthropic.{' '}
              <ActionChip onClick={() => onIncludePrivate(t)}>Include them this session</ActionChip>
            </p>
          ) : null}
          <p>I couldn't find this in {t.heldBack ? 'the sources that may go to the cloud' : 'your sources'}. The closest three:</p>
          <Closest sources={t.closest} />
        </div>
      ) : t.path === 'data' ? (
        <div className="turn-a">
          <p className="turn-via">{t.route ?? 'From BELLA data'}</p>
          <p className="turn-lead">{t.data.title}</p>
          <DataTable
            columns={t.data.columns}
            rows={t.data.rows}
            rowKey={t.data.rowKey}
            caption={t.data.caption ?? 'Results'}
            maxHeight="calc(var(--spacing-20) * 6)"
          />
          <p className="meta">data/bella.json, synced from BELLA @ {bella?.source.commit}. No model call.</p>
        </div>
      ) : (
        <div className="turn-a" aria-busy={!done}>
          {t.compareTo ? <p className="turn-via">The same question, asked of Claude. Compare it with the answer above.</p> : null}
          {t.route ? <p className="turn-via">{t.route}</p> : null}
          <p className="turn-via">
            {t.model ? `Answered by ${t.model} · ${t.place === 'cloud' ? 'cloud' : 'local'}` : 'From your docs'}
          </p>
          {t.fallback ? <p className="turn-note">Claude could not answer ({t.fallback}). The local model answered instead.</p> : null}
          {t.heldBack ? (
            <p className="turn-note">
              {t.heldBack} Notion source{t.heldBack === 1 ? ' was' : 's were'} held back: private sources are not sent to Anthropic.{' '}
              <ActionChip onClick={() => onIncludePrivate(t)}>Include them this session</ActionChip>
            </p>
          ) : null}
          {done && isMiss(t.text) ? (
            <>
              <p>I couldn't find this in your sources. The closest three:</p>
              <Closest sources={t.sources} />
            </>
          ) : t.text ? (
            <Rich text={tidyCitations(t.text)} sources={t.sources} />
          ) : (
            <p className="meta">Reading your sources…</p>
          )}
          {t.cutOff ? <p className="turn-note">This answer stopped part way ({t.cutOff}).</p> : null}
          {done && t.place === 'local' && claudeOk && soundsUnsure(t.text) ? (
            <p className="turn-escalate">
              This looks hard for the local model. <ActionChip onClick={() => onCompare(t)}>Ask Claude</ActionChip>
            </p>
          ) : null}
        </div>
      )}

      {done && names.length ? (
        <div className="turn-chips" aria-label="Components in this answer">
          {names.map((n) => (
            <ActionChip key={n} onClick={() => onOpenAtlas(n)}>
              Open {n} in Atlas
            </ActionChip>
          ))}
        </div>
      ) : null}

      {done && (t.path === 'data' || (t.path === 'docs' && t.text && !isMiss(t.text))) ? (
        <div className="turn-actions">
          {t.path === 'docs' && t.place === 'local' && claudeOk && !soundsUnsure(t.text) ? (
            <ActionChip onClick={() => onCompare(t)}>Ask Claude instead</ActionChip>
          ) : null}
          {sandboxable ? <ActionChip onClick={() => onSandbox(target)}>Try in sandbox</ActionChip> : null}
          <ActionChip onClick={copy}>Copy as proposal</ActionChip>
          {target ? <ActionChip onClick={() => onSave(target, t)}>Save to {target} notes</ActionChip> : null}
        </div>
      ) : null}

      {t.path === 'docs' && t.total != null ? (
        <details className="turn-details">
          <summary>Details</summary>
          <p className="meta">
            First words {t.first?.toFixed(1) ?? '–'} s · total {t.total.toFixed(1)} s · best match {t.top?.toFixed(2)}
          </p>
          {claudeOk && budget ? (
            <p className="meta">
              Auto sent {budget.used} of {budget.limit} questions to Claude today.
              {/* TODO(04 context savings): add "≈ tokens kept local today" once 04's ledger exists */}
            </p>
          ) : null}
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

/* ---------- the thread and the two paths ---------- */
export function useObi({ bella, page, notify, onSaved, models = [], budget, picked = 'auto', onAnswered }) {
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const session = useRef(null);
  const history = useRef([]);
  const includePrivate = useRef(false); // once per session, on her yes
  const auto = picked === 'auto';
  const patch = (id, fn) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...fn(t) } : t)));

  // opts.provider forces a brain (slash override, Ask Claude instead)
  async function ask(q, opts = {}) {
    const id = Date.now() + Math.random();
    const base = { id, kind: 'ask', q, page };
    const c = clarify(q, turns, page);
    if (c) return setTurns((ts) => [...ts, { ...base, path: 'clarify', text: c }]);
    // BELLA data questions never call a model, whatever the picker says
    const data = answerFromData(q, bella, page);
    if (data) return setTurns((ts) => [...ts, { ...base, path: 'data', data, components: data.components, route: auto ? 'Auto → BELLA data · no model' : null }]);

    const autoPick = routeFor(q, models, budget);
    const choice = opts.provider ? { provider: opts.provider, why: null } : auto ? autoPick : { provider: picked, why: null };
    if (!choice.provider) return setTurns((ts) => [...ts, { ...base, path: 'clarify', text: choice.why }]);
    const route = auto && !opts.provider ? `Auto → ${choice.why}` : null;
    // a hand pick that differs from Auto is logged, so the rules can learn
    const override = opts.override ?? (!auto && !opts.provider && autoPick.provider && autoPick.provider !== picked ? { autoChose: autoPick.provider, chose: picked } : null);

    setTurns((ts) => [...ts, { ...base, path: 'docs', text: '', sources: [], asked: choice.provider, route, compareTo: opts.compareTo }]);
    setBusy(true);
    const t0 = performance.now();
    try {
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: q, sessionId: session.current, page, stream: true,
          provider: choice.provider, route, auto: auto && !opts.provider, includePrivate: includePrivate.current, override,
        }),
      });
      if (!res.ok) throw new Error(`The CHIP server answered ${res.status}`);
      for await (const ev of lines(res)) {
        if (ev.type === 'error') {
          // an answer that stopped part way keeps what it said, marked as cut off
          let kept = false;
          patch(id, (t) => {
            kept = Boolean(t.text);
            return kept ? { cutOff: ev.error, total: (performance.now() - t0) / 1000 } : {};
          });
          if (kept) continue;
          throw new Error(ev.error);
        }
        session.current = ev.sessionId ?? session.current;
        if (ev.type === 'weak') patch(id, () => ({ path: 'weak', closest: ev.closest, top: ev.top }));
        if (ev.type === 'provider') patch(id, () => ({ model: ev.model, place: ev.place, provider: ev.id === 'claude' ? 'claude' : choice.provider.startsWith('local:') ? choice.provider : `local:${ev.model}` }));
        if (ev.type === 'private') patch(id, () => ({ heldBack: ev.heldBack }));
        // the local model read every source after a fallback, so nothing is held back any more
        if (ev.type === 'fallback') patch(id, () => ({ fallback: ev.reason, heldBack: 0 }));
        if (ev.type === 'sources') patch(id, () => ({ sources: ev.sources, top: ev.top }));
        if (ev.type === 'token') patch(id, (t) => ({ text: t.text + ev.text, first: t.first ?? (performance.now() - t0) / 1000 }));
        if (ev.type === 'done') patch(id, (t) => ({ total: (performance.now() - t0) / 1000, components: componentsIn(t.text, bella) }));
      }
    } catch (err) {
      patch(id, () => ({ path: 'error', text: /fetch/i.test(err.message) ? 'The CHIP server is not answering on 127.0.0.1:3100. Start it with npm start.' : err.message }));
    } finally {
      setBusy(false);
      onAnswered?.();
    }
  }

  /** "Ask Claude instead": the same question, stacked under the first answer. */
  function compare(t) {
    if (busy) return notify('OBI is still answering. Try again in a moment.');
    ask(t.q, { provider: 'claude', compareTo: t.id, override: { autoChose: t.provider ?? t.asked ?? 'local', chose: 'claude' } });
  }

  /** Her yes to sending private Notion sources, for this session, then the same question again. */
  function includeAndRetry(t) {
    includePrivate.current = true;
    if (!busy) ask(t.q, { provider: t.asked, compareTo: t.id });
  }

  async function run(cmd) {
    const id = Date.now() + Math.random();
    setTurns((ts) => [...ts, { id, kind: 'cmd', cmd, text: '', exit: null }]);
    setBusy(true);
    try {
      const res = await fetch('/cmd', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        patch(id, () => ({ text: `chip: ${err.error ?? `server answered ${res.status}`}`, exit: 1 }));
        return;
      }
      const dec = new TextDecoder();
      let text = '';
      for await (const part of res.body) {
        text += dec.decode(part, { stream: true });
        patch(id, () => ({ text: text.replace(/\n\[exit [^\]]+\]\n?$/, '') }));
      }
      const m = text.match(/\[exit (\S+)\]\s*$/);
      patch(id, () => ({ exit: m ? (Number.isNaN(+m[1]) ? 1 : +m[1]) : 1 }));
    } catch {
      patch(id, () => ({ text: 'chip: the CHIP server is not answering on 127.0.0.1:3100.', exit: 1 }));
    } finally {
      setBusy(false);
    }
  }

  /** Plain text asks; "/status", "/audit", "/sync" run; "/ask <q>" asks. */
  function send(raw) {
    const text = raw.trim();
    if (!text || busy) return false;
    history.current = [...history.current.filter((h) => h !== text), text];
    if (text.startsWith('/')) {
      const [word, ...rest] = text.slice(1).split(' ');
      const arg = rest.join(' ').trim();
      // /ask --claude … or /ask --local … overrides the picker for one question
      const flag = arg.match(/^--(claude|local)\s+(.+)$/);
      const localId = (models.find((m) => m.place === 'local' && m.isDefault) ?? models.find((m) => m.place === 'local'))?.id;
      if (word === 'ask' && flag) ask(flag[2], { provider: flag[1] === 'claude' ? 'claude' : localId });
      else if (word === 'ask' && arg) ask(arg);
      else if (COMMANDS.some((c) => c.cmd === word && c.cmd !== 'ask')) run(word);
      else setTurns((ts) => [...ts, { id: Date.now(), kind: 'ask', q: text, path: 'error', text: `Unknown command. Try ${COMMANDS.map((c) => '/' + c.cmd).join(', ')}.` }]);
      return true;
    }
    ask(text);
    return true;
  }

  async function save(component, t) {
    const text = t.data ? [t.data.title, ...t.data.rows.map((r) => rowText(t.data, r))].join('\n') : t.text;
    try {
      const res = await fetch('/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ component, text, question: t.q }) });
      if (!res.ok) throw new Error();
      notify(`Saved to ${component} notes`);
      onSaved();
    } catch {
      notify('Could not save the note');
    }
  }

  return { turns, busy, send, save, history, compare, includeAndRetry };
}

/* ---------- the one input ---------- */
export function OneInput({ bella, docs, page, obi, inPanel, onJump, onEscape, notify, cloud, models = [], budget, picked = 'auto' }) {
  const [q, setQ] = useState('');
  const histAt = useRef(-1);
  const query = q.trim();
  const needle = query.toLowerCase();
  // before sending, say where the question goes (Auto may pick Claude)
  const goesToClaude = query && !query.startsWith('/') && (picked === 'claude' || (picked === 'auto' && routeFor(query, models, budget).provider === 'claude'));
  const askMeta = goesToClaude ? `Looking at ${page} · Claude, sent to Anthropic` : `Looking at ${page}`;

  const groups = useMemo(() => {
    if (!query) return [];
    if (query.startsWith('/')) {
      const word = needle.slice(1).split(' ')[0];
      return [
        {
          id: 'cmd',
          label: 'Run',
          options: COMMANDS.filter((c) => c.cmd.startsWith(word)).map((c) => ({ id: `cmd:${c.cmd}`, label: c.cmd === 'ask' ? '/ask <question>' : `/${c.cmd}`, meta: c.note })),
        },
      ];
    }
    const comps = (bella?.components ?? []).filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 6);
    const words = needle.split(/\s+/).filter((w) => w.length > 2);
    const docHits = docs
      .map((d) => ({ d, hits: words.filter((w) => d.title.toLowerCase().includes(w)).length }))
      .filter((x) => x.hits > 0 || x.d.title.toLowerCase().includes(needle))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 4);
    return [
      {
        id: 'jump',
        label: 'Jump to',
        options: [
          ...comps.map((c) => ({ id: `c:${c.id}`, label: c.name, meta: c.parts.length ? `Component · ${c.parts.length} parts` : 'Component' })),
          ...docHits.map(({ d }, i) => ({ id: `d:${i}:${d.url ?? d.path}`, label: d.title, meta: 'Doc' })),
        ],
      },
      { id: 'ask', label: 'Ask OBI', options: [{ id: 'ask', label: `Ask OBI: ${query}`, meta: askMeta }] },
    ];
  }, [query, needle, bella, docs, page, askMeta]);

  const exact = bella?.components.find((c) => c.name.toLowerCase() === needle);
  const preferred = query.startsWith('/') ? groups[0]?.options[0]?.id : exact ? `c:${exact.id}` : 'ask';

  function select(o) {
    if (o.id.startsWith('c:')) {
      onJump(o.id.slice(2));
      setQ('');
    } else if (o.id.startsWith('d:')) {
      const href = o.id.split(':').slice(2).join(':');
      window.open(href.startsWith('http') ? href : `/source?path=${encodeURIComponent(href)}`, '_blank', 'noopener');
      setQ('');
    } else if (o.id === 'cmd:ask') {
      setQ('/ask ');
    } else if (o.id.startsWith('cmd:')) {
      if (obi.send(`/${o.id.slice(4)}`)) setQ('');
    } else if (o.id === 'ask') {
      if (obi.send(query)) setQ('');
    }
  }

  function onKeyDown(e) {
    const open = e.currentTarget.getAttribute('aria-expanded') === 'true';
    const h = obi.history.current;
    // history wins over the list while browsing it (the list opens as soon as a
    // recalled entry fills the field)
    if (e.key === 'ArrowUp' && (!q || histAt.current >= 0) && h.length) {
      e.preventDefault();
      histAt.current = histAt.current < 0 ? h.length - 1 : Math.max(0, histAt.current - 1);
      setQ(h[histAt.current]);
    } else if (e.key === 'ArrowDown' && histAt.current >= 0) {
      e.preventDefault();
      histAt.current += 1;
      if (histAt.current >= h.length) {
        histAt.current = -1;
        setQ('');
      } else setQ(h[histAt.current]);
    } else if (e.key === 'Enter' && query.startsWith('/') && !groups[0]?.options.length) {
      // an unknown command still reaches OBI, which says so
      e.preventDefault();
      if (obi.send(query)) setQ('');
    } else if (e.key === 'Enter' && query.startsWith('/ask ') && query.length > 5) {
      // "/ask <question>" goes straight to OBI
      e.preventDefault();
      if (obi.send(query)) setQ('');
    } else if (e.key === 'Enter' && !open && query) {
      // Enter before the list has opened (fast typing): take the preferred option
      e.preventDefault();
      const all = groups.flatMap((g) => g.options);
      const o = all.find((x) => x.id === preferred) ?? (query.startsWith('/') ? null : { id: 'ask' });
      if (o) select(o);
      else if (obi.send(query)) setQ('');
    } else if (e.key === 'Escape' && !open) {
      onEscape();
    } else if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
      histAt.current = -1;
    }
  }

  return (
    <Combobox
      id="one-input"
      label="Ask OBI or jump to"
      hideLabel
      value={q}
      onChange={setQ}
      groups={groups}
      defaultOptionId={preferred}
      onSelect={select}
      onKeyDown={onKeyDown}
      placement={inPanel ? 'above' : 'below'}
      placeholder={
        cloud
          ? inPanel ? 'Sent to Anthropic · ask a follow-up, or / for a command' : 'Ask OBI (sent to Anthropic) or jump to…'
          : inPanel ? 'Ask a follow-up, or / for a command' : 'Ask OBI or jump to…'
      }
      hint={inPanel ? null : <Kbd keys={['⌘', 'K']} label="Command K" />}
      className="one-input"
    />
  );
}

/* ---------- the panel ---------- */
export function ObiPanel({ bella, health, page, obi, inputSlot, onOpenAtlas, onSandbox, onClose, notify, models = [], picked, setPicked, budget }) {
  const thread = useRef(null);
  const claudeOk = models.some((m) => m.id === 'claude' && m.available);
  const pickedModel = models.find((m) => m.id === picked);
  const options = [
    { value: 'auto', label: 'Auto · OBI decides' },
    ...models.filter((m) => m.place === 'local').map((m) => ({ value: m.id, label: `${m.label} · on this machine` })),
    ...models.filter((m) => m.place === 'cloud' && m.kind !== 'decider').map((m) => ({ value: m.id, label: `${m.label} · your plan, cloud${m.available ? '' : ' (not available)'}` })),
  ];
  const suggestions = useMemo(() => suggestionsFor(page, bella), [page, bella]);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [obi.turns]);

  return (
    <section className="obi" aria-labelledby="obi-h">
      <header className="obi-head">
        <div className="obi-name">
          <h2 id="obi-h" className="obi-title">
            OBI
          </h2>
          <Tag>Looking at {page}</Tag>
        </div>
        <div className="obi-model">
          {/* the Select shows the choice; each answer's route line says what Auto picked */}
          <Select label="Model" value={picked} onChange={setPicked} options={options} className="model-select" />
        </div>
        <ActionChip onClick={onClose} ariaLabel="Hide OBI (Escape or Command J)">
          Hide
        </ActionChip>
      </header>

      <ol className="obi-thread" ref={thread} aria-live="polite" aria-label="OBI thread">
        {obi.turns.length === 0 ? (
          <li className="obi-empty">
            <p className="label">Ask below, or type / for a command. Questions about {page === 'Health' ? 'BELLA' : page.replace('Atlas · ', '')} include it as context.</p>
            {suggestions.length ? (
              <div className="obi-suggest" aria-label="Suggested questions">
                {suggestions.map((s) => (
                  <ActionChip key={s} onClick={() => obi.send(s)} disabled={obi.busy}>
                    {s}
                  </ActionChip>
                ))}
              </div>
            ) : null}
          </li>
        ) : null}
        {obi.turns.map((t) =>
          t.kind === 'cmd' ? (
            <CmdTurn key={t.id} t={t} />
          ) : (
            <AskTurn
              key={t.id}
              t={t}
              bella={bella}
              page={page}
              claudeOk={claudeOk}
              budget={budget}
              onOpenAtlas={onOpenAtlas}
              onSandbox={onSandbox}
              onSave={obi.save}
              onCompare={obi.compare}
              onIncludePrivate={obi.includeAndRetry}
              notify={notify}
            />
          )
        )}
      </ol>

      <div className="obi-input" ref={inputSlot} />

      <p className="obi-status">
        <span>{picked === 'auto' ? `Auto · local ${health?.model ?? ''}`.trim() : pickedModel?.label ?? 'Model offline'}</span>
        <span>{health ? `${health.chunks.toLocaleString('en')} chunks` : 'No index'}</span>
        <span>BELLA @ {bella?.source.commit ?? '…'}</span>
      </p>
    </section>
  );
}
