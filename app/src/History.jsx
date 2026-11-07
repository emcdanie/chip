// History, rebuilt from the approved mock (chip-mock-03, #history) on real
// data: GET /history (BELLA's decision records, CHANGELOG and git log, CHIP's
// git log, review-card Accept / Undo), GET /obi-docs and the search index.
// Ask in plain words with suggestions; quick chips and a Filters drawer
// narrow it; a summary put together from the records, every claim numbered to
// its record; a timeline of numbered points; record cards with the Why from
// the record. "Written down" is the three layers an agent reads and the docs
// table. Lead with changes the card body. Nothing here calls a model.
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import BellaStatusPill from '@bella/components/StatusPill/StatusPill';
import { Checkbox, Chips, DataTable, Drawer, LinkButton, PageHeader, Sheet, StatusPill } from './kit/index.jsx';
import './History.css';

const TYPES = ['Decision', 'Visual', 'Contract', 'Tokens', 'Fix', 'Docs', 'Tooling'];
const QUICK = [
  ['all', 'All'],
  ['Decision', 'Decisions'],
  ['Visual', 'Visual'],
  ['Contract', 'Contract'],
  ['Fix', 'Fix'],
];
const STATUSES = ['Decided', 'Merged', 'Shipped', 'On a branch', 'Undone'];
// green shipped, yellow waiting on you, the rest neutral
const TONE_OF = { Shipped: 'pass', 'On a branch': 'needs' };
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

