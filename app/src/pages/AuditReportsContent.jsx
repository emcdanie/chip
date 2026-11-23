// Audit reports: the one full report of all audits (CHIP rule 23 Nov), built from the approved mock
// docs/reference/screens/2026-11-23-audit-reports/ part by part. Every number is read from the saved files by
// /audit-reports (server/lib/audit-reports.mjs) and each chart's grey line names the file. BELLA parts and the
// template's Flow only; no page CSS. Address: #/health/audits?filter=real|none|first&report=<audit id>[:<day>]|bench|ready.
//
// Which READ FIRST line each part meets (CLAUDE.md, 23 Nov): a drawer is a reading surface (title, one plain line,
// the picture, then the facts, the action at the right edge); nothing sends her out of CHIP (Report opens a
// drawer, a run opens its saved report in one); a report is explained (AuditReading: meaning, what to do first).
import { useEffect, useMemo, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Marker from '@bella/components/Marker/Marker';
import Stat from '@bella/components/Stat/Stat';
import Tag from '@bella/components/Tag/Tag';
import Button from '@bella/components/Button/Button';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import DataTable from '@bella/components/DataTable/DataTable';
import LineChart from '@bella/components/LineChart/LineChart';
import GapChart from '@bella/components/GapChart/GapChart';
import ShareBars from '@bella/components/ShareBars/ShareBars';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import ReadingDrawer, { Inset } from '../templates/ReadingDrawer.jsx';
import ResultsBar from '../templates/ResultsBar.jsx';
import NoResults from '../templates/NoResults.jsx';
import { planRun } from '../templates/RunPlan.jsx';
import AuditReading from './AuditReading.jsx';
import { AUDIT_NAME, FILTERS, buildReport, changeTone, changeWord, counts, dayWords, sgn } from './auditReportsModel.js';

const TAG = { success: 'success', danger: 'danger', warning: 'attention', neutral: 'default', info: 'info' };
const q = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');
const NOTE = 'When BELLA has no part for a job, AGENTS.md tells the agent to stop and ask. The Open Design System Benchmark scores that as zero. This is intended (decided 12 Nov).';
// proposals only, nothing started (benchmark-answers-2026-11-23.md, section 7)
const PROPOSALS = [
  'Rule 3: add a "build from existing parts, mark the gap" fallback. Conflicts with the 12 Nov decision, so it is your call.',
  'Show one Section heading example in the part list, so the paged log compiles.',
  'One line on destructive confirmations: a drawer plus a secondary button named for the action.',
];

function Source({ children }) {
  return <TextStack meta={children} />;
}

/* A short written answer under a title, as the mock's note and summary lines. */
const Note = ({ children }) => <TextStack body={children} />;

function Pairs({ b }) {
  const pair = (what, unit, bare, md) => (
    <Flow gap={8}>
      <TextStack title={what} meta={unit} />
      <Flow direction="row" gap={24} wrap>
        <Stat label="No file" value={bare} />
        <Stat label="AGENTS.md" value={md} />
      </Flow>
    </Flow>
  );
  return (
    <Flow gap={24} cards>
      {pair('All 10 jobs', 'Score out of 100', b.all10.bare, b.all10.md)}
      {pair(`The ${b.eight.n} jobs BELLA can do`, 'Score out of 100, computed from results.json', b.eight.bare, b.eight.md)}
    </Flow>
  );
}

function BenchmarkCard({ b, onReport }) {
  const gapRows = (arr) =>
    arr.map((r) => ({
      id: r.id,
      name: r.name,
      base: r.base,
      value: r.value,
      gap: r.gap,
      word: r.word,
      tone: r.tone,
      why: r.why ?? undefined,
    }));
  const runRows = gapRows(
    b.runs.map((r) => {
      const gap = r.bare == null ? null : Math.round((r.md - r.bare) * 10) / 10;
      const [word, tone] = gap == null ? ['no-file was not run', 'neutral'] : gap <= -3 ? ['no file ahead', 'danger'] : gap >= 3 ? ['my note ahead', 'success'] : ['no real change', 'neutral'];
      return { id: r.id, name: `${dayWords(r.day)}, ${r.how}`, base: r.bare, value: r.md, gap, word, tone };
    }),
  );
  const dirs = b.runs.filter((r) => !/eight$/.test(r.id)).map((r) => dayWords(r.day)).join(', ');
  const runsSum = (() => {
    const behindRuns = b.runs.filter((r) => r.bare != null && r.md - r.bare <= -3).map((r) => dayWords(r.day));
    const lone = b.runs.filter((r) => r.bare == null).map((r) => dayWords(r.day));
    return `AGENTS.md was behind no file on ${[...new Set(behindRuns)].join(' and ')}${b.runs.some((r) => r.bare != null && r.md - r.bare >= 3) ? ', ahead on some' : ''}${lone.length ? `. The ${lone.join(', ')} run had no no-file run, so it has one dot.` : '.'}`;
  })();
  return (
    <Card>
      <Flow gap={24}>
        <SectionHead
          icon="Activity"
          iconTone="info"
          title="Benchmark: AGENTS.md against no file"
          showInfo={false}
          description="The same ten jobs, run once with the file in the folder and once without."
          action={<Button variant="secondary" size="sm" onClick={onReport}>Report</Button>}
        />
        <Note>{NOTE}</Note>
        <Pairs b={b} />
        <Flow gap={8}>
          <TextStack title="Run by run" titleAs="h3" />
          <Note>{runsSum}</Note>
          <GapChart label="AGENTS.md against no file, by run" rows={runRows} baseLabel="No file" valueLabel="AGENTS.md" />
        </Flow>
        <Source>{`Source: Open Design System Benchmark runs of ${dirs}, results.json of each. One run per job, so a hint, not proof. Last run ${dayWords(b.day)}.`}</Source>
      </Flow>
    </Card>
  );
}

function JobsCard({ b }) {
  const behind = b.jobs.filter((j) => j.gap <= -3).length;
  const level = b.jobs.filter((j) => Math.abs(j.gap) < 3).length;
  const ahead = b.jobs.filter((j) => j.gap >= 3).length;
  const gap = Math.round((b.all10.md - b.all10.bare) * 10) / 10;
  const rows = b.jobs.map((j) => ({ id: j.id, name: j.name, base: j.bare, value: j.md, gap: j.gap, word: j.word, tone: j.tone, why: j.why ?? undefined }));
  const sh = b.checks.map((c) => ({ id: c.id, name: c.name, detail: `${c.bare} to ${c.md}, ${Math.round(c.weight * 100)}% of the score`, share: c.share, tone: Math.abs(c.md - c.bare) < 3 ? 'neutral' : c.md < c.bare ? 'danger' : 'success' }));
  return (
    <Card>
      <Flow gap={24}>
        <SectionHead icon="CheckCircle" iconTone="info" title={`The ${b.jobs.length} jobs, one by one`} showInfo={false} description={`Sorted from most behind to most ahead. ${behind} jobs are behind by 3 or more, ${level} are level, ${ahead} are ahead. The agent's own words are behind each Why button.`} />
        <GapChart label="Each job, no file against AGENTS.md" rows={rows} baseLabel="No file" valueLabel="AGENTS.md" />
        <Flow gap={12}>
          <TextStack title="Which checks cost the points" titleAs="h3" />
          <Note>{`Each bar is a check's weighted share of the ${sgn(gap)} gap between ${b.all10.bare} and ${b.all10.md}. Worst first; zero in the middle. Bar length is the weighted share; colour follows the raw score change, grey under 3 points.`}</Note>
          <Flow direction="row" gap={24} wrap>
            <Stat label="No file" value={b.all10.bare} />
            <Stat label="AGENTS.md" value={b.all10.md} />
            <Stat label="The gap" value={sgn(gap)} />
          </Flow>
          <ShareBars label="Each check's share of the gap" rows={sh} />
        </Flow>
        <Source>{`Source: results.json of the ${dayWords(b.day)} run (scores, compiler errors) and each job's transcript.jsonl (the agent's words). "Quality of the result" is the model-graded check.`}</Source>
      </Flow>
    </Card>
  );
}

function ChangedCard({ rows, rd }) {
  const c = rd.composite.p;
  const fell = c.length > 2 ? Math.round((c[c.length - 2][1] - c[c.length - 1][1]) * 10) / 10 : null;
  const prev = c[c.length - 2];
  const last = c[c.length - 1];
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead icon="Activity" iconTone="info" title="What changed since the last run" showInfo={false} description="Different scores, so no shared chart. Moves under 3 points are grey: no real change." />
        {rows.length ? (
          <ListRowGroup ariaLabel="What changed since the last run">
            {rows.map((r) => (
              <ListRow
                key={r.id}
                layout="stacked"
                statusBar={r.kind === 'first' ? 'info' : r.kind === 'none' ? 'neutral' : r.delta < 0 ? 'danger' : 'success'}
                title={r.name}
                meta={r.kind === 'first' ? `${dayWords(r.day)}` : `${dayWords(r.from)} to ${dayWords(r.to)}`}
                value={r.kind === 'first' ? (r.value ?? '') : `${r.delta > 0 ? '+' : r.delta < 0 ? '−' : ''}${Math.abs(r.delta)}`}
                tag={<Tag tone={TAG[changeTone(r)]}>{changeWord(r)}</Tag>}
              />
            ))}
          </ListRowGroup>
        ) : null}
        {fell != null && prev && last ? (
          <Note>{`Readiness score (with the agent run) ${fell > 0 ? 'fell' : 'rose'} ${Math.abs(fell)} from ${dayWords(prev[0])} (${prev[1]}) to ${dayWords(last[0])} (${last[1]}), but the two are not like for like${rd.note ? `: on ${dayWords(rd.note.at)} the run was ${rd.note.text}` : ''} (SUMMARY.md). How much of the drop each part caused: Not measured.`}</Note>
        ) : null}
      </Flow>
    </Card>
  );
}

