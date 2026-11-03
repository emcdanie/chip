// History (phase 6, 3 Nov late): what we agreed and changed, when and why,
// from BELLA's decision records, CHANGELOG and git log, CHIP's git log and
// the review cards' Accept / Undo. Ask in plain words (GET /history parses
// component names, type words, months and "breaking" into filters and says
// what it understood); quick chips and a Filters drawer narrow it; a
// full-width timeline above the cards. Each card: View full record, Show on
// the timeline, Compare versions. The notes and inbox are "Written down".
import React, { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '@bella/components/PageHeader/PageHeader';
import Card from '@bella/components/Card/Card';
import Input from '@bella/components/Input/Input';
import Button from '@bella/components/Button/Button';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Tag from '@bella/components/Tag/Tag';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Drawer from '@bella/components/Drawer/Drawer';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import Docs from './Docs.jsx';

export const SHAPE = { Decision: '◆', Visual: '●', Contract: '■', Tokens: '◇', Fix: '▲', Docs: '□', Tooling: '○' };
const QUICK = ['Decision', 'Visual', 'Contract', 'Tokens', 'Fix'];
const STATUSES = ['Decided', 'Merged', 'Shipped', 'On a branch', 'Undone'];
const STATUS_SHAPE = { Decided: '◆', Merged: '●', Shipped: '✓', 'On a branch': '◌', Undone: '↺' };
const TRY = ["What changed in Button's contract since September?", 'Decisions about the highlight', 'wee-dote', 'Breaking changes', 'What did CHIP accept?'];
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const short = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const thisYear = new Date().getFullYear();
const DATES = [
  { id: '', label: 'Any time' },
  { id: `${thisYear}-09-01`, label: 'Since September' },
  { id: `${thisYear}-10-01`, label: 'Since October' },
  { id: 'last30', label: 'Last 30 days' },
];

function useHistory(params) {
  const [data, setData] = useState(null);
  const key = JSON.stringify(params);
  useEffect(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && (!Array.isArray(v) || v.length)) q.set(k, Array.isArray(v) ? v.join(',') : v === true ? '1' : v);
    let gone = false;
    fetch(`/history?${q}`)
      .then((r) => r.json())
      .then((d) => !gone && setData(d))
      .catch(() => !gone && setData({ error: true }));
    return () => {
      gone = true;
    };
  }, [key]);
  useEffect(() => {
    const on = () => setData((d) => (d ? { ...d } : d));
    window.addEventListener('chip:changed', on);
    return () => window.removeEventListener('chip:changed', on);
  }, []);
  return data;
}