const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const dayYear = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
// a note's first lines, without the markdown it was written in
const plainText = (s) => (s ?? '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^#+\s*/gm, '');
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
            <StatusPill tone={TONE_OF[rec.status]}>{rec.status}</StatusPill>
          </p>
          <dl className="kv">
            {why ? (
              <>
                <dt>Why</dt>
                <dd>{why}</dd>
              </>
            ) : null}
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
function Changes({ bella, lens, onOpenAtlas, onSession, repo }) {
  const [f, setF] = useState(() => ({ ...EMPTY, ...load('chip-hist', {}) }));
  const [draft, setDraft] = useState(f.q);
  const [sort, setSort] = useState('newest');
  const [drawer, setDrawer] = useState(false);
  const [record, setRecord] = useState(null);
  const [info, setInfo] = useState({});
  const jumpRef = useRef(null);
  const [recent, setRecent] = useState(() => load('chip-hq', []));
  const [mine, setMine] = useState(() => load('chip-hpre', []));
  const [seen, setSeen] = useState(() => new Set(load('chip-hseen', [], sessionStorage)));
  const [shown, setShown] = useState(10); // one row a change, 10 on load (rule 13), 20 more at a time (concept step 7: no sideways timeline)

  useEffect(() => keep('chip-hist', f), [f]);
  // opened from a project: that repo's changes
  // leaving that project clears the filter it set, so plain History shows every repo again; a filter she chose stays
  const fromProject = useRef('');
  useEffect(() => {
    if (repo) setF((x) => ({ ...x, repo }));
    else if (fromProject.current) setF((x) => (x.repo === fromProject.current ? { ...x, repo: '' } : x));
    fromProject.current = repo || '';
  }, [repo]);
  useEffect(() => setShown(10), [f, sort]);
  const data = useJSON(`/history?${query({ ...paramsOf(f), sort: sort === 'oldest' ? 'oldest' : '' })}`);
  // every record, newest first: what Current and Superseded are read against
  const base = useJSON('/history');
  const [preN, setPreN] = useState([]);
  useEffect(() => {
    Promise.all([...PRESETS.map(([, p]) => p), ...mine.map(([, p]) => p)].map((p) => fetch(`/history?${query(paramsOf({ ...EMPTY, ...p }))}`).then((r) => r.json()).then((d) => d.count).catch(() => null))).then(setPreN);
  }, [mine]);

  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const run = (q) => {
    setDraft(q);
    const r = [q, ...recent.filter((x) => x !== q)].slice(0, 3);
    setRecent(r);
    keep('chip-hq', r);
    setF({ ...EMPTY, q });
  };
  const clear = () => setF((x) => ({ ...EMPTY, q: x.q }));
  const markSeen = (id) =>
    setSeen((s) => {
      const n = new Set(s).add(id);
      keep('chip-hseen', [...n], sessionStorage);
      return n;
    });
  const records = useMemo(() => (data?.records ?? []).map((r) => ({ ...r, tags: tagsOf(r) })), [data]);
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
  // the type chips pick one type at a time; Breaking is its own on/off filter beside them
  const quickOn = !f.types.length ? 'all' : f.types.length === 1 ? f.types[0] : null;
  const quickN = (k) => (k === 'all' ? counts?.anyType : counts?.types?.[k]);
  const quick = QUICK.filter(([k]) => quickN(k) || quickOn === k).map(([id, label]) => ({ id, label, count: quickN(id) ?? '…' }));
  const onQuick = (k) => set({ types: k === 'all' || quickOn === k ? [] : [k] });

  const related = parsed ? [...new Set([`${parsed.components[0] ?? 'Button'} decisions`, `Breaking changes to ${parsed.components[0] ?? 'Button'}`, `${parsed.components[0] ?? 'Button'} since October`, 'What changed in CHIP'])].filter((x) => x.toLowerCase() !== f.q.toLowerCase()).slice(0, 4) : [];
  const understood = parsed ? [parsed.types.length ? `${parsed.types.join(', ').toLowerCase()} changes` : 'every kind of change', parsed.components.length ? parsed.components.join(', ') : 'every component', parsed.since ? `since ${day(parsed.since)}` : 'any time', ...(parsed.breaking ? ['breaking only'] : []), ...(parsed.repo ? [`in ${parsed.repo === 'chip' ? 'CHIP' : 'BELLA'}`] : []), ...parsed.terms.map((t) => `“${t}”`)] : [];
  const bellaComp = (r) => bella?.components.find((c) => c.name === r.components?.[0]);

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
        {/* the strip's own line carries the count; this one speaks up for a search or a filter */}
        <p className={!data || data.error || f.q || data.count !== data.total ? 'hecho' : 'k-vh'} aria-live="polite">
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
                <LinkButton onClick={() => (setDraft(''), setF({ ...EMPTY }))}>Search everything instead</LinkButton>
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
        {data && !data.error && !records.length ? (
          <p className="hnone" aria-live="polite">
            Nothing matches. Try:{' '}
            {f.date ? <LinkButton onClick={() => set({ date: '' })}>any time</LinkButton> : null}
            {f.types.length ? <LinkButton onClick={() => set({ types: [] })}>every type</LinkButton> : null}
            {f.comps.length ? <LinkButton onClick={() => set({ comps: [] })}>every component</LinkButton> : null}
            {!nOn ? <LinkButton onClick={() => (setDraft(''), setF({ ...EMPTY }))}>clear the search</LinkButton> : null}
          </p>
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
        {data && !data.error && records.length ? (
          <>
            <ListRowGroup ariaLabel="Changes" className="hrows">
              {records.slice(0, shown).map((r) => (
                <ListRow
                  key={r.id}
                  title={
                    <>
                      <BellaStatusPill className="htag" variant={r.breaking ? 'danger' : r.type === 'Decision' ? 'info' : 'neutral'}>
                        {r.breaking ? `Breaking ${r.type.toLowerCase()}` : r.type}
                      </BellaStatusPill>
                      {clip(r.title, 90)}
                    </>
                  }
                  description={
                    <>
                      {day(r.date)} · {r.components?.length ? r.components.slice(0, 3).join(', ') : r.repo === 'chip' ? 'CHIP' : 'BELLA'}
                      {r.why ? ` · ${clip(r.why.replace(/\s+/g, ' '), 70)}` : ''} · From <code className="hsrc-code">{r.source}{r.sha ? ` ${r.sha}` : ''}</code>
                    </>
                  }
                  action={
                    <LinkButton aria-label={`Open: ${clip(r.title, 60)}`} onClick={() => (markSeen(r.id), setRecord(r.id))}>
                      Open →
                    </LinkButton>
                  }
                />
              ))}
            </ListRowGroup>
            {records.length > shown ? (
              <Button variant="secondary" onClick={() => setShown((n) => n + 20)}>
                Show {Math.min(20, records.length - shown)} more of {records.length - shown}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        onApply={() => (setDrawer(false), document.getElementById('h-track')?.scrollIntoView({ block: 'start' }))}
        applyLabel={`Show ${data?.count ?? 0} change${data?.count === 1 ? '' : 's'}`}
        onClear={nOn ? clear : undefined}
      >
        <div className="hpre">
          <span className="sub2">Presets</span>
          {PRESETS.map(([n, p], i) => (
            <button key={n} type="button" className="k-chip" onClick={() => (setF({ ...EMPTY, ...p }), setDraft(''))}>
              {n} <span className="n">{preN[i] ?? '…'}</span>
            </button>
          ))}
          {mine.map(([n, p], i) => (
            <span key={n} className="mine">
              <button type="button" className="k-chip" onClick={() => (setF({ ...EMPTY, ...p }), setDraft(p.q ?? ''))}>
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
        <fieldset>
          <legend>Show</legend>
          <Checkbox checked={f.breaking} count={counts?.breaking ?? 0} onChange={(on) => set({ breaking: on })}>
            Breaking only
          </Checkbox>
        </fieldset>
        <fieldset>
          <legend>Order</legend>
          <Chips
            label="Order"
            value={sort}
            onChange={setSort}
            items={[
              { id: 'newest', label: 'Newest first' },
              { id: 'oldest', label: 'Oldest first' },
            ]}
          />
        </fieldset>
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

export default function History({ docId, version = 0, bella, lens = 'visual', onOpenAtlas, onSession, repo }) {
  const [doc, setDoc] = useState(docId ?? null);
  useEffect(() => setDoc(docId ?? null), [docId]);
  return (
    <div className="hist k-chrome">
      <PageHeader title="History" lede="What changed, when and why, across BELLA and CHIP." />
      <Changes bella={bella} lens={lens} onOpenAtlas={onOpenAtlas} onSession={onSession} repo={repo} />
      {/* Written down's cards are cut (concept, amended 7 Nov); #/docs/<id> still opens the doc */}
      <DocSheet id={doc} onClose={() => setDoc(null)} bella={bella} onOpenAtlas={onOpenAtlas} />
    </div>
  );
}
