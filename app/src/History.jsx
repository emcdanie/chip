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
import { Checkbox, Chips, DataTable, Drawer, LinkButton, PageHeader, Sheet, StatusPill } from './kit/index.jsx';
import ResultsBar from './templates/ResultsBar.jsx';
import NoResults from './templates/NoResults.jsx';
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
    r.type === 'Contract' || r.files?.includes('tokens/contracts.json') ? 'contract' : '',
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

/* ---------- the card track: dated cards on a rail, the page scroll moves it ----------
   After the Learning timeline on Elleta's site: one strip of dated cards on a
   rail, the month on the first card of each. While the strip is pinned, the
   page scroll moves it sideways; ONE progress number drives the strip, the ink
   on the rail, the marker ring, the dots (a dot fills once the marker passes)
   and the counter. The card on the marker is lit and opens to show why, what
   it touched and its links; hovering or focusing a card lights that one
   instead. Arrow keys, Home and End walk the cards; "Jump to" puts a month on
   the marker; "Skip timeline" goes on to Written down. The rail draws when the
   strip comes into view and again each time it comes back. Reduced motion: a
   plain sideways-scrolling strip, the same marker, no drawing. */
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const box = (el) => el.getBoundingClientRect();
const month = (iso) => new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const RMQ = '(prefers-reduced-motion: reduce)';
function useReduced() {
  const [r, setR] = useState(() => window.matchMedia(RMQ).matches);
  useEffect(() => {
    const m = window.matchMedia(RMQ);
    const on = () => setR(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return r;
}

function Track({ records, total, decisions, lens, onRecord, onOpenAtlas, bellaComp, vstat, seen, markSeen, jumpRef }) {
  const reduce = useReduced();
  const scrub = !reduce;
  const run = useRef(null);
  const pin = useRef(null);
  const wrap = useRef(null);
  const tlx = useRef(null);
  const track = useRef(null);
  const fill = useRef(null);
  const head = useRef(null);
  const geo = useRef({ dist: 0, span: 0, D: [], L: 0, M: 0, top: 0, reached: false, scrolled: 0 });
  const [n, setN] = useState(0);
  const [hov, setHov] = useState(null);
  const [reached, setReached] = useState(false);
  const T = records;
  const lit = Math.min(hov ?? n, Math.max(0, T.length - 1));

  /* progress, 0 to 1: the page scroll while pinned, or the strip's own scroll */
  const p = useCallback(() => {
    const g = geo.current;
    if (scrub) return clamp01((g.top - box(run.current).top) / (g.span || 1));
    return g.dist ? tlx.current.scrollLeft / g.dist : 0;
  }, [scrub]);
  /* where card u (fractional) sits on the strip */
  const at = (u) => {
    const D = geo.current.D, i = Math.min(D.length - 1, Math.floor(u));
    return i >= D.length - 1 ? D[D.length - 1] : D[i] + (u - i) * (D[i + 1] - D[i]);
  };

  const update = useCallback(() => {
    const g = geo.current;
    if (!run.current || !tlx.current || !g.D.length) return;
    /* in view: the rail draws; out of view it resets, so it draws again on the way back */
    const r = box(run.current);
    const now = reduce || (r.top <= innerHeight * 0.75 && r.bottom >= innerHeight * 0.25);
    if (now !== g.reached) {
      g.reached = now;
      setReached(now);
    }
    const last = g.D.length - 1;
    const u = p() * last;
    let k, s, key;
    if (scrub) {
      /* each card rests on the marker for the first half of its stretch, then the strip slides on; the next card lights halfway */
      const i = Math.floor(u), t = u - i;
      const e = t < 0.5 ? 0 : ((x) => x * x * (3 - 2 * x))((t - 0.5) * 2);
      key = at(Math.min(last, i + e));
      k = Math.min(last, Math.round(i + e));
      /* the marker holds one card in from the left; it walks in at the start and out at the end */
      s = Math.min(g.dist, Math.max(0, key - g.M));
      if (Math.abs(tlx.current.scrollLeft - s) > 0.5) tlx.current.scrollLeft = s;
    } else {
      s = tlx.current.scrollLeft;
      k = Math.round(u);
      key = g.D[k];
    }
    const xm = key - s;
    fill.current.style.inlineSize = `${Math.max(0, xm - g.L).toFixed(1)}px`;
    head.current.style.translate = `${xm.toFixed(1)}px var(--ry)`;
    setN(k);
  }, [p, reduce, scrub]);

  const layout = useCallback(() => {
    const r = run.current, w = wrap.current, x = tlx.current, t = track.current;
    if (!r || !w || !x || !t) return;
    const g = geo.current;
    const items = [...t.children];
    const dot = items[0]?.querySelector('[data-dot]');
    if (!dot) {
      g.D = [];
      return;
    }
    /* in the strip's own coordinates: offsets ignore its scroll */
    const dx = dot.offsetLeft - items[0].offsetLeft + dot.offsetWidth / 2;
    g.D = items.map((c) => c.offsetLeft + dx);
    g.L = g.D[0];
    const pitch = g.D.length > 1 ? g.D[1] - g.D[0] : 0;
    g.M = x.clientWidth >= 3 * pitch ? g.L + pitch : g.L;
    g.dist = Math.max(0, x.scrollWidth - x.clientWidth);
    const dr = box(dot);
    w.style.setProperty('--ry', `${dr.top + dr.height / 2 - box(w).top}px`);
    w.style.setProperty('--rx', `${g.L}px`);
    g.top = parseFloat(getComputedStyle(pin.current).top) || 0;
    /* half a card's width of page scroll per card, and the whole walk in at most ten screens */
    g.span = (g.D.length - 1) * Math.min(pitch / 2, (10 * innerHeight) / Math.max(1, g.D.length - 1));
    r.style.blockSize = scrub ? `${pin.current.offsetHeight + g.span}px` : '';
    update();
  }, [scrub, update]);

  useLayoutEffect(() => {
    layout();
  }, [layout, T]);

  useEffect(() => {
    const ro = new ResizeObserver(() => layout());
    if (run.current?.parentElement) ro.observe(run.current.parentElement);
    if (pin.current) ro.observe(pin.current);
    const onScroll = () => {
      geo.current.scrolled = Date.now();
      setHov(null);
      update();
    };
    addEventListener('scroll', onScroll, { passive: true });
    const x = tlx.current;
    x?.addEventListener('scroll', update, { passive: true });
    /* while the page drives the strip, a sideways swipe on it moves the page in step */
    const wheel = (e) => {
      if (!scrub || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      scrollBy(0, e.deltaX / 2);
    };
    x?.addEventListener('wheel', wheel, { passive: false });
    return () => {
      ro.disconnect();
      removeEventListener('scroll', onScroll);
      x?.removeEventListener('scroll', update);
      x?.removeEventListener('wheel', wheel);
    };
  }, [layout, update, scrub]);

  /* put card i on the marker */
  const goTo = (i, smooth = !reduce) => {
    const g = geo.current;
    if (!g.D.length) return;
    const q = i / Math.max(1, g.D.length - 1);
    const behavior = smooth ? 'smooth' : 'auto';
    if (scrub) scrollTo({ top: Math.ceil(scrollY + box(run.current).top - g.top + q * g.span), behavior });
    else tlx.current.scrollTo({ left: Math.ceil(q * g.dist), behavior });
  };
  const focusCard = (j) => track.current?.querySelectorAll('.hct')[j]?.focus();
  const keys = (e, i) => {
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: T.length - 1 }[e.key];
    if (j === undefined || !T[j]) return;
    e.preventDefault();
    focusCard(j);
  };
  // Jump to a month lives in the Filters drawer now (density pass): it calls this
  if (jumpRef) jumpRef.current = (m) => goTo(T.findIndex((r) => month(r.date) === m));
  const used = T.filter((r) => r.type === 'Decision').length;
  if (!T.length) return null;
  const order = Date.parse(T[0].date) >= Date.parse(T[T.length - 1].date) ? 'newest on the left' : 'oldest on the left';

  return (
    <section ref={run} id="h-track" className="hrun" aria-label={`Changes, ${order}`} data-scrub={scrub || undefined} data-reached={reached || undefined}>
      <h2 className="k-vh">Timeline</h2>
      <div ref={pin} className="hpin">
        <div className="hkey">
          <p className="hcount">
            {lit + 1} of {T.length}
            {total > T.length ? ` (first ${T.length} of ${total} records)` : ' records'} · {dayYear(T[lit].date)}
          </p>
          <p className="hlegend">
            <span>
              <i data-dec="" aria-hidden="true" />
              Decision record ({decisions != null && decisions !== used ? `${used} of ${decisions} in this stretch` : used})
            </span>
            <span>
              <i aria-hidden="true" />
              Commit, release or review card
            </span>
          </p>
        </div>
        <div ref={wrap} className="hwrap">
          <i className="hrail" aria-hidden="true" />
          <i ref={fill} className="hfill" aria-hidden="true" />
          <i ref={head} className="hhead" aria-hidden="true" />
          <div ref={tlx} className="htx" role="region" aria-label={`Timeline, ${order}`} tabIndex={scrub ? undefined : 0}>
            <ol ref={track} className="htrack" onPointerLeave={() => setHov(null)}>
              {T.map((r, i) => {
                const m = month(r.date);
                const first = i === 0 || month(T[i - 1].date) !== m;
                const on = i === lit;
                const why = whyOf(r);
                const v = vstat(r);
                const c = bellaComp(r);
                const files = r.files ?? [];
                return (
                  <li
                    key={r.id}
                    id={`rec-${r.id}`}
                    className="hitem"
                    data-dec={r.type === 'Decision' || undefined}
                    data-passed={i <= n || undefined}
                    data-now={on || undefined}
                    aria-current={on || undefined}
                    onPointerMove={(e) => (e.movementX || e.movementY) && Date.now() - geo.current.scrolled > 200 && hov !== i && setHov(i)}
                  >
                    <span className="hmon" aria-hidden={!first || undefined}>
                      {first ? m : ''}
                    </span>
                    <i className="hdot" data-dot="" aria-hidden="true" />
                    <article className={`hcard${seen.has(r.id) ? ' seen' : ''}`}>
                      <p className="hchips">
                        <StatusPill>{r.type}</StatusPill>
                        <StatusPill tone={TONE_OF[r.status]}>{r.status}</StatusPill>
                        {r.breaking ? <StatusPill tone="fail">Breaking</StatusPill> : null}
                      </p>
                      <h3>
                        <button
                          type="button"
                          className="hct"
                          tabIndex={on ? 0 : -1}
                          aria-expanded={on}
                          aria-controls={`hcd-${i}`}
                          onFocus={() => {
                            setHov(null);
                            goTo(i, false);
                          }}
                          onKeyDown={(e) => keys(e, i)}
                          onClick={() => (markSeen(r.id), onRecord(r.id))}
                        >
                          {clip(r.title, 80)}
                        </button>
                      </h3>
                      <p className="hsrc2">
                        <span>{day(r.date)}</span>
                        <span>{where(r)}</span>
                        {seen.has(r.id) ? <span>Viewed</span> : null}
                      </p>
                      <div className="hcd" id={`hcd-${i}`} hidden={!on}>
                        {why ? (
                          <p className="hwhy hsumm">
                            <b>{lens === 'scope' ? 'Asked for' : 'Why'}</b> {clip(why.replace(/\s+/g, ' '), 140)}
                          </p>
                        ) : null}
                        <dl className="hrefdl">
                          <dt>Touched</dt>
                          <dd>
                            {r.components?.length ? r.components.slice(0, 4).join(', ') : r.repo === 'chip' ? 'CHIP only' : 'BELLA, no single component'}
                            {v ? ` · ${v}` : ''}
                          </dd>
                          {files.length ? (
                            <>
                              <dt>Files</dt>
                              <dd className="hfiles">
                                {files.slice(0, 2).map((f) => (
                                  <code key={f} title={f}>
                                    {f}
                                  </code>
                                ))}
                                {files.length > 2 ? <span className="k-sub">and {files.length - 2} more</span> : null}
                              </dd>
                            </>
                          ) : null}
                          <dt>Record</dt>
                          <dd>
                            <Source r={r} />
                          </dd>
                        </dl>
                        <p className="hacts">
                          <LinkButton onClick={() => (markSeen(r.id), onRecord(r.id))}>View full record</LinkButton>
                          {c ? <LinkButton onClick={() => (markSeen(r.id), onOpenAtlas(c.id, 'history'))}>Compare versions</LinkButton> : null}
                        </p>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
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
  const [info, setInfo] = useState({});
  const jumpRef = useRef(null);
  const [recent, setRecent] = useState(() => load('chip-hq', []));
  const [mine, setMine] = useState(() => load('chip-hpre', []));
  const [seen, setSeen] = useState(() => new Set(load('chip-hseen', [], sessionStorage)));

  useEffect(() => keep('chip-hist', f), [f]);
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
            {nOn ? `Filters · ${nOn}` : 'Filters'}
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
          <NoResults
            noun="records"
            what={f.q ? `“${f.q}”` : null}
            on={applied.map(([k, v, l]) => ({ key: `${k}${v}`, label: l, onRemove: () => unapply(k, v) }))}
            onClearAll={() => (setDraft(''), setF({ ...EMPTY }))}
          />
        ) : null}
        {applied.length ? (
          <ResultsBar
            applied={applied.map(([k, v, l]) => ({ key: `${k}${v}`, label: l, removeLabel: `Remove ${l}`, onRemove: () => unapply(k, v) }))}
            shown={data && !data.error ? data.count : null}
            total={data?.total}
            onClearAll={clear}
            extra={
              mine.some(([n]) => n === searchName) ? null : (
                <LinkButton
                  onClick={() => {
                    const next = [...mine, [searchName, { ...f }]];
                    setMine(next);
                    keep('chip-hpre', next);
                  }}
                >
                  Save this search
                </LinkButton>
              )
            }
          />
        ) : null}
        {data && !data.error ? <Track records={records} total={data.count} decisions={f.q || f.types.length ? null : base?.counts?.types?.Decision} lens={lens} onRecord={setRecord} onOpenAtlas={onOpenAtlas} bellaComp={bellaComp} vstat={vstat} seen={seen} markSeen={markSeen} jumpRef={jumpRef} /> : null}
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
        {records.length ? (
          <fieldset>
            <legend>Jump to</legend>
            <div className="hjump">
              {[...new Set(records.map((r) => month(r.date)))].map((m) => (
                <button key={m} type="button" className="k-chip" onClick={() => (setDrawer(false), requestAnimationFrame(() => jumpRef.current?.(m)))}>
                  {m}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}
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
        excerpt: plainText(d.excerpt),
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
      <h2 className="dlt" id="h-written" tabIndex={-1}>
        Written down
      </h2>
      <p className="sub2">Agents build from the contract, check the guidance, and stop at a decision. Notes live in obi-notes, outside the public repo.</p>
      <ol className="layers" aria-label="What an agent reads, in order">
        <li>
          <span className="ln2">1</span>
          <div>
            <b>Contract</b>
            <code>tokens/<wbr />contracts.json</code>
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
            { key: 'kind', label: 'Type', prio: 2, render: (r) => <StatusPill>{r.kind}</StatusPill> },
            {
              key: 'agents',
              label: 'Agents',
              prio: 3,
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
      <PageHeader
        title="History"
        lede="What we agreed, when and why, across BELLA and CHIP."
        actions={
          // the decision records sit below an 80-card timeline: this skips it
          <Button
            onClick={() => {
              const h = document.getElementById('h-written');
              h?.scrollIntoView({ block: 'start' });
              h?.focus({ preventScroll: true });
            }}
          >
            Written down ↓
          </Button>
        }
      />
      <Changes bella={bella} lens={lens} onOpenAtlas={onOpenAtlas} onSession={onSession} />
      <WrittenDown bella={bella} docId={docId} version={version} onOpenAtlas={onOpenAtlas} decisions={base?.counts?.types?.Decision ?? null} />
    </div>
  );
}