function Record({ id, onClose, onOpen }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    if (!id) return;
    setR(null);
    fetch(`/history/record?id=${encodeURIComponent(id)}`)
      .then((x) => x.json())
      .then(setR)
      .catch(() => setR({ error: true }));
  }, [id]);
  return (
    <Drawer open={!!id} onClose={onClose} label={r?.title ?? 'Record'} side="right" className="sheet">
      {!r ? (
        <p className="label">Reading the record…</p>
      ) : r.error ? (
        <p className="label">The record could not be read.</p>
      ) : (
        <div className="record">
          <p className="label">
            {SHAPE[r.type]} {r.type} · {STATUS_SHAPE[r.status]} {r.status} · {day(r.date)}
            {r.who ? ` · ${r.who}` : ''} · from {r.source}
            {r.sha ? (
              <>
                {' '}
                · <span className="mono">{r.sha}</span>
              </>
            ) : null}
            {r.path ? (
              <>
                {' '}
                · <span className="mono">{r.path}</span>
              </>
            ) : null}
          </p>
          {r.components?.length ? (
            <p className="chips">
              {r.components.map((c) => (
                <Tag key={c}>{c}</Tag>
              ))}
            </p>
          ) : null}
          <pre className="record-body">{r.body ?? r.why}</pre>
          {r.stat ? <pre className="review-code">{r.stat}</pre> : null}
          {r.diff ? (
            <details>
              <summary>Show the diff</summary>
              <pre className="review-code">{r.diff}</pre>
            </details>
          ) : null}
          {r.versions ? (
            <p className="review-actions">
              {r.versions.older ? <ActionChip onClick={() => onOpen(r.versions.older)}>Older {r.versions.component} change</ActionChip> : null}
              {r.versions.newer ? <ActionChip onClick={() => onOpen(r.versions.newer)}>Newer {r.versions.component} change</ActionChip> : null}
              <span className="label">
                {r.versions.count} records touch {r.versions.component}.
              </span>
            </p>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}

function Timeline({ points, picked, onPick }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [picked]);
  if (!points.length) return null;
  const oldest = [...points].reverse();
  const keys = (e, i) => {
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? oldest.length - 1 : null;
    if (to == null) return;
    e.preventDefault();
    const n = Math.max(0, Math.min(oldest.length - 1, to));
    ref.current?.querySelectorAll('button')[n]?.focus();
    onPick(oldest[n].id);
  };
  return (
    <div className="timeline" ref={ref} role="group" aria-label={`Timeline, ${points.length} records, oldest first`}>
      <ol>
        {oldest.map((p, i) => (
          <li key={p.id}>
            <button type="button" aria-pressed={picked === p.id} onClick={() => onPick(picked === p.id ? null : p.id)} onKeyDown={(e) => keys(e, i)} title={p.title}>
              <span className="tl-dot" aria-hidden="true">
                {SHAPE[p.type] ?? '●'}
              </span>
              <span className="tl-date">{short(p.date)}</span>
              <span className="tl-title">{p.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Changes({ onOpenAtlas, bella }) {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [types, setTypes] = useState([]);
  const [comps, setComps] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [date, setDate] = useState('');
  const [breaking, setBreaking] = useState(false);
  const [sort, setSort] = useState('newest');
  const [drawer, setDrawer] = useState(false);
  const [record, setRecord] = useState(null);
  const [picked, setPicked] = useState(null);
  const since = date === 'last30' ? ago(30) : date;
  const data = useHistory({ q, type: types, component: comps, status: statuses, since, breaking, sort });
  const active = types.length + comps.length + statuses.length + (date ? 1 : 0) + (breaking ? 1 : 0);
  const clear = () => {
    setTypes([]);
    setComps([]);
    setStatuses([]);
    setDate('');
    setBreaking(false);
  };
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const submit = (e) => {
    e?.preventDefault();
    setQ(draft.trim());
    setPicked(null);
  };
  const ask = (text) => {
    setDraft(text);
    setQ(text);
    setPicked(null);
  };
  useEffect(() => {
    if (!picked) return;
    document.getElementById(`rec-${CSS.escape(picked)}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [picked]);
  const understood = data?.parsed ? [...data.parsed.components.map((c) => `component: ${c}`), ...data.parsed.types.map((t) => `type: ${t}`), ...(data.parsed.since ? [`since ${short(data.parsed.since)}`] : []), ...(data.parsed.breaking ? ['breaking only'] : []), ...(data.parsed.repo ? [`in ${data.parsed.repo.toUpperCase()}`] : []), ...data.parsed.terms.map((t) => `“${t}”`)] : [];
  const compNames = useMemo(() => Object.entries(data?.counts?.components ?? {}).sort((a, b) => b[1] - a[1]), [data]);

  return (
    <>
      <form className="history-search" onSubmit={submit} role="search">
        <Input label="Ask about a change, in plain words" value={draft} onChange={setDraft} />
        <Button variant="primary" type="submit">
          Search
        </Button>
      </form>
      {!q ? (
        <p className="chips history-try">
          <span className="label">Try:</span>
          {TRY.map((t) => (
            <ActionChip key={t} onClick={() => ask(t)}>
              {t}
            </ActionChip>
          ))}
        </p>
      ) : null}

      <div className="history-filters">
        <div className="chips" role="group" aria-label="Quick filters">
          <FilterChip pressed={!types.length && !breaking} onClick={() => (setTypes([]), setBreaking(false))}>
            All
          </FilterChip>
          {QUICK.filter((t) => data?.counts?.types?.[t] || types.includes(t)).map((t) => (
            <FilterChip key={t} pressed={types.includes(t)} onClick={() => toggle(types, setTypes, t)}>
              {SHAPE[t]} {t} {data?.counts?.types?.[t] ?? ''}
            </FilterChip>
          ))}
          {data?.counts?.breaking || breaking ? (
            <FilterChip pressed={breaking} onClick={() => setBreaking(!breaking)}>
              Breaking {data?.counts?.breaking ?? ''}
            </FilterChip>
          ) : null}
        </div>
        <ActionChip onClick={() => setDrawer(true)}>{active ? `Filters · ${active}` : 'Filters'}</ActionChip>
      </div>

      {data?.error ? <p className="label">History could not be read (is the CHIP server running?).</p> : null}
      {data && !data.error ? (
        <>
          <p className="history-echo" aria-live="polite">
            <strong>
              {data.count} record{data.count === 1 ? '' : 's'}
            </strong>
            {q ? ` for “${q}”` : ` of ${data.total}`}
            {understood.length ? (
              <>
                . CHIP understood: {understood.join(' · ')}.{' '}
                <ActionChip onClick={() => (setQ(''), setDraft(''))}>Search everything instead</ActionChip>
              </>
            ) : null}
          </p>
          {active ? (
            <p className="chips" aria-label="Applied filters">
              {types.map((t) => (
                <ActionChip key={t} onClick={() => toggle(types, setTypes, t)}>
                  ✕ {t}
                </ActionChip>
              ))}
              {comps.map((c) => (
                <ActionChip key={c} onClick={() => toggle(comps, setComps, c)}>
                  ✕ {c}
                </ActionChip>
              ))}
              {statuses.map((s) => (
                <ActionChip key={s} onClick={() => toggle(statuses, setStatuses, s)}>
                  ✕ {s}
                </ActionChip>
              ))}
              {date ? <ActionChip onClick={() => setDate('')}>✕ {DATES.find((d) => d.id === date)?.label}</ActionChip> : null}
              {breaking ? <ActionChip onClick={() => setBreaking(false)}>✕ Breaking</ActionChip> : null}
              <ActionChip onClick={clear}>Clear all</ActionChip>
            </p>
          ) : null}

          <Timeline points={data.timeline} picked={picked} onPick={setPicked} />

          <div className="history-sort">
            <span className="label">Sort:</span>
            <FilterChip pressed={sort === 'newest'} onClick={() => setSort('newest')} size="compact">
              Newest first
            </FilterChip>
            <FilterChip pressed={sort === 'oldest'} onClick={() => setSort('oldest')} size="compact">
              Oldest first
            </FilterChip>
          </div>

          {!data.records.length ? <p>Nothing matches. Try fewer words, or one of: {TRY.slice(0, 3).join(' · ')}.</p> : null}
          <ol className="history-cards">
            {data.records.map((r) => (
              <li key={r.id} id={`rec-${r.id}`} data-picked={picked === r.id || undefined}>
                <Card>
                  <article className="hcard" aria-labelledby={`rt-${r.id}`}>
                    <h3 id={`rt-${r.id}`} className="card-title">
                      {r.title}
                    </h3>
                    <p className="chips">
                      <Tag>
                        {SHAPE[r.type]} {r.type}
                      </Tag>
                      <StatusPill variant={r.status === 'Undone' ? 'neutral' : r.status === 'On a branch' ? 'attention' : 'quiet'}>
                        {STATUS_SHAPE[r.status]} {r.status}
                      </StatusPill>
                      {r.breaking ? <Tag variant="accent">Breaking</Tag> : null}
                      {r.components.slice(0, 4).map((c) => (
                        <Tag key={c}>{c}</Tag>
                      ))}
                    </p>
                    {r.why ? <p className="hcard-why">{r.why}</p> : null}
                    <p className="label">
                      From {r.source} · {day(r.date)}
                      {r.who ? ` · ${r.who}` : ''}
                      {r.sha ? (
                        <>
                          {' '}
                          · <span className="mono">{r.sha}</span>
                        </>
                      ) : null}
                    </p>
                    <p className="hcard-actions">
                      <ActionChip onClick={() => setRecord(r.id)}>View full record</ActionChip>
                      <ActionChip onClick={() => setPicked(r.id)}>Show on the timeline</ActionChip>
                      {r.components.length && bella?.components.some((c) => c.name === r.components[0]) ? (
                        <ActionChip onClick={() => onOpenAtlas(bella.components.find((c) => c.name === r.components[0]).id, 'history')}>Compare versions of {r.components[0]}</ActionChip>
                      ) : null}
                    </p>
                  </article>
                </Card>
              </li>
            ))}
          </ol>
          {data.count > data.records.length ? <p className="label">Showing the first {data.records.length}. Narrow the search to see the rest.</p> : null}
        </>
      ) : null}

      <Drawer open={drawer} onClose={() => setDrawer(false)} label="Filters" side="right" className="sheet">
        <div className="filters">
          <fieldset>
            <legend>Type</legend>
            <p className="chips">
              {Object.keys(SHAPE).filter((t) => data?.counts?.types?.[t] || types.includes(t)).map((t) => (
                <FilterChip key={t} pressed={types.includes(t)} onClick={() => toggle(types, setTypes, t)}>
                  {SHAPE[t]} {t} {data?.counts?.types?.[t] ?? 0}
                </FilterChip>
              ))}
            </p>
          </fieldset>
          <fieldset>
            <legend>Date</legend>
            <p className="chips">
              {DATES.map((d) => (
                <FilterChip key={d.id} pressed={date === d.id} onClick={() => setDate(d.id)}>
                  {d.label}
                </FilterChip>
              ))}
            </p>
          </fieldset>
          <fieldset>
            <legend>Status</legend>
            <p className="chips">
              {STATUSES.filter((s) => data?.counts?.status?.[s] || statuses.includes(s)).map((s) => (
                <FilterChip key={s} pressed={statuses.includes(s)} onClick={() => toggle(statuses, setStatuses, s)}>
                  {STATUS_SHAPE[s]} {s} {data?.counts?.status?.[s] ?? 0}
                </FilterChip>
              ))}
            </p>
          </fieldset>
          <fieldset>
            <legend>Component</legend>
            <p className="label">Named in the record’s title, body or files.</p>
            <p className="chips">
              {compNames.map(([c, n]) => (
                <FilterChip key={c} pressed={comps.includes(c)} onClick={() => toggle(comps, setComps, c)} size="compact">
                  {c} {n}
                </FilterChip>
              ))}
            </p>
          </fieldset>
          <div className="review-actions">
            <Button variant="primary" onClick={() => setDrawer(false)}>
              Show {data?.count ?? 0} changes
            </Button>
            <Button variant="tertiary" onClick={clear}>
              Clear all
            </Button>
          </div>
        </div>
      </Drawer>
      <Record id={record} onClose={() => setRecord(null)} onOpen={setRecord} />
    </>
  );
}

export default function History({ docId, version, narrow, bella, onOpenAtlas }) {
  const [tab, setTab] = useState(docId ? 'written' : 'changes');
  useEffect(() => {
    if (docId) setTab('written');
  }, [docId]);
  return (
    <div className="history">
      <PageHeader title="History" lede="What we agreed, when and why, across BELLA and CHIP: decision records, the changelog, git, and what you accepted in a review card. Ask in plain words; every card names its source." />
      <Tabs
        tabs={[
          { id: 'changes', label: 'Changes' },
          { id: 'written', label: 'Written down' },
        ]}
        value={tab}
        onChange={setTab}
        label="History"
        idBase="hist"
      />
      <div {...tabPanelProps('hist', 'changes', tab === 'changes')}>
        <div className="history-changes">{tab === 'changes' ? <Changes bella={bella} onOpenAtlas={onOpenAtlas} /> : null}</div>
      </div>
      <div {...tabPanelProps('hist', 'written', tab === 'written')}>{tab === 'written' ? <Docs docId={docId} version={version} narrow={narrow} /> : null}</div>
    </div>
  );
}
