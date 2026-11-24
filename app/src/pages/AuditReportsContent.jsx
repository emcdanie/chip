// Audit reports: the one full report of all audits (CHIP rule 23 Nov), built from the approved mock
// docs/reference/screens/2026-11-23-audit-reports/ part by part. Every number is read from the saved files by
// /audit-reports (server/lib/audit-reports.mjs) and each chart's grey line names the file. BELLA parts and the
// template's Flow only; no page CSS. Address: #/health/audits?audit=<id>&report=<audit id>[:<day>]|bench|ready.
//
// Which READ FIRST line each part meets (CLAUDE.md, 23 Nov): a drawer is a reading surface (title, one plain line,
// the picture, then the facts, the action at the right edge); nothing sends her out of CHIP (Report opens a
// drawer, a run opens its saved report in one); a report is explained (AuditReading: meaning, what to do first).
import { useEffect, useMemo, useState } from 'react';
import Card from '@bella/components/Card/Card';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Marker from '@bella/components/Marker/Marker';
import ScoreTile from '@bella/components/ScoreTile/ScoreTile';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import Button from '@bella/components/Button/Button';
import Link from '@bella/components/Link/Link';
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
import { planRun } from '../templates/RunPlan.jsx';
import AuditReading from './AuditReading.jsx';
import { markOf } from '../templates/marks.js';
import Loading from '../templates/Loading.jsx';
import { AUDIT_NAME, buildReport, counts, dayWords, sgn } from './auditReportsModel.js';

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

/* The four benchmark scores as BELLA ScoreTiles (her note, 24 Nov: the big numbers read off centre): two by two on the
   card's grid (one column on a phone), the label above, the number centred; the tint has one meaning: No file is the
   base (neutral), AGENTS.md is green ahead, yellow behind, grey under 3 points (the chart rule), with its word.
   A tile is a toggle: it highlights what it is about in the charts below (her idea, 24 Nov). */
// a No file tile lights the rings (the base), an AGENTS.md tile the dots and gaps, and in the checks the ones that cost points
const lightOf = (pick) => (!pick ? null : pick.endsWith('bare') ? 'base' : 'value');
/* Two measures from Romina Kavcic's article (her ask, 24 Nov), on the same tiles. Adherence: the benchmark jobs whose
   AGENTS.md run passes the benchmark's own gate, against the run before; one run says "first run" in grey. Cost: what
   CHIP's own runs cost (as Claude Code reports each run) over the runs whose gate passed; no runs, "Not measured". */
const adherence = (a) => {
  if (!a) return { value: 'Not measured', tone: 'neutral' };
  if (!a.prev) return { value: `${a.pass} of ${a.n}`, tone: 'neutral', word: 'first run' };
  const [tone] = STATE(Math.round((a.pass / a.n) * 100));
  return { value: `${a.pass} of ${a.n}`, tone, word: a.pass === a.prev.pass ? `same as ${dayWords(a.prev.day)}` : `was ${a.prev.pass} on ${dayWords(a.prev.day)}` };
};
const cost = (c) => {
  if (!c) return { value: 'Not measured', tone: 'neutral', word: 'not recorded yet' };
  if (c.per == null) return { value: 'Not measured', tone: 'neutral', word: 'none passed yet' };
  return { value: `$${c.per.toFixed(2)}`, tone: 'neutral', word: 'first measure' };
};
const costLine = (c) => (c?.per == null ? '' : ` Cost: $${c.total.toFixed(2)} over ${c.runs} CHIP runs since ${dayWords(c.since)}${c.costed < c.runs ? ` (${c.runs - c.costed} with no cost recorded)` : ''}; ${c.shipped} passed their gate.`);
function Pairs({ b, pick, onPick }) {
  const md = (bare, mdv) => {
    const gap = Math.round((mdv - bare) * 10) / 10;
    return gap >= 3 ? ['success', `ahead by ${gap}`] : gap <= -3 ? ['attention', `behind by ${Math.abs(gap)}`] : ['neutral', 'no real change'];
  };
  const [t10, w10] = md(b.all10.bare, b.all10.md);
  const [t8, w8] = md(b.eight.bare, b.eight.md);
  const tile = (key, label, value, tone, word) => (
    <ScoreTile key={key} label={label} value={value} tone={tone} word={word} selected={pick === key} onSelect={() => onPick(pick === key ? null : key)} />
  );
  return (
    <Flow gap={8}>
      <Flow gap={16} cards role="group" aria-label="Benchmark scores, out of 100. Pick one to highlight it in the charts below">
        {tile('all-bare', 'All 10 jobs · No file', b.all10.bare, 'neutral', 'the base')}
        {tile('all-md', 'All 10 jobs · AGENTS.md', b.all10.md, t10, w10)}
        {tile('eight-bare', `The ${b.eight.n} jobs BELLA can do · No file`, b.eight.bare, 'neutral', 'the base')}
        {tile('eight-md', `The ${b.eight.n} jobs BELLA can do · AGENTS.md`, b.eight.md, t8, w8)}
        <ScoreTile key="adherence" label="Agent adherence · jobs that pass with AGENTS.md" {...adherence(b.adherence)} />
        <ScoreTile key="cost" label="Cost per shippable output · a run that passed its gate" {...cost(b.cost)} />
      </Flow>
      <Source>{`Scores out of 100. The ${b.eight.n} jobs BELLA can do: computed from results.json.${costLine(b.cost)}`}</Source>
      <Source>
        Agent adherence and cost per shippable output: Romina Kavcic,{' '}
        <Link href="https://learn.thedesignsystem.guide/p/half-my-design-system-metrics-dont" external>
          “Half my design system metrics don't work anymore” (opens the site)
        </Link>
        , learn.thedesignsystem.guide, 24 Oct 2026.
      </Source>
    </Flow>
  );
}

