// History · content: the code twin of the Figma slot fill (CHIP Dashboard
// 664:123671, "visual · default"). Search in plain words, the kinds as
// filter chips, Filters in a drawer, then the Activity timeline (Step per
// record, by day) beside the opened record. Real CHIP data: /history and
// /history/record. Built from BELLA parts and the template's Flow only.
//
// Gaps (library board): the "What it touched" tree (Map line pieces placed
// by position) has no part yet, so the files show as a list of cards; the
// Count in Figma is Stat without its chart. Ask uses Input's own Send button.
// Actions that run the agent (Ask) wait for the Menu part for the model menu
// (Auto, local first).
import { useEffect, useMemo, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Step from '@bella/components/Step/Step';
import Tag from '@bella/components/Tag/Tag';
import TextStack from '@bella/components/TextStack/TextStack';
import Notification from '@bella/components/Notification/Notification';
import Stat from '@bella/components/Stat/Stat';
import Input from '@bella/components/Input/Input';
import Button from '@bella/components/Button/Button';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Drawer from '@bella/components/Drawer/Drawer';
import Eyebrow from '@bella/components/Eyebrow/Eyebrow';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';

const KINDS = ['Decision', 'Fix', 'Visual', 'Contract', 'Tokens', 'Tooling', 'Docs'];
// one icon per kind, as Figma's Activity draws them: Tooling a gear, Visual an eye; Docs (a page) and
// Tokens (a palette) stand in with Book and Sparks until BELLA has those glyphs (gap). Figma draws no
// icon for Fix, Contract or Decision: never the done tick, which reads as a status.
const ICON = { Decision: 'ShieldCheck', Fix: 'RefreshDouble', Visual: 'Eye', Contract: 'Code', Tokens: 'Sparks', Tooling: 'Settings', Docs: 'Book' };
const STATUSES = ['Decided', 'Merged', 'Shipped', 'On a branch', 'Undone'];
const SINCE = [
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['90d', 'Last 90 days'],
];
const PAGE = 10;

const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const time = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const STATUS_TONE = { Merged: 'success', Shipped: 'success', Decided: 'info', 'On a branch': 'attention', Undone: 'neutral' };
// Plain words on screen (her rule): no Figma node ids, file paths, app routes or model names.
const plain = (t) =>
  String(t ?? '')
    .replace(/\s*\(?\b\d{2,4}:\d{2,7}\b\)?/g, '')
    .replace(/#\/[\w-]+-old\b/g, 'its old address')
    .replace(/#\/([\w-]+)/g, (_, r) => `the ${r.replace(/-/g, ' ')} page`)
    .replace(/(?:[\w.-]+\/)+[\w.-]+\.\w+|\b[\w-]+\.(?:jsx?|tsx?|css|html|json|mjs|md|ya?ml)\b/g, '')
    .replace(/\bClaude Code\b|\bClaude\b/g, 'the agent')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\(\s*\)|,\s*(?=[,.;])/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
const count = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const lines = (stat) => [...String(stat ?? '').matchAll(/(\d+) (?:insertion|deletion)/g)].reduce((n, m) => n + Number(m[1]), 0);

function useHistory(params) {
  const [data, setData] = useState(null);
  const qs = new URLSearchParams(params).toString();
  useEffect(() => {
    let live = true;
    setData(null);
    fetch(`/history?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setData(d))
      .catch(() => live && setData({ error: true, records: [], total: 0, counts: { types: {} } }));
    return () => {
      live = false;
    };
  }, [qs]);
  return data;
}

function useRecord(id) {
  const [rec, setRec] = useState(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    setRec(null);
    fetch(`/history/record?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setRec(d))
      .catch(() => live && setRec(null));
    return () => {
      live = false;
    };
  }, [id]);
  return rec;
}

function Activity({ records, total, open, onOpen }) {
  const [shown, setShown] = useState(PAGE);
  const list = records.slice(0, shown);
  let last = null;
  return (
    <Card>
      <Flow gap={8}>
        <SectionHead title="Activity" words={`${list.length} of ${total} records`} />
        <Flow gap={4} as="ol" aria-label="Records, newest first">
          {list.map((r) => {
            const d = day(r.date);
            const head = d !== last ? d : null;
            last = d;
            return (
              <li key={r.id}>
                {head ? <Eyebrow>{head}</Eyebrow> : null}
                <Step
                  title={plain(r.title)}
                  time={time(r.date)}
                  tag={<Tag tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Tag>}
                  icon={ICON[r.type] ?? 'Clock'}
                  state="done"
                  selected={r.id === open}
                  onSelect={() => onOpen(r.id)}
                />
              </li>
            );
          })}
        </Flow>
        {records.length > shown ? (
          <Flow direction="row" justify="end">
            <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, records.length - shown)} more
            </Button>
          </Flow>
        ) : null}
      </Flow>
    </Card>
  );
}

function Record({ id }) {
  const rec = useRecord(id);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  useEffect(() => setAnswer(null), [id]);
  if (!rec) return <Card><EmptyState size="lane" title="Opening the record" line="Reading it from git. Two ticks." /></Card>;
  const files = Array.isArray(rec.files) ? rec.files : [];
  const comps = Array.isArray(rec.components) ? rec.components : [];
  const ask = () => {
    if (!q.trim()) return;
    setAnswer({ reply: 'Asking the agent…' });
    fetch('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `About ${rec.repo} ${rec.sha} ("${rec.title}"): ${q.trim()}`, page: 'history', auto: true }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setAnswer({ reply: d.reply ?? 'The agent found nothing close enough to answer from.' }))
      .catch(() => setAnswer({ reply: 'The agent did not answer. Try again in a moment.', error: true }));
  };
  return (
    <Card>
      <Flow gap={24}>
        <Flow gap={8}>
          <Flow direction="row" justify="between" wrap gap={8} align="center">
            <Tag tone={STATUS_TONE[rec.status] ?? 'neutral'}>{rec.status}</Tag>
            <Eyebrow>{[day(rec.date), time(rec.date), rec.who, rec.repo.toUpperCase() === 'CHIP' ? 'CHIP' : rec.repo === 'bella' ? 'BELLA' : rec.repo].join(' · ')}</Eyebrow>
          </Flow>
          <TextStack title={plain(rec.title)} />
        </Flow>
        {rec.why ? (
          <Notification
            tone="info"
            showIcon={false}
            title="Why"
            message={
              <Flow gap={4} as="span">
                {rec.why.split(/\n(?=-\s)|\n{2,}/).map((l) => l.replace(/^-\s*/, '').replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).map((l) => (
                  <span key={l}>{plain(l)}</span>
                ))}
              </Flow>
            }
          />
        ) : null}
        <Flow gap={8}>
          <SectionHead title="What changed" titleLevel={3} />
          <TextStack body={rec.stat ? `${count(files.length, 'file')}, ${count(lines(rec.stat), 'line')}.` : 'No before picture: this commit has no saved screenshot.'} />
        </Flow>
        <Flow gap={8}>
          <SectionHead title="What it touched" titleLevel={3} words={count(files.length, 'file')} />
          <Flow gap={12} as="ul" aria-label="Files this record touched">
            {files.map((f) => (
              <li key={f}>
                <Card>
                  <TextStack title={f.split('/').pop()} subtitle={`file · ${String(rec.status).toLowerCase()}`} />
                </Card>
              </li>
            ))}
          </Flow>
        </Flow>
        <Flow direction="row" wrap fill gap={12}>
          <Stat label="parts changed" value={comps.length} />
          <Stat label="files changed" value={files.length} />
          <Stat label="lines changed" value={lines(rec.stat)} />
        </Flow>
        <Flow gap={8}>
          <Input label="Ask about this change" value={q} onChange={setQ} onSend={ask} sendLabel="Ask" />
          {answer ? <Notification tone={answer.error ? 'danger' : 'info'} showIcon={false} title="The agent" message={answer.reply} /> : null}
        </Flow>
      </Flow>
    </Card>
  );
}

export default function HistoryContent() {
  const phone = useNarrow();
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState(null);
  const [status, setStatus] = useState([]);
  const [since, setSince] = useState('');
  const [breaking, setBreaking] = useState(false);
  const [filters, setFilters] = useState(false);
  const [open, setOpen] = useState(null);
  const params = useMemo(() => {
    const p = { limit: 400 };
    if (q) p.q = q;
    if (kind) p.type = kind;
    if (status.length) p.status = status.join(',');
    if (since) p.since = new Date(Date.now() - Number(since.replace('d', '')) * 864e5).toISOString().slice(0, 10);
    if (breaking) p.breaking = '1';
    return p;
  }, [q, kind, status, since, breaking]);
  const data = useHistory(params);
  const all = useHistory({ limit: 1 });
  const records = data?.records ?? [];
  useEffect(() => {
    if (records.length && !records.some((r) => r.id === open)) setOpen(records[0].id);
  }, [records, open]);
  const counts = all?.counts?.types ?? {};
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const extra = status.length + (since ? 1 : 0) + (breaking ? 1 : 0);

  return (
    <>
      <Flow gap={24}>
        {/* Figma's content set opens with its lede (664:123672) */}
        <TextStack body="What we agreed, when and why, across BELLA and CHIP." />
        {/* Search beside the field, lined up with its box (the label sits above); a phone stacks them */}
        <Flow direction={phone ? 'column' : 'row'} gap={8} grow={phone ? undefined : 'first'} as="form" role="search" onSubmit={(e) => (e.preventDefault(), setQ(draft.trim()))}>
          <Input label="Ask about a change, in plain words" leadingIcon="Search" value={draft} onChange={setDraft} />
          <Flow direction={phone ? 'row' : 'column'} justify="end">
            <Button variant="primary" type="submit">
              Search
            </Button>
          </Flow>
        </Flow>
        <Flow direction={phone ? 'column' : 'row'} gap={8} wrap={!phone} justify="between">
          <Flow direction="row" gap={8} wrap aria-label="Kinds">
            <FilterChip size="compact" pressed={!kind} onClick={() => setKind(null)}>
              All {all?.total ?? ''}
            </FilterChip>
            {KINDS.map((k) => (
              <FilterChip key={k} size="compact" pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
                {k} {counts[k] ?? 0}
              </FilterChip>
            ))}
          </Flow>
          <Flow direction="row" justify="end">
            <Button variant="secondary" icon="FilterList" onClick={() => setFilters(true)} ariaHaspopup="dialog">
              {extra ? `Filters · ${extra}` : 'Filters'}
            </Button>
          </Flow>
        </Flow>
      </Flow>

      {data?.error ? (
        <EmptyState size="page" title="History isn't answering" line="CHIP couldn't read git just now. Refresh and I'll try again." />
      ) : data && !records.length ? (
        <EmptyState
          size="page"
          title="No record matches"
          line="Nothing in BELLA or CHIP fits that. Loosen a filter and I'll look again."
          actions={
            <Button variant="secondary" onClick={() => (setDraft(''), setQ(''), setKind(null), setStatus([]), setSince(''), setBreaking(false))}>
              Clear everything
            </Button>
          }
        />
      ) : !data ? (
        <EmptyState size="page" title="Reading the record" line="Pulling BELLA's and CHIP's git logs. Won't be a minute." />
      ) : (
        <>
          <Flow span={4}>
            <Activity records={records} total={data.total} open={open} onOpen={setOpen} />
          </Flow>
          <Flow span={8}>
            <Record id={open} />
          </Flow>
        </>
      )}

      <Drawer
        open={filters}
        onClose={() => setFilters(false)}
        label="Filters"
        footer={
          <Flow direction="row" justify="end" gap={8}>
            <Button variant="secondary" onClick={() => (setStatus([]), setSince(''), setBreaking(false))}>
              Clear
            </Button>
            <Button variant="primary" onClick={() => setFilters(false)}>
              Show {data?.total ?? ''} records
            </Button>
          </Flow>
        }
      >
        <Flow gap={24}>
          <Flow gap={8}>
            <SectionHead title="Status" titleLevel={3} />
            <Flow direction="row" gap={8} wrap>
              {STATUSES.map((s) => (
                <FilterChip key={s} pressed={status.includes(s)} onClick={() => toggle(status, setStatus, s)}>
                  {s}
                </FilterChip>
              ))}
            </Flow>
          </Flow>
          <Flow gap={8}>
            <SectionHead title="When" titleLevel={3} />
            <Flow direction="row" gap={8} wrap>
              {SINCE.map(([v, label]) => (
                <FilterChip key={v} pressed={since === v} onClick={() => setSince(since === v ? '' : v)}>
                  {label}
                </FilterChip>
              ))}
            </Flow>
          </Flow>
          <Flow gap={8}>
            <SectionHead title="Breaking" titleLevel={3} />
            <Flow direction="row" gap={8} wrap>
              <FilterChip pressed={breaking} onClick={() => setBreaking(!breaking)}>
                Breaking changes only
              </FilterChip>
            </Flow>
          </Flow>
        </Flow>
      </Drawer>
    </>
  );
}
