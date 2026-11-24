// Atlas: one BELLA component, documented by itself (docs/plans/component-docs.md,
// approved mock chip-docs-01). One live specimen is the page: every fact hangs
// off a part of it, every rule is a check that runs on it. No tabs: the checks
// strip, the stage with its inspector, the scenes, Behind it.
// Every panel reads real data: data/bella.json, /bella-doc, /bella-spec,
// /bella-history, /component-tests, /figma-lint and BELLA's own files. Where
// there is no source, the page says so instead of inventing it.
// CHIP's chrome sits in k-chrome roots; every BELLA specimen sits outside
// them, so it keeps BELLA's own look.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Select from '@bella/components/Select/Select';
import Input from '@bella/components/Input/Input';
import { StatusPill, Chips } from './kit/index.jsx';
import { keyboardOf } from './AtlasSpec.jsx';
import { canSee, settingsOf } from './visibility.jsx';
import { SPECIMENS, VARIANTS, COMPONENTS } from './specimens.jsx';
import { targetsOf } from './anatomy.js';
import { forceAttr, installForcedStates } from './forcedStates.js';
import './atlas.css';
import Icon from '@bella/components/Icon/Icon';

function useReducedMotion() {
  const q = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** A token in full, allowed to wrap after each "-" (never cut in the middle). */
export function Token({ name }) {
  if (!name) return null;
  // never break inside the leading "--": only at the hyphens after it
  const lead = name.startsWith('--') ? '--' : '';
  const parts = name.slice(lead.length).split('-');
  return (
    <span className="token-name">
      {lead}
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 1 ? (
            <>
              -<wbr />
            </>
          ) : null}
        </React.Fragment>
      ))}
    </span>
  );
}

const NO_CONTRACT = 'Missing a contract';
const dontText = (u) => cap1(u.replace(/^Do not /, ''));
const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

// BELLA's own files, read in place like its components (no copy, no server)
const SOURCES = import.meta.glob('@bella/components/*/*.{tsx,css}', { query: '?raw', import: 'default' });

function useJson(url) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    setD(null);
    fetch(url)
      .then((r) => r.json())
      .then((j) => live && setD(j))
      .catch(() => live && setD({ error: true }));
    return () => {
      live = false;
    };
  }, [url]);
  return d;
}

/* ---------- small pieces ---------- */
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

// a radio group drawn as the mock's .seg (a view switch inside a panel, not tabs)

function Panel({ name, one, below, children, insp, label }) {
  return (
    <div className={`docpanel${one ? ' one' : ''}`} data-docpanel={name}>
      <div className="fig">{children}</div>
      {insp ? (
        <aside className={`insp${below ? ' below' : ''}`} aria-label={label}>
          {insp}
        </aside>
      ) : null}
    </div>
  );
}

function Empty({ title, children }) {
  return (
    <div className="a-empty">
      <p className="h3s">{title}</p>
      <p className="sub2">{children}</p>
    </div>
  );
}

/* ---------- a specimen as JSX: the element tree the stage renders, written out ---------- */
const NAMES = new Map(Object.entries(COMPONENTS).map(([k, v]) => [v, k]));
function nameOf(t) {
  return typeof t === 'string' ? t : NAMES.get(t) || t?.displayName || t?.name || 'Component';
}
function attrOf(k, v) {
  if (typeof v === 'string') return `${k}="${v}"`;
  if (typeof v === 'function') return `${k}={() => {}}`;
  if (v === true) return k;
  return `${k}={${JSON.stringify(v)}}`;
}
function jsxLines(el, pad = '') {
  if (el == null || el === false || el === true) return [];
  if (typeof el === 'string' || typeof el === 'number') return [pad + el];
  if (Array.isArray(el)) return el.flatMap((e) => jsxLines(e, pad));
  const { children, ...props } = el.props ?? {};
  const tag = nameOf(el.type);
  const attrs = Object.entries(props).map(([k, v]) => attrOf(k, v));
  const open = `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
  if (children == null) return [`${pad}${open} />`];
  if (typeof children === 'string' || typeof children === 'number') return [`${pad}${open}>${children}</${tag}>`];
  return [`${pad}${open}>`, ...jsxLines(children, pad + '  '), `${pad}</${tag}>`];
}

function CodeBlock({ title, lines, notify, max = 6 }) {
  const [open, setOpen] = useState(false);
  const id = React.useId();
  const long = lines.length > max;
  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      notify('Copied the code');
    } catch {
      notify('Could not copy the code');
    }
  }
  return (
    <div className="excode">
      <div className="codehead k-chrome">
        <code>{title}</code>
        <Button variant="secondary" onClick={copy} ariaLabel={`Copy: ${title}`}>
          <CopyIcon />
          Copy
        </Button>
      </div>
      <pre className="exv" id={id} tabIndex={0} data-open={!long || open}>
        {lines.map((l, i) => (
          <span key={i} className="ln">
            {l || ' '}
          </span>
        ))}
      </pre>
      {long ? (
        <button type="button" className="exmore" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show full code'} <span className="n">· {plural(lines.length, 'line')}</span>
        </button>
      ) : null}
    </div>
  );
}

// a specimen in one state: BELLA's own rules, forced through attributes
function Forced({ state, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('[data-bella-component]');
    if (!el) return;
    const f = forceAttr(state === 'press' ? 'active' : state);
    if (f) el.setAttribute(f[0], f[1]);
    if (state === 'disabled') {
      if ('disabled' in el) el.disabled = true;
      else el.setAttribute('aria-disabled', 'true');
    }
  }, [state, children]);
  return (
    <div ref={ref} inert aria-hidden="true" className="a-spec">
      {children}
    </div>
  );
}


/* ---------- guidance: the markdown file's sections ---------- */
function sectionsOf(md) {
  const out = {};
  let head = null;
  for (const line of (md ?? '').split('\n')) {
    const h = line.match(/^##\s+(.*)/);
    if (h) {
      head = h[1].trim();
      out[head] = [];
    } else if (head) out[head].push(line);
  }
  return out;
}
const bulletsOf = (lines = []) => lines.filter((l) => /^\s*[-*]\s/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, '').replace(/`/g, ''));

// the AGENTS.md rule that names a variant: "| Main action (at most one per view) | `Button variant="primary"` |"
function agentRuleFor(doc, c, v) {
  const r = doc?.agents?.rules?.find((x) => x.text.includes(`${c.name} variant="${v}"`));
  return r ? r.text.split('|').map((s) => s.trim()).filter(Boolean)[0] : null;
}

// the tokens a state changes: the component tokens named for it (and its tier)
function stateTokens(c, tier, state) {
  const list = c.tokens?.list ?? [];
  const word = { focus: /(-focus|ring)/, press: /-(active|press)/, active: /-(active|press)/ }[state] ?? new RegExp(`-${state}(-|$)`);
  const named = list.filter((t) => word.test(t) && (!tier || t.includes(`-${tier}-`) || !/-(primary|secondary|tertiary)-/.test(t)));
  // and the anatomy's parts that only show in this state (a hover wash, a pressed fill)
  const parts = (c.parts ?? []).filter((p) => p.trigger === state || (state === 'active' && p.trigger === 'press')).map((p) => p.token);
  return [...new Set([...named, ...parts])].filter(Boolean);
}