function BenchmarkCard({ b, onReport, pick, onPick }) {
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
  // the one sentence that says what the four scores mean (her verdict, 24 Nov: look at the data and understand it)
  const g10 = Math.round((b.all10.md - b.all10.bare) * 10) / 10;
  const g8 = Math.round((b.eight.md - b.eight.bare) * 10) / 10;
  const say = (g) => (g <= -3 ? `${Math.abs(g)} lower` : g >= 3 ? `${g} higher` : 'level');
  const meaning = (
    <>
      With AGENTS.md BELLA scores <Marker>{say(g10)}</Marker> on all {b.jobs.length} jobs{b.stopped ? `, because ${b.stopped} jobs stop to ask` : ''}; on the {b.eight.n} jobs BELLA can do it is <Marker>{say(g8)}</Marker>.
    </>
  );
  // the charts sit behind Details, closed (her rule, 24 Nov: never first); picking a score tile opens them to show its part
  const [details, setDetails] = useState(false);
  useEffect(() => {
    if (pick) setDetails(true);
  }, [pick]);
  return (
    <Card>
      <Flow gap={24}>
        <SectionHead
          title="Benchmark: AGENTS.md against no file"
          showInfo={false}
          description="The same ten jobs, run once with the file in the folder and once without."
          action={<Button variant="secondary" size="sm" onClick={onReport}>Report</Button>}
        />
        <Pairs b={b} pick={pick} onPick={onPick} />
        <TextStack body={meaning} />
        <Disclosure title="Details: run by run, each job, which checks cost the points" open={details} onToggle={setDetails}>
          <Flow gap={24}>
            <Note>{NOTE}</Note>
            <Flow gap={8} id="bench-run-by-run">
              <TextStack title="Run by run" titleAs="h3" />
              <Note>{runsSum}</Note>
              <GapChart label="AGENTS.md against no file, by run" rows={runRows} baseLabel="No file" valueLabel="AGENTS.md" highlight={lightOf(pick)} />
            </Flow>
            <JobsDetail b={b} pick={pick} />
            <Source>{`Source: Open Design System Benchmark runs of ${dirs}, results.json of each. One run per job, so a hint, not proof. Last run ${dayWords(b.day)}.`}</Source>
          </Flow>
        </Disclosure>
      </Flow>
    </Card>
  );
}

