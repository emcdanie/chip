// History, rebuilt from the approved mock (chip-mock-03, #history) on real
// data: GET /history (BELLA's decision records, CHANGELOG and git log, CHIP's
// git log, review-card Accept / Undo), GET /obi-docs and the search index.
// Ask in plain words with suggestions; quick chips and a Filters drawer
// narrow it; a summary put together from the records, every claim numbered to
// its record; a timeline of numbered points; record cards with the Why from
// the record. "Written down" is the three layers an agent reads and the docs
// table. Lead with changes the card body. Nothing here calls a model.
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import { Checkbox, Chips, DataTable, Drawer, LinkButton, PageHeader, Sheet, StatusPill } from './kit/index.jsx';
import './History.css';

const TYPES = ['Decision', 'Visual', 'Contract', 'Tokens', 'Fix', 'Docs', 'Tooling'];
const QUICK = [
  ['all', 'All'],
  ['Decision', 'Decisions'],
  ['Visual', 'Visual'],
  ['Contract', 'Contract'],
  ['Fix', 'Fix'],
  ['brk', 'Breaking'],
];
const STATUSES = ['Decided', 'Merged', 'Shipped', 'On a branch', 'Undone'];
const SICON = { Decided: '◆', Merged: '●', Shipped: '✓', 'On a branch': '◌', Undone: '↺' };
const SCLASS = { Decided: 's-decided', Merged: 's-merged', Shipped: 's-shipped', 'On a branch': 's-branch', Undone: 's-undone' };
const year = new Date().getFullYear();
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const DATES = [
  ['', 'Any time'],
  [`${year}-09-01`, 'Since September'],
  [`${year}-10-01`, 'Since October'],
  ['last30', 'Last 30 days'],
];
const dateLabel = (id) => DATES.find(([k]) => k === id)?.[1] ?? '';
const EXAMPLES = ["What changed in Button's contract since September?", 'Breaking changes', 'Button decisions', 'What changed in CHIP in November?'];
// where each filter's values come from: filters are only as good as their metadata, so say it
const HINFO = {
  comp: 'Named in the record’s title, message or the files it touched.',
  since: 'The day it was committed or decided, from git log and the record’s file name.',
  type: 'From the commit’s prefix and the files it touched; decision records are Decision.',
  status: 'Decided: a record in docs/decisions. Merged: in main. Shipped: in a BELLA release. On a branch: accepted in CHIP, not pushed. Undone: the Accept was undone.',
};
const PER_PAGE = 20;

const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const dayYear = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const clip = (s, n) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);
// the reason, without commit trailers; null when the record gives none
const whyOf = (r) => {
  const w = (r.why ?? '')
    .split('\n')
    .filter((l) => !/^(Co-Authored-By|Signed-off-by):/i.test(l.trim()))
    .join('\n')
    // git bodies are wrapped at 72: rejoin the lines, keep list items apart
    .replace(/\n(?!\s*(?:[-*•]|\d+[.)])\s)/g, ' ')
    .trim();
  return w || null;
};
const tagsOf = (r) => {
  const t = `${r.title} ${whyOf(r) ?? ''}`;
  return [
    r.type === 'Contract' || r.files?.includes('tokens/component.json') ? 'contract' : '',
    /token|semantic|colou?r|padding/i.test(t) ? 'tokens' : '',
    /focus|keyboard|skip link|contrast|a11y|accessib/i.test(t) ? 'a11y' : '',
  ].filter(Boolean);
};
const where = (r) => (r.components?.length ? r.components.slice(0, 2).join(', ') : r.repo === 'chip' ? 'CHIP' : 'BELLA');
function Source({ r }) {
  if (r.sha && r.source !== 'CHIP review card')
    return (
      <>
        commit <code>{r.sha}</code> in {r.repo === 'chip' ? 'CHIP' : 'BELLA'}
      </>
    );
  if (r.path) return <code>{r.path}</code>;
  if (r.source === 'BELLA changelog') return <>BELLA’s changelog{r.release && r.release !== 'Unreleased' ? `, ${r.release}` : ''}</>;
  if (r.source === 'CHIP review card') return <>a CHIP review card, branch <code>{r.branch}</code></>;
  return r.source;
}
const query = (o) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v && (!Array.isArray(v) || v.length)) q.set(k, Array.isArray(v) ? v.join(',') : v === true ? '1' : v);
  return q.toString();
};
const load = (key, fallback, store = localStorage) => {
  try {
    return JSON.parse(store.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const keep = (key, v, store = localStorage) => {
  try {
    store.setItem(key, JSON.stringify(v));
  } catch {}
};

function useJSON(url) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!url) return undefined;
    let gone = false;
    fetch(url)
      .then((r) => r.json())
      .then((d) => !gone && setData(d))
      .catch(() => !gone && setData({ error: true }));
    return () => {
      gone = true;
    };
  }, [url]);
  return data;
}