function Mini({ title, p, line, target, summary }) {
  if (p.length < 2) return null;
  const { points, xRange } = line(p);
  return (
    <Flow gap={8}>
      <TextStack title={title} titleAs="h4" />
      <LineChart label={title} points={points} xRange={xRange} variant="full" tone="neutral" area={false} callout unit="" target={target ?? undefined} targetLabel={target ? `Target ${target}` : undefined} summary={summary} />
    </Flow>
  );
}

function AuditsCard({ d, rows, line, onReport, onPlan, filter }) {
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  const show = (ids) => !filter || ids.some((i) => by[i]?.kind === filter);
  const b = d.bench;
  const benchWord = by['bench-md'];
  const sources = (a) => `Source: ${a.file ? `the saved ${a.title} report of ${dayWords(a.ran)}` : 'no saved report'}`;
  const rd = d.readiness;
  const tagOf = (c) => <Tag tone={TAG[changeTone(c)]}>{c.kind === 'real' ? `${changeWord(c)}, ${c.delta > 0 ? '+' : '−'}${Math.abs(c.delta)}` : changeWord(c)}</Tag>;
  const bar = (c) => (c.kind === 'first' ? 'info' : c.kind === 'none' ? 'neutral' : c.delta < 0 ? 'danger' : 'success');
  const actions = (a, plan = true) => (
    <Flow direction="row" gap={8} wrap justify="end">
      <Button variant="secondary" onClick={() => onReport(a)}>Report</Button>
      {plan ? <Button variant="tertiary" onClick={() => onPlan(a)}>See the plan</Button> : null}
    </Flow>
  );
  const items = [];
  const wrap = (key, row, acts) => (
    <Flow as="li" key={key} gap={8}>
      {row}
      {acts}
    </Flow>
  );
  if (show(['bench-md', 'bench-bare'])) {
    const gap = Math.round((b.all10.md - b.all10.bare) * 10) / 10;
    items.push(wrap("bench",
      <ListRow
          as="div"
        layout="stacked"
        statusBar={bar(benchWord)}
        title="Benchmark (AGENTS.md against no file)"
        value={b.all10.md}
        meta="out of 100"
        valueLabel={dayWords(b.day)}
        tag={tagOf(benchWord)}
        description={<><strong>Top finding:</strong> {b.stopped} of {b.jobs.length} jobs wrote nothing because BELLA has no part for them.</>}
        body={
          <Flow gap={8}>
            <Flow as="ol" gap={4} bullets>
              {PROPOSALS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </Flow>
            <Source>Proposals only, nothing started. Source: the benchmark answers note of 23 Nov, section 7.</Source>
          </Flow>
        }
      />,
actions({ id: 'bench', title: 'Benchmark', proposals: PROPOSALS, gap })));
  }
  if (show(['ready-composite', 'ready-static'])) {
    const cmp = rd.composite.p;
    const top = rd.failures[0]?.replace(/^[^:]+: /, '') ?? null;
    items.push(wrap("ready",
      <ListRow
          as="div"
        layout="stacked"
        statusBar={bar(by['ready-composite'])}
        title="Readiness score (with the agent run)"
        value={cmp[cmp.length - 1]?.[1]}
        meta="out of 100"
        valueLabel={dayWords(cmp[cmp.length - 1][0])}
        tag={tagOf(by['ready-composite'])}
        description={top ? <><strong>Top finding:</strong> {top.replace(/\.$/, '')}{rd.parts?.['Enablement surface'] != null ? ` (surface check scores ${rd.parts['Enablement surface']}).` : '.'}</> : undefined}
        body={
          <Flow gap={24} cards>
            <Mini title="Readiness score (with the agent run)" p={rd.composite.p} line={line} target={rd.target} summary={rd.note ? `${dayWords(rd.note.at)}: ${rd.note.text}` : undefined} />
            <Mini title="Readiness score (files only)" p={rd.static.p} line={line} />
          </Flow>
        }
      />,
actions({ id: 'ready', title: 'Readiness score', orders: rd.failures })));
  }
  for (const a of d.audits.filter((x) => x.ran)) {
    const c = by[`audit-${a.id}`];
    if (!show([`audit-${a.id}`])) continue;
    const same = (a.runs ?? []).filter((r) => r.unit === a.unit);
    items.push(wrap(a.id,
      <ListRow
          as="div"
        layout="stacked"
        statusBar={bar(c)}
        title={AUDIT_NAME[a.id] ?? a.title}
        value={a.value}
        meta={a.unit}
        valueLabel={dayWords(a.ran)}
        tag={tagOf(c)}
        description={a.orders[0] ? <><strong>Top finding:</strong> {a.orders[0]}.</> : 'No work order in the saved report.'}
        body={
          <Flow gap={8}>
            {a.unit === 'of 100' && same.length > 1 ? (
              <Flow gap={16} cards>
                <Mini title={AUDIT_NAME[a.id] ?? a.title} p={same.map((r) => [r.day, r.value])} line={line} />
              </Flow>
            ) : null}
            <Source>{sources(a)}</Source>
          </Flow>
        }
      />,
actions(a)));
  }
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead icon="ShieldCheck" iconTone="info" title="Every audit and what to do next" showInfo={false} description="One line each: its score, what moved, the top finding and the plan to read first." />
        {items.length ? <Flow as="ul" gap={24} aria-label="Every audit and what to do next">{items}</Flow> : null}
      </Flow>
    </Card>
  );
}