function JobsDetail({ b, pick }) {
  const behind = b.jobs.filter((j) => j.gap <= -3).length;
  const level = b.jobs.filter((j) => Math.abs(j.gap) < 3).length;
  const ahead = b.jobs.filter((j) => j.gap >= 3).length;
  const gap = Math.round((b.all10.md - b.all10.bare) * 10) / 10;
  const rows = b.jobs.map((j) => ({ id: j.id, name: j.name, base: j.bare, value: j.md, gap: j.gap, word: j.word, tone: j.tone, why: j.why ?? undefined }));
  const sh = b.checks.map((c) => ({ id: c.id, name: c.name, detail: `${c.bare} to ${c.md}, ${Math.round(c.weight * 100)}% of the score`, share: c.share, tone: Math.abs(c.md - c.bare) < 3 ? 'neutral' : c.md < c.bare ? 'danger' : 'success' }));
  return (
    <>
      <Flow gap={8}>
        <TextStack title={`The ${b.jobs.length} jobs, one by one`} titleAs="h3" />
        <Note>{`Sorted from most behind to most ahead: ${behind} behind by 3 or more, ${level} level, ${ahead} ahead. The agent's own words are behind each Why button.`}</Note>
        <GapChart label="Each job, no file against AGENTS.md" rows={rows} baseLabel="No file" valueLabel="AGENTS.md" highlight={lightOf(pick)} />
      </Flow>
      <Flow gap={8}>
        <TextStack title="Which checks cost the points" titleAs="h3" />
        <Note>{`Each bar is a check's weighted share of the ${sgn(gap)} gap. Worst first; zero in the middle; grey under 3 points.`}</Note>
        <ShareBars label="Each check's share of the gap" rows={sh} highlight={lightOf(pick) === 'value' ? sh.filter((x) => x.share < 0).map((x) => x.id) : null} />
        <Source>{`Source: results.json of the ${dayWords(b.day)} run and each job's transcript.jsonl. "Quality of the result" is the model-graded check.`}</Source>
      </Flow>
    </>
  );
}

/* One audit, read at a glance (her rule, 24 Nov): its name as the card's title, the score big in a ScoreTile with its
   state word, one plain sentence on what moved, and Do next with its plan at the card foot's right edge. Any chart is
   behind Details, closed. State is the status dot and word only; no side bar. */
const STATE = (pct) => (pct == null ? ['neutral', 'Not measured'] : pct >= 85 ? ['success', 'Healthy'] : pct >= 50 ? ['attention', 'Needs work'] : ['danger', 'Failing']);
const pctOf = (value, unit) => {
  if (value == null || Number.isNaN(Number(value))) return null;
  const of = /of (\d+) checks/.exec(unit ?? '');
  return of ? (Number(value) / Number(of[1])) * 100 : Number(value);
};
// the tile's label in plain words, from the report's own unit
const labelOf = (unit) => {
  const checks = /of (\d+) checks/.exec(unit ?? '');
  if (checks) return `Checks healthy, of ${checks[1]}`;
  const avg = /average of (\d+) screens/.exec(unit ?? '');
  if (avg) return `Average of ${avg[1]} screens, out of 100`;
  return 'Score out of 100';
};
const movedOf = (c) =>
  !c ? 'Not measured yet.' : c.kind === 'first' ? `First run, ${dayWords(c.day)}; nothing to compare yet.` : c.kind === 'none' ? `No real change since ${dayWords(c.from)} (${sgn(c.delta)}).` : `${c.delta > 0 ? 'Up' : 'Down'} ${Math.abs(c.delta)} since ${dayWords(c.from)}.`;