/* ---------- presets: the common cuts, with counts from the server ---------- */
const PRESETS = [
  ['Contract changes', { types: ['Contract'] }],
  ['Decisions', { types: ['Decision'] }],
  ['Breaking', { breaking: true }],
  ['In CHIP', { repo: 'chip' }],
  ['Since October', { date: `${year}-10-01` }],
];
const EMPTY = { q: '', types: [], comps: [], statuses: [], date: '', breaking: false, repo: '' };
const paramsOf = (f) => ({ q: f.q, type: f.types, component: f.comps, status: f.statuses, since: f.date === 'last30' ? ago(30) : f.date, breaking: f.breaking, repo: f.repo });

/* ---------- the record sheet ---------- */
function RecordSheet({ id, onClose, onOpen, onSession }) {
  const r = useJSON(id ? `/history/record?id=${encodeURIComponent(id)}` : null);
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [id]);
  const rec = r && !r.error && r.id === id ? r : null;
  const why = rec && whyOf(rec);
  const lines = rec?.diff ? rec.diff.split('\n') : [];
  const agreed = !rec
    ? ''
    : rec.status === 'Decided'
      ? `${rec.who ?? 'Not recorded'}, ${dayYear(rec.date)}`
      : rec.status === 'Shipped'
        ? `Released in BELLA ${rec.release}`
        : rec.status === 'On a branch'
          ? `Accepted in CHIP, ${dayYear(rec.date)}; not pushed`
          : rec.status === 'Undone'
            ? `Undone, ${dayYear(rec.date)}`
            : `Merged, ${dayYear(rec.date)}`;
  return (
    <Sheet
      open={!!id}
      title={rec?.title ?? 'Record'}
      onClose={onClose}
      className="hrec"
      footer={
        rec?.sha && rec.source !== 'CHIP review card' ? (
          <Button onClick={() => onSession?.(`Restore the version before ${rec.repo === 'chip' ? 'CHIP' : 'BELLA'} commit ${rec.sha}: ${rec.title}. Open a branch, revert only that commit, run the gate, and stop for my OK before merging.`)}>
            Restore the version before this
          </Button>
        ) : null
      }
    >
      {!r || (!rec && !r.error) ? (
        <p className="k-sub">Reading the record…</p>
      ) : r.error ? (
        <p>The record could not be read. Is the CHIP server running?</p>
      ) : (
        <>
          <p className="hmeta2">
            <span>{dayYear(rec.date)}</span>
            <span>{where(rec)}</span>
            <span>{rec.type}</span>
            <StatusPill tone={rec.status === 'Shipped' ? 'pass' : rec.status === 'On a branch' ? 'needs' : 'neutral'} badge>
              {rec.status}
            </StatusPill>
          </p>
          <dl className="kv">
            <dt>Why</dt>
            <dd>{why ?? 'The record gives no reason.'}</dd>
            <dt>Agreed</dt>
            <dd>{agreed}</dd>
            <dt>Built</dt>
            <dd>{rec.who ?? 'Not recorded'}</dd>
            <dt>Record</dt>
            <dd>
              <Source r={rec} />
            </dd>
            {rec.breaking ? (
              <>
                <dt>Breaking</dt>
                <dd>Yes, by the record’s own mark</dd>
              </>
            ) : null}
          </dl>
          {rec.body && rec.body.trim() !== (why ?? '') ? (
            <details className="hdet">
              <summary>The whole record</summary>
              <p className="hbody">{rec.body}</p>
            </details>
          ) : null}
          {lines.length ? (
            <>
              <pre className="kdiff" aria-label="The diff">
                {(all ? lines : lines.slice(0, 40)).map((l, i) => (
                  <span key={i} className={/^\+(?!\+\+)/.test(l) ? 'add' : /^-(?!--)/.test(l) ? 'del' : /^(diff|@@)/.test(l) ? 'hd' : undefined}>
                    {l || ' '}
                  </span>
                ))}
              </pre>
              {lines.length > 40 ? <LinkButton onClick={() => setAll(!all)}>{all ? 'Show less of the diff' : `Show the whole diff (${lines.length} lines)`}</LinkButton> : null}
            </>
          ) : null}
          {rec.versions ? (
            <p className="hvers">
              <span className="k-sub">
                {rec.versions.count} records touch {rec.versions.component}
              </span>
              {rec.versions.older ? <LinkButton onClick={() => onOpen(rec.versions.older)}>The change before</LinkButton> : null}
              {rec.versions.newer ? <LinkButton onClick={() => onOpen(rec.versions.newer)}>The change after</LinkButton> : null}
            </p>
          ) : null}
          {rec.sha && rec.source !== 'CHIP review card' ? <p className="will">This will: start a session that restores the version before this · Undo: restore again in History</p> : null}
        </>
      )}
    </Sheet>
  );
}