function RunsCard({ d, filter, onOpen, kinds }) {
  const rows = useMemo(() => {
    const out = [];
    for (const a of d.audits) for (const r of a.runs ?? []) out.push({ key: `${a.id}:${r.day}`, day: r.day, audit: AUDIT_NAME[a.id] ?? a.title, score: `${r.value} ${r.unit ?? ''}`.trim(), kind: kinds[`audit-${a.id}`], sort: r.day });
    for (const r of d.bench.runs.filter((x) => !/eight$/.test(x.id))) out.push({ key: `bench:${r.day}`, day: r.day, audit: r.bare == null ? 'Benchmark: AGENTS.md' : `Benchmark: no file ${r.bare} / AGENTS.md`, score: `${r.md} out of 100`, kind: kinds['bench-md'], sort: r.day });
    d.readiness.composite.p.forEach(([day, v]) => out.push({ key: `ready:${day}`, day, audit: 'Readiness score (with the agent run)', score: `${v} out of 100`, kind: kinds['ready-composite'], sort: day }));
    return out.sort((x, y) => y.sort.localeCompare(x.sort));
  }, [d, kinds]);
  const shown = filter ? rows.filter((r) => r.kind === filter) : rows;
  const [more, setMore] = useState(10);
  const list = shown.slice(0, more);
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead icon="Page" iconTone="info" title="Every run, newest first" showInfo={false} description="A row opens that run's full report in a drawer here, not a new tab." />
        <DataTable
          caption="Every saved run, newest first"
          rowKey="key"
          density="default"
          stack
          columns={[
            { key: 'when', label: 'Date', render: (r) => dayWords(r.day), sortValue: (r) => r.day },
            { key: 'audit', label: 'Audit' },
            { key: 'score', label: 'Score', numeric: true },
          ]}
          rows={list.map((r) => ({ ...r, when: r.day }))}
          onOpen={onOpen}
        />
        {shown.length > list.length ? (
          <Flow direction="row" gap={8} align="center" wrap>
            <Button variant="secondary" onClick={() => setMore(more + 10)}>{`Show ${Math.min(10, shown.length - list.length)} more`}</Button>
            <TextStack subtitle={`Showing ${list.length} of ${shown.length}`} />
          </Flow>
        ) : null}
      </Flow>
    </Card>
  );
}

