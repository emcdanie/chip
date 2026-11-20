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
import Heading from '@bella/components/Heading/Heading';
import Notification from '@bella/components/Notification/Notification';
import Stat from '@bella/components/Stat/Stat';
import Input from '@bella/components/Input/Input';
import Button from '@bella/components/Button/Button';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Drawer from '@bella/components/Drawer/Drawer';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import useNarrow from '../templates/useNarrow.js';

/* A commit's why in plain words: git trailers (Co-Authored-By, Signed-off-by,
   the tool's "Generated with" line) are bookkeeping, not reasons, and never
   name a model on the page (19 Nov audit). */
const TRAILER = /^\s*([\w-]+-by:|.*Generated with \[|🤖)/i;
const plainWhy = (why) => (why ?? '').split('\n').filter((l) => !TRAILER.test(l)).join('\n').trim();

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
/* Who made a record, as Figma says it: the role, never a person or a handle
   (Many users, not one, 20 Nov); the agent stays the agent. */
const roleOf = (who) => (!who ? null : /claude|agent|bot/i.test(who) ? 'the agent' : /in CHIP/i.test(who) ? 'a maintainer, in CHIP' : 'a maintainer');
// Plain words on screen (her rule): no Figma node ids, file paths, app routes or model names.
const plain = (t) =>
  String(t ?? '')
    // a bracket that holds a Figma node id goes whole ("(612:60963, table 800:79888)"), never half (audit 9)
    .replace(/\s*\([^()]*\b\d{2,4}:\d{2,7}\b[^()]*\)/g, '')
    .replace(/\s*\b\d{2,4}:\d{2,7}\b/g, '')
    // a person's byline in brackets goes; a name left in the words reads as the role (Many users, not one)
    .replace(/\s*\(\s*Elleta\b[^()]*\)/g, '')
    .replace(/\bElleta['’]s\b/g, "the maintainer's")
    .replace(/\bElleta\b/g, 'the maintainer')
    .replace(/#\/[\w-]+-old\b/g, 'its old address')
    .replace(/#\/([\w-]+)/g, (_, r) => `the ${r.replace(/-/g, ' ')} page`)
    .replace(/(?:[\w.-]+\/)+[\w.-]+\.\w+|\b[\w-]+\.(?:jsx?|tsx?|css|html|json|mjs|md|ya?ml)\b/g, '')
    .replace(/\bClaude Code\b|\bClaude\b/g, 'the agent')
    // a commit reference in brackets ("(bella-parts f134741)") is bookkeeping, not words
    .replace(/\s*\([^()]*\b[0-9a-f]{7,40}\b[^()]*\)/g, '')
    .replace(/\bbella-parts\b/g, "BELLA's parts")
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\(\s*\)|,\s*(?=[,.;])/g, '')
    // a removed name or path leaves no comma at a bracket's edge ("(the stories,)" reads "(the stories)")
    .replace(/,\s*\)/g, ')')
    .replace(/\(\s*,\s*/g, '(')
    .replace(/\s{2,}/g, ' ')
    .trim();
/* A touched file in plain words: what it is, not its path ("Team page", "Button part"). */
const fileWords = (f) => {
  const parts = String(f).split('/');
  const base = parts.pop().replace(/\.(stories)?\.?(jsx?|tsx?|mjs|css|md|json|ya?ml|html)$/, '');
  const name = base.replace(/Content$/, '').replace(/\.stories$/, '');
  if (/\.stories\./.test(f)) return `${name} stories`;
  // a page's model is its data, not a page ("workModel page" read as a page, audit 9)
  if (parts.includes('pages') && /Model$/.test(name)) return `${name.replace(/Model$/, '')} data`;
  if (parts.includes('pages')) return `${name} page`;
  if (parts.includes('templates')) return `${name} template`;
  if (parts.includes('components')) return `${name} part`;
  if (parts[0] === 'server') return 'CHIP server';
  if (parts[0] === 'data') return 'CHIP data';
  if (parts[0] === 'scripts') return `${name} script`;
  if (/\.css$/.test(f)) return `${name} styles`;
  if (/\.md$/.test(f)) return `${name} notes`;
  return name;
};
const count = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const lines = (stat) => [...String(stat ?? '').matchAll(/(\d+) (?:insertion|deletion)/g)].reduce((n, m) => n + Number(m[1]), 0);

/* History's data, kept between visits (useCached): no loading flash when you come back. */
function useHistory(params) {
  const qs = new URLSearchParams(params).toString();
  const { data, error } = useCached([`/history?${qs}`]);
  if (error) return { error: true, records: [], total: 0, counts: { types: {} } };
  return data ? data[0] : null;
}

function useRecord(id) {
  const { data } = useCached(id ? [`/history/record?id=${encodeURIComponent(id)}`] : []);
  return id && data ? data[0] : null;
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
                {head ? <TextStack subtitle={head} /> : null}
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

/* Files in plain words, one row per thing: a page's two files are one page (they showed twice). */
const touched = (files) => [...files.reduce((m, f) => m.set(fileWords(f), (m.get(fileWords(f)) ?? 0) + 1), new Map())];

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
            <TextStack subtitle={[day(rec.date), time(rec.date), roleOf(rec.who), rec.repo.toUpperCase() === 'CHIP' ? 'CHIP' : rec.repo === 'bella' ? 'BELLA' : rec.repo].filter(Boolean).join(' · ')} />
          </Flow>
          {/* Figma: the record's title at the subsection size, the biggest thing in the record */}
          <Heading tier="subsection" as="h2">{plain(rec.title)}</Heading>
        </Flow>
        {plainWhy(rec.why) ? (
          <Notification
            tone="info"
            showIcon={false}
            title="Why"
            message={
              <Flow gap={4} as="span">
                {plainWhy(rec.why).split(/\n(?=-\s)|\n{2,}/).map((l) => l.replace(/^-\s*/, '').replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).map((l) => (
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
            {touched(files).map(([what, n]) => (
              <li key={what}>
                <Card>
                  <TextStack title={what} subtitle={`${n === 1 ? 'file' : `${n} files`} · ${String(rec.status).toLowerCase()}`} />
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
            {/* Figma (664:123671): Search, then Filters, both white, words only; the page's one blue action is New task */}
            <Flow direction="row" gap={8} justify="end">
              <Button variant="secondary" type="submit">
                Search
              </Button>
              <Button variant="secondary" onClick={() => setFilters(true)} ariaHaspopup="dialog">
                {extra ? `Filters · ${extra}` : 'Filters'}
              </Button>
            </Flow>
          </Flow>
        </Flow>
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
          <Flow span={5}>
            <Activity records={records} total={data.total} open={open} onOpen={setOpen} />
          </Flow>
          <Flow span={7}>
            <Record id={open} />
          </Flow>
        </>
      )}

      <Drawer
        side="right"
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
