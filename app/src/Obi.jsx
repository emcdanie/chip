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
import { answerFromData, clarify, componentsIn, tokensIn, suggestionsFor, routeFor, soundsUnsure, tidyCitations, isMiss, toolRouteFor, summarizeTool } from './answers.js';
import Select from '@bella/components/Select/Select';
import { baseOf } from './Sandbox.jsx';

const COMMANDS = [
  { cmd: 'tools', note: 'connected tools and their status' },
  { cmd: 'tool', note: '/tool <server> <tool> {json args}' },
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

// the one meta line under an answer: model · place · kind
function metaLine(t) {
  if (t.path === 'data') return 'BELLA data · no model';
  if (t.path === 'weak') return `${t.asked === 'claude' ? 'Claude' : 'local'} · miss`;
  const who = t.model ? `${t.model} · ${t.place === 'cloud' ? 'cloud' : 'local'}` : 'reading your sources';
  return `${who} · ${isMiss(t.text) ? 'miss' : 'docs'}`;
}

// is the question about this component (named, or "here", "this", "it" on its page)?
function aboutComponent(t, name) {
  if (!name) return false;
  if (new RegExp(`\\b${name}\\b`, 'i').test(t.q)) return true;
  return t.page === `Atlas · ${name}` && /\b(here|this|it|its)\b/i.test(t.q);
}

function AskTurn({ t, bella, page, claudeOk, budget, onOpenAtlas, onSandbox, onSave, onCompare, onIncludePrivate, notify }) {
  const here = page?.match(/^Atlas · (\w+)$/)?.[1];
  const done = t.path !== 'docs' || t.total != null;
  const miss = t.path === 'weak' || (t.path === 'docs' && done && isMiss(t.text));
  const answered = done && !miss && (t.path === 'data' || (t.path === 'docs' && t.text));

  async function copy() {
    try {
      await navigator.clipboard.writeText(proposalOf(t));
      notify('Copied the answer as a proposal');
    } catch {
      notify('Could not copy');
    }
  }

  // actions, most useful first; two show, the rest go under More
  const actions = [];
  if (answered) {
    if (t.path === 'docs' && t.place === 'local' && claudeOk) actions.push({ key: 'claude', label: soundsUnsure(t.text) ? 'Ask Claude' : 'Ask Claude instead', run: () => onCompare(t) });
    const target = (t.components ?? []).find((n) => aboutComponent(t, n)) ?? (aboutComponent(t, here) ? here : null);
    const targetComp = target && bella?.components.find((c) => c.name === target);
    if (targetComp && tokensIn(t.text ?? '').length && Object.keys(baseOf(targetComp)).length) actions.push({ key: 'try', label: 'Try in sandbox', run: () => onSandbox(target) });
    for (const n of (t.components ?? []).filter((n) => n !== here)) actions.push({ key: `open-${n}`, label: `Open ${n} in Atlas`, run: () => onOpenAtlas(n) });
    if (target) actions.push({ key: 'save', label: `Save to ${target} notes`, run: () => onSave(target, t) });
    actions.push({ key: 'copy', label: 'Copy as proposal', run: copy });
  }
  const shown = actions.slice(0, 2);
  const more = actions.slice(2);

  return (
    <li className="turn">
      <p className="you">
        <span className="you-label">You</span>
        <span>{t.q}</span>
      </p>

      <div className="answer">
        {t.compareTo ? <p className="label">The same question, asked of Claude. Compare it with the answer above.</p> : null}
        {t.path === 'clarify' ? <p>{t.text}</p> : null}
        {t.path === 'error' ? <p role="alert">{t.text}</p> : null}
        {t.fallback ? <p className="label">Claude could not answer ({t.fallback}). The local model answered instead.</p> : null}
        {t.heldBack ? (
          <p className="turn-note">
            {t.heldBack} Notion source{t.heldBack === 1 ? ' was' : 's were'} held back: private sources are not sent to Anthropic.{' '}
            <ActionChip onClick={() => onIncludePrivate(t)}>Include them this session</ActionChip>
          </p>
        ) : null}
        {miss ? (
          <>
            <p>I couldn't find this in {t.heldBack ? 'the sources that may go to the cloud' : 'your sources'}. The closest three:</p>
            <Closest sources={t.path === 'weak' ? t.closest : t.sources} />
          </>
        ) : t.path === 'data' ? (
          <>
            <p>{t.data.title}</p>
            <DataTable columns={t.data.columns} rows={t.data.rows} rowKey={t.data.rowKey} caption={t.data.caption ?? 'Results'} maxHeight="calc(var(--spacing-20) * 4)" density="compact" />
          </>
        ) : t.path === 'docs' ? (
          t.text ? <Rich text={tidyCitations(t.text)} sources={t.sources} /> : <p className="label">Reading your sources…</p>
        ) : null}
        {t.cutOff ? <p className="label">This answer stopped part way ({t.cutOff}).</p> : null}
      </div>

      {t.path === 'data' || t.path === 'docs' || t.path === 'weak' ? (
        <details className="turn-details">
          <summary>
            <span className="label">{metaLine(t)}</span> <span className="details-link">Details</span>
          </summary>
          {t.route ? <p className="label">Why: {t.route.replace(/^Auto → /, 'Auto chose ')}</p> : null}
          {t.total != null ? (
            <p className="label">
              First words {t.first?.toFixed(1) ?? '–'} s · total {t.total.toFixed(1)} s{t.top != null ? ` · best match ${t.top.toFixed(2)}` : ''}
            </p>
          ) : null}
          {t.path === 'docs' && t.sources?.length && !miss ? (
            <ol className="detail-sources">
              {t.sources.map((src) => (
                <li key={src.n}>
                  [{src.n}] {src.title} <span className="label">match {src.score?.toFixed(2)}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {t.path === 'data' ? <p className="label">From data/bella.json, synced from BELLA @ <span className="mono">{bella?.source.commit}</span>.</p> : null}
          {claudeOk && budget ? (
            <p className="label">
              Auto sent {budget.used} of {budget.limit} questions to Claude today.
              {/* TODO(04 context savings): add "≈ tokens kept local today" once 04's ledger exists */}
            </p>
          ) : null}
        </details>
      ) : null}

      {shown.length ? (
        <div className="turn-actions">
          {shown.map((x) => (
            <ActionChip key={x.key} onClick={x.run}>
              {x.label}
            </ActionChip>
          ))}
          {more.length ? (
            <details className="turn-more">
              <summary>More</summary>
              <div className="turn-more-list">
                {more.map((x) => (
                  <ActionChip key={x.key} onClick={x.run}>
                    {x.label}
                  </ActionChip>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

// a tool call: who ran what, how long, its output; a write waits for Confirm
function ToolTurn({ t, onConfirm, onCancel }) {
  return (
    <li className="turn turn-tool">
      <p className="you">
        <span className="you-label">You</span>
        <span>{t.q}</span>
      </p>
      <div className="answer">
        {t.list ? (
          <ul className="tool-list">
            {t.list.map((srv) => (
              <li key={srv.name}>
                <span className="mono">{srv.name}</span> · {srv.status}
                {srv.tools ? ` · ${srv.tools.filter((x) => x.kind === 'read').length} read · ${srv.tools.filter((x) => x.kind !== 'read').length} write, ${srv.tools.filter((x) => x.kind !== 'read' && x.allowed).length} allowed` : ''}
                {srv.note && srv.disabled ? <span className="label"> · {srv.note}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {t.message ? <p>{t.message}</p> : null}
        {t.preview ? (
          <div className="tool-preview">
            <p>
              This would change Figma through <span className="mono">{t.preview.tool}</span>. Nothing has run yet.
            </p>
            {t.preview.before ? (
              <>
                <p className="label">Before</p>
                <pre className="turn-out mono">{t.preview.before}</pre>
              </>
            ) : null}
            <p className="label">After</p>
            <pre className="turn-out mono">{JSON.stringify(t.preview.after, null, 2)}</pre>
            {t.settled ? (
              <p className="label">{t.settled}</p>
            ) : (
              <div className="turn-actions">
                <ActionChip onClick={() => onConfirm(t)}>Confirm</ActionChip>
                <ActionChip onClick={() => onCancel(t)}>Cancel</ActionChip>
              </div>
            )}
          </div>
        ) : null}
        {t.text != null || t.error ? (
          // the answer in words; the raw output is under Details
          t.error ? <p role="alert">{summarizeTool(t)}</p> : <p>{summarizeTool(t)}</p>
        ) : null}
        {t.error && /Desktop Bridge/i.test(t.error) ? (
          <p className="label">Open the Desktop Bridge plugin in Figma (Plugins, Development, Figma Desktop Bridge) on the BELLA file, then ask again.</p>
        ) : null}
      </div>
      {t.server && t.tool ? (
        <details className="turn-details">
          {/* one line: who, what, how long; the why and the raw output inside */}
          <summary>
            <Tag>
              {t.server} · {t.label ?? t.tool.replace(/^figma_/, '').replace(/_/g, ' ')}
              {t.ms != null ? ` · ${(t.ms / 1000).toFixed(1)}s` : ''}
            </Tag>{' '}
            <span className="details-link">Details</span>
          </summary>
          {t.why ? <p className="label">Why: {t.why}</p> : null}
          {t.text || t.error ? (
            <pre className="turn-out mono" tabIndex={0} aria-label={`Raw output of ${t.tool}`}>
              {(t.text || t.error).length > 3000 ? `${(t.text || t.error).slice(0, 3000)}\n…` : t.text || t.error}
            </pre>
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
      <p className="you">
        <span className="you-label">You</span>
        <span className="mono">/{t.cmd}</span>
      </p>
      <pre className="turn-out mono" tabIndex={0} aria-label={`Output of /${t.cmd}`}>
        {t.text || ' '}
      </pre>
      <p className="label meta-line">
        command ·{' '}
        {t.exit == null ? (
          <StatusPill variant="info">running</StatusPill>
        ) : (
          <StatusPill variant={t.exit === 0 ? 'success' : 'info'}>{t.exit === 0 ? 'pass' : `fail (exit ${t.exit})`}</StatusPill>
        )}
        {gates.map((g) => (
          <span key={g[1]} className="gate">
            <span className="mono">{g[1]}</span>
            <StatusPill variant={g[2] === 'OK' ? 'success' : 'info'}>{g[2] === 'OK' ? 'pass' : 'fail'}</StatusPill>
          </span>
        ))}
      </p>
    </li>
  );
}

/* ---------- the thread and the two paths ---------- */
// one id per page load: only this page can confirm the writes it asked for
const SESSION = crypto.randomUUID();
const HOST_HEADERS = { 'content-type': 'application/json', 'x-chip-session': SESSION };

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

    // a question for Figma goes to a tool, not a model (Auto only)
    const toolRoute = auto && !opts.provider ? toolRouteFor(q) : null;
    if (toolRoute) return runTool(q, { ...toolRoute, why: `Auto chose ${toolRoute.server} · ${toolRoute.tool ?? 'none'}: ${toolRoute.why}` });

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

  /** Runs a tool through the host (POST /host/call); a write comes back as a preview. */
  async function runTool(q, { server, tool, args = {}, label = null, why = null }) {
    const id = Date.now() + Math.random();
    setTurns((ts) => [...ts, { id, kind: 'tool', q, server, tool, label, why }]);
    if (!tool) return patch(id, () => ({ message: `${why}. Name it in chip.config.local.json and turn it on to use it.` }));
    setBusy(true);
    try {
      const res = await fetch('/host/call', { method: 'POST', headers: HOST_HEADERS, body: JSON.stringify({ server, tool, args, purpose: q.slice(0, 200) }) });
      const r = await res.json();
      if (r.error) patch(id, () => ({ error: r.error }));
      else if (r.refused) patch(id, () => ({ error: `Refused: ${r.refused}` }));
      else if (r.pending) patch(id, () => ({ preview: r.pending.preview, pendingId: r.pending.id }));
      else patch(id, () => (r.ok ? { text: r.text, ms: r.ms } : { error: r.error, ms: r.ms }));
    } catch {
      patch(id, () => ({ error: 'The CHIP server is not answering on 127.0.0.1:3100.' }));
    } finally {
      setBusy(false);
    }
  }

  async function settle(t, confirm) {
    const res = await fetch(`/host/${confirm ? 'confirm' : 'cancel'}`, { method: 'POST', headers: HOST_HEADERS, body: JSON.stringify({ id: t.pendingId }) });
    const r = await res.json().catch(() => ({}));
    if (!confirm) return patch(t.id, () => ({ settled: 'Cancelled. Nothing changed.' }));
    patch(t.id, () => (r.ok ? { settled: 'Applied.', text: r.text, ms: r.ms } : { settled: 'Not applied.', error: r.error ?? 'The change did not run.' }));
  }

  async function listTools(q) {
    const id = Date.now() + Math.random();
    setTurns((ts) => [...ts, { id, kind: 'tool', q }]);
    try {
      const r = await (await fetch('/host')).json();
      patch(id, () => ({ list: r.servers, message: r.servers.length ? null : 'No servers in chip.config.local.json yet. See docs/host.md.' }));
    } catch {
      patch(id, () => ({ error: 'The CHIP server is not answering on 127.0.0.1:3100.' }));
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
      if (word === 'tools') listTools(text);
      else if (word === 'tool') {
        // /tool <server> <tool> {json args}
        const m = arg.match(/^(\S+)\s+(\S+)\s*(\{[\s\S]*\})?$/);
        let args = {};
        try {
          args = m?.[3] ? JSON.parse(m[3]) : {};
        } catch {
          setTurns((ts) => [...ts, { id: Date.now(), kind: 'ask', q: text, path: 'error', text: 'The arguments are not valid JSON.' }]);
          return true;
        }
        if (!m) setTurns((ts) => [...ts, { id: Date.now(), kind: 'ask', q: text, path: 'error', text: 'Use /tool <server> <tool> {json args}. /tools lists them.' }]);
        else runTool(text, { server: m[1], tool: m[2], args, why: `You named ${m[1]} · ${m[2]}` });
      } else if (word === 'ask' && flag) ask(flag[2], { provider: flag[1] === 'claude' ? 'claude' : localId });
      else if (word === 'ask' && arg) ask(arg);
      else if (['status', 'audit', 'sync'].includes(word)) run(word);
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

  return { turns, busy, send, save, history, compare, includeAndRetry, confirmTool: (t) => settle(t, true), cancelTool: (t) => settle(t, false) };
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
    // a command with arguments is complete: no list, Enter sends it
    if (query.startsWith('/') && query.includes(' ')) return [];
    if (query.startsWith('/')) {
      const word = needle.slice(1).split(' ')[0];
      return [
        {
          id: 'cmd',
          label: 'Run',
          options: COMMANDS.filter((c) => c.cmd.startsWith(word)).map((c) => ({ id: `cmd:${c.cmd}`, label: c.cmd === 'ask' ? '/ask <question>' : c.cmd === 'tool' ? '/tool <server> <tool>' : `/${c.cmd}`, meta: c.note })),
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
    } else if (o.id === 'cmd:tool') {
      setQ('/tool ');
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
export function ObiPanel({ bella, page, obi, inputSlot, onOpenAtlas, onSandbox, onClose, notify, models = [], picked, setPicked, budget }) {
  const thread = useRef(null);
  const claudeOk = models.some((m) => m.id === 'claude' && m.available);
  const suggestions = useMemo(() => suggestionsFor(page, bella), [page, bella]);
  const options = [
    { value: 'auto', label: 'Auto · OBI decides' },
    ...models.filter((m) => m.place === 'local').map((m) => ({ value: m.id, label: `${m.label} · on this machine` })),
    ...models.filter((m) => m.place === 'cloud' && m.kind !== 'decider').map((m) => ({ value: m.id, label: `${m.label} · your plan, cloud${m.available ? '' : ' (not available)'}` })),
  ];

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [obi.turns]);

  return (
    <section className="obi" aria-labelledby="obi-h">
      <header className="obi-head">
        <h2 id="obi-h" className="obi-title">
          OBI
        </h2>
        <Tag>Looking at {page}</Tag>
        <span className="obi-grow" />
        <Select label="Model" value={picked} onChange={setPicked} options={options} className="model-select" />
        <ActionChip onClick={onClose} ariaLabel="Hide OBI (Escape or Command J)">
          Hide
        </ActionChip>
      </header>

      <ol className="obi-thread" ref={thread} aria-live="polite" aria-label="OBI thread">
        {obi.turns.length === 0 ? (
          <li className="obi-empty">
            <p>Ask about {page === 'Health' ? 'BELLA' : page.replace('Atlas · ', '')}, or type / for a command.</p>
            {suggestions.length ? (
              <div className="obi-suggest" aria-label="Suggested questions">
                {suggestions.map((sg) => (
                  <ActionChip key={sg} onClick={() => obi.send(sg)} disabled={obi.busy}>
                    {sg}
                  </ActionChip>
                ))}
              </div>
            ) : null}
          </li>
        ) : null}
        {obi.turns.map((t) =>
          t.kind === 'cmd' ? (
            <CmdTurn key={t.id} t={t} />
          ) : t.kind === 'tool' ? (
            <ToolTurn key={t.id} t={t} onConfirm={obi.confirmTool} onCancel={obi.cancelTool} />
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
    </section>
  );
}