function BenchDrawer({ open, onClose, d }) {
  const h = d.bench.how;
  const gap = Math.round((d.bench.all10.md - d.bench.all10.bare) * 10) / 10;
  const row = (title, value) => <ListRow key={title} layout="stacked" statusBar="neutral" title={title} value={value} />;
  return (
    <ReadingDrawer open={open} onClose={onClose} label="Benchmark run" status={`Ran ${dayWords(h.day)} · ${h.jobs} jobs`}>
      <Inset gap={16}>
        <TextStack body={<>The newest run gave AGENTS.md <Marker>{`${d.bench.all10.md} against ${d.bench.all10.bare}`}</Marker> for no file, a gap of {sgn(gap)}. One run per job, so a hint, not proof.</>} />
        <Source>{`Source: manifest.json and results.json of the ${dayWords(h.day)} run`}</Source>
      </Inset>
      <ListRowGroup ariaLabel="How the newest run was made">
        {[
          row('Jobs', h.jobs),
          row('Contexts', h.contexts.join(' and ')),
          row('Runs per job', h.reps),
          row('Profile', h.profile ?? 'Not recorded'),
          row('Agent', h.agent ?? 'Not recorded'),
          row('BELLA commit', h.bella ?? 'Not recorded'),
          row('Cost', h.cost != null ? `$${h.cost.toFixed(2)}` : 'Not recorded'),
          row('Time', h.seconds != null ? `${Math.floor(h.seconds / 60)} min ${h.seconds % 60} s` : 'Not recorded'),
        ]}
      </ListRowGroup>
    </ReadingDrawer>
  );
}