function AuditCard({ title, value, unit, change, next, onReport, onPlan, details }) {
  const [tone, word] = STATE(pctOf(value, unit));
  return (
    <Card footerAction={next ? <Button variant="secondary" size="sm" onClick={onPlan}>See the plan</Button> : undefined}>
      <Flow gap={16}>
        <SectionHead title={title} showInfo={false} action={<Button variant="tertiary" size="sm" onClick={onReport}>Report</Button>} />
        {/* what moved and what to do on the left, the score at the right edge as in the approved mock */}
        <Flow direction="row" gap={24} wrap grow="first" align="center">
          <Flow gap={8}>
            <TextStack body={movedOf(change)} />
            <TextStack body={next ? <><Marker>Do next</Marker>: {next}.</> : 'No work order in the saved report.'} />
          </Flow>
          <Flow aside>
            <ScoreTile label={labelOf(unit)} value={value ?? 'Not measured'} tone={tone} word={word} />
          </Flow>
        </Flow>
        {details ? <Disclosure title="Details">{details}</Disclosure> : null}
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

function RunsCard({ d, onOpen, kinds, only }) {
  const rows = useMemo(() => {
    const out = [];
    for (const a of d.audits) for (const r of a.runs ?? []) out.push({ key: `${a.id}:${r.day}`, day: r.day, audit: AUDIT_NAME[a.id] ?? a.title, score: `${r.value} ${r.unit ?? ''}`.trim(), kind: kinds[`audit-${a.id}`], sort: r.day });
    for (const r of d.bench.runs.filter((x) => !/eight$/.test(x.id))) out.push({ key: `bench:${r.day}`, day: r.day, audit: r.bare == null ? 'Benchmark: AGENTS.md' : `Benchmark: no file ${r.bare} / AGENTS.md`, score: `${r.md} out of 100`, kind: kinds['bench-md'], sort: r.day });
    d.readiness.composite.p.forEach(([day, v]) => out.push({ key: `ready:${day}`, day, audit: 'Readiness score (with the agent run)', score: `${v} out of 100`, kind: kinds['ready-composite'], sort: day }));
    return out.sort((x, y) => y.sort.localeCompare(x.sort));
  }, [d, kinds]);
  const shown = rows.filter((r) => !only || r.key.split(':')[0] === only);
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
  const row = (title, value) => <ListRow key={title} layout="stacked" title={title} value={value} />;
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
            <ListRow key={k} layout="stacked" title={k} value={v == null ? 'Not measured' : v} tag={v == null ? undefined : <StatusDot tone={v >= 70 ? 'success' : 'attention'} label={v >= 70 ? 'Healthy' : 'Needs work'} />} />
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
  const [open, setOpen] = useState(() => q().get('report'));
  const [how, setHow] = useState(false);
  const [auditAsked, setAudit] = useState(() => q().get('audit'));
  useEffect(() => {
    const p = q();
    open ? p.set('report', open) : p.delete('report');
    auditAsked ? p.set('audit', auditAsked) : p.delete('audit');
    const s = p.toString();
    window.history.replaceState(null, '', `#/health/audits${s ? `?${s}` : ''}`);
  }, [open, auditAsked]);
  const rep = useMemo(() => (d?.ok ? buildReport(d) : null), [d]);
  // a picked score tile (her idea, 24 Nov): a second click or Esc clears it; the chart it lights scrolls into view when it
  // is out of view, at once under reduced motion
  const [pick, setPick] = useState(null);
  useEffect(() => {
    if (!pick) return undefined;
    const chart = document.getElementById('bench-run-by-run');
    const r = chart?.getBoundingClientRect();
    if (r && (r.top < 0 || r.bottom > window.innerHeight)) chart.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const esc = (e) => e.key === 'Escape' && setPick(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [pick]);

  if (error && !d) return <EmptyState size="lane" {...markOf('🔌')} title="CHIP's server isn't answering" line={error} />;
  if (!d) return <Loading title="Reading the audits" sources={[{ url: '/audit-reports', label: "each audit's saved report and the benchmark runs" }]} />;
  if (!d.ok) return <EmptyState size="lane" {...markOf('📄')} title="Not measured" line={d.why} />;

  const { changes, line } = rep;
  const kinds = Object.fromEntries(changes.map((c) => [c.id, c.kind]));
  const audits = [{ id: 'bench', label: 'Benchmark' }, { id: 'ready', label: 'Readiness' }, ...d.audits.filter((a) => a.ran).map((a) => ({ id: a.id, label: a.id === 'figma' ? 'Figma screens' : a.title }))];
  // an audit the address names that has no report reads as All
  const audit = audits.some((x) => x.id === auditAsked) ? auditAsked : null;
  const b = d.bench;

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

  // the headline (her rule, 24 Nov: one line in plain words, then the chips): how many audits are healthy, need work or
  // fail, and the one to start with (the lowest score)
  const scored = d.audits.filter((a) => a.ran).map((a) => ({ a, pct: pctOf(a.value, a.unit) }));
  const tally = { Healthy: 0, 'Needs work': 0, Failing: 0 };
  for (const x of scored) if (x.pct != null) tally[STATE(x.pct)[1]] += 1;
  const low = scored.filter((x) => x.pct != null).sort((p, q) => p.pct - q.pct)[0]?.a;
  const words = [tally.Healthy && `${tally.Healthy} healthy`, tally['Needs work'] && `${tally['Needs work']} need work`, tally.Failing && `${tally.Failing} failing`].filter(Boolean).join(', ');
  const rd = d.readiness;
  const cmp = rd.composite.p;
  const changeOf = (id) => changes.find((c) => c.id === id);
  const show = (id) => !audit || audit === id;
  const onReport = (id) => (id === 'bench' ? setOpen('bench') : id === 'ready' ? setOpen('ready') : setOpen(id));

  return (
    <Flow span={12} gap={24}>
      <Flow gap={12}>
        <Flow direction="row" gap={8} wrap align="center">
          <TextStack body={<><Marker>{`BELLA's audits: ${words || 'none measured'}`}</Marker>{low ? `; start with ${AUDIT_NAME[low.id] ?? low.title}.` : '.'}</>} />
          <Button variant="tertiary" size="sm" onClick={() => setHow(true)}>How was this measured?</Button>
        </Flow>
        {/* one chip row with counts, one at a time (the 23 Nov search-and-filter pattern); what is on shows only when on */}
        <Flow direction="row" gap={8} swipe role="group" aria-label="Show one audit">
          <FilterChip pressed={!audit} onClick={() => setAudit(null)}>{`All ${audits.length}`}</FilterChip>
          {audits.map((x) => (
            <FilterChip key={x.id} pressed={audit === x.id} onClick={() => setAudit(audit === x.id ? null : x.id)}>{x.label}</FilterChip>
          ))}
        </Flow>
        {audit ? <ResultsBar applied={[{ key: 'a', label: audits.find((x) => x.id === audit)?.label ?? audit, onRemove: () => setAudit(null) }]} shown={1} total={audits.length} onClearAll={() => setAudit(null)} /> : null}
      </Flow>

      {show('bench') ? <BenchmarkCard b={b} onReport={() => setOpen('bench')} pick={pick} onPick={setPick} /> : null}

      <Flow gap={24}>
        {show('ready') && cmp.length ? (
          <AuditCard
            title="Readiness score (with the agent run)"
            value={cmp[cmp.length - 1][1]}
            unit="out of 100"
            change={changeOf('ready-composite')}
            next={rd.failures[0]?.replace(/^[^:]+: /, '').replace(/\.$/, '')}
            onReport={() => onReport('ready')}
            onPlan={() => plan({ id: 'ready', title: 'Readiness score', orders: rd.failures })}
            details={
              <Flow gap={24}>
                <Mini title="Readiness score (with the agent run)" p={rd.composite.p} line={line} target={rd.target} summary={rd.note ? `${dayWords(rd.note.at)}: ${rd.note.text}` : undefined} />
                <Mini title="Readiness score (files only)" p={rd.static.p} line={line} />
              </Flow>
            }
          />
        ) : null}
        {d.audits
          .filter((a) => a.ran && show(a.id))
          .map((a) => {
            const same = (a.runs ?? []).filter((r) => r.unit === a.unit);
            return (
              <AuditCard
                key={a.id}
                title={AUDIT_NAME[a.id] ?? a.title}
                value={a.value}
                unit={a.unit}
                change={changeOf(`audit-${a.id}`)}
                next={a.orders[0]?.replace(/\.$/, '')}
                onReport={() => onReport(a.id)}
                onPlan={() => plan(a)}
                details={
                  <Flow gap={8}>
                    {a.unit === 'of 100' && same.length > 1 ? <Mini title={AUDIT_NAME[a.id] ?? a.title} p={same.map((r) => [r.day, r.value])} line={line} /> : null}
                    <Source>{`Source: ${a.file ? `the saved ${a.title} report of ${dayWords(a.ran)}` : 'no saved report'}`}</Source>
                  </Flow>
                }
              />
            );
          })}
      </Flow>

      <RunsCard d={d} kinds={kinds} only={audit} onOpen={(k) => (k.startsWith('bench') ? setOpen('bench') : k.startsWith('ready') ? setOpen('ready') : openRun(k))} />

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