function valuesOf(p) {
  const opts = [...String(p.values).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const def = p.default ? String(p.default).replace(/'/g, '') : null;
  if (opts.length > 1)
    return opts.map((o, i) => (
      <React.Fragment key={o}>
        {i ? ' · ' : ''}
        {o === def ? <code>{o}</code> : o}
      </React.Fragment>
    ));
  return p.values;
}

/* ---------- a file with line numbers and marked lines ---------- */
function useFileView({ path, text, marks, notify, label }) {
  const pre = useRef(null);
  const [on, setOn] = useState(null);
  const lines = (text ?? '').split('\n');
  const marked = new Set(marks.map((m) => m.line));
  async function copy() {
    try {
      await navigator.clipboard.writeText(text ?? '');
      notify('Copied the file');
    } catch {
      notify('Could not copy the file');
    }
  }
  function jump(line) {
    setOn(line);
    const el = pre.current?.querySelector(`[data-ln="${line}"]`);
    if (el && pre.current) pre.current.scrollTop = el.offsetTop - pre.current.clientHeight / 3;
  }
  return { jump, on, view: (
    <div className="codebox">
      <div className="codehead k-chrome">
        <code>{path}</code>
        <Button variant="secondary" onClick={copy} ariaLabel={`Copy ${path}`}>
          <CopyIcon />
          Copy
        </Button>
      </div>
      <div role="region" aria-label={label}>
        <pre className="code-v" ref={pre} tabIndex={0}>
          {text == null ? (
            <span className="ln">Reading…</span>
          ) : (
            lines.map((l, i) => (
              <span key={i} data-ln={i + 1} className={`ln${marked.has(i + 1) ? ' mk' : ''}${on === i + 1 ? ' on' : ''}`}>
                {l || ' '}
              </span>
            ))
          )}
        </pre>
      </div>
    </div>
  ) };
}

const CONTRACT_MARKS = [
  ['"description"', 'What it is'],
  ['"variants"', 'Its tiers'],
  ['"states"', 'Its states'],
  ['"dont"', 'What not to do'],
  ['"a11y"', 'Verified contrast'],
  ['"anatomy"', 'Its parts'],
  ['min-height', 'Its target size'],
];
function marksOf(kind, text) {
  const lines = (text ?? '').split('\n');
  if (kind === 'guide')
    return lines.flatMap((l, i) => (/^##\s/.test(l) ? [{ line: i + 1, title: l.replace(/^#+\s*/, ''), text: (lines[i + 2] ?? '').slice(0, 80) }] : []));
  return CONTRACT_MARKS.flatMap(([needle, title]) => {
    const i = lines.findIndex((l) => l.includes(needle));
    return i < 0 ? [] : [{ line: i + 1, title, text: lines[i].trim().slice(0, 64) }];
  }).sort((a, b) => a.line - b.line);
}

function ContractPanel({ c, bella, doc, tests, hist, notify, onOpen }) {
  const [view, setView] = useState('overview');
  const [file, setFile] = useState('contract');
  const text = file === 'contract' ? doc?.contract?.block : doc?.guidance?.md;
  const path = file === 'contract' ? `${doc?.contract?.path ?? 'tokens/contracts.json'} → component.${c.id.replace(/-/g, '-')}` : doc?.guidance?.path ?? `docs/components/${c.id}.md`;
  const marks = marksOf(file === 'contract' ? 'contract' : 'guide', text);
  const fv = useFileView({ path, text, marks, notify, label: file === 'contract' ? 'Contract file' : 'Guidance file' });
  const semantic = (c.tokens?.list ?? []).filter((t) => t.startsWith('--color-semantic') || !t.startsWith('--component'));
  const row = (k, v) => (
    <tr key={k}>
      <th scope="row">{k}</th>
      <td>{v}</td>
    </tr>
  );
  const link = (n) => {
    const o = bella.components.find((x) => x.name === n);
    return o ? (
      <a
        key={n}
        href={`#/atlas/${o.id}`}
        onClick={(e) => {
          e.preventDefault();
          onOpen(o.id);
        }}
      >
        {n}
      </a>
    ) : (
      n
    );
  };
  const join = (xs) => xs.map((x, i) => <React.Fragment key={i}>{i ? ' · ' : ''}{x}</React.Fragment>);
  return (
    <Panel
      name="contract"
      label="Marked in this file"
      insp={
        <>
          <p className="insp-h">Marked in this file</p>
          <ol className="marks">
            {marks.map((m, i) => (
              <li key={m.line}>
                <button type="button" onClick={() => fv.jump(m.line)} aria-pressed={fv.on === m.line}>
                  <b>{i + 1}</b>
                  <b className="a-mt">{m.title}</b>
                  <small>
                    Line {m.line} · {m.text}
                  </small>
                </button>
              </li>
            ))}
          </ol>
        </>
      }
    >
      <div className="statebar">
        <p className="cap">What {c.name} promises, whether it keeps its promises, and who relies on them.</p>
        <SegmentedControl
          label="Contract view"
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'compliance', label: 'Compliance' },
            { value: 'consumption', label: 'Consumption' },
            { value: 'versions', label: 'Versions' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      <div className="slav">
        {view === 'overview' ? (
          <table className="ttab a-sla">
            <tbody>
              {row('Variants', c.variants?.length ? c.variants.join(' · ') : 'none')}
              {c.shapes?.length ? row('Shape', c.shapes.join(' · ')) : null}
              {row('States', (c.states ?? []).join(' · ') || 'none')}
              {c.minTarget ? row('Target', `${c.minTarget.value} min · ${c.minTarget.token}`) : null}
              {c.rendersAs ? row('Renders as', c.rendersAs) : null}
              {row('Contract', c.hasContract ? `${doc?.contract?.path ?? 'tokens/contracts.json'} · ${c.health?.contract?.status === 'fail' ? 'disagrees with the code' : 'matches the code'}` : NO_CONTRACT)}
              {c.tokens ? row('Tokens', `${c.tokens.count}: ${c.tokens.component} component, ${c.tokens.semantic} semantic`) : null}
            </tbody>
          </table>
        ) : view === 'compliance' ? (
          tests?.tests ? (
            <ul className="k-list sla2">
              {tests.tests.map((t) => (
                <li key={t.name}>
                  <span>
                    <b>{t.name}</b>
                    <br />
                    <span className="sub2">{t.detail}</span>
                  </span>
                  <StatusPill tone={t.status === 'pass' ? 'pass' : t.status === 'fail' ? 'fail' : 'needs'}>{t.status === 'pass' ? 'Keeps it' : t.status === 'fail' ? 'Breaks it' : 'Not run'}</StatusPill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sub2">Reading the tests…</p>
          )
        ) : view === 'consumption' ? (
          <table className="ttab a-sla">
            <tbody>
              {row('Used inside', c.composesInto?.length ? join(c.composesInto.map(link)) : 'Nothing in BELLA composes it')}
              {row('Built from', c.composedFrom?.length ? join(c.composedFrom.map(link)) : 'No other BELLA component')}
              {row(
                'Shared tokens',
                semantic.length
                  ? join(semantic.map((t) => `${t.replace(/^--color-semantic-/, '')} (${(bella.tokenUsage?.[t] ?? []).length || '?'} components)`))
                  : 'None: every token it reads is its own'
              )}
            </tbody>
          </table>
        ) : hist?.entries ? (
          <ul className="k-list sla2">
            {hist.entries.slice(0, 6).map((e) => (
              <li key={e.sha}>
                <span>
                  <b>{e.explanation || e.subject}</b>
                  <br />
                  <span className="sub2">
                    <code>{e.sha}</code> · {fmtDate(e.date)} · {(e.types ?? []).join(', ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sub2">Reading the history…</p>
        )}
      </div>
      <div className="slafile">
        <div className="statebar">
          <p className="cap">The file itself. Marked lines matter most.</p>
          <SegmentedControl label="File" options={[{ value: 'contract', label: 'Contract' }, { value: 'guide', label: 'Guidance' }]} value={file} onChange={setFile} />
        </div>
        {fv.view}
      </div>
    </Panel>
  );
}

function SourcePanel({ c, doc, notify }) {
  const files = useMemo(() => {
    const own = Object.keys(SOURCES)
      .filter((k) => k.includes(`/${c.name}/`))
      .map((k) => ({ key: k, dir: `src/components/${c.name}/`, name: k.split('/').pop(), load: SOURCES[k] }))
      .sort((a, b) => a.name.length - b.name.length);
    return [
      ...own,
      ...(doc?.contract ? [{ key: 'contract', dir: 'tokens/', name: 'contracts.json', text: doc.contract.block, note: `component.${c.id}` }] : []),
      ...(doc?.guidance ? [{ key: 'guide', dir: 'docs/components/', name: doc.guidance.path.split('/').pop(), text: doc.guidance.md }] : []),
    ];
  }, [c.id, doc]);
  const [cur, setCur] = useState(null);
  const [text, setText] = useState(null);
  const f = files.find((x) => x.key === cur) ?? files[0];
  useEffect(() => setCur(null), [c.id]);
  useEffect(() => {
    if (!f) return;
    let live = true;
    setText(null);
    if (f.text != null) setText(f.text);
    else f.load().then((t) => live && setText(t)).catch(() => live && setText('Could not read this file.'));
    return () => {
      live = false;
    };
  }, [f?.key, c.id]);
  const dirs = [...new Set(files.map((x) => x.dir))];
  const fv = useFileView({ path: f ? `${f.dir}${f.name}${f.note ? ` → ${f.note}` : ''}` : '', text, marks: [], notify, label: 'File' });
  return (
    <Panel name="source" one>
      <p className="cap">The files that make {c.name}, read only, straight from BELLA. Change them through a session.</p>
      {files.length ? (
        <div className="srcwrap">
          <ul className="ftree" aria-label="Files">
            {dirs.map((d) => (
              <React.Fragment key={d}>
                <li className="fdir">{d}</li>
                {files
                  .filter((x) => x.dir === d)
                  .map((x) => (
                    <li key={x.key}>
                      <button type="button" aria-current={x.key === f.key} onClick={() => setCur(x.key)}>
                        {x.name}
                      </button>
                    </li>
                  ))}
              </React.Fragment>
            ))}
          </ul>
          {fv.view}
        </div>
      ) : (
        <Empty title="No files found">CHIP couldn’t find {c.name}’s folder in BELLA.</Empty>
      )}
    </Panel>
  );
}

const TYPE_LABEL = { visual: 'Visual', api: 'API', tokens: 'Tokens', docs: 'Docs', a11y: 'A11y' };
function HistoryPanel({ c, hist }) {
  const [type, setType] = useState('all');
  const [order, setOrder] = useState('new');
  const [focus, setFocus] = useState(null);
  const list = useRef(null);
  useEffect(() => (setType('all'), setFocus(null)), [c.id]);
  if (!hist) return <Panel name="history" one><p className="sub2">Reading {c.name}’s history…</p></Panel>;
  const all = hist.entries ?? [];
  if (!all.length)
    return (
      <Panel name="history" one>
        <Empty title="No history yet">BELLA’s git log has no commit that touches {c.name}’s files.</Empty>
      </Panel>
    );
  const typesOf = (e) => (e.types ?? []).map((t) => t.toLowerCase());
  const counts = {};
  for (const e of all) for (const t of typesOf(e)) counts[t] = (counts[t] ?? 0) + 1;
  const chips = [{ id: 'all', label: 'All', count: all.length }, ...Object.keys(TYPE_LABEL).filter((t) => counts[t]).map((t) => ({ id: t, label: TYPE_LABEL[t], count: counts[t] }))];
  const shown = all.filter((e) => type === 'all' || typesOf(e).includes(type));
  const sorted = order === 'new' ? shown : [...shown].reverse();
  const chrono = [...all].reverse(); // oldest first
  const recent = chrono.slice(-5);
  function jump(sha) {
    setType('all');
    setFocus(sha);
    requestAnimationFrame(() => list.current?.querySelector(`[data-sha="${sha}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
  return (
    <Panel name="history" one>
      <p className="cap">Every change to {c.name}, from BELLA’s git log of its files. Select a point on the line to find it below.</p>
      <div className="hquick k-chrome">
        <Chips label="Change type" items={chips} value={type} onChange={setType} />
      </div>
      <div className="hline2" role="group" aria-label={`The ${recent.length} latest changes`}>
        <ol>
          {recent.map((e) => (
            <li key={e.sha}>
              <button type="button" className="hpt" aria-pressed={focus === e.sha} onClick={() => jump(e.sha)} aria-label={`${e.explanation || e.subject}, ${fmtDate(e.date)}`}>
                {chrono.indexOf(e) + 1}
              </button>
              <span className="hd">{fmtDate(e.date)}</span>
              <span className="ht">{e.explanation || e.subject}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="hsortrow k-chrome">
        <p className="sub2">
          {shown.length} of {all.length} · sort by
        </p>
        <Chips
          label="Sort"
          items={[
            { id: 'new', label: 'Newest first' },
            { id: 'old', label: 'Oldest first' },
          ]}
          value={order}
          onChange={setOrder}
        />
      </div>
      <ol className="hlist" ref={list}>
        {sorted.map((e) => (
          <li key={e.sha} data-sha={e.sha} className={`hcardr${focus === e.sha ? ' on' : ''}`}>
            <h3>{e.explanation || e.subject}</h3>
            <div className="hchips">
              {typesOf(e).map((t) => (
                <span key={t} className="k-pill">
                  {TYPE_LABEL[t] ?? t}
                </span>
              ))}
              {e.api ? <StatusPill>API: {String(e.api).slice(0, 60)}</StatusPill> : null}
            </div>
            {e.detail ? (
              <div className="hwhy">
                <p className="rk">From the commit</p>
                <p className="hsumm">{e.detail.split(/\n\s*\n/)[0]}</p>
                {e.detail.split(/\n\s*\n/).length > 1 ? (
                  <details className="hdet">
                    <summary>The rest of the message</summary>
                    <p className="hsumm">{e.detail.split(/\n\s*\n/).slice(1).join('\n\n')}</p>
                  </details>
                ) : null}
              </div>
            ) : null}
            <p className="hsrc2">
              <span>
                From commit <code>{e.sha}</code>
              </span>
              <span>{fmtDate(e.date)}</span>
              <span>{e.subject}</span>
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

const VERDICT = { pass: 'Passes', fail: 'Fails', 'not-run': 'Not run' };
function TestsPanel({ c, tests, onRun, running }) {
  if (!tests) return <Panel name="tests" one><p className="sub2">Reading the tests…</p></Panel>;
  if (tests.error) return <Panel name="tests" one><Empty title="The tests could not be read">The CHIP server didn’t answer /component-tests.</Empty></Panel>;
  const order = { fail: 0, 'not-run': 1, pass: 2 };
  const rows = [...tests.tests].sort((a, b) => order[a.status] - order[b.status]);
  const n = (s) => rows.filter((r) => r.status === s).length;
  return (
    <Panel name="tests" one>
      <div className="statebar">
        <p className="cap">The tests the gate runs on {c.name}, failing first. What it looks like is under Variants and States.</p>
      </div>
      <p className="stsum">
        {n('fail') ? <span className="bad">{`${n('fail')} of ${rows.length} fail${n('fail') === 1 ? 's' : ''}`}</span> : <b>{`${n('pass')} of ${rows.length} pass`}</b>}
        {n('fail') ? ` · ${n('pass')} pass` : ''}
        {n('not-run') ? ` · ${n('not-run')} not run` : ''}
        {running ? ' · the stories audit is running' : ''}
      </p>
      <ul className="tlist">
        {rows.map((r) => (
          <li key={r.name} className={`trow a-trow${r.status === 'fail' ? ' fails' : ''}`}>
            <div className="tmain">
              <h3>{r.name}</h3>
              <p className="twhy">
                {r.status === 'fail' ? <b>Fails: </b> : null}
                {r.detail}
              </p>
            </div>
            <div className="tside k-chrome">
              <span className={`tverd${r.status === 'fail' ? ' bad' : ''}`}>
                <StatusPill tone={r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : 'needs'}>{VERDICT[r.status]}</StatusPill>
              </span>
              {r.action ? (
                <Button variant="secondary" onClick={() => onRun(r.action)}>
                  {r.action.label}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {tests.ranAt ? <p className="foot">Stories last ran {new Date(tests.ranAt).toLocaleString('en-GB')}.</p> : null}
    </Panel>
  );
}

function FigmaPanel({ c, lint, reading, onRead }) {
  const ok = lint?.read;
  return (
    <Panel name="figma" one>
      <div className="statebar">
        <p className="cap">The Figma component beside the code, so you don’t switch apps. CHIP reads it through the Figma MCP; it can’t test it.</p>
      </div>
      <div className="embed">
        <div className="embedbar">
          <span className={`dot ${ok ? 'ok' : 'warn'}`} aria-hidden="true" />
          <code><Icon name="Figma" size="sm" /> Figma · {c.name}</code>
          <span className="sub2">{reading ? 'Reading Figma…' : !lint ? 'Not read yet' : ok ? `Read ${new Date(lint.at).toLocaleString('en-GB')}` : 'The Figma MCP is not answering'}</span>
        </div>
        {ok ? (
          <div className="figempty">
            <p className="big">{lint.found ? `${c.name} is in Figma` : `No ${c.name} in Figma`}</p>
            {lint.summary ? <p>{lint.summary}</p> : null}
            {(lint.issues ?? []).length ? (
              <ul className="glist">
                {lint.issues.map((i, k) => (
                  <li key={k}>{typeof i === 'string' ? i : i.text ?? i.message ?? JSON.stringify(i)}</li>
                ))}
              </ul>
            ) : null}
            <span className="k-chrome a-ch">
              <Button variant="secondary" icon="Figma" leadingIcon onClick={onRead}>Read Figma again</Button>
            </span>
          </div>
        ) : (
          <div className="figempty">
            <p className="big">Figma isn’t connected</p>
            <p>There is nothing to show or compare yet. The rest of {c.name}’s page works without it.</p>
            <ol className="figsteps">
              <li>
                <span className="fx" aria-hidden="true">
                  ✕
                </span>
                <div>
                  <b>The Figma MCP isn’t answering</b>
                  <p className="sub2">{lint?.reason ?? 'CHIP reads Figma through it.'}</p>
                  <span className="k-chrome a-ch">
                    <Button variant="secondary" icon="Figma" leadingIcon onClick={onRead} disabled={reading}>
                      {reading ? 'Reading Figma…' : 'Read Figma again'}
                    </Button>
                  </span>
                </div>
              </li>
            </ol>
            <p className="sub2">Until it answers, Compare with Figma is off.</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ================= the stage: one specimen, every fact hung off it ================= */

const noop = () => {};
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const STATE_LABEL = (s) => cap1(s === 'active' ? 'press' : s);

// one tab stop per group: arrows, Home and End move inside it
function useRove(ref, sel = '[data-rv]') {
  useLayoutEffect(() => {
    const items = [...(ref.current?.querySelectorAll(sel) ?? [])];
    if (!items.length) return;
    const on = (b) => ['aria-checked', 'aria-pressed', 'aria-expanded'].some((a) => b.getAttribute(a) === 'true');
    const cur = items.find((b) => b === document.activeElement) ?? items.find(on) ?? items[0];
    for (const b of items) b.tabIndex = b === cur ? 0 : -1;
  });
}
function roveKeys(e, sel = '[data-rv]') {
  const items = [...e.currentTarget.querySelectorAll(sel)];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return null;
  const n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
  if (n === undefined) return null;
  e.preventDefault();
  const next = items[(n + items.length) % items.length];
  for (const b of items) b.tabIndex = b === next ? 0 : -1;
  next.focus();
  return next;
}

/* ---------- colour, measured ---------- */
// any CSS colour (BELLA's compute as oklch) to sRGB, through a 1px canvas
let ink2d = null;
function rgbOf(s) {
  if (!ink2d) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    ink2d = cv.getContext('2d', { willReadFrequently: true });
  }
  ink2d.clearRect(0, 0, 1, 1);
  ink2d.fillStyle = 'rgba(0, 0, 0, 0)';
  ink2d.fillStyle = String(s);
  ink2d.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ink2d.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}
function hexOf(s) {
  const [r, g, b, a] = Array.isArray(s) ? s : rgbOf(s);
  if (a === 0) return 'transparent';
  return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
}
function lum([r, g, b]) {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
// what an element paints: the opaque stops of its gradients (the plate under
// a gloss), else its background colour
const COLOUR = /(?:oklch|oklab|rgba?|hsla?|color|lab|lch)\((?:[^()]|\([^()]*\))*\)/g;
function plateOf(cs) {
  const stops = (cs.backgroundImage.match(COLOUR) ?? []).map(rgbOf).filter((x) => x[3] >= 0.99);
  if (stops.length) return [0, 1, 2].map((i) => stops.reduce((a, x) => a + x[i], 0) / stops.length).concat(1);
  const bg = rgbOf(cs.backgroundColor);
  return bg[3] > 0 ? bg : null;
}
const famOf = (cs) => cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
// the first painted background behind an element, up to the stage
function groundOf(el, stop) {
  for (let n = el; n; n = n.parentElement) {
    const rgb = plateOf(getComputedStyle(n));
    if (rgb) return { el: n, rgb };
    if (n === stop) break;
  }
  return null;
}

/* ---------- per component: what the contract can't say yet (concept, question 2) ---------- */
const labelOf = (c) => (c.usage ?? []).map((u) => u.match(/reads "([^"]+)"/)?.[1]).find(Boolean);
const CFG = {
  Button: {
    label: (c) => labelOf(c) ?? 'Save changes',
    axes: [
      { key: 'variant', label: 'Variant', from: 'variants' },
      { key: 'shape', label: 'Shape', from: 'shapes' },
    ],
    // dont[i] -> the part it is about
    ruleParts: { 0: 'fill', 1: 'box', 2: 'label', 3: 'fill', 4: 'shadow', 5: 'ring' },
    // picking a part that only shows on one tier or state takes the stage there
    needs: { shadow: { variant: 'primary' }, fill: { variant: 'primary' }, ring: { st: 'focus' } },
    render: (o) => (
      <Button variant={o.variant} shape={o.shape} disabled={o.st === 'disabled'} onClick={noop}>
        {o.label}
      </Button>
    ),
    jsx: (o) => [`<Button variant="${o.variant}"${o.shape && o.shape !== 'default' ? ` shape="${o.shape}"` : ''}${o.st === 'disabled' ? ' disabled' : ''}>${o.label}</Button>`],
  },
  FilterChip: {
    label: () => 'Cases',
    axes: [{ key: 'size', label: 'Size', values: ['default', 'compact'] }],
    ruleParts: { 0: 'box', 1: 'outline', 2: 'pressed' },
    needs: {},
    render: (o, live) => (
      <FilterChip pressed={live ? live.pressed : o.st === 'pressed'} size={o.size} onClick={live ? live.toggle : noop}>
        {o.label}
      </FilterChip>
    ),
    jsx: (o) => [`<FilterChip pressed={${o.st === 'pressed'}}${o.size === 'compact' ? ' size="compact"' : ''} onClick={toggle}>${o.label}</FilterChip>`],
  },
};
// everything else: the same surface with whatever CHIP has for it
function cfgOf(c) {
  if (CFG[c.name]) return CFG[c.name];
  const V = VARIANTS[c.name];
  const R = SPECIMENS[c.name];
  const el = (o) => (V && o.variant ? V(o.variant) : R ? R() : null);
  return {
    generic: true,
    label: () => null,
    axes: V && c.variants?.length ? [{ key: 'variant', label: 'Variant', from: 'variants' }] : [],
    ruleParts: {},
    needs: {},
    render: el,
    jsx: (o) => jsxLines(el(o)),
  };
}
// a component with no anatomy still has a box to measure
const partsOf = (c) =>
  c.parts?.length
    ? c.parts
    : [{ key: 'box', n: 1, title: 'Box', kind: 'box', target: ':scope', token: c.minTarget?.token ?? null, value: null, detail: 'Measured on the render. The contract names no parts yet.', synthetic: true }];

/* ---------- measuring the parts ---------- */
// a target's box, cut to the window it shows through (the label roll)
function clipped(els, root) {
  const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width || r.height);
  if (!rs.length) return root.getBoundingClientRect();
  let l = Math.min(...rs.map((r) => r.left));
  let t = Math.min(...rs.map((r) => r.top));
  let r = Math.max(...rs.map((x) => x.right));
  let b = Math.max(...rs.map((x) => x.bottom));
  let clip = null;
  for (let n = els[0].parentElement; n && n !== root.parentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
    clip = n.getBoundingClientRect();
    l = Math.max(l, clip.left);
    t = Math.max(t, clip.top);
    r = Math.min(r, clip.right);
    b = Math.min(b, clip.bottom);
  }
  // rolled out of its window: the window is where it shows
  if ((r - l < 1 || b - t < 1) && clip) return clip;
  return { left: l, top: t, width: Math.max(0, r - l), height: Math.max(0, b - t) };
}

// the focus ring: on the element, or on a pseudo-element (the primary keycap
// draws it on ::before, around its key edge). Returns its stroke and the box it rings.
function ringOf(root) {
  for (const pseudo of [null, '::before', '::after']) {
    const cs = getComputedStyle(root, pseudo);
    if (cs.outlineStyle === 'none' || !(num(cs.outlineWidth) > 0)) continue;
    // a pseudo's box: the root's, moved by its insets
    const ins = pseudo && cs.position === 'absolute' ? ['top', 'right', 'bottom', 'left'].map((k) => num(cs[k]) ?? 0) : [0, 0, 0, 0];
    return { cs, pseudo, width: num(cs.outlineWidth), offset: num(cs.outlineOffset) ?? 0, color: cs.outlineColor, ins };
  }
  return null;
}

/** Every part's own box (own), where its outline goes (zone) and the edge its dot sits on (edge), in canvas space. */
function geoOf(canvas, root, parts) {
  const cr = canvas.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  const k = root.offsetWidth ? rr.width / root.offsetWidth : 1;
  const rel = (r) => ({ x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height });
  const grow = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
  const box = rel(rr);
  const cs = getComputedStyle(root);
  const out = parts.map((p) => {
    const els = p.target && p.target !== ':scope' ? targetsOf(root, p.target) : [root];
    let own = els.length ? rel(clipped(els, root)) : box;
    // a label that is the whole element: the words themselves, not the box
    if (p.kind === 'content' && els[0] === root && root.textContent.trim()) {
      const range = document.createRange();
      range.selectNodeContents(root);
      const t = range.getBoundingClientRect();
      if (t.width && t.height) own = rel(t);
    }
    let zone = own;
    let edge = own;
    if (p.kind === 'ring') {
      // the outline itself when it shows, BELLA's ring tokens when it doesn't
      const ring = ringOf(root);
      const w = ring?.width ?? num(cs.getPropertyValue('--focus-ring-width')) ?? 3;
      const off = ring?.offset ?? num(cs.getPropertyValue('--focus-ring-offset')) ?? 3;
      const [t, r, b, l] = (ring?.ins ?? [0, 0, 0, 0]).map((v) => v * k);
      const base = { x: box.x + l, y: box.y + t, w: box.w - l - r, h: box.h - t - b };
      zone = grow(base, (off + w) * k);
      edge = grow(base, (off + w / 2) * k);
    } else if (p.kind === 'shadow') {
      // the key edge: the first shadow layer's y offset, under the box
      const m = cs.boxShadow.split(/,(?![^(]*\))/)[0].match(/(-?[\d.]+)px\s+(-?[\d.]+)px/);
      const dy = Math.max(2, m ? Math.abs(+m[2]) : p.zone?.size ?? 4) * k;
      zone = edge = { x: box.x + 4 * k, y: box.y + box.h, w: Math.max(0, box.w - 8 * k), h: dy };
    } else if (p.kind === 'fill' || p.kind === 'state') {
      // inside the edge, so the dot lands on the paint, not the border
      zone = edge = grow(own, -((num(cs.borderTopWidth) ?? 0) + 3) * k);
    }
    return { ...p, own, zone, edge };
  });
  return { box, k, w: cr.width, h: cr.height, parts: out };
}

const CH = 36; // chip height
const GAP = 48; // chip pitch
const OUT = 64; // chip distance from the specimen
const PAD = 16;
/** A leader as her 19 Nov mock draws it: out of the chip along its side, one
 * rounded bend, into the dot (guideline 17). Straight only when already in line. */
function leaderPath(side, ex, ey, ax, ay) {
  const flat = side === 'L' || side === 'R'; // leaves the chip sideways; T and B leave it up or down
  const d1 = flat ? ax - ex : ay - ey;
  const d2 = flat ? ay - ey : ax - ex;
  if (Math.abs(d2) < 2 || Math.abs(d1) < 2) return `M${ex} ${ey}L${ax} ${ay}`;
  const r = Math.min(12, Math.abs(d1), Math.abs(d2));
  const s1 = Math.sign(d1), s2 = Math.sign(d2);
  return flat
    ? `M${ex} ${ey}H${ax - s1 * r}Q${ax} ${ey} ${ax} ${ey + s2 * r}V${ay}`
    : `M${ex} ${ey}V${ay - s1 * r}Q${ex} ${ay} ${ex + s2 * r} ${ay}H${ax}`;
}

/** Where each chip goes and where its leader lands: beside the specimen, or above and below when it is too wide. */
function placePins(geo, widths) {
  if (!geo) return [];
  const { box, w: cw } = geo;
  const ps = geo.parts;
  const zy = (p) => p.zone.y + p.zone.h / 2 + (p.kind === 'shadow' ? 1000 : 0);
  const L = ps.filter((_, i) => i % 2 === 0).sort((a, b) => zy(a) - zy(b));
  const R = ps.filter((_, i) => i % 2 === 1).sort((a, b) => zy(a) - zy(b));
  const bwOf = (p) => Math.min(widths[p.key] ?? 160, 240);
  const maxL = Math.max(0, ...L.map(bwOf));
  const maxR = Math.max(0, ...R.map(bwOf));
  const out = [];
  if (box.x - OUT - maxL >= PAD && box.x + box.w + OUT + maxR <= cw - PAD) {
    const cy = box.y + box.h / 2;
    for (const [list, side] of [[L, 'L'], [R, 'R']]) {
      const total = (list.length - 1) * GAP;
      list.forEach((p, i) => {
        const bw = bwOf(p);
        const y = cy - total / 2 + i * GAP;
        const x = side === 'L' ? Math.max(PAD, Math.min(box.x - OUT - bw, cw * 0.08)) : Math.min(cw - PAD - bw, Math.max(box.x + box.w + OUT, cw * 0.92 - bw));
        const e = p.edge;
        const inset = Math.min(3, e.h / 2);
        // a chip level with the part meets its side; one above or below meets its top or bottom, after one bend
        const level = y >= box.y + inset && y <= box.y + box.h - inset;
        const ax = level ? (side === 'L' ? Math.min(e.x, box.x) : Math.max(e.x + e.w, box.x + box.w)) : clamp(e.x + e.w / 2, box.x + 8, box.x + box.w - 8);
        const ay = level ? y : y < box.y ? Math.min(e.y, box.y) : Math.max(e.y + e.h, box.y + box.h);
        out.push({ p, side, x, y: y - CH / 2, bw, ex: side === 'L' ? x + bw : x, ey: y, ax, ay });
      });
    }
    return out;
  }
  // above and below: a part under the box (the key shadow) goes below; each row in x order, so leaders don't cross
  const under = new Set(ps.filter((p) => p.kind === 'shadow'));
  ps.filter((p) => !under.has(p)).forEach((p, i) => i % 2 === 1 && under.size < Math.floor(ps.length / 2) && under.add(p));
  const below = (p) => under.has(p);
  const cx = (p) => p.edge.x + p.edge.w / 2;
  const T = ps.filter((p) => !below(p)).sort((a, b) => cx(a) - cx(b));
  const B = ps.filter((p) => below(p)).sort((a, b) => cx(a) - cx(b));
  // a row too wide for the stage wraps onto more lines, outward from the specimen
  const room = cw - 2 * PAD;
  for (const [list, row] of [[T, 'T'], [B, 'B']]) {
    const lines = [[]];
    let used = 0;
    for (const p of list) {
      const bw = bwOf(p);
      if (lines.at(-1).length && used + 12 + bw > room) {
        lines.push([]);
        used = 0;
      }
      used += (lines.at(-1).length ? 12 : 0) + bw;
      lines.at(-1).push(p);
    }
    // the gap to the specimen shrinks (72 down to 32) so a wrapped stack stays inside the stage
    const room2 = row === 'T' ? box.y - PAD : geo.h - PAD - (box.y + box.h);
    const off = clamp(room2 - CH / 2 - (lines.length - 1) * (CH + 12), 32, 72);
    lines.forEach((line, li) => {
      const total = line.reduce((a, p) => a + bwOf(p), 0) + Math.max(0, line.length - 1) * 12;
      let x = clamp(box.x + box.w / 2 - total / 2, PAD, Math.max(PAD, cw - PAD - total));
      const step = li * (CH + 12);
      const y = row === 'T' ? box.y - off - CH / 2 - step : box.y + box.h + off - CH / 2 + step;
      for (const p of line) {
        const bw = bwOf(p);
        const e = p.edge;
        const mid = x + bw / 2;
        const inset = Math.min(3, e.w / 2);
        out.push({ p, side: row, x, y, bw, ex: mid, ey: row === 'T' ? y + CH : y, ax: clamp(mid, e.x + inset, e.x + e.w - inset), ay: row === 'T' ? Math.min(e.y, box.y) : Math.max(e.y + e.h, box.y + box.h) });
        x += bw + 12;
      }
    });
  }
  return out;
}

// a redline: the measured length between two ticks, its label in a red pill
function Dim({ x1, y1, x2, y2, text, vertical }) {
  const tx = vertical ? x1 - 10 : (x1 + x2) / 2;
  const ty = vertical ? (y1 + y2) / 2 : y1 - 10;
  const w = String(text).length * 9 + 14;
  return (
    <g className="dm-dim">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {vertical ? (
        <>
          <line x1={x1 - 5} y1={y1} x2={x1 + 5} y2={y1} />
          <line x1={x1 - 5} y1={y2} x2={x1 + 5} y2={y2} />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - 5} x2={x1} y2={y1 + 5} />
          <line x1={x2} y1={y2 - 5} x2={x2} y2={y2 + 5} />
        </>
      )}
      <rect x={vertical ? tx - w : tx - w / 2} y={ty - 12} width={w} height={24} rx={12} />
      <text x={vertical ? tx - w / 2 : tx} y={ty + 5} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

/* ---------- the stage's states: BELLA's own rules, forced through attributes ---------- */
const FORCE = ['data-force-hover', 'data-force-focus', 'data-force-active'];
function applyState(root, st, generic) {
  if (!root) return;
  for (const a of FORCE) root.removeAttribute(a);
  if (!st) return;
  const f = forceAttr(st === 'press' ? 'active' : st);
  if (f && f[0] !== 'aria-pressed') root.setAttribute(f[0], f[1]);
  if (generic && f?.[0] === 'aria-pressed' && root.hasAttribute('aria-pressed')) root.setAttribute('aria-pressed', 'true');
  if (generic && st === 'disabled') {
    if ('disabled' in root) root.disabled = true;
    else root.setAttribute('aria-disabled', 'true');
  }
}

/* ---------- checks: measured on the specimen, every change ---------- */
function proseDrift({ root, parts, c, o, st, theme, contrast, disabled, variantKeyed }) {
  const out = [];
  const cs = getComputedStyle(root);
  for (const p of parts) {
    const d = p.detail || '';
    const font = d.match(/^([A-Z][a-z]+) (\d+), (\d{3})/);
    if (font && p.kind === 'content') {
      const el = (p.target !== ':scope' && root.querySelector(p.target)) || root;
      const ls = getComputedStyle(el);
      const got = { fam: famOf(ls), size: num(ls.fontSize), weight: num(ls.fontWeight) };
      if (got.fam !== font[1] || got.size !== +font[2] || got.weight !== +font[3]) out.push({ part: p.key, says: `${font[1]} ${font[2]}, ${font[3]}`, got: `${got.fam} ${got.size}, ${got.weight}`, src: `anatomy.${p.key}` });
    }
    const pad = d.match(/padding (\d+) \/ (\d+)/);
    if (pad && p.kind === 'box') {
      const pt = num(cs.paddingTop);
      const pl = num(cs.paddingLeft);
      if (pt !== +pad[1] || pl !== +pad[2]) out.push({ part: p.key, says: `padding ${pad[1]} / ${pad[2]}`, got: `padding ${pt} / ${pl}`, src: `anatomy.${p.key}` });
    }
  }
  // the a11y line's ratio for what is on stage (it states light first), against the measured one
  const key = variantKeyed ? (st === 'default' ? o.variant : null) : st;
  if (key && theme === 'light' && !disabled && contrast && c.a11y) {
    const re = new RegExp(`\\b${key}\\b[^.]*?(\\d+(?:\\.\\d+)?):1`, 'i');
    const says = c.a11y
      .split(/(?<=\.)\s+/)
      .map((s) => s.match(re)?.[1])
      .find(Boolean);
    const content = parts.find((p) => p.kind === 'content');
    if (says && Math.abs(+says - contrast) > 0.3) out.push({ part: content?.key ?? null, says: `${says}:1 for ${key}`, got: `${contrast.toFixed(1)}:1`, src: 'a11y' });
  }
  return out;
}

// nothing on stage to measure: say so, keep the synced results
function noSpecimen(c) {
  const hl = c.health ?? {};
  const g = (id, label) => ({ id, part: null, grey: true, label, val: 'no specimen', rule: 'measured on the specimen', src: 'specimens.jsx', got: `CHIP has no specimen for ${c.name} yet, so nothing is measured` });
  return [
    g('target', 'Target'),
    g('type', 'Type'),
    g('contrast', 'Contrast'),
    g('ring', 'Focus ring'),
    g('prose', 'Contract vs render'),
    { id: 'parity', part: null, ok: hl.contract?.status === 'pass', grey: !hl.contract, label: 'Contract parity', val: hl.contract ? (hl.contract.status === 'pass' ? 'synced' : 'drift') : 'none', rule: 'props and variants match the code', src: 'contract-parity.mjs', got: hl.contract?.issues?.length ? hl.contract.issues.join('; ') : 'synced result, not live: re-runs on sync' },
  ];
}

function runChecks({ root, canvas, c, cfg, o, parts, st, theme, bella }) {
  const cs = getComputedStyle(root);
  const content = parts.find((p) => p.kind === 'content');
  const lbl = (content && content.target !== ':scope' && root.querySelector(content.target)) || root;
  const ls = getComputedStyle(lbl);
  const h = root.offsetHeight;
  const fs = num(ls.fontSize);
  const g = groundOf(lbl, root);
  const canvasBg = plateOf(getComputedStyle(canvas)) ?? [255, 255, 255, 1];
  const bg = g ? g.rgb : canvasBg;
  const r = ratio(rgbOf(ls.color), bg);
  const disabled = root.disabled || root.getAttribute('aria-disabled') === 'true' || st === 'disabled';
  const on = g ? hexOf(bg) : `the stage ${hexOf(canvasBg)}`;
  const variantKeyed = cfg.axes.some((a) => a.key === 'variant');
  const drift = proseDrift({ root, parts, c, o, st, theme, contrast: r, disabled, variantKeyed });
  const hl = c.health ?? {};
  const ring = ringOf(root);
  const tp = (k) => parts.find((p) => p.key === k || p.kind === k)?.key ?? null;
  return [
    !root.matches('button, a[href], input, select, textarea, [role=button], [role=tab], [role=radio], [tabindex]') && !root.querySelector('button, a[href], input, select, textarea, [role=tab], [role=radio]')
      ? { id: 'target', part: tp('box'), grey: true, label: 'Target', val: 'n/a', rule: 'targets ≥ 44px', src: 'AGENTS.md Floors', got: `${h}px tall; not interactive, so no target to meet` }
      : { id: 'target', part: tp('box'), ok: h >= 44, label: 'Target', val: `${h}px`, rule: 'targets ≥ 44px', src: `AGENTS.md Floors${c.minTarget ? ` · ${c.minTarget.token}` : ''}`, got: `${h}px tall, measured on the specimen` },
    { id: 'type', part: tp('content'), ok: fs >= 16, label: 'Type', val: `${fs}px`, rule: 'nothing < 16px', src: 'AGENTS.md Floors', got: `${famOf(ls)} ${fs}px, ${ls.fontWeight}` },
    disabled
      ? { id: 'contrast', part: tp('content'), grey: true, label: 'Contrast', val: 'n/a', rule: 'disabled controls are exempt', src: 'WCAG 1.4.3', got: `${r.toFixed(1)}:1, label ${hexOf(ls.color)} on ${on}` }
      : { id: 'contrast', part: tp('content'), ok: r >= 4.5, label: 'Contrast', val: `${r.toFixed(1)}:1`, rule: 'text ≥ 4.5:1 (AA); BELLA aims AAA', src: `WCAG 1.4.3${hl.contrast?.pairs ? ` · ${hl.contrast.pairs} pairs in contrast-pairs.mjs` : ''}`, got: `label ${hexOf(ls.color)} on ${on}, ${theme}` },
    st === 'focus'
      ? { id: 'ring', part: tp('ring'), ok: !!ring && ring.width >= 3, label: 'Focus ring', val: ring ? `${ring.width}px` : 'none', rule: 'focus ring = BELLA’s, never removed', src: 'AGENTS.md Floors · --ring-focus-color', got: ring ? `${ring.width}px ${hexOf(ring.color)}, offset ${ring.offset}px${ring.pseudo ? `, drawn on ${ring.pseudo}` : ''}` : 'no outline while focused' }
      : { id: 'ring', part: tp('ring'), grey: true, label: 'Focus ring', val: 'on focus', rule: 'focus ring = BELLA’s, never removed', src: 'AGENTS.md Floors', got: 'pick Focus, or tab to it in Use, to measure it' },
    drift.length
      ? { id: 'prose', part: drift[0].part, needs: true, label: 'Contract vs render', val: `${drift.length} differ`, rule: 'the contract describes what renders', src: `component.${c.id} ${[...new Set(drift.map((x) => x.src))].join(', ')}`, got: drift.map((x) => `${parts.find((p) => p.key === x.part)?.title ?? 'Label'}: contract says “${x.says}”, renders ${x.got}`).join(' · ') }
      : { id: 'prose', part: null, ok: true, label: 'Contract vs render', val: 'match', rule: 'the contract describes what renders', src: `component.${c.id} anatomy, a11y`, got: c.parts?.length ? 'every number the contract names for this render matches it' : 'the contract names no numbers for this component yet' },
    { id: 'parity', part: null, ok: hl.contract?.status === 'pass', grey: !hl.contract, label: 'Contract parity', val: hl.contract ? (hl.contract.status === 'pass' ? 'synced' : 'drift') : 'none', rule: 'props and variants match the code', src: `contract-parity.mjs @ ${bella.source?.commit ?? ''}`, got: hl.contract?.issues?.length ? hl.contract.issues.join('; ') : 'synced result, not live: re-runs on sync' },
    { id: 'visual', part: null, grey: hl.visual?.status !== 'pass' && hl.visual?.status !== 'fail', ok: hl.visual?.status === 'pass', label: 'Visual', val: hl.visual?.status === 'pass' ? 'match' : hl.visual?.status === 'fail' ? 'differs' : 'not run', rule: 'snapshots match', src: 'audit:visual', got: hl.visual?.note ?? 'skipped' },
  ];
}

/* ---------- scenes: the contract's usage and dont lines, as compositions that run ---------- */
const SCENES = {
  Button: [
    { id: 'hero', title: 'Hero call to action', from: 'usage[0]', kind: 'actions', head: 'Design systems that ship', text: 'One primary, one way out.', items: (l) => [{ c: 'Button', v: 'primary', t: l }, { c: 'Button', v: 'secondary', t: 'See the work' }] },
    {
      id: 'two', title: 'Save and publish', from: 'dont[0]', rule: 0, kind: 'actions', head: 'Draft saved 2 min ago',
      items: () => [{ c: 'Button', v: 'primary', t: 'Save' }, { c: 'Button', v: 'primary', t: 'Publish' }],
      fixLabel: 'Make one secondary',
      fix: (its) => {
        const last = its.map((x) => x.v).lastIndexOf('primary');
        return its.map((x, i) => (x.v === 'primary' && i !== last ? { ...x, v: 'secondary' } : x));
      },
    },
    {
      id: 'filters', title: 'Filter the work', from: 'dont[1]', rule: 1, kind: 'filter', head: 'Work',
      items: () => [{ c: 'Button', v: 'primary', t: 'All' }, { c: 'Button', v: 'secondary', t: 'Cases' }, { c: 'Button', v: 'secondary', t: 'Writing' }],
      fixLabel: 'Swap in FilterChip', fix: (its) => its.map((x, i) => ({ c: 'FilterChip', on: i === 0, t: x.t })), goto: 'filter-chip',
    },
    { id: 'nav', title: 'Nav call to action', from: 'usage[4]', kind: 'actions', nav: ['Work', 'Writing', 'About'], items: (l) => [{ c: 'Button', v: 'primary', s: 'pill', t: l }] },
  ],
  FilterChip: [
    { id: 'narrow', title: 'Narrow the library', from: 'usage[1]', kind: 'multi', head: 'Library', items: () => [{ c: 'FilterChip', on: true, t: 'Cases' }, { c: 'FilterChip', on: true, t: 'Writing' }, { c: 'FilterChip', t: 'Talks' }, { c: 'FilterChip', t: 'Tools' }] },
    {
      id: 'views', title: 'Grid or list', from: 'dont[0]', rule: 0, kind: 'exclusive', head: 'Show as',
      items: () => [{ c: 'FilterChip', on: true, t: 'Grid' }, { c: 'FilterChip', t: 'List' }],
      fixLabel: 'Swap in SegmentedControl', fix: (its) => [{ c: 'SegmentedControl', options: its.map((x) => x.t), value: its.find((x) => x.on)?.t ?? its[0].t }], goto: 'segmented-control',
    },
  ],
};
const lineOf = (c, from) => {
  const [, list, i] = from.match(/^(\w+)\[(\d+)\]$/) ?? [];
  return c[list]?.[+i] ?? '';
};

// tier 1 (structure) and tier 2 (measured): the checks Playground runs on a screen, on a tiny one
function sceneFindings(sc, box, byId) {
  const f = [];
  const idx = (els) => [...new Set(els.map((e) => +e.closest('[data-i]')?.dataset.i).filter((n) => !Number.isNaN(n)))];
  const btns = [...box.querySelectorAll('[data-bella-component="button"]')];
  const prim = btns.filter((b) => b.dataset.bellaVariant === 'primary');
  const quote = (id, i) => byId(id)?.dont?.[i] ?? '';
  if (prim.length > 1) f.push({ idx: idx(prim.slice(1)), rule: 'button.dont[0]', text: quote('button', 0), instead: 'Button variant="secondary"' });
  if (sc.kind === 'filter' && btns.length) f.push({ idx: idx(btns), rule: 'button.dont[1]', text: quote('button', 1), instead: 'FilterChip, SegmentedControl, Select' });
  const chips = [...box.querySelectorAll('[data-bella-component="filter-chip"]')];
  if (sc.kind === 'exclusive' && chips.length) f.push({ idx: idx(chips), rule: 'filter-chip.dont[0]', text: quote('filter-chip', 0), instead: 'SegmentedControl' });
  const raised = chips.filter((x) => getComputedStyle(x).boxShadow !== 'none');
  if (raised.length) f.push({ idx: idx(raised), rule: 'filter-chip.dont[1]', text: quote('filter-chip', 1), instead: 'flat chip, outline only' });
  const small = [...box.querySelectorAll('button, a[href]')].filter((x) => x.offsetHeight && x.offsetHeight < 44);
  if (small.length) f.push({ idx: idx(small), rule: 'AGENTS.md Floors', text: 'targets ≥ 44px', instead: 'the 44px touch-target token' });
  return f;
}

function Scene({ sc, c, bella, theme, label, onGoto, notify }) {
  const fresh = useCallback(() => sc.items(label), [sc, label]);
  const [items, setItems] = useState(fresh);
  const [touched, setTouched] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [why, setWhy] = useState(false);
  const [finds, setFinds] = useState([]);
  const box = useRef(null);
  const byId = (id) => bella.components.find((x) => x.id === id);
  useEffect(() => {
    setItems(fresh());
    setTouched(false);
    setFixed(false);
  }, [fresh]);
  // the check runs on what rendered, after every change
  useLayoutEffect(() => {
    const f = sceneFindings(sc, box.current, byId);
    if (JSON.stringify(f) !== JSON.stringify(finds)) setFinds(f);
  });
  const edit = (i, ch) => {
    setItems((its) => its.map((x, j) => (j === i ? { ...x, ...ch } : x)));
    setTouched(true);
  };
  const ORDER = ['primary', 'secondary', 'tertiary'];
  const bad = new Set(finds.flatMap((x) => x.idx));
  const item = (it, i) => {
    let el = null;
    if (it.c === 'Button')
      el = (
        <Button variant={it.v} shape={it.s} onClick={() => edit(i, { v: ORDER[(ORDER.indexOf(it.v) + 1) % ORDER.length] })}>
          {it.t}
        </Button>
      );
    else if (it.c === 'FilterChip')
      el = (
        <FilterChip pressed={!!it.on} onClick={() => edit(i, { on: !it.on })}>
          {it.t}
        </FilterChip>
      );
    else el = <SegmentedControl label={sc.head ?? sc.title} value={it.value} onChange={(v) => edit(i, { value: v })} options={it.options.map((o) => ({ value: o, label: o }))} />;
    return (
      <span key={i} className={`dm-it${bad.has(i) ? ' bad' : ''}`} data-i={i}>
        {el}
      </span>
    );
  };
  const path = `${c.id}.${sc.from}`;
  function openPlay() {
    try {
      sessionStorage.setItem('chip-play-scene', JSON.stringify({ component: c.name, scene: sc.id, title: sc.title, from: path, items }));
    } catch {}
    notify('Opening Playground. It loads site pages; the scene waits in chip-play-scene for it.');
    window.location.hash = '#/play';
  }
  const ok = !finds.length;
  return (
    <article className="dm-scene dm-card" id={`sc-${sc.id}`}>
      <header>
        <h3 tabIndex={-1}>{sc.title}</h3>
        <span className={`dm-verdict ${ok ? 'ok' : 'bad'}`}>{ok ? '✓ Follows the contract' : `× Breaks ${finds[0].rule}`}</span>
      </header>
      <div className="dm-scenebox dm-sp" data-theme={theme === 'dark' ? 'chip-dark' : 'chip-light'} ref={box}>
        {sc.head ? <p className="dm-sh">{sc.head}</p> : null}
        {sc.text ? <p className="dm-sp2">{sc.text}</p> : null}
        {sc.nav ? (
          <div className="dm-nav">
            <span className="dm-wm">ctrl-alt</span>
            {sc.nav.map((n) => (
              <span key={n} className="dm-nl">
                {n}
              </span>
            ))}
            {items.map(item)}
          </div>
        ) : (
          <div className="dm-row">{items.map(item)}</div>
        )}
      </div>
      <footer>
        {finds.length ? (
          <div className="dm-find">
            {finds.map((x) => (
              <p key={x.rule}>
                <b>{x.rule}</b> · instead: <code>{x.instead}</code>
              </p>
            ))}
          </div>
        ) : null}
        <div className="dm-fx k-chrome">
          <span className="dm-src">from {path}</span>
          <button type="button" className="k-link" aria-expanded={why} onClick={() => setWhy(!why)}>
            Why
          </button>
          <span className="dm-fxacts">
          {sc.fix && !fixed ? (
            <Button
              variant="secondary"
              onClick={() => {
                setItems((its) => sc.fix(its));
                setFixed(true);
                setTouched(true);
              }}
            >
              {sc.fixLabel}
            </Button>
          ) : null}
          {fixed && sc.goto && byId(sc.goto) ? (
            <button type="button" className="k-link" onClick={() => onGoto(sc.goto)}>
              {byId(sc.goto).name} docs
            </button>
          ) : null}
          {touched ? (
            <Button
              variant="secondary"
              onClick={() => {
                setItems(fresh());
                setFixed(false);
                setTouched(false);
              }}
            >
              Reset
            </Button>
          ) : null}
          <button type="button" className="k-link" onClick={openPlay}>
            Open in Playground
          </button>
          </span>
        </div>
        {why ? <blockquote className="dm-wq">“{lineOf(c, sc.from)}”</blockquote> : null}
      </footer>
    </article>
  );
}

/* ---------- Ask: answers only by quoting the contract ---------- */
const SUGG = {
  Button: ['Can a form have two primaries?', 'Can I use it to filter a list?', 'Does it lift on hover?', 'What colour is the focus ring?', 'Can it be round?'],
  FilterChip: ['Can I use it for grid or list?', 'Is colour enough for pressed?', 'How big is the target?', 'Can it have a shadow?'],
};
const suggOf = (c) => SUGG[c.name] ?? (c.dont?.length ? ['What should I not do?', 'Where is it used?'] : ['Where is it used?']);
const SYN = { two: ['one', 'more'], filter: ['filter', 'toggle', 'sort'], list: ['filter'], round: ['pill', 'rounded'], rounded: ['pill'], shadow: ['raise', 'lift', 'keycap', 'shadow'], lift: ['lift', 'raise'], raise: ['raise', 'lift'], ring: ['focus', 'ring'], focus: ['focus', 'ring'], colour: ['colour', 'color', 'fill', 'ochre'], color: ['colour', 'color'], big: ['44px', 'target', 'min'], target: ['44px', 'target', 'hit'], font: ['figtree', 'unique', 'label', 'type'], view: ['view', 'views'], grid: ['views', 'exclusive'], pressed: ['pressed', 'aria'], enough: ['alone'], disabled: ['disabled'], underline: ['underline', 'tertiary'], nav: ['nav'], not: ['do'], used: ['usage', 'use'] };
const STOP = new Set('a an the i it is are can do does to of in on for with my be use using what how this that should could would when or and as at by me we you your our its than then so if there their they'.split(' '));
const stem = (w) => w.replace(/ies$/, 'y').replace(/(ing|ed)$/, '').replace(/s$/, '');
const words = (s) => s.toLowerCase().replace(/[^a-z0-9#. ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map(stem);
function corpusOf(c, cfg, parts) {
  const L = [];
  (c.dont ?? []).forEach((t, i) => L.push({ t, path: `${c.id}.dont[${i}]`, part: cfg.ruleParts[i], scene: (SCENES[c.name] ?? []).find((s) => s.rule === i), w: 1.3 }));
  (c.usage ?? []).forEach((t, i) => L.push({ t, path: `${c.id}.usage[${i}]`, w: 1 }));
  (c.a11y ?? '').split(/(?<=[.)])\s+(?=[A-Z])/).forEach((t) => t && L.push({ t, path: `${c.id}.a11y`, w: 1 }));
  (c.restNote ?? '').split(/(?<=\.)\s+/).forEach((t) => t && L.push({ t, path: `${c.id}.restState`, w: 0.9 }));
  parts.filter((p) => !p.synthetic).forEach((p) => L.push({ t: `${p.title}: ${p.detail}`, path: `${c.id}.anatomy.${p.key}`, part: p.key, w: 1 }));
  for (const l of L) l.ws = new Set(words(l.t));
  return L;
}
function askContract(q, corpus) {
  const N = corpus.length;
  const qs = [...new Set(words(q).flatMap((w) => [w, ...(SYN[w] ?? []).map(stem)]))];
  const df = (w) => corpus.filter((l) => l.ws.has(w)).length;
  return corpus
    .map((l) => ({ l, s: qs.reduce((a, w) => a + (l.ws.has(w) ? Math.log(1 + N / df(w)) : 0), 0) * l.w }))
    .filter((x) => x.s > 1.6)
    .sort((a, b) => b.s - a.s)
    .slice(0, 2)
    .map((x) => x.l);
}

/* ---------- accessibility, measured on every tier ---------- */
function A11yFacts({ c, cfg, label }) {
  const stage = useRef(null);
  const [rows, setRows] = useState([]);
  const tiers = cfg.axes.find((a) => a.key === 'variant') ? c.variants ?? [] : [null];
  useLayoutEffect(() => {
    const measure = () =>
      setRows(
        [...(stage.current?.querySelectorAll('[data-bella-component]') ?? [])]
          .filter((el) => !el.parentElement.closest('[data-bella-component]'))
          .map((el) => {
            const role = el.getAttribute('role') || { BUTTON: 'button', A: 'link', INPUT: 'textbox', SELECT: 'combobox' }[el.tagName] || el.tagName.toLowerCase();
            // BELLA's label roll renders the label twice; the name is said once
            const t = el.textContent.trim();
            const half = t.slice(0, t.length / 2);
            const name = el.getAttribute('aria-label') || (t.length % 2 === 0 && half + half === t ? half : t);
            return { role, name, w: el.offsetWidth, h: el.offsetHeight };
          })
      );
    measure();
    document.fonts?.ready.then(measure);
  }, [c.id, label]);
  const target = parseFloat(c.minTarget?.value);
  const ct = c.health?.contrast ?? {};
  return (
    <div className="dm-a11y">
      <div className="dm-a11ystrip" ref={stage} inert aria-hidden="true">
        {tiers.map((v) => (
          <span key={v ?? 'one'}>{cfg.render({ variant: v, shape: 'default', size: 'default', st: 'default', label })}</span>
        ))}
      </div>
      <table className="ttab a-sla">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row">{tiers[i] ? cap1(tiers[i]) : c.name}</th>
              <td>
                {r.role} “{r.name}” · {r.w} × {r.h}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">Screen readers</th>
            <td>{c.rendersAs ? `Renders as ${c.rendersAs}. ` : ''}The visible label is the name unless ariaLabel says otherwise.</td>
          </tr>
          <tr>
            <th scope="row">Keyboard</th>
            <td>{keyboardOf(c)}</td>
          </tr>
          <tr>
            <th scope="row">Touch targets</th>
            <td>{c.minTarget ? `${c.minTarget.value} minimum, from ${c.minTarget.token}: ${target >= 44 ? 'meets' : 'under'} BELLA’s 44 floor (WCAG 2.5.5); 2.5.8 asks 24.` : 'No minimum target in the contract.'}</td>
          </tr>
          <tr>
            <th scope="row">Contrast</th>
            <td>{ct.status === 'fail' ? `Failing: ${ct.failing.join('; ')}` : ct.status === 'pass' ? `${ct.pairs} of ${ct.pairs} pairs pass.` : 'No contrast pairs declared.'}</td>
          </tr>
          {c.a11y ? (
            <tr>
              <th scope="row">Verified</th>
              <td>{c.a11y}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Behind it: where the words still live, one row each ---------- */
// paths and links may break after a "/", never inside a name like Button.tsx
const atSlashes = (t) => (typeof t === 'string' ? t.split('/').flatMap((part, i, all) => (i < all.length - 1 ? [part, '/', <wbr key={i} />] : [part])) : t);

function Row({ name, sum, hint, children }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <b>{name}</b>
        <span>{atSlashes(sum)}</span>
        <em>{hint}</em>
      </summary>
      {open ? <div className="dm-bd">{children}</div> : null}
    </details>
  );
}

/* ================= the page ================= */
const firstSentence = (s) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? t;
};

export default function Atlas({ c, bella, lens = 'visual', onOpen, role = 'admin', vis = { components: {} }, pinned, onPin }) {
  const reduced = useReducedMotion();
  const cfg = useMemo(() => (c ? cfgOf(c) : null), [c?.id]);
  const parts = useMemo(() => (c ? partsOf(c) : []), [c?.id]);
  const axisVals = (ax) => ax.values ?? c?.[ax.from] ?? [];
  const axes = cfg ? cfg.axes.filter((ax) => axisVals(ax).length) : [];

  // what is on stage
  const [o, setO] = useState({});
  const [mode, setMode] = useState('inspect');
  const [z, setZ] = useState(2);
  const [theme, setTheme] = useState('light');
  const [all, setAll] = useState(false);
  const [allChecks, setAllChecks] = useState(false); // passing and not-run checks fold into one "N pass" pill
  const [sel, setSel] = useState(null);
  const [hov, setHov] = useState(null);
  const [live, setLive] = useState(null); // the state the pointer or keyboard put it in, in Use
  const [pressed, setPressed] = useState(false); // FilterChip in Use: really toggles
  const [why, setWhy] = useState(null);
  const [read, setRead] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [toast, setToast] = useState('');

  const [lint, setLint] = useState(null);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [testsAt, setTestsAt] = useState(0);
  const id = c?.id;
  const doc = useJson(id ? `/bella-doc/${id}` : null);
  const spec = useJson(id ? `/bella-spec/${id}` : null);
  const hist = useJson(id ? `/bella-history/${id}` : null);
  const tests = useJson(id ? `/component-tests/${id}?t=${testsAt}` : null);
  const readLint = useCallback(
    (refresh) => {
      if (!id) return;
      setReading(true);
      fetch(`/figma-lint/${id}${refresh ? '?refresh=1' : ''}`)
        .then((r) => r.json())
        .then(setLint)
        .catch(() => setLint({ read: false, at: new Date().toISOString(), reason: "The CHIP server didn't answer." }))
        .finally(() => setReading(false));
    },
    [id]
  );
  useEffect(() => {
    setLint(null);
    readLint(false);
  }, [id]);
  useEffect(() => installForcedStates(), []);
  useEffect(() => {
    const again = () => setTestsAt(Date.now());
    window.addEventListener('chip:changed', again);
    return () => window.removeEventListener('chip:changed', again);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // a new component starts at rest, on its first tier
  useEffect(() => {
    if (!c || !cfg) return;
    setO({ variant: c.variants?.[0] ?? null, shape: c.shapes?.[0] ?? 'default', size: 'default', st: c.states?.[0] ?? 'default', label: cfg.label(c) });
    setSel(null);
    setHov(null);
    setWhy(null);
    setLive(null);
    setAll(false);
    setPlaying(false);
    setAnswer(null);
    setQ('');
    setRead(false);
  }, [id]);

  const canvas = useRef(null);
  const wrap = useRef(null);
  const ckRef = useRef(null);
  const pinsRef = useRef(null);
  const filmRef = useRef(null);
  const plistRef = useRef(null);
  const suggRef = useRef(null);
  useRove(ckRef);
  useRove(pinsRef);
  useRove(filmRef);
  useRove(plistRef);
  useRove(suggRef);
  const chipEls = useRef({});
  const [geo, setGeo] = useState(null);
  const [checks, setChecks] = useState([]);
  const [widths, setWidths] = useState({});
  const rootOf = () => wrap.current?.querySelector('[data-bella-component]') ?? null;
  const st = mode === 'use' ? live ?? (pressed ? 'pressed' : 'default') : o.st;

  const measure = useCallback(() => {
    const root = rootOf();
    if (!root || !canvas.current || !c) {
      setGeo(null);
      setChecks(c ? noSpecimen(c) : []);
      return;
    }
    setGeo(geoOf(canvas.current, root, parts));
    setChecks(runChecks({ root, canvas: canvas.current, c, cfg, o, parts, st: st ?? 'default', theme, bella }));
  }, [c, cfg, o, parts, st, theme, bella]);

  // force the state, measure now and again once BELLA's transitions settle
  useLayoutEffect(() => {
    if (!o.label && cfg && !cfg.generic) return;
    applyState(rootOf(), mode === 'inspect' ? o.st : null, cfg?.generic);
    measure();
    const t = setTimeout(measure, reduced ? 0 : 320);
    return () => clearTimeout(t);
  }, [measure, mode, z, all, lens, reduced]);

  // and on resize, fonts, and every transition the specimen runs
  useEffect(() => {
    if (!canvas.current) return;
    let raf = 0;
    const again = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(again);
    ro.observe(canvas.current);
    const root = rootOf();
    if (root) ro.observe(root);
    document.fonts?.ready.then(again);
    const w = wrap.current;
    w?.addEventListener('transitionend', again);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      w?.removeEventListener('transitionend', again);
    };
  }, [measure]);

  // a narrow stage gets 1×, so the chips have room beside the specimen
  useLayoutEffect(() => {
    if (canvas.current && canvas.current.offsetWidth < 760) setZ(1);
  }, [id]);

  // chip widths are measured, then the leaders drawn to them
  useLayoutEffect(() => {
    const next = {};
    for (const [k, el] of Object.entries(chipEls.current)) if (el) next[k] = el.offsetWidth;
    if (Object.keys(next).some((k) => Math.abs((widths[k] ?? 0) - next[k]) > 1)) setWidths(next);
  });

  // Play states: one state a beat
  useEffect(() => {
    if (!playing || !c) return;
    const sts = c.states?.length ? c.states : ['default'];
    const t = setInterval(() => setO((x) => ({ ...x, st: sts[(sts.indexOf(x.st) + 1) % sts.length] })), 1100);
    return () => clearInterval(t);
  }, [playing, id]);

  if (!c || !bella || !cfg) return <p className="loading">Loading BELLA…</p>;
  const settings = settingsOf(vis, c);
  const crumb = `Components · ${c.category ?? NO_CONTRACT} · ${c.name}`;
  if (!canSee(role, settings.visibleTo))
    return (
      <div className="atlas k-chrome">
        <div>
          <p className="k-meta dm-crumb">{crumb}</p>
          <h1 className="k-h1">{c.name}</h1>
        </div>
        <p className="k-note">This page is visible to {settings.visibleTo} only. View as an Editor or Admin to see it.</p>
      </div>
    );

  const partOf = (k) => parts.find((p) => p.key === k);
  const rulesOn = (k) => Object.entries(cfg.ruleParts).filter(([, v]) => v === k).map(([i]) => +i);
  const scenes = SCENES[c.name] ?? [];
  const states = c.states?.length ? c.states : ['default'];
  const trigOf = (p) => (p.trigger && p.trigger !== 'rest' ? p.trigger : p.kind === 'ring' ? 'focus' : null);
  const visible = (p) => {
    const t = trigOf(p);
    return !t || st === t;
  };

  function pick(k) {
    const next = sel === k ? null : k;
    setSel(next);
    if (!next) return;
    setMode('inspect');
    setPlaying(false);
    const p = partOf(next);
    const need = cfg.needs[next];
    const t = p && p.trigger && p.trigger !== 'rest' ? p.trigger : null;
    if (need || t) setO((x) => ({ ...x, ...(need ?? {}), ...(t ? { st: t } : {}) }));
  }
  const setAxis = (k, v) => (setO((x) => ({ ...x, [k]: v })), setPlaying(false));
  const setState = (s) => (setO((x) => ({ ...x, st: s })), setPlaying(false));
  const notify = setToast;

  /* ---- the stage ---- */
  const pins = all || !geo ? [] : placePins(geo, widths);
  const on = (k) => sel === k || hov === k;
  const tokShort = (t) => (t ?? '').replace(`--component-${c.id}-`, '').replace(/^--/, '');
  const shortVal = (p) => {
    const v = p.value?.[theme] ?? p.value?.light;
    return v && (/^#[0-9a-f]{3,8}$/i.test(v) || /^\d+px$/.test(v)) ? v : '';
  };
  const chipText = (p) => {
    if (lens === 'technical') return <span className="tok">{p.token ? tokShort(p.token) : p.synthetic ? 'no token' : p.key}</span>;
    if (lens === 'scope') {
      const n = rulesOn(p.key).length;
      return (
        <span>
          {p.title} <em>· {n ? plural(n, 'rule') : 'no rule'}</em>
        </span>
      );
    }
    const v = shortVal(p);
    return (
      <span>
        {p.title}
        {v ? <em> · {v}</em> : null}
      </span>
    );
  };
  const focusPart = (el) => setHov(el?.dataset.part ?? null);

  const redlines = () => {
    const k = sel ?? hov;
    const p = k && geo?.parts.find((x) => x.key === k);
    if (!p) return null;
    const b = geo.box;
    const root = rootOf();
    if (p.kind === 'box')
      return (
        <>
          <Dim x1={b.x - 14} y1={b.y} x2={b.x - 14} y2={b.y + b.h} text={Math.round(b.h / geo.k)} vertical />
          <Dim x1={b.x} y1={b.y - 14} x2={b.x + b.w} y2={b.y - 14} text={Math.round(b.w / geo.k)} />
        </>
      );
    if (p.kind === 'content' && p.target !== ':scope' && root) {
      const bw = num(getComputedStyle(root).borderLeftWidth) ?? 0;
      const ly = b.y + b.h + 18;
      const l = p.own;
      return (
        <>
          <Dim x1={b.x} y1={ly} x2={l.x} y2={ly} text={Math.round((l.x - b.x) / geo.k - bw)} />
          <Dim x1={l.x + l.w} y1={ly} x2={b.x + b.w} y2={ly} text={Math.round((b.x + b.w - l.x - l.w) / geo.k - bw)} />
        </>
      );
    }
    return null;
  };

  const liveProps = cfg.generic ? null : { pressed, toggle: () => (setPressed((v) => !v), setLive(null)) };
  const stage = cfg.render(o.label || cfg.generic ? o : { ...o, label: cfg.label(c) }, mode === 'use' ? liveProps : null);
  const useEvents =
    mode === 'use'
      ? {
          onPointerEnter: () => setLive('hover'),
          onPointerLeave: () => setLive(null),
          onPointerDown: () => setLive(states.includes('active') ? 'active' : null),
          onPointerUp: () => setLive('hover'),
          onFocus: (e) => e.target.matches(':focus-visible') && setLive('focus'),
          onBlur: () => setLive(null),
        }
      : {};

  /* ---- inspector ---- */
  const measured = (p) => {
    const root = rootOf();
    if (!root) return '';
    const cs = getComputedStyle(root);
    if (p.kind === 'box') return `${root.offsetHeight} × ${root.offsetWidth}px, padding ${num(cs.paddingTop)} / ${num(cs.paddingLeft)}, radius ${cs.borderTopLeftRadius}${cs.minHeight !== 'auto' && cs.minHeight !== '0px' ? `, min ${cs.minHeight}` : ''}`;
    if (p.kind === 'content') {
      const ls = getComputedStyle((p.target !== ':scope' && root.querySelector(p.target)) || root);
      return `${famOf(ls)} ${ls.fontSize}, ${ls.fontWeight}`;
    }
    if (p.kind === 'ring') {
      const ring = ringOf(root);
      return ring ? `${ring.width}px ${hexOf(ring.color)}, offset ${ring.offset}px${ring.pseudo ? ` on ${ring.pseudo}` : ''}` : 'not shown in this state';
    }
    if (p.kind === 'fill' || p.kind === 'state') return plateOf(cs) ? hexOf(plateOf(cs)) : 'transparent';
    if (p.kind === 'edge') return `${cs.borderTopWidth} ${hexOf(cs.borderTopColor)}`;
    if (p.kind === 'shadow') return cs.boxShadow === 'none' ? 'none in this state' : cs.boxShadow.split(/,(?![^(]*\))/)[0];
    return '';
  };
  const jsx = cfg.jsx({ ...o, label: o.label ?? '' });
  const importLine = `import { ${c.name} } from 'bella';`;
  const delta = st && st !== 'default' && st !== 'rest' ? stateTokens(c, o.variant, st) : [];
  const props = (spec?.props ?? []).filter((p) => !['children', 'className'].includes(p.name));
  const rule = o.variant ? agentRuleFor(doc, c, o.variant) : null;
  const tierLine = o.variant ? bulletsOf(sectionsOf(doc?.guidance?.md)['Choosing a tier']).find((t) => t.toLowerCase().includes(o.variant)) : null;
  const link = (n) => {
    const x = bella.components.find((y) => y.name === n || y.id === n);
    return x ? (
      <a key={n} href={`#/atlas/${x.id}`} onClick={(e) => (e.preventDefault(), onOpen?.(x.id))}>
        {x.name}
      </a>
    ) : (
      n
    );
  };
  const join = (xs) => xs.map((x, i) => <React.Fragment key={i}>{i ? ', ' : ''}{x}</React.Fragment>);

  function Detail() {
    // a pin from the last component lasts one render: treat it as none
    if (!sel || !partOf(sel)) {
      if (lens === 'technical')
        return (
          <>
            <h3>
              On stage <span className="cap">the code for exactly this</span>
            </h3>
            <CodeBlock title="JSX" lines={[importLine, '', ...jsx, ...(st && st !== 'default' && mode === 'inspect' ? [`{/* shown: :${st === 'focus' ? 'focus-visible' : st} */}`] : [])]} notify={notify} />
            <dl className="dm-kv">
              <dt>Renders</dt>
              <dd>{c.rendersAs ?? 'not in the contract'}</dd>
              <dt>Tokens</dt>
              <dd>{c.tokens?.count ?? 0}</dd>
              {delta.length ? (
                <>
                  <dt>{STATE_LABEL(st)} reads</dt>
                  <dd>
                    {delta.map((t) => (
                      <code key={t}>{t} </code>
                    ))}
                  </dd>
                </>
              ) : null}
            </dl>
            {props.length ? (
              <div className="a-tscroll">
                <table className="ttab props">
                  <caption className="dm-cap">Props, from BELLA’s docgen</caption>
                  <tbody>
                    {props.map((p) => (
                      <tr key={p.name}>
                        <th scope="row">{p.name}</th>
                        <td>
                          {valuesOf(p)}
                          {p.description ? <small>{p.description.replace(/`/g, '').replace(/[;:]$/, '')}</small> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="cap">Props: {(c.props ?? []).join(', ') || 'none listed'}</p>
            )}
          </>
        );
      if (lens === 'scope')
        return (
          <>
            <h3>
              Where it goes <span className="cap">from the contract</span>
            </h3>
            {(c.usage ?? []).length ? (
              <div className="dm-rules">
                {c.usage.map((u, i) => (
                  <p key={i} className="dm-rule use">
                    <span>{u}</span>
                    <code>
                      {c.id}.usage[{i}]
                    </code>
                  </p>
                ))}
              </div>
            ) : null}
            {(c.dont ?? []).length ? (
              <div className="dm-rules">
                {c.dont.map((u, i) => (
                  <p key={i} className="dm-rule">
                    <span>{u}</span>
                    <code>
                      {c.id}.dont[{i}]
                    </code>
                  </p>
                ))}
              </div>
            ) : null}
            <dl className="dm-kv">
              <dt>Used in</dt>
              <dd>{c.composesInto?.length ? join(c.composesInto.map(link)) : 'no BELLA component yet'}</dd>
              <dt>Built from</dt>
              <dd>{c.composedFrom?.length ? join(c.composedFrom.map(link)) : 'no other BELLA component'}</dd>
              {doc?.related?.length ? (
                <>
                  <dt>Related</dt>
                  <dd>{join(doc.related.map((r) => link(r.id)))}</dd>
                </>
              ) : null}
            </dl>
          </>
        );
      return null;
    }
    const p = partOf(sel);
    const vals = p.value ?? {};
    const rules = rulesOn(p.key);
    const colour = /^#[0-9a-f]{3,8}$/i.test(vals.light ?? '');
    return (
      <>
        <h3>
          <b className="dm-n">{p.n}</b>
          {p.title} <span className="cap">{p.kind}</span>
        </h3>
        {lens === 'visual' ? (
          <>
            {colour ? (
              <div className="dm-swrow">
                {['light', 'dark'].map((t) => (
                  <div key={t} className="dm-swt">
                    <i style={{ background: vals[t] }} />
                    <span>{cap1(t)}</span>
                    <code>{vals[t]}</code>
                  </div>
                ))}
              </div>
            ) : null}
            <p>{p.detail}</p>
            <dl className="dm-kv">
              <dt>Measured now</dt>
              <dd>{measured(p)}</dd>
              {trigOf(p) ? (
                <>
                  <dt>Shows</dt>
                  <dd>on {trigOf(p)}</dd>
                </>
              ) : null}
            </dl>
          </>
        ) : lens === 'technical' ? (
          <>
            <dl className="dm-kv">
              <dt>Token</dt>
              <dd>
                <code>{p.token ? <Token name={p.token} /> : 'none in the contract'}</code>
              </dd>
              {Object.entries(vals).map(([t, v]) => (
                <React.Fragment key={t}>
                  <dt>{t}</dt>
                  <dd>
                    <code>{v}</code>
                  </dd>
                </React.Fragment>
              ))}
              <dt>Selector</dt>
              <dd>
                <code>{p.target}</code>
              </dd>
              <dt>Computed</dt>
              <dd>
                <code>{measured(p)}</code>
              </dd>
            </dl>
            <CodeBlock title="JSX" lines={[importLine, '', ...jsx]} notify={notify} />
          </>
        ) : (
          <>
            {rules.length ? (
              <div className="dm-rules">
                {rules.map((i) => (
                  <p key={i} className="dm-rule">
                    <span>{c.dont[i]}</span>
                    <code>
                      {c.id}.dont[{i}]
                    </code>
                  </p>
                ))}
              </div>
            ) : (
              <p className="cap">No rule names this part. That may be a gap in the contract.</p>
            )}
            {rules.some((i) => scenes.some((s) => s.rule === i)) ? (
              <button type="button" className="k-link" onClick={() => toScene(scenes.find((s) => rules.includes(s.rule)).id)}>
                Show the scene that tests it
              </button>
            ) : null}
          </>
        )}
      </>
    );
  }
  function toScene(sid) {
    const el = document.getElementById(`sc-${sid}`);
    el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    el?.querySelector('h3')?.focus({ preventScroll: true });
  }
  function toStage(k) {
    setSel(null);
    pick(k);
    canvas.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }
  const corpus = corpusOf(c, cfg, parts);
  function ask(text) {
    const t = text.trim();
    if (!t) return;
    setQ(t);
    setAnswer(askContract(t, corpus));
  }

  /* ---- checks ---- */
  const whyCheck = checks.find((k) => k.id === why);
  const ckClass = (k) => (k.grey ? 'grey' : k.needs ? 'needs' : k.ok ? 'pass' : 'fail');
  const CK_TONE = { grey: 'neutral', needs: 'needs', pass: 'pass', fail: 'fail' };

  /* ---- behind it ---- */
  const hl = c.health ?? {};
  const tl = tests?.tests ?? [];
  const tFail = tl.filter((x) => x.status === 'fail').length;
  const tSum = tl.length ? `${tl.length - tFail - tl.filter((x) => x.status === 'not-run').length} of ${tl.length} pass${tFail ? ` · ${tFail} fail` : ''}` : tests ? 'none' : 'reading…';
  function runTest(action) {
    if (action.type === 'review') return import('./ReviewSheet.jsx').then((m) => m.openReview(action.check));
    setRunning(true);
    fetch(`/checks/${action.check}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(() => setToast('The stories audit is running'))
      .catch(() => setToast('The CHIP server did not answer'));
  }

  const sp = { 'data-theme': theme === 'dark' ? 'chip-dark' : 'chip-light' };
  const detail = stage ? Detail() : null;

  return (
    <div className="atlas dm" data-lens={lens} onKeyDown={(e) => e.key === 'Escape' && (sel || why) && (setSel(null), setWhy(null))}>
      <section className="dm-head k-chrome" aria-labelledby="dm-h1">
        <div>
          <p className="k-meta dm-crumb">{crumb}</p>
          <div className="k-tline">
            <h1 className="k-h1" id="dm-h1" tabIndex={-1}>
              {c.name}
            </h1>
            {onPin ? (
              <button type="button" className={`k-toggle dm-pin${pinned ? ' on' : ''}`} aria-pressed={!!pinned} onClick={onPin}>
                Pin to the nav
              </button>
            ) : null}
          </div>
          <p className="dm-lede">{firstSentence(c.description) || 'No description in the contract yet.'}</p>
          <p className="k-meta dm-built">
            Renders as <b>{c.rendersAs ?? 'unknown'}</b> · BELLA {bella.source?.version} @ <code>{bella.source?.commit}</code>
          </p>
          <button type="button" className="k-link" aria-expanded={read} aria-controls="dm-read" onClick={() => setRead(!read)}>
            {read ? 'Hide the description' : 'Read the full description'}
          </button>
          {read ? (
            <div className="dm-read" id="dm-read">
              {(c.description ?? '').replace(/\s+/g, ' ').trim().slice(firstSentence(c.description).length).trim() ? <p>{(c.description ?? '').replace(/\s+/g, ' ').trim().slice(firstSentence(c.description).length).trim()}</p> : null}
              {c.restNote ? <p>{c.restNote}</p> : null}
              {c.a11y ? <p>{c.a11y}</p> : null}
              <p className="cap">
                Quoted from the contract, <code>component.{c.id}</code>. Nothing here is written twice.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-label="Checks" className="k-chrome" hidden={!stage}>
        <div className="dm-checks" role="toolbar" aria-label="Measured on this render" ref={ckRef} onKeyDown={(e) => roveKeys(e)}>
          <span className="dm-lbl">Measured on this render</span>
          {checks.filter((k) => allChecks || ckClass(k) === 'fail' || ckClass(k) === 'needs').map((k) => (
            <button
              key={k.id}
              type="button"
              data-rv=""
              className="dm-ck"
              aria-expanded={why === k.id}
              aria-controls="dm-why"
              onClick={() => {
                const next = why === k.id ? null : k.id;
                setWhy(next);
                if (next && k.part && sel !== k.part) pick(k.part);
              }}
            >
              <StatusPill tone={CK_TONE[ckClass(k)]}>
                {k.label} · {k.val}
              </StatusPill>
            </button>
          ))}
          {checks.some((k) => ckClass(k) === 'pass' || ckClass(k) === 'grey') ? (
            <button type="button" data-rv="" className="dm-ck dm-more" aria-expanded={allChecks} onClick={() => setAllChecks(!allChecks)}>
              {allChecks ? (
                <StatusPill>Show fewer</StatusPill>
              ) : (
                <StatusPill tone="pass">
                  {checks.filter((k) => ckClass(k) === 'pass').length} pass
                  {checks.some((k) => ckClass(k) === 'grey') ? ` · ${checks.filter((k) => ckClass(k) === 'grey').length} not run` : ''}
                </StatusPill>
              )}
            </button>
          ) : null}
        </div>
        <div className="dm-why" id="dm-why" aria-live="polite" hidden={!whyCheck}>
          {whyCheck ? (
            <>
              <b>{whyCheck.rule}</b>
              <span>{whyCheck.got}</span>
              <code>{whyCheck.src}</code>
            </>
          ) : null}
        </div>
      </section>

      <section className={`dm-work dm-card${stage ? '' : ' dm-nospec'}`} aria-label="Specimen">
        <div className="dm-stage">
          <div className="dm-sbar k-chrome">
            <SegmentedControl label="Pointer" options={[{ value: 'inspect', label: 'Inspect' }, { value: 'use', label: 'Use' }]} value={mode} onChange={(v) => (setMode(v), setLive(null), v === 'use' && (setSel(null), setHov(null), setPlaying(false)))} />
            <span className="dm-sbacts">
              <button type="button" className="k-toggle dm-tog" aria-pressed={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                Dark
              </button>
              <button type="button" className="k-toggle dm-tog" aria-pressed={all} onClick={() => setAll(!all)}>
                All at once
              </button>
            </span>
          </div>
          <div className="dm-canvas dm-sp" {...sp} ref={canvas} data-mode={mode}>
            <div className="dm-specwrap" ref={wrap} style={{ '--z': z }} inert={mode === 'inspect' || all} aria-hidden={mode === 'inspect' || all ? true : undefined} {...useEvents} key={mode === 'inspect' && cfg.generic ? `${o.st}-${o.variant}` : 'live'}>
              {stage ?? (
                <p className="dm-none k-chrome">
                  No specimen for {c.name} yet. Next step: add its render to <code>app/src/specimens.jsx</code> in CHIP.
                </p>
              )}
            </div>
            {geo && !all ? (
              <>
                <svg className="dm-ov" aria-hidden="true" width={geo.w} height={geo.h}>
                  {pins.map(({ p, side, ex, ey, ax, ay }) => {
                    const latent = !visible(p);
                    return (
                      <g key={p.key} className={on(p.key) ? 'on' : undefined} data-latent={latent || undefined}>
                        <path className="dm-lead" d={leaderPath(side, ex, ey, ax, ay)} />
                        <circle cx={ax} cy={ay} r={on(p.key) ? 5 : 4} />
                        {on(p.key) ? <rect className="dm-zone" x={p.zone.x} y={p.zone.y} width={Math.max(1, p.zone.w)} height={Math.max(1, p.zone.h)} rx={3} /> : null}
                      </g>
                    );
                  })}
                  {redlines()}
                </svg>
                {mode === 'inspect' ? (
                  <div className="dm-hits" aria-hidden="true">
                    {[...geo.parts]
                      .sort((a, b) => b.zone.w * b.zone.h - a.zone.w * a.zone.h)
                      .map((p) => (
                        <div key={p.key} title={p.title} onPointerEnter={() => setHov(p.key)} onPointerLeave={() => setHov(null)} onClick={() => pick(p.key)} style={{ left: p.zone.x, top: p.zone.y, width: Math.max(8, p.zone.w), height: Math.max(8, p.zone.h) }} />
                      ))}
                  </div>
                ) : null}
                <div className="dm-pins" role="toolbar" aria-label={`${c.name} parts`} ref={pinsRef} onKeyDown={(e) => focusPart(roveKeys(e))}>
                  {[...pins]
                    .sort((a, b) => a.p.n - b.p.n)
                    .map(({ p, x, y }) => {
                      const latent = !visible(p);
                      return (
                        <button
                          key={p.key}
                          type="button"
                          data-rv=""
                          data-part={p.key}
                          ref={(el) => (chipEls.current[p.key] = el)}
                          className={`dm-anno${on(p.key) ? ' on' : ''}${latent ? ' idle' : ''}${lens === 'technical' ? ' tok' : ''}`}
                          style={{ left: x, top: y }}
                          aria-pressed={sel === p.key}
                          onClick={() => pick(p.key)}
                          onPointerEnter={() => setHov(p.key)}
                          onPointerLeave={() => setHov(null)}
                          onFocus={() => setHov(p.key)}
                          onBlur={() => setHov(null)}
                        >
                          <b>{p.n}</b> {chipText(p)}
                          {latent ? <span className="k-vh">, shows on {trigOf(p)}</span> : null}
                        </button>
                      );
                    })}
                </div>
              </>
            ) : null}
            {all ? (
              <div className="dm-mx">
                <table>
                  <thead>
                    <tr>
                      <th />
                      {states.map((s) => (
                        <th key={s} scope="col">
                          {STATE_LABEL(s)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(axes[0] ? axisVals(axes[0]) : [null]).map((r) => (
                      <tr key={r ?? 'one'}>
                        <th scope="row">{r ? cap1(r) : c.name}</th>
                        {states.map((s) => {
                          const cur = (!axes[0] || o[axes[0].key] === r) && o.st === s;
                          return (
                            <td key={s} className={cur ? 'cur' : undefined}>
                              <Forced key={`${r}-${s}-${o.label}`} state={s}>
                                {cfg.render({ ...o, ...(axes[0] ? { [axes[0].key]: r } : {}), st: s })}
                              </Forced>
                              <button type="button" className="dm-cell" aria-label={`${r ? cap1(r) + ', ' : ''}${STATE_LABEL(s)}`} onClick={() => (setO((x) => ({ ...x, ...(axes[0] ? { [axes[0].key]: r } : {}), st: s })), setAll(false))} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
          <div className="dm-film" role="radiogroup" aria-label="State" ref={filmRef} onKeyDown={(e) => {
            const b = roveKeys(e);
            if (b) setState(b.dataset.st);
          }}>
            {states.map((s) => (
              // a div, not a button: the thumbnail is a real BELLA button inside it
              <div
                key={s}
                role="radio"
                data-rv=""
                data-st={s}
                aria-checked={o.st === s && mode === 'inspect'}
                className={`dm-frame dm-sp${mode === 'use' && st === s ? ' live' : ''}`}
                onClick={() => (setState(s), setMode('inspect'))}
                onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setState(s), setMode('inspect'))}
                {...sp}
              >
                <span className="dm-thumb">
                  <Forced key={`${s}-${o.variant}-${o.shape}-${o.size}-${o.label}`} state={s}>
                    {cfg.render({ ...o, st: s })}
                  </Forced>
                </span>
                <span className="dm-fl">{STATE_LABEL(s)}</span>
              </div>
            ))}
          </div>
          <div className="dm-ctl k-chrome">
            {axes.map((ax) => (
              <Select key={ax.key} label={ax.label} options={axisVals(ax).map((v) => ({ value: v, label: cap1(v) }))} value={o[ax.key]} onChange={(v) => setAxis(ax.key, v)} />
            ))}
            {!cfg.generic ? <Input id="dm-label" label="Label" value={o.label ?? ''} onChange={(v) => setO((x) => ({ ...x, label: v || cfg.label(c) }))} /> : null}
            {states.length > 1 ? (
              <button type="button" className="k-toggle dm-tog" aria-pressed={playing} onClick={() => (setPlaying(!playing), setMode('inspect'))}>
                {playing ? 'Stop' : 'Play states'}
              </button>
            ) : null}
          </div>
        </div>

        <aside className="dm-insp" aria-label="Inspector">
          <h2 className="k-vh">Inspector</h2>
          <section>
            <h3>
              Parts <span className="cap">{c.parts?.length ? 'from the contract' : 'measured, none in the contract'}</span>
            </h3>
            <ul className="dm-plist" ref={plistRef} onKeyDown={(e) => focusPart(roveKeys(e))} onPointerLeave={() => setHov(null)}>
              {parts.map((p) => (
                <li key={p.key}>
                  <button type="button" data-rv="" data-part={p.key} className={hov === p.key ? 'hov' : undefined} aria-pressed={sel === p.key} onClick={() => pick(p.key)} onPointerEnter={() => setHov(p.key)} onFocus={() => setHov(p.key)} onBlur={() => setHov(null)}>
                    <b>{p.n}</b>
                    {p.title}
                    <span className="dm-tg">{trigOf(p) ? `on ${trigOf(p)}` : p.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {/* nothing pinned, nothing shown: the panel appears with the pin */}
          <section className="dm-detail" aria-live="polite" hidden={!detail}>
            {detail}
          </section>
          <section className="dm-ask">
            <h3 id="dm-askh">Ask {c.name}</h3>
            <form
              role="search"
              aria-labelledby="dm-askh"
              className="k-chrome"
              onSubmit={(e) => {
                e.preventDefault();
                ask(q);
              }}
            >
              {/* the placeholder no longer reads as a typed question: the suggestions under it are the prompts */}
              <input aria-labelledby="dm-askh" autoComplete="off" value={q} placeholder="Type a question" onChange={(e) => setQ(e.target.value)} />
              <Button variant="primary" type="submit" disabled={!q.trim()}>
                Ask
              </Button>
            </form>
            <div className="dm-sugg" role="group" aria-label="Suggested questions" ref={suggRef} onKeyDown={(e) => roveKeys(e)}>
              {suggOf(c).map((s) => (
                <button key={s} type="button" data-rv="" onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="dm-ans" aria-live="polite">
              {answer == null ? (
                <p className="cap">Answers quote contract lines, with their index. Nothing else.</p>
              ) : answer.length ? (
                <>
                  <p>From the contract:</p>
                  {answer.map((l) => (
                    <React.Fragment key={l.path + l.t}>
                      <blockquote>
                        {l.t}
                        <code>{l.path}</code>
                      </blockquote>
                      {l.part || l.scene ? (
                        <p className="dm-arow">
                          {l.part ? (
                            <button type="button" className="k-link" onClick={() => toStage(l.part)}>
                              Show on the stage
                            </button>
                          ) : null}
                          {l.scene ? (
                            <button type="button" className="k-link" onClick={() => toScene(l.scene.id)}>
                              Show the scene
                            </button>
                          ) : null}
                        </p>
                      ) : null}
                    </React.Fragment>
                  ))}
                </>
              ) : (
                <p>
                  <b>The contract doesn’t say.</b> That’s a gap to add to <code>component.{c.id}</code>, not something to guess.
                </p>
              )}
            </div>
          </section>
        </aside>
      </section>

      <section aria-labelledby="dm-sch" className="dm-sec">
        <div className="dm-sechead">
          <h2 id="dm-sch">Rules, run on real compositions</h2>
          <p>{scenes.length ? 'Click a component in a scene to change it. The check runs again.' : `No scene runs ${c.name}’s rules yet. They are listed under Scope.`}</p>
        </div>
        {scenes.length ? (
          <div className="dm-scenes">
            {scenes.map((sc) => (
              <Scene key={`${c.id}-${sc.id}`} sc={sc} c={c} bella={bella} theme={theme} label={cfg.label(c)} onGoto={(x) => onOpen?.(x)} notify={notify} />
            ))}
          </div>
        ) : null}
        {scenes.length && (c.dont ?? []).some((_, i) => !scenes.some((s) => s.rule === i)) ? (
          <p className="cap">
            No scene yet for:{' '}
            {(c.dont ?? [])
              .filter((_, i) => !scenes.some((s) => s.rule === i))
              .join('; ')}
            .
          </p>
        ) : null}
      </section>

      <section aria-labelledby="dm-bhh" className="dm-sec">
        <div className="dm-sechead">
          <h2 id="dm-bhh">Behind it</h2>
          <p>The files and results this page reads from, one row each.</p>
        </div>
        <div className="dm-behind dm-card">
          <Row name="Contract" sum={`tokens/contracts.json → component.${c.id} · ${c.tokens?.count ?? 0} tokens, ${(c.props ?? []).length} props, ${states.length} states · ${(c.usage ?? []).length} usage, ${(c.dont ?? []).length} rules, ${(c.parts ?? []).length} parts · ${c.hasContract ? (hl.contract?.status === 'fail' ? 'disagrees with the code' : 'matches the code') : NO_CONTRACT}`} hint="overview, compliance, file">
            <ContractPanel c={c} bella={bella} doc={doc} tests={tests} hist={hist} notify={notify} onOpen={onOpen} />
          </Row>
          <Row name="Accessibility" sum={`${c.minTarget ? `${c.minTarget.value} target` : 'no target'} · ${hl.contrast?.status === 'pass' ? `${hl.contrast.pairs} contrast pairs pass` : hl.contrast?.status === 'fail' ? 'contrast fails' : 'no pairs'} · ${keyboardOf(c).split('.')[0]}`} hint="role, name, keyboard">
            <A11yFacts c={c} cfg={cfg} label={cfg.label(c)} />
          </Row>
          <Row name="Source" sum={`src/components/${c.name}/${c.name}.tsx · ${c.name}.module.css`} hint="read only">
            <SourcePanel c={c} doc={doc} notify={notify} />
          </Row>
          <Row name="Tests" sum={tSum} hint="what the gate runs">
            <TestsPanel c={c} tests={tests} onRun={runTest} running={running} />
          </Row>
          <Row name="History" sum={hist?.entries?.length ? `${plural(hist.entries.length, 'change')} · latest ${fmtDate(hist.entries[0].date)}: ${hist.entries[0].explanation || hist.entries[0].subject}` : hist ? 'no commits' : 'reading…'} hint="git log of its files">
            <HistoryPanel c={c} hist={hist} />
          </Row>
          <Row name="Story" sum={c.storyUrl ?? 'no story'} hint="Storybook">
            {c.storyUrl ? (
              <p>
                <a href={c.storyUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="Storybook" size="sm" /> {c.storyUrl}
                </a>
              </p>
            ) : (
              <p className="cap">No story yet.</p>
            )}
          </Row>
          <Row name="Figma" sum={!lint ? 'reading…' : lint.read ? (lint.found ? `${c.name} is in Figma` : `no ${c.name} in Figma`) : 'the Figma MCP is not answering'} hint="through the Figma MCP">
            <FigmaPanel c={c} lint={lint} reading={reading} onRead={() => readLint(true)} />
          </Row>
        </div>
      </section>

      <p className="toast" role="status" aria-live="polite" data-show={toast ? '' : undefined}>
        {toast}
      </p>
    </div>
  );
}