function ReadyDrawer({ open, onClose, d }) {
  const rd = d.readiness;
  const last = rd.composite.p[rd.composite.p.length - 1];
  return (
    <ReadingDrawer open={open} onClose={onClose} label="Readiness score" status={last ? `${last[1]} out of 100 · ${dayWords(last[0])}` : undefined}>
      <Inset gap={16}>
        <TextStack body={<>How ready BELLA is for an AI agent to use. <Marker>{`The score is the seven file checks plus how the agent run went`}</Marker>; the files-only score leaves the agent run out.</>} />
        <Source>{`Source: ${rd.composite.src.join(', ')}`}</Source>
      </Inset>
      {rd.parts ? (
        <ListRowGroup ariaLabel="The checks behind the readiness score">
          {Object.entries(rd.parts).map(([k, v]) => (
            <ListRow key={k} layout="stacked" statusBar={v == null ? 'neutral' : v >= 70 ? 'success' : 'attention'} title={k} value={v == null ? 'Not measured' : v} />
          ))}
        </ListRowGroup>
      ) : null}
      {rd.failures.length ? (
        <Inset gap={8}>
          <TextStack title="What the checks found" />
          <Flow as="ul" gap={8} bullets>
            {rd.failures.slice(0, 6).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </Flow>
        </Inset>
      ) : null}
    </ReadingDrawer>
  );
}

export default function AuditReportsContent() {
  const { data, error } = useCached(['/audit-reports'], { live: true });
  const d = data?.[0] ?? null;
  const [filter, setFilter] = useState(() => (FILTERS.some((f) => f.id === q().get('filter')) ? q().get('filter') : null));
  const [open, setOpen] = useState(() => q().get('report'));
  const [how, setHow] = useState(false);
  useEffect(() => {
    const p = q();
    filter ? p.set('filter', filter) : p.delete('filter');
    open ? p.set('report', open) : p.delete('report');
    const s = p.toString();
    window.history.replaceState(null, '', `#/health/audits${s ? `?${s}` : ''}`);
  }, [filter, open]);
  const rep = useMemo(() => (d?.ok ? buildReport(d) : null), [d]);

  if (error && !d) return <EmptyState size="lane" mark="🔌" title="CHIP's server isn't answering" line={error} />;
  if (!d) return <EmptyState size="lane" mark="⏳" title="Reading the audits" line="Looking for each audit's saved report and the benchmark runs." />;
  if (!d.ok) return <EmptyState size="lane" mark="📄" title="Not measured" line={d.why} />;

  const { changes, line } = rep;
  const n = counts(changes);
  const kinds = Object.fromEntries(changes.map((c) => [c.id, c.kind]));
  const shownChanges = filter ? changes.filter((c) => c.kind === filter) : changes;
  const b = d.bench;
  const stopsStory = b.all10.md < b.all10.bare && b.stopped > 0;

  const plan = (a) => {
    const orders = a.proposals ?? a.orders ?? [];
    return planRun({
      title: `Start with: ${orders[0] ?? a.title}`,
      from: 'Health · Audit reports',
      subtitle: 'Plan ready · read only until you approve',
      summary: `${a.title}: ${orders.length ? `${orders.length} work order${orders.length === 1 ? '' : 's'} from the saved report.` : 'no work order in the saved report.'} Nothing runs until you approve.`,
      brief: [`Work through ${a.title}'s top work orders from its saved report, one commit each:`, ...orders.slice(0, 3).map((o) => `- ${o}`), 'Follow BELLA AGENTS.md; ask before changing a public API.'].join('\n'),
      steps: orders.slice(0, 3).map((o, i) => ({ id: `${a.id}-${i}`, title: o, line: i === 0 ? 'Do this first' : 'Then' })),
    }).catch(() => {});
  };
  const report = (a) => setOpen(a.id);
  const openRun = (key) => setOpen(key);
  const [openId, openDay] = (open ?? '').split(':');
  const auditOf = openId ? d.audits.find((x) => x.id === openId) : null;
  const runOf = auditOf && openDay ? (auditOf.runs ?? []).find((r) => r.day === openDay) : null;

  return (
    <Flow span={12} gap={24}>
      <Flow gap={12}>
        <TextStack
          body={
            stopsStory ? (
              <>
                <Marker>{`AGENTS.md scores ${b.all10.md} against ${b.all10.bare} for no file, because ${b.stopped} of ${b.jobs.length} jobs wrote nothing`}</Marker>: BELLA has no part for them and the file says to stop and ask. On the {b.eight.n} jobs BELLA can do, AGENTS.md is ahead, {b.eight.md} to {b.eight.bare}.
              </>
            ) : (
              <>
                <Marker>{`AGENTS.md scores ${b.all10.md} against ${b.all10.bare} for no file`}</Marker> on all {b.jobs.length} jobs; on the {b.eight.n} jobs BELLA can do, {b.eight.md} to {b.eight.bare}.
              </>
            )
          }
        />
        <Flow direction="row" gap={8} wrap align="center">
          <TextStack subtitle={`Read from the saved reports and benchmark runs at ${new Date(d.read).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`} />
          <Button variant="tertiary" size="sm" onClick={() => setHow(true)}>How was this measured?</Button>
        </Flow>
        <Flow direction="row" gap={8} wrap role="group" aria-label="Filter">
          <FilterChip pressed={!filter} onClick={() => setFilter(null)}>{`All ${n.all}`}</FilterChip>
          {FILTERS.map((f) => (
            <FilterChip key={f.id} pressed={filter === f.id} onClick={() => setFilter(filter === f.id ? null : f.id)}>{`${f.label} ${n[f.id]}`}</FilterChip>
          ))}
        </Flow>
        <ResultsBar
          applied={filter ? [{ key: 'f', label: FILTERS.find((f) => f.id === filter).label, onRemove: () => setFilter(null) }] : []}
          shown={shownChanges.length}
          total={n.all}
          onClearAll={() => setFilter(null)}
        />
      </Flow>

      {filter && !shownChanges.length ? (
        <NoResults noun="audits" on={[{ key: 'f', label: FILTERS.find((f) => f.id === filter).label, would: n.all, onRemove: () => setFilter(null) }]} onClearAll={() => setFilter(null)} />
      ) : null}

      {!filter ? <BenchmarkCard b={b} onReport={() => setOpen('bench')} /> : null}
      {!filter ? <JobsCard b={b} /> : null}
      {shownChanges.length ? <ChangedCard rows={shownChanges} rd={d.readiness} /> : null}
      {shownChanges.length ? <AuditsCard d={d} rows={changes} line={line} onReport={(a) => (a.id === 'bench' ? setOpen('bench') : a.id === 'ready' ? setOpen('ready') : report(a))} onPlan={plan} filter={filter} /> : null}
      {shownChanges.length ? <RunsCard d={d} filter={filter} kinds={kinds} onOpen={(k) => (k.startsWith('bench') ? setOpen('bench') : k.startsWith('ready') ? setOpen('ready') : openRun(k))} /> : null}

      <BenchDrawer open={open === 'bench'} onClose={() => setOpen(null)} d={d} />
      <ReadyDrawer open={open === 'ready'} onClose={() => setOpen(null)} d={d} />
      {auditOf ? (
        <ReadingDrawer open onClose={() => setOpen(null)} label={`${auditOf.title} audit`} status={`Ran ${dayWords(runOf?.day ?? auditOf.ran)}`}>
          <AuditReading a={runOf ? { ...auditOf, ...runOf, at: runOf.day } : auditOf} day={dayWords(runOf?.day ?? auditOf.ran)} />
        </ReadingDrawer>
      ) : null}
      <ReadingDrawer open={how} onClose={() => setHow(false)} label="How was this measured?" subtitle="Every figure on this page">
        <Inset gap={16}>
          <Flow gap={4}>
            <TextStack title="Where it comes from" />
            <TextStack body={`The benchmark's results.json for each run (${b.runDirs.join(', ')}), its SUMMARY.md and data/checks/bench-static.json for the readiness score, and each audit's saved report in docs/reference/audit.`} />
          </Flow>
          <Flow gap={4}>
            <TextStack title="How the numbers are made" />
            <TextStack body="A job's score is the benchmark's own overall for it. A context's score is the mean of its jobs. A check's share is its weight times the change between the two contexts. A move under 3 points is called no real change." />
          </Flow>
          <Flow gap={4}>
            <TextStack title="When it was read" />
            <TextStack body="When this page opened, and again every minute while it is open. Nothing here re-runs an audit." />
          </Flow>
        </Inset>
      </ReadingDrawer>
    </Flow>
  );
}