/* ---------- the timeline: every result on one line, oldest left ---------- */
function Timeline({ points, picked, onPick, lineRef }) {
  const T = useMemo(() => [...points].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), [points]);
  const ref = useRef(null);
  useEffect(() => {
    const ln = ref.current;
    const on = ln?.querySelector('.hpt.on') ?? [...(ln?.querySelectorAll('.hpt') ?? [])].pop();
    if (ln && on) ln.scrollLeft = Math.max(0, on.parentElement.offsetLeft - ln.clientWidth / 2);
  }, [T, picked]);
  if (!T.length) return null;
  const keys = (e, i) => {
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: T.length - 1 }[e.key];
    if (j === undefined || !T[j]) return;
    e.preventDefault();
    onPick(T[j].id, false);
    ref.current.querySelectorAll('.hpt')[j]?.focus();
  };
  const has = T.some((p) => p.id === picked);
  return (
    <div className="htl" ref={lineRef}>
      <div className="hline2" ref={ref} role="group" aria-label="Changes over time, oldest first">
        <ol>
          {T.map((p, i) => {
            const on = p.id === picked;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`hpt${on ? ' on' : ''}`}
                  aria-pressed={on}
                  tabIndex={on || (!has && i === T.length - 1) ? 0 : -1}
                  aria-label={`${i + 1}. ${day(p.date)}: ${p.title}`}
                  onClick={() => onPick(p.id, true)}
                  onKeyDown={(e) => keys(e, i)}
                >
                  {i + 1}
                </button>
                <span className="hd">{day(p.date)}</span>
                <span className="ht">{clip(p.title, 60)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/* ---------- ask in plain words: suggestions on focus, records from the box ---------- */
function Ask({ value, onChange, onRun, records, recent, onRecord }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(-1);
  const t = value.trim().toLowerCase();
  const items = open
    ? [
        ...[...recent.map((q) => ['Recent', q]), ...EXAMPLES.filter((q) => !recent.includes(q)).map((q) => ['Try', q])].filter(([, q]) => !t || q.toLowerCase().includes(t)).slice(0, 5),
        ...(t.length > 1 ? records.filter((r) => r.title.toLowerCase().includes(t)).slice(0, 3).map((r) => ['Record', r]) : []),
      ]
    : [];
  const pick = (i) => {
    const [k, v] = items[i];
    setOpen(false);
    if (k === 'Record') onRecord(v.id);
    else onRun(v);
  };
  const keys = (e) => {
    if (e.key === 'Escape') return setOpen(false);
    if (!items.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
    if (e.key === 'Enter') {
      if (a >= 0) {
        e.preventDefault();
        pick(a);
      }
      return;
    }
    e.preventDefault();
    setA((x) => (x + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
  };
  useEffect(() => setA(-1), [value, open]);
  return (
    <form
      className="hq"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        if (value.trim()) onRun(value.trim());
        else setOpen(true);
      }}
    >
      <label className="hql" htmlFor={`${id}-in`}>
        Ask about a change, in plain words
      </label>
      <div className="hqbox">
        <input
          id={`${id}-in`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={!!items.length}
          aria-controls={`${id}-sug`}
          aria-activedescendant={a >= 0 ? `${id}-o${a}` : undefined}
          autoComplete="off"
          value={value}
          onChange={(e) => (onChange(e.target.value), setOpen(true))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={keys}
        />
        <ul className="hqsug" id={`${id}-sug`} role="listbox" aria-label="Suggestions" hidden={!items.length}>
          {items.map(([k, v], i) => (
            <li key={`${k}${i}`} id={`${id}-o${i}`} role="option" aria-selected={i === a} className="hqo" onMouseDown={(e) => (e.preventDefault(), pick(i))}>
              <span className="hqk">{k}</span>
              <span>
                {k === 'Record' ? (
                  <>
                    {v.title} <span className="sub2">{day(v.date)}</span>
                  </>
                ) : (
                  v
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Button variant="primary" type="submit">
        Search
      </Button>
    </form>
  );
}

/* ---------- changes: search, filters, summary, timeline, cards ---------- */
function Changes({ bella, lens, onOpenAtlas, onSession }) {
  const [f, setF] = useState(() => ({ ...EMPTY, ...load('chip-hist', {}) }));
  const [draft, setDraft] = useState(f.q);
  const [sort, setSort] = useState('newest');
  const [drawer, setDrawer] = useState(false);
  const [record, setRecord] = useState(null);
  const [picked, setPicked] = useState(null);
  const [shown, setShown] = useState(PER_PAGE);
  const [info, setInfo] = useState({});
  const [how, setHow] = useState(false);
  const [recent, setRecent] = useState(() => load('chip-hq', []));
  const [mine, setMine] = useState(() => load('chip-hpre', []));
  const [seen, setSeen] = useState(() => new Set(load('chip-hseen', [], sessionStorage)));
  const lineRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => keep('chip-hist', f), [f]);
  useEffect(() => setShown(PER_PAGE), [f, sort]);
  const data = useJSON(`/history?${query({ ...paramsOf(f), sort: sort === 'oldest' ? 'oldest' : '' })}`);
  // every record, newest first: what Current and Superseded are read against
  const base = useJSON('/history');
  const [preN, setPreN] = useState([]);
  useEffect(() => {
    Promise.all([...PRESETS.map(([, p]) => p), ...mine.map(([, p]) => p)].map((p) => fetch(`/history?${query(paramsOf({ ...EMPTY, ...p }))}`).then((r) => r.json()).then((d) => d.count).catch(() => null))).then(setPreN);
  }, [mine]);

  const set = (patch) => (setF((x) => ({ ...x, ...patch })), setPicked(null));
  const run = (q) => {
    setDraft(q);
    const r = [q, ...recent.filter((x) => x !== q)].slice(0, 3);
    setRecent(r);
    keep('chip-hq', r);
    setF({ ...EMPTY, q });
    setPicked(null);
  };
  const clear = () => (setF((x) => ({ ...EMPTY, q: x.q })), setPicked(null));
  const markSeen = (id) =>
    setSeen((s) => {
      const n = new Set(s).add(id);
      keep('chip-hseen', [...n], sessionStorage);
      return n;
    });
  const pick = (id, scroll) => {
    const next = picked === id && scroll ? null : id;
    setPicked(next);
    if (next && scroll) {
      const i = (data?.records ?? []).findIndex((r) => r.id === next);
      if (i >= shown) setShown(i + 1);
      setTimeout(() => document.getElementById(`rec-${CSS.escape(next)}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    }
  };

  const records = useMemo(() => {
    const l = (data?.records ?? []).map((r) => ({ ...r, tags: tagsOf(r) }));
    return sort === 'status' ? [...l].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)) : l;
  }, [data, sort]);
  // Current: no newer record touches the same component; Superseded: one does
  const vstat = useMemo(() => {
    const all = base?.records ?? [];
    const pos = new Map(all.map((r, i) => [r.id, i]));
    return (r) => {
      const c = r.components?.[0];
      if (!c) return null;
      const i = pos.get(r.id);
      const newer = all.find((x, j) => (i == null ? Date.parse(x.date) > Date.parse(r.date) : j < i) && x.components.includes(c));
      return newer ? 'Superseded' : i != null ? 'Current' : null;
    };
  }, [base]);

  const parsed = data?.parsed;
  const counts = data?.counts;
  const nOn = f.types.length + f.comps.length + f.statuses.length + (f.date ? 1 : 0) + (f.breaking ? 1 : 0) + (f.repo ? 1 : 0);
  const applied = [
    ...f.comps.map((v) => ['comps', v, v]),
    ...f.types.map((v) => ['types', v, v]),
    ...f.statuses.map((v) => ['statuses', v, v]),
    ...(f.date ? [['date', f.date, dateLabel(f.date)]] : []),
    ...(f.breaking ? [['breaking', true, 'Breaking']] : []),
    ...(f.repo ? [['repo', f.repo, `In ${f.repo === 'chip' ? 'CHIP' : 'BELLA'}`]] : []),
  ];
  const searchName = f.q || applied.map(([, , l]) => l).join(' · ');
  const unapply = (k, v) => set({ [k]: Array.isArray(f[k]) ? f[k].filter((x) => x !== v) : EMPTY[k] });
  const toggle = (k, v, on) => set({ [k]: on ? [...f[k], v] : f[k].filter((x) => x !== v) });
  const quickOn = f.breaking ? 'brk' : !f.types.length ? 'all' : f.types.length === 1 ? f.types[0] : null;
  const quickN = (k) => (k === 'all' ? data?.total : k === 'brk' ? counts?.breaking : counts?.types?.[k]);
  const quick = QUICK.filter(([k]) => quickN(k) || quickOn === k).map(([id, label]) => ({ id, label, count: quickN(id) ?? '…' }));
  const onQuick = (k) => (k === 'all' ? set({ types: [], breaking: false }) : k === 'brk' ? set({ breaking: !f.breaking }) : set({ types: quickOn === k ? [] : [k] }));

  // the summary: short first, every claim numbered to its record; says so when there is too little to sum up
  const src = records.slice(0, 4);
  const cite = (i) => (
    <a
      href="#"
      className="cite"
      aria-label={`Source ${i + 1}`}
      onClick={(e) => {
        e.preventDefault();
        setRecord(src[i].id);
      }}
    >
      [{i + 1}]
    </a>
  );
  const dec = records.filter((r) => r.type === 'Decision').length;
  const bi = src.findIndex((r) => r.breaking);
  const scope = [f.comps.length ? ` to ${f.comps.join(' and ')}` : '', f.date ? `, ${dateLabel(f.date).toLowerCase()}` : ''].join('');
  const related = parsed ? [...new Set([`${parsed.components[0] ?? 'Button'} decisions`, `Breaking changes to ${parsed.components[0] ?? 'Button'}`, `${parsed.components[0] ?? 'Button'} since October`, 'What changed in CHIP'])].filter((x) => x.toLowerCase() !== f.q.toLowerCase()).slice(0, 4) : [];
  const understood = parsed ? [parsed.types.length ? `${parsed.types.join(', ').toLowerCase()} changes` : 'every kind of change', parsed.components.length ? parsed.components.join(', ') : 'every component', parsed.since ? `since ${day(parsed.since)}` : 'any time', ...(parsed.breaking ? ['breaking only'] : []), ...(parsed.repo ? [`in ${parsed.repo === 'chip' ? 'CHIP' : 'BELLA'}`] : []), ...parsed.terms.map((t) => `“${t}”`)] : [];
  const bellaComp = (r) => bella?.components.find((c) => c.name === r.components?.[0]);
  const relOf = (r) => records.filter((y) => y !== r && y.components?.[0] && y.components[0] === r.components?.[0] && y.tags.some((t) => r.tags.includes(t))).slice(0, 3);

  const fieldset = (k, legend, body) => (
    <fieldset>
      <div className="lgrow">
        <legend>{legend}</legend>
        <button type="button" className="info" aria-expanded={!!info[k]} aria-controls={`hi-${k}`} onClick={() => setInfo((x) => ({ ...x, [k]: !x[k] }))}>
          <span aria-hidden="true">?</span>
          <span className="k-vh">Where {legend} comes from</span>
        </button>
      </div>
      <p className="infob" id={`hi-${k}`} hidden={!info[k]}>
        {HINFO[k]}
      </p>
      {body}
    </fieldset>
  );

  return (
    <>
      <Ask value={draft} onChange={setDraft} onRun={run} records={base?.records ?? []} recent={recent} onRecord={setRecord} />
      <div className="hblock">
        <div className="hquick">
          <Chips label="Quick filters" items={quick} value={quickOn} onChange={onQuick} />
          <Button onClick={() => setDrawer(true)}>
            Filters{nOn ? <span className="n">{nOn}</span> : null}
          </Button>
        </div>
        {data?.error ? <p className="k-note">History could not be read. Is the CHIP server running?</p> : null}
        <p className="hecho" aria-live="polite">
          {!data || data.error ? 'Reading the records…' : f.q ? `${data.count} record${data.count === 1 ? '' : 's'} for “${f.q}”` : `${data.count} of ${data.total} records`}
        </p>
        {f.q && parsed ? (
          <div className="hrefine">
            <div className="dym">
              <p>
                <span className="rk">Did you mean</span>
                {understood.map((c) => (
                  <span key={c} className="dchip">
                    {c}
                  </span>
                ))}
              </p>
              <p className="sub2">
                CHIP read your words as these filters.{' '}
                <LinkButton onClick={() => (setDraft(''), setF({ ...EMPTY }), setPicked(null))}>Search everything instead</LinkButton>
              </p>
            </div>
            <div className="relq">
              <span className="sub2">Related searches</span>
              {related.map((t) => (
                <button key={t} type="button" className="k-chip" onClick={() => run(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {data && !data.error ? (
          <section className="hsum" aria-live="polite" aria-label="Summary by CHIP">
            {records.length > 1 ? (
              <>
                <div className="hsumh">
                  <p className="rk">Summary by CHIP</p>
                  <LinkButton aria-expanded={how} aria-controls="hAiEx" onClick={() => setHow(!how)}>
                    How CHIP wrote this
                  </LinkButton>
                </div>
                <p className="aiex" id="hAiEx" hidden={!how}>
                  Put together on this laptop from the records below, with no model: it counts them, quotes the newest, and numbers each source. With fewer than two matches it says so instead of summing up.
                </p>
                <p className="hshort">
                  {data.count} changes{scope}. The latest: “{src[0].title}” {cite(0)}, {day(src[0].date)}.{dec ? ` ${dec} ${dec > 1 ? 'are decisions' : 'is a decision'}.` : ''}
                  {bi === 0 ? <> It is marked breaking {cite(0)}.</> : bi > 0 ? <> One is breaking: “{src[bi].title}” {cite(bi)}.</> : null}
                </p>
                <details className="hdet">
                  <summary>What it’s based on</summary>
                  <ol>
                    {src.map((r, i) => (
                      <li key={r.id}>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setRecord(r.id);
                          }}
                        >
                          {r.title}
                        </a>{' '}
                        · <Source r={r} />
                      </li>
                    ))}
                  </ol>
                </details>
              </>
            ) : records.length === 1 ? (
              <>
                <p className="rk">Summary by CHIP</p>
                <p className="hshort">One record matches, so there’s nothing to sum up. It’s below.</p>
              </>
            ) : (
              <p>
                Nothing matches. Try:{' '}
                {f.date ? <LinkButton onClick={() => set({ date: '' })}>any time</LinkButton> : null}
                {f.types.length ? <LinkButton onClick={() => set({ types: [] })}>every type</LinkButton> : null}
                {f.comps.length ? <LinkButton onClick={() => set({ comps: [] })}>every component</LinkButton> : null}
                {!nOn ? <LinkButton onClick={() => (setDraft(''), setF({ ...EMPTY }))}>clear the search</LinkButton> : null}
              </p>
            )}
          </section>
        ) : null}
        {applied.length ? (
          <div className="happ" aria-label="Applied filters" role="group">
            {applied.map(([k, v, l]) => (
              <button key={`${k}${v}`} type="button" className="k-chip on" aria-label={`Remove ${l}`} onClick={() => unapply(k, v)}>
                {l} <span aria-hidden="true">✕</span>
              </button>
            ))}
            <LinkButton onClick={clear}>Clear all</LinkButton>
            {mine.some(([n]) => n === searchName) ? null : (
              <LinkButton
                onClick={() => {
                  const next = [...mine, [searchName, { ...f }]];
                  setMine(next);
                  keep('chip-hpre', next);
                }}
              >
                Save this search
              </LinkButton>
            )}
          </div>
        ) : null}
        {data && !data.error ? <Timeline points={data.timeline} picked={picked} onPick={pick} lineRef={lineRef} /> : null}
        <div className="hsortrow">
          <p className="sub2">Sort by</p>
          <Chips
            label="Sort"
            value={sort}
            onChange={setSort}
            items={[
              { id: 'newest', label: 'Newest first' },
              { id: 'oldest', label: 'Oldest first' },
              { id: 'status', label: 'Status' },
            ]}
          />
        </div>
        <ol className="hlist" ref={listRef}>
          {records.slice(0, shown).map((r) => {
            const why = whyOf(r);
            const v = vstat(r);
            const rel = lens === 'technical' ? relOf(r) : [];
            const c = bellaComp(r);
            return (
              <li key={r.id} id={`rec-${r.id}`} className={`hcardr${seen.has(r.id) ? ' seen' : ''}${picked === r.id ? ' on' : ''}`}>
                <h3>
                  {r.title}
                  {seen.has(r.id) ? <span className="seenm">Viewed</span> : null}
                </h3>
                <p className="hchips">
                  <span className="tchip">{r.type}</span>
                  <span className={`schip ${SCLASS[r.status] ?? ''}`}>
                    <span aria-hidden="true">{SICON[r.status]}</span> {r.status}
                  </span>
                  {r.breaking ? <span className="schip s-brk">Breaking</span> : null}
                  {v ? <span className="vchip">{v}</span> : null}
                  {(r.components?.length ? r.components.slice(0, 3) : [r.repo === 'chip' ? 'CHIP' : 'BELLA']).map((x) => (
                    <span key={x} className="tchip">
                      {x}
                    </span>
                  ))}
                  {r.tags.map((t) => (
                    <span key={t} className="mcp">
                      {t}
                    </span>
                  ))}
                </p>
                {lens === 'scope' ? (
                  <p className="hsumm">
                    <b>Asked for:</b> {why ? clip(why, 280) : 'the record gives no reason.'} <b>Scope:</b> {r.components?.length ? `${r.components.join(', ')} and every page that uses ${r.components.length > 1 ? 'them' : 'it'}` : r.repo === 'chip' ? 'CHIP only' : 'BELLA, no single component'}.
                  </p>
                ) : (
                  <div className="hwhy">
                    <p className="rk">
                      Why <span>from the record</span>
                    </p>
                    <p className="hsumm">{why ? clip(why, 280) : 'The record gives no reason.'}</p>
                  </div>
                )}
                {lens === 'technical' ? (
                  <dl className="hrefdl">
                    {r.sha ? (
                      <>
                        <dt>Commit</dt>
                        <dd>
                          <code>{r.sha}</code>
                        </dd>
                      </>
                    ) : null}
                    <dt>Contract</dt>
                    <dd>{r.files?.includes('tokens/component.json') ? <code>tokens/component.json</code> : 'No contract change'}</dd>
                    {r.files?.length ? (
                      <>
                        <dt>Files</dt>
                        <dd>{r.files.length > 3 ? `${r.files.slice(0, 3).join(', ')} and ${r.files.length - 3} more` : r.files.join(', ')}</dd>
                      </>
                    ) : null}
                    {r.release ? (
                      <>
                        <dt>Release</dt>
                        <dd>BELLA {r.release}</dd>
                      </>
                    ) : null}
                    {r.breaking ? (
                      <>
                        <dt>Breaking</dt>
                        <dd>Yes</dd>
                      </>
                    ) : null}
                  </dl>
                ) : null}
                {rel.length ? (
                  <p className="hrelated">
                    <span className="sub2">Related</span>
                    {rel.map((y) => (
                      <LinkButton key={y.id} onClick={() => setRecord(y.id)}>
                        {y.title}
                      </LinkButton>
                    ))}
                  </p>
                ) : null}
                <p className="hsrc2">
                  <span>
                    From <Source r={r} />
                  </span>
                  <span>{day(r.date)}</span>
                  {r.who ? <span>{r.who}</span> : null}
                </p>
                <p className="hacts">
                  <LinkButton onClick={() => (markSeen(r.id), setRecord(r.id))}>View full record</LinkButton>
                  <LinkButton
                    onClick={() => {
                      markSeen(r.id);
                      setPicked(r.id);
                      lineRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      setTimeout(() => lineRef.current?.querySelector('.hpt.on')?.focus({ preventScroll: true }), 80);
                    }}
                  >
                    Show on the timeline
                  </LinkButton>
                  {c ? <LinkButton onClick={() => (markSeen(r.id), onOpenAtlas(c.id, 'history'))}>Compare versions</LinkButton> : null}
                </p>
              </li>
            );
          })}
        </ol>
        {records.length > shown ? (
          <p className="hmore">
            <Button onClick={() => setShown((n) => n + PER_PAGE)}>Show {Math.min(PER_PAGE, records.length - shown)} more</Button>
            <span className="sub2">
              {shown} of {records.length} shown
            </span>
          </p>
        ) : data && data.count > records.length ? (
          <p className="sub2">The first {records.length} of {data.count}. Narrow the search to see the rest.</p>
        ) : null}
      </div>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        onApply={() => (setDrawer(false), listRef.current?.scrollIntoView({ block: 'nearest' }))}
        applyLabel={`Show ${data?.count ?? 0} change${data?.count === 1 ? '' : 's'}`}
        onClear={nOn ? clear : undefined}
      >
        <div className="hpre">
          <span className="sub2">Presets</span>
          {PRESETS.map(([n, p], i) => (
            <button key={n} type="button" className="k-chip" onClick={() => (setF({ ...EMPTY, ...p }), setDraft(''), setPicked(null))}>
              {n} <span className="n">{preN[i] ?? '…'}</span>
            </button>
          ))}
          {mine.map(([n, p], i) => (
            <span key={n} className="mine">
              <button type="button" className="k-chip" onClick={() => (setF({ ...EMPTY, ...p }), setDraft(p.q ?? ''), setPicked(null))}>
                {n} <span className="n">{preN[PRESETS.length + i] ?? '…'}</span>
              </button>
              <button
                type="button"
                className="k-iconbtn rmmine"
                aria-label={`Remove saved search ${n}`}
                onClick={() => {
                  const next = mine.filter((_, j) => j !== i);
                  setMine(next);
                  keep('chip-hpre', next);
                }}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </span>
          ))}
        </div>
        {fieldset(
          'comp',
          'Component',
          Object.entries(counts?.components ?? {})
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([c, n]) => (
              <Checkbox key={c} checked={f.comps.includes(c)} count={n} onChange={(on) => toggle('comps', c, on)}>
                {c}
              </Checkbox>
            )),
        )}
        {fieldset(
          'since',
          'Date',
          <Chips label="Date" value={f.date} onChange={(d) => set({ date: d })} items={DATES.map(([id, label]) => ({ id, label }))} />,
        )}
        {fieldset(
          'type',
          'Type',
          TYPES.filter((t) => counts?.types?.[t] || f.types.includes(t)).map((t) => (
            <Checkbox key={t} checked={f.types.includes(t)} count={counts?.types?.[t] ?? 0} onChange={(on) => toggle('types', t, on)}>
              {t}
            </Checkbox>
          )),
        )}
        {fieldset(
          'status',
          'Status',
          STATUSES.filter((s) => counts?.status?.[s] || f.statuses.includes(s)).map((s) => (
            <Checkbox key={s} checked={f.statuses.includes(s)} count={counts?.status?.[s] ?? 0} onChange={(on) => toggle('statuses', s, on)}>
              {s}
            </Checkbox>
          )),
        )}
      </Drawer>
      <RecordSheet id={record} onClose={() => setRecord(null)} onOpen={setRecord} onSession={onSession} />
    </>
  );
}

/* ---------- written down: the three layers, then the docs ---------- */
const KIND = (k) => (k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Note');
function DocSheet({ id, onClose, bella, onOpenAtlas }) {
  const d = useJSON(id ? `/obi-docs/${encodeURIComponent(id)}` : null);
  const [copied, setCopied] = useState('');
  useEffect(() => setCopied(''), [id]);
  const doc = d && !d.error && d.id === id ? d : null;
  const path = doc ? (doc.group === 'Loop' ? `docs/reference/inbox/${doc.id === 'loop-next' ? 'next' : 'report'}.md` : `obi-notes/${doc.id}.md`) : '';
  const comp = doc && bella?.components.find((c) => new RegExp(`\\b${c.name}\\b`).test(doc.title));
  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied('none');
    }
  };
  return (
    <Sheet
      open={!!id}
      title={doc?.title ?? 'Doc'}
      onClose={onClose}
      className="hrec"
      footer={
        doc ? (
          <>
            <Button variant="primary" onClick={() => copy('md', `# ${doc.title}\n\n${doc.body.trim()}\n`)}>
              {copied === 'md' ? 'Copied' : 'Copy as Markdown'}
            </Button>
            <Button onClick={() => copy('path', path)}>{copied === 'path' ? 'Copied' : 'Copy the path'}</Button>
            {comp ? <Button onClick={() => (onClose(), onOpenAtlas(comp.id))}>Open {comp.name} in Components</Button> : null}
          </>
        ) : null
      }
    >
      {!d || (!doc && !d.error) ? (
        <p className="k-sub">Reading the doc…</p>
      ) : d.error ? (
        <p>The doc could not be read.</p>
      ) : (
        <>
          <p className="hmeta2">
            <StatusPill>{KIND(doc.kind)}</StatusPill>
            <span>{doc.date ? dayYear(doc.date) : `updated ${dayYear(doc.updated)}`}</span>
            <span>{doc.status}</span>
            {doc.localOnly ? <span>Stays on this laptop</span> : null}
          </p>
          <p className="hbody">{doc.body.trim()}</p>
          {doc.linkedFrom?.length ? (
            <dl className="kv">
              <dt>Linked from</dt>
              <dd>{doc.linkedFrom.map((x) => x.title).join(' · ')}</dd>
            </dl>
          ) : null}
          <pre>{path}</pre>
          {copied === 'none' ? <p role="status">Could not copy. Select the text instead.</p> : null}
        </>
      )}
    </Sheet>
  );
}

function WrittenDown({ bella, docId, version, onOpenAtlas, decisions }) {
  const docs = useJSON(`/obi-docs?v=${version}`);
  const index = useJSON('/docs');
  const [open, setOpen] = useState(docId ?? null);
  useEffect(() => setOpen(docId ?? null), [docId]);
  const cited = useMemo(() => new Set((Array.isArray(index) ? index : []).map((x) => x.path).filter(Boolean)), [index]);
  const rows = useMemo(
    () =>
      (docs?.docs ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        excerpt: d.excerpt,
        kind: KIND(d.kind),
        agents: !Array.isArray(index) ? null : cited.has(`obi-notes/${d.id}.md`) ? 'OBI cites it' : 'People only',
        date: d.date ?? d.updated?.slice(0, 10) ?? '',
      })),
    [docs, index, cited],
  );
  const kinds = [...new Set(rows.map((r) => r.kind))];
  const n = bella?.components.length;
  return (
    <>
      <h2 className="dlt">Written down</h2>
      <p className="sub2">Agents build from the contract, check the guidance, and stop at a decision. Notes live in obi-notes, outside the public repo.</p>
      <ol className="layers" aria-label="What an agent reads, in order">
        <li>
          <span className="ln2">1</span>
          <div>
            <b>Contract</b>
            <code>tokens/<wbr />component.json</code>
            <p>What to build: tokens, variants, don’ts, contrast.</p>
          </div>
          <span className="lv">{n ? <><b>{bella.components.filter((c) => c.hasContract).length}</b>/{n} components</> : 'Not measured'}</span>
        </li>
        <li>
          <span className="ln2">2</span>
          <div>
            <b>Guidance</b>
            <code>docs/<wbr />components/<wbr />*.md</code>
            <p>Why: the reasons the contract can’t hold.</p>
          </div>
          <span className="lv">{n ? <><b>{bella.components.filter((c) => c.hasDocs).length}</b>/{n} components</> : 'Not measured'}</span>
        </li>
        <li>
          <span className="ln2">3</span>
          <div>
            <b>Decisions</b>
            <code>docs/<wbr />decisions/<wbr /></code>
            <p>What’s settled, so an agent doesn’t reopen it.</p>
          </div>
          <span className="lv">{decisions != null ? <><b>{decisions}</b> decision record{decisions === 1 ? '' : 's'}</> : 'Not measured'}</span>
        </li>
      </ol>
      {docs?.error ? (
        <p className="k-note">The docs could not be read. Is the CHIP server running?</p>
      ) : (
        <DataTable
          label="docs"
          rows={rows}
          rowKey={(r) => r.id}
          onRow={(r) => setOpen(r.id)}
          chips={[{ id: 'all', label: 'All', test: () => true }, ...kinds.map((k) => ({ id: k, label: `${k}s`, test: (r) => r.kind === k }))]}
          cols={[
            {
              key: 'title',
              label: 'Doc',
              render: (r) => (
                <div className="dtitle">
                  <button type="button" className="k-rowbtn" onClick={() => setOpen(r.id)}>
                    {r.title}
                  </button>
                  <span>{clip(r.excerpt ?? '', 120)}</span>
                </div>
              ),
            },
            { key: 'kind', label: 'Type', render: (r) => <StatusPill>{r.kind}</StatusPill> },
            {
              key: 'agents',
              label: 'Agents',
              sortVal: (r) => (r.agents === 'OBI cites it' ? 0 : 1),
              render: (r) =>
                r.agents === 'OBI cites it' ? (
                  <span className="agy">
                    <i className="av" aria-hidden="true">
                      ✓
                    </i>
                    OBI cites it
                  </span>
                ) : (
                  <span className="agn">{r.agents ?? 'Not measured'}</span>
                ),
            },
            { key: 'date', label: 'Date', end: true, render: (r) => (r.date ? day(r.date) : 'No date') },
          ]}
        />
      )}
      <DocSheet id={open} onClose={() => setOpen(null)} bella={bella} onOpenAtlas={onOpenAtlas} />
    </>
  );
}

export default function History({ docId, version = 0, bella, lens = 'visual', onOpenAtlas, onSession }) {
  const base = useJSON('/history');
  return (
    <div className="hist k-chrome">
      <PageHeader title="History" lede="What we agreed, when and why, across BELLA and CHIP. Ask in plain words; every answer names its sources." />
      <Changes bella={bella} lens={lens} onOpenAtlas={onOpenAtlas} onSession={onSession} />
      <WrittenDown bella={bella} docId={docId} version={version} onOpenAtlas={onOpenAtlas} decisions={base?.counts?.types?.Decision ?? null} />
    </div>
  );
}
