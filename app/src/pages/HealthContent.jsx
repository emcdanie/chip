// Health · content: the code twin of the Figma slot fill (CHIP Dashboard
// 601:111049). States as a prop, as in Figma: the gate run (none, running,
// passed, failed); "all clear" follows from the data (nothing left to fix).
// BELLA parts and the template's Flow only; no page CSS.
//
// Stand-ins and gaps (parts-dev):
// - Fix actions run an agent: Figma's model menu needs a button-with-menu
//   part; plain buttons until then.
// - Needs you cards: Figma draws a brain icon well; no brain icon in BELLA.
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import StatCard from '@bella/components/StatCard/StatCard';
import Progress from '@bella/components/Progress/Progress';
import SystemHealth from '@bella/components/SystemHealth/SystemHealth';
import CheckRow from '@bella/components/CheckRow/CheckRow';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import LineChart from '@bella/components/LineChart/LineChart';
import TextStack from '@bella/components/TextStack/TextStack';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import { planRun } from '../templates/RunPlan.jsx';
import AuditReading from './AuditReading.jsx';
import ReadingDrawer, { Inset, ReadingGroups } from '../templates/ReadingDrawer.jsx';
import Marker from '@bella/components/Marker/Marker';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import { useEffect, useRef, useState } from 'react';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import useNarrow from '../templates/useNarrow.js';
import { TARGET, handOff } from './healthModel.js';
import { explainRun, gateAnswer, gateSlots } from './gateSlots.js';
import BarChart from '@bella/components/BarChart/BarChart';
import Toast from '@bella/components/Toast/Toast';
import Toasts from '../templates/Toasts.jsx';

export const GATE_RUNS = ['none', 'running', 'passed', 'failed'];

/* The gate banner, Figma's words per state. `run` carries the live numbers. */
function GateBanner({ run }) {
  if (!run || run.state === 'none') return null;
  if (run.state === 'running')
    return <Notification tone="info" title="The gate" message={`Running: ${run.done} of ${run.of} checks done, now ${run.now}. You can keep working.`} />;
  if (run.state === 'passed') return <Notification tone="success" title="The gate" message={`Passed: ${run.of} of ${run.of} checks, just now.`} />;
  return <Notification tone="danger" title="The gate" message={`Failed on ${run.failed}: ${run.why}`} />;
}

/* A card CHIP has no data for: no number before a measure, the empty bar, and the footer saying why
   with its action (StatCard chart="empty", 22 Nov 19:08). */
/* Gate runs: every recorded run in a slot of the range picked (the chart holds its range, we hand it that range's slots).
   Under the title, the question the card answers and its answer from the recorded runs (Elleta, 23 Nov: "explain to me
   why it helps"); nothing else under the chart: a red bar (click or Enter) opens the drawer with its failures in plain
   words ("remove all this under the chart its too much": a long list under a chart lives in a drawer). */
const PER = { day: 'half hour', week: 'day', month: 'day', year: 'month' };
const WHEN = { day: 'today', week: 'this week', month: 'this month', year: 'this year' };
const gDay = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const clockOf = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const firstLine = (t) => String(t ?? '').split(/(?<=[.!?])\s/)[0].trim();
function GateBars({ runs, readAt }) {
  const [range, setRange] = useState('day');
  const [open, setOpen] = useState(null);
  const slots = gateSlots(runs, range);
  const a = gateAnswer(runs);
  const trend = a?.trend == null ? null : `${a.trend > 0 ? '↑' : a.trend < 0 ? '↓' : '→'} ${Math.abs(a.trend)} points against the 30 days before`;
  return (
    <Flow gap={16}>
      {a ? (
        <Flow gap={4}>
          <TextStack title="Can you trust a green gate?" />
          <TextStack
            body={
              <>
                <Marker>{`${a.passed} of ${a.total}`}</Marker> {`CI runs passed since ${gDay(a.since)}.`}
                {a.last ? ` The last failure was ${gDay(a.last.at)}: ${firstLine(a.last.title) || a.last.cause}.` : ' None has failed.'}
                {trend ? ` ${trend}.` : ''}
              </>
            }
          />
          {a.most ? <TextStack subtitle={`Failing most often: ${a.most.name} (${a.most.n})`} /> : null}
        </Flow>
      ) : null}
      <BarChart
        title="Gate runs"
        showViewToggle={false}
        range={range}
        onRangeChange={setRange}
        slots={slots}
        label="Passed"
        unit="Runs"
        axisUnit={`Runs per ${PER[range]}`}
        calloutText={(slot) => `${slot.passed + slot.failed} runs · ${slot.failed} failed · ${slot.passed} passed`}
        onSlotSelect={(slot) => slot.failedRuns?.length && setOpen(slot.failedRuns)}
        context="GitHub CI and CHIP's own runs · only what was recorded"
        summary={(() => {
          const n = slots.reduce((t, x) => t + x.passed + x.failed, 0);
          const f = slots.reduce((t, x) => t + x.failed, 0);
          return `${f} of ${n} runs failed ${WHEN[range]}. Each bar is the runs in that ${PER[range]}; a red cross means at least one failed. Press a bar with a cross to see what failed.`;
        })()}
      />
      <TextStack subtitle={`GitHub CI and CHIP's own runs${readAt ? ` · read ${clockOf(new Date(readAt))}` : ''}`} />
      <ReadingDrawer
        open={Boolean(open?.length)}
        onClose={() => setOpen(null)}
        label={open?.length > 1 ? `${open.length} failed runs` : 'A failed run'}
        subtitle={open?.length ? `${gDay(open[0].at)} ${clockOf(open[0].at)}${open.length > 1 ? ` · ${open.length} runs` : ` · ${open[0].source === 'ci' ? 'GitHub CI' : 'CHIP'}`}` : undefined}
        footer={
          <Button variant="primary" onClick={() => (setOpen(null), (window.location.hash = '#/system/history'))}>
            Open the commit in History
          </Button>
        }
      >
        {(open ?? []).map((run, k) => {
          const why = explainRun(run, runs);
          return (
            <Inset key={`${+run.at}-${k}`} gap={16}>
              <TextStack title={`${clockOf(run.at)} · What failed`} />
              <TextStack body={`${why.what[0].toUpperCase()}${why.what.slice(1)}.`} />
              {why.why ? (
                <Flow gap={4}>
                  <TextStack title="Why it matters" />
                  <TextStack body={`${why.why[0].toUpperCase()}${why.why.slice(1)}.`} />
                </Flow>
              ) : null}
              <Flow gap={4}>
                <TextStack title="What caused it" />
                <TextStack body={why.cause ?? 'Cause not recorded'} />
              </Flow>
              <Flow gap={4}>
                <TextStack title="What fixed it" />
                <TextStack body={why.fixed ? `Fixed ${why.fixed}.` : 'No later run has passed yet.'} />
              </Flow>
              {run.sha ? <TextStack subtitle={`Commit ${run.sha}`} /> : null}
            </Inset>
          );
        })}
      </ReadingDrawer>
    </Flow>
  );
}

function NoData({ title, icon, context, caption, button }) {
  return <StatCard title={title} icon={icon} tone="neutral" chart="empty" context={context} caption={caption} button={button} />;
}

/* Drift from BELLA, in one place (her note, 22 Nov: "we have drift in two places"; her whole presentation):
   every code part, what differs between Figma, its spec and its code, read from BELLA's own files (/drift), so
   it needs no Figma key. Figma: the spec's own Figma-vs-code mismatches (a token name with the same value in
   Chip is not counted). Spec: props the spec is behind on. A part with no spec is named too. The card counts;
   ↗ opens every part, the most differences first, each opening its part. */
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const driftLine = (p) =>
  p.noSpec
    ? 'No spec yet'
    : [p.differ ? plural(p.differ, 'Figma difference') : p.compared ? 'Matches Figma' : 'Not read from Figma', p.specBehind.length ? `spec behind on ${plural(p.specBehind.length, 'prop')}` : null].filter(Boolean).join(' · ');
/* The plan for one part's drift: the code is the truth for its spec (rebuild it); a Figma difference is fixed in
   code where the code is behind Figma, and listed for the parts session where Figma is behind the code. */
function driftPlan(p) {
  const steps = [];
  if (p.noSpec) steps.push({ id: 'spec', title: `Write ${p.name}'s spec from its code (node scripts/spec-build.mjs ${p.name})` });
  else if (p.specBehind.length) steps.push({ id: 'spec', title: `Rebuild ${p.name}'s spec: it is behind on ${plural(p.specBehind.length, 'prop')}` });
  if (p.differ) steps.push({ id: 'figma', title: `Bring ${p.name}'s code in line with Figma on ${plural(p.differ, 'difference')}; list any that Figma should change for the parts session` });
  const brief = [
    `Close ${p.name}'s drift in BELLA. For each:`,
    ...(p.noSpec ? [`- ${p.name} has no spec: run node scripts/spec-build.mjs ${p.name} and keep the generated file.`] : []),
    ...(p.specBehind.length ? [`- The spec is behind the code: ${p.specBehind.join('; ')}. Rebuild it with node scripts/spec-build.mjs ${p.name}.`] : []),
    ...(p.differ ? [`- Figma and code differ on: ${p.fields.join('; ')}. Change the code where Figma is the decided look (Figma first); where the code is right, list the field under "For the parts session" in your summary and leave it.`] : []),
    'Follow BELLA AGENTS.md; no new tokens; ask before changing a public API.',
  ].join('\n');
  return { title: `Fix ${p.name}'s drift`, from: 'Health · Drift', brief, steps };
}

/* The recorded checks that changed the count (the first, each change, the last), labelled short: the day where the day
   starts, the time after it, so a 640 drawer and a phone both keep their axis readable. */
function driftPoints(hist) {
  const keep = hist.filter((x, i) => i === 0 || i === hist.length - 1 || x.differing !== hist[i - 1].differing);
  let lastDay = null;
  return keep.map((x) => {
    const t = new Date(x.at);
    const day = t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const label = day === lastDay ? t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : day;
    lastDay = day;
    return { label, value: x.differing };
  });
}

function DriftCard({ components }) {
  const { data } = useCached(['/drift'], { live: true });
  const [open, setOpen] = useState(false);
  // a Fix asks for its plan once this drawer has closed, so the plan opens on top, never under it
  const pending = useRef(null);
  const closed = () => {
    setOpen(false);
    const p = pending.current;
    pending.current = null;
    if (p) planRun(driftPlan(p)).catch(() => {});
  };
  const d = data?.[0] ?? null;
  const hist = d?.history ?? [];
  const prev = hist.length > 1 ? hist.at(-2) : null;
  const kinds = d?.total ? [{ label: 'Differ from Figma', n: d.drifting }, { label: 'Spec behind the code', n: d.specBehind }, { label: 'No spec', n: d.noSpec }].sort((a, b) => b.n - a.n) : [];
  if (!d?.total) return <NoData title="Drift from BELLA" icon="Activity" context="Parts that differ from Figma, spec or code" caption={d ? 'No parts found' : 'Reading the specs'} />;
  const idOf = (name) => components.find((c) => c.name === name)?.id ?? name.replace(/(?<=[a-z])(?=[A-Z])/g, '-').toLowerCase();
  const day = d.at ? new Date(d.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
  return (
    <>
      <StatCard
        title="Drift from BELLA"
        icon="Activity"
        tone={d.differing ? 'warning' : 'success'}
        chart="none"
        value={d.differing}
        unit={`of ${d.total}`}
        context="Parts that differ from Figma, their spec or their code"
        caption={
          <>
            {day ? `Specs from ${day} · ` : ''}
            <Marker>{`${d.total - d.compared} not read from Figma`}</Marker>
          </>
        }
        onOpen={() => setOpen(true)}
      />
      <ReadingDrawer open={open} onClose={closed} label="Drift from BELLA" status={`${d.differing} of ${d.total} parts differ · most first`}>
        <>
          {/* since the last check: the trend arrow and the mini chart from the snapshots CHIP keeps (/drift history);
              with one snapshot there is no change to show yet */}
          <Inset gap={24}>
          {/* the headline as BELLA's LineChart (full: scrubber and callout), from the snapshots CHIP keeps (/drift history) */}
          {hist.length > 1 ? (
            <LineChart
              label="Parts that differ"
              tone="warning"
              unit="parts"
              baseline="auto"
              baselineReason="Shows the change in parts that differ, not the count from zero"
              scrubber
              callout
              draw="pick"
              summary="Parts that differ over the last checks"
              points={driftPoints(hist)}
            />
          ) : (
            <TextStack title={`${d.differing} of ${d.total} parts differ`} body="First check kept: the chart shows once BELLA moves." />
          )}
          {/* three kinds of drift, sorted, words in Lexend (pin 2) */}
          <Flow gap={12} as="ul" aria-label="The three kinds of drift, most first">
            {kinds.map((k) => (
              <li key={k.label}>
                <Progress label={k.label} value={`${k.n} of ${d.total}`} fill={(k.n / d.total) * 100} tone="attention" showTarget={false} />
              </li>
            ))}
          </Flow>
          </Inset>
        {(() => {
          const open = (p) => () => ((window.location.hash = `#/system/components/${encodeURIComponent(idOf(p.name))}`), setOpen(false));
          // Fix opens the same plan-first sheet as every fix; nothing runs until it is approved
          const fix = (p) => (
            <Button variant="tertiary" size="sm" onClick={() => ((pending.current = p), setOpen(false))}>
              Fix
            </Button>
          );
          const item = (p, state, line) => ({ key: p.name, title: p.name, state, line, onClick: open(p), action: fix(p) });
          return (
            <ReadingGroups
              single
              openFirst
              label="Parts by kind of drift"
              groups={[
                { name: 'Figma differs', tone: 'attention', items: d.parts.filter((p) => !p.noSpec && p.differ).map((p) => item(p, 'Differs', plural(p.differ, 'Figma difference'))) },
                { name: 'Spec behind the code', tone: 'info', items: d.parts.filter((p) => !p.noSpec && p.specBehind.length).map((p) => item(p, 'Behind', `Spec behind on ${plural(p.specBehind.length, 'prop')}`)) },
                { name: 'No spec', tone: 'neutral', items: d.parts.filter((p) => p.noSpec).map((p) => item(p, 'No spec', 'No spec yet')) },
                { name: 'Matches', tone: 'success', items: d.parts.filter((p) => !p.noSpec && !p.differ && !p.specBehind.length).map((p) => ({ key: p.name, title: p.name, state: 'Matches', line: p.compared ? 'Matches Figma' : 'Not read from Figma', onClick: open(p) })) },
              ]}
            />
          );
        })()}
        </>
      </ReadingDrawer>
    </>
  );
}

/* Gaps: what BELLA can't do yet (her presentation, 22 Nov), measured from BELLA itself (/bella-gaps): parts drawn
   and specified that have no code yet, and the parts AGENTS.md lists as not in BELLA. ↗ opens both lists; the
   specified ones can be built: Plan the build opens the plan, and nothing runs until it is approved. */
function GapsCard() {
  const { data } = useCached(['/bella-gaps'], { live: true });
  const [open, setOpen] = useState(false);
  // the plan opens once this drawer has closed, so it sits on top
  const planNext = useRef(false);
  const g = data?.[0] ?? null;
  if (!g) return <NoData title="Gaps" icon="WarningCircle" context="What BELLA can't do yet" caption="Reading BELLA" />;
  const total = g.notInCode.length + g.notInBella.length;
  const brief = ['Build these BELLA parts in code from their specs (specs/components/<Name>.spec.yaml), one at a time, each with a story:', ...g.notInCode.map((n) => `- ${n}`), 'Follow BELLA AGENTS.md; no new tokens; ask before changing a public API.'].join('\n');
  const plan = () => ((planNext.current = true), setOpen(false));
  const closed = () => {
    setOpen(false);
    if (!planNext.current) return;
    planNext.current = false;
    planRun({ title: `Build ${plural(g.notInCode.length, 'part')} from their specs`, from: 'Health · Gaps', brief, steps: g.notInCode.map((n) => ({ id: n, title: `Build ${n} from its spec` })) }).catch(() => {});
  };
  return (
    <>
      <StatCard
        title="Gaps"
        icon="WarningCircle"
        tone={total ? 'warning' : 'success'}
        chart="none"
        value={total}
        unit={total === 1 ? 'part' : 'parts'}
        context={<><Marker>{`${g.notInCode.length} specified, not in code`}</Marker>{` · ${g.notInBella.length} not in BELLA yet`}</>}
        caption="What BELLA can't do yet"
        onOpen={() => setOpen(true)}
      />
      <ReadingDrawer
        open={open}
        onClose={closed}
        label="Gaps"
        status={`${plural(total, 'part')} BELLA can't give yet`}
        footer={g.notInCode.length ? <Button variant="primary" onClick={plan}>Plan the build</Button> : undefined}
      >
        <Inset>
          <TextStack body={`${plural(total, 'part')} now. No earlier checks are recorded for Gaps yet, so there is no chart: it starts with the next reading.`} />
        </Inset>
        <ReadingGroups
          single
          openFirst
          label="Gaps by kind"
          groups={[
            { name: 'Specified, not in code', tone: 'info', items: g.notInCode.map((n) => ({ key: n, title: n, state: 'Specified', line: 'Has a spec from Figma, no code part yet' })) },
            { name: 'Not in BELLA yet', tone: 'neutral', items: g.notInBella.map((n) => ({ key: n, title: n, state: 'Listed', line: "In BELLA's AGENTS.md: ask before building" })) },
          ]}
        />
      </ReadingDrawer>
    </>
  );
}

function GateCard({ gate, run, onOpen }) {
  if (!gate) return <NoData title="Checks" icon="ShieldCheck" context="Gate checks that pass" caption="No gate runs yet" />;
  if (run?.state === 'running')
    return <StatCard title="Checks" icon="ShieldCheck" tone="info" value={run.done} unit={`of ${run.of} so far`} chart="segments" meter={{ segments: run.of, done: run.done }} context={`Running ${run.now}`} caption="Started just now" />;
  const failed = run?.state === 'failed';
  const ok = failed ? run.of - 1 : run?.state === 'passed' ? run.of : gate.ok;
  const of = run && run.state !== 'none' ? run.of : gate.of;
  return (
    // "Gate" means one thing per word (audit 4, item 2): this card counts the gate's checks,
    // the Gate runs view counts commits, the board's lane counts tasks at the gate
    <StatCard
      title="Checks"
      icon="ShieldCheck"
      tone={ok === of ? 'success' : 'warning'}
      value={ok}
      unit={`of ${of}`}
      chart="segments"
      meter={{ segments: of, done: ok }}
      context={
        run && run.state !== 'none'
          ? 'Last run just now'
          : gate.behind?.length
            ? `${gate.behind.map((b) => b.name).join(', ')} last ran ${gate.behind[0].when} on ${gate.behind[0].commit}; the rest on ${gate.on}`
            : gate.when
              ? `Gate checks, last run ${gate.when}${gate.on ? ` on ${gate.on}` : ''}`
              : 'Gate checks'
      }
      // of what: the checks that didn't pass, by name (one source with System map and Connectors)
      caption={failed ? run.why : gate.failing.length ? <><Marker>{`Failing: ${gate.failing.join('; ')}`}</Marker></> : gate.notRun.length ? `Not run yet: ${gate.notRun.join('; ')}` : `All ${of} pass`}
      href={onOpen ? undefined : '#/system/history'}
      onOpen={onOpen}
    />
  );
}

/* Figma's views of the Component checks card: coverage per check, the gate per day, drift from Figma. */
const CHECK_VIEWS = [
  { value: 'coverage', label: 'Coverage' },
  { value: 'gate', label: 'Gate runs' },
];

/* Needs you (Figma Flow 2, screen 1, the card at the foot): the three checks with the most parts to fix,
   each with who takes it, its fix and ↗ to the first part that needs it; "See all N fixes" opens
   Components on Needs work. Counts are the Component checks' own (one source). */
function NeedsYouCard({ rows, fixCount, verb, send, sending }) {
  const top = rows.filter((r) => r.missing.length).sort((a, b) => b.missing.length - a.missing.length).slice(0, 3);
  if (!top.length) return null;
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead
          icon="WarningCircle"
          iconTone="warning"
          title="Needs you"
          showInfo={false}
          description="Fixes that need a reviewer"
          action={
            <Button variant="tertiary" size="sm" icon="ArrowUpRight" href="#/system/components?filter=needs">
              {`See all ${fixCount} ${fixCount === 1 ? 'fix' : 'fixes'}`}
            </Button>
          }
        />
        <Flow as="ul" gap={0} aria-label="Fixes that need a reviewer">
          {top.map((r, i) => (
            <ListRow
              key={r.id}
              layout="stacked"
              statusBar="attention"
              divider={i < top.length - 1}
              title={`${r.missing.length} ${r.some}`}
              description={r.line.split(': ').slice(1).join(': ')}
              textButton={
                r.action ? (
                  <Button variant="tertiary" size="sm" busy={sending === r.id} onClick={sending ? undefined : () => send(r)}>
                    {verb(r)}
                  </Button>
                ) : undefined
              }
              trailing="ArrowUpRight"
              href={r.href}
            />
          ))}
        </Flow>
      </Flow>
    </Card>
  );
}

/* Audits, all in one place (CHIP rule 22 Nov): one card per audit, read from the report it saved in
   docs/reference/audit/<date>/ (/audits). An audit with no saved report says Not run. The card: score and trend,
   the day it ran, failing and needs work; ↗ opens the report read in the drawer, explained (AuditReading.jsx). Run all opens a plan first. */
const dayOf = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const AUDIT_ICON = { product: 'ViewGrid', figma: 'Palette', ds: 'ShieldCheck', tokens: 'Key', a11y: 'Eye', agents: 'Brain' };
function AuditCard({ a }) {
  const [open, setOpen] = useState(false);
  if (!a.ran) return <NoData title={a.title} icon={AUDIT_ICON[a.id] ?? 'Activity'} context={`${a.skill}`} caption="Not run: no saved report yet" />;
  const lights = a.red == null ? 'Failing and needs-work not counted' : `${a.red} failing · ${a.yellow} need work`;
  const was = a.prev ? ` · was ${a.prev.value} on ${dayOf(a.prev.day)}` : '';
  return (
    <>
      <StatCard
        title={a.title}
        icon={AUDIT_ICON[a.id] ?? 'Activity'}
        tone={a.red ? 'danger' : a.yellow ? 'warning' : 'success'}
        chart="none"
        value={a.value ?? '–'}
        unit={a.unit ?? ''}
        context={lights}
        caption={`Ran ${dayOf(a.ran)}${was}`}
        onOpen={() => setOpen(true)}
      />
      <ReadingDrawer open={open} onClose={() => setOpen(false)} label={`${a.title} audit`} status={`Ran ${dayOf(a.ran)} · ${lights}`}>
        <AuditReading a={a} day={dayOf(a.ran)} />
      </ReadingDrawer>
    </>
  );
}

function AuditsSection() {
  const { data } = useCached(['/audits'], { live: true });
  const audits = data?.[0] ?? null;
  if (!audits) return <EmptyState size="lane" mark="⏳" title="Reading the audits" line="Looking for each audit's saved report." />;
  const runAll = () =>
    planRun({
      title: `Run all ${audits.length} audits`,
      from: 'Health · Audits',
      subtitle: 'Plan ready · read only',
      summary: 'Read only: nothing changes except each audit saving its report. Cost in plan usage: not measured, each is a long read, so check your plan limit first. Nothing runs until you approve.',
      brief: ['Run each audit read only and save its report to docs/reference/audit/<today>/ :', ...audits.map((a) => `- ${a.title}: ${a.skill}`), 'Change no repo, Figma or config file other than the reports.'].join('\n'),
      steps: audits.map((a) => ({ id: a.id, title: `${a.title}: ${a.skill}, read only`, line: a.ran ? `Last ran ${dayOf(a.ran)}` : 'Not run yet' })),
    }).catch(() => {});
  // two cards under each other in three columns, as the cards above (the page's 12-column grid)
  const cols = [0, 1, 2].map((c) => audits.slice(c * 2, c * 2 + 2));
  return (
    <>
      <Flow span={12} gap={24}>
        <SectionHead
          icon="ShieldCheck"
          iconTone="info"
          title="Audits"
          showInfo={false}
          description="The latest saved report of each audit"
          action={<Button variant="secondary" size="sm" onClick={runAll}>Run all audits</Button>}
        />
      </Flow>
      {cols.map((col, i) => (
        <Flow key={i} span={4} gap={24} fill>
          {col.map((a) => (
            <AuditCard key={a.id} a={a} />
          ))}
        </Flow>
      ))}
    </>
  );
}

export default function HealthContent({ model, run, checked, stale, onCheck, loading, view: startView = 'coverage' }) {
  const narrow = useNarrow();
  const [view, setView] = useState(startView);
  // handing a check's gaps to the agent: the button says Sending…, then a toast
  const [sending, setSending] = useState(null);
  const [notice, setNotice] = useState(null);
  const send = async (row) => {
    setSending(row.id);
    try {
      // opens the plan; the plan's Approve sends it and says so (templates/RunPlan.jsx)
      await handOff(row);
    } catch (e) {
      if (!e.shown) setNotice({ tone: 'danger', text: `Not sent: ${e.message}.` });
    } finally {
      setSending(null);
    }
  };
  const verb = (row) => (sending === row.id ? 'Sending…' : row.action);
  // Check again ends with a toast that says what it found (feedback on the control plus a toast)
  const wasLoading = useRef(false);
  useEffect(() => {
    if (wasLoading.current && !loading && model?.health) setNotice({ tone: 'success', text: `Checked ${checked ?? ''}: ${model.health.pct}% healthy, ${model.health.needsWork} ${model.health.needsWork === 1 ? 'part needs' : 'parts need'} work.` });
    wasLoading.current = !!loading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  if (!model) return <EmptyState size="lane" mark="⏳" title="Reading BELLA" line="Counting every part and its checks." />;
  const { health, contrast, rows, n } = model;
  return (
    <>
      {/* Control bar, as on Work: the last check and Check again, one group on the left. */}
      <Flow direction="row" gap={8} align="center">
        {stale ? <TextStack subtitle={stale} /> : checked ? <TextStack subtitle={`Updated ${checked}`} /> : null}
        {/* busy while the check runs: the icon turns and clicks wait (Button busy, parts-dev 99a021d) */}
        <Button variant="tertiary" size="sm" icon="RefreshDouble" leadingIcon busy={!!loading} onClick={onCheck}>
          {loading ? 'Checking…' : 'Check again'}
        </Button>
      </Flow>
      <GateBanner run={run} />
      {notice ? (
        <Toasts>
          <Toast tone={notice.tone} onClose={() => setNotice(null)}>
            {notice.text}
          </Toast>
        </Toasts>
      ) : null}
      {/* System health is two rows tall beside four of the figures and Lowest contrast takes the last row, so every row spans the content width with no empty strip or dead space (Elleta, 23 Nov: "too much space") */}
      <Flow span={12} gap={24} cards="bento">
        {health ? (
          <SystemHealth
            subtitle="Component checks that pass"
            value={health.pct}
            status={health.pct >= TARGET ? 'Healthy' : 'Below target'}
            target={TARGET}
            passed={`${health.passed} of ${health.total} pass`}
            // the failing checks show once, in Component checks below with their fix (user test 21 Nov, item 6)
            why={
              <>
                {`Healthy means ${TARGET}% or more pass (the blue tick). `}
                {health.failing.length ? (
                  <>
                    <Marker>{`${health.failing.reduce((s, r) => s + r.missing.length, 0)} checks still fail`}</Marker>
                    {'; each is in Component checks below.'}
                  </>
                ) : (
                  <Marker>Every check passes.</Marker>
                )}
              </>
            }
            // the way to the parts themselves: Components on Needs work, the same count it shows there
            failing={health.needsWork ? [{ name: 'Parts that need work', count: health.needsWork, ofTotal: `of ${n} parts`, href: '#/system/components?filter=needs' }] : []}
          />
        ) : (
          <NoData title="System health" icon="Activity" context="Component checks that pass" caption="No components yet: point CHIP at BELLA" />
        )}
        {/* ↗ opens the gate's recorded runs in Component checks and brings that card into view (click test 22 Nov: it switched the view out of sight, so it read as doing nothing) */}
        <GateCard gate={model.gate} run={run} onOpen={model.gateDays.length ? () => (setView('gate'), requestAnimationFrame(() => [...document.querySelectorAll('[role="heading"], h2, h3')].find((h) => h.textContent === 'Component checks')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))) : undefined} />
        <DriftCard components={model.components ?? []} />
        <GapsCard />
        {contrast ? (
          <StatCard
            title="Contrast coverage"
            icon="Palette"
            tone={contrast.pct >= TARGET ? 'success' : 'warning'}
            value={contrast.pct}
            unit="%"
            chart="bar"
            meter={{ fill: contrast.pct, target: TARGET }}
            context={`${contrast.pass} of ${contrast.of} have pairs${contrast.toGo ? ` · ${contrast.toGo} to go` : ''}`}
            href={contrast.href ?? undefined}
          />
        ) : null}
        {model.lowest ? (
          <StatCard
            title="Lowest contrast"
            icon="HalfMoon"
            tone={model.lowest.below ? 'warning' : 'success'}
            value={model.lowest.ratio.toFixed(2)}
            unit=":1"
            chart="bar"
            meter={{ fill: Math.round((model.lowest.ratio / 21) * 100), target: Math.round((model.lowest.bar / 21) * 100) }}
            context={model.lowest.below ? <Marker>{`${model.lowest.below} text pairs below ${model.lowest.bar}:1`}</Marker> : <Marker>Every pair clears the target</Marker>}
            caption={`Target ${model.lowest.bar}:1 · ${model.lowest.checked ? `${model.lowest.checked} checks${model.lowest.declared ? ` across ${model.lowest.declared} pairs in 4 themes` : ''}` : model.lowest.failing ? `the pairs check fails (${model.lowest.failing})` : 'not counted'}`}
            href="#/system/foundations"
          />
        ) : (
          <NoData title="Lowest contrast" icon="HalfMoon" context="The weakest text pair" caption="No pairs measured yet" />
        )}
      </Flow>
      <Card>
        <Flow gap={24}>
          {(() => {
            const all = model.gateRuns;
            const runs = all.length;
            const first = all[0]?.at;
            // what the view reports, each number once
            const line =
              view === 'gate' ? `${runs} recorded ${runs === 1 ? 'run' : 'runs'}${first ? ` · since ${gDay(first)}` : ''} · GitHub CI and CHIP`
              : (
                    // the target said once, in the line, with the blue marker (no legend under the rows)
                    <>
                      {`${n} parts · each block is 5 parts · `}
                      <Marker>{`target ${TARGET}%`}</Marker>
                    </>
                  );
            // her 21 Nov pick (question 1 A, "the control at teh top right and the feedback under?"): the
            // switch at the head's right end, and what the view reports in the line under the title
            return (
              <SectionHead
                icon="ShieldCheck"
                iconTone="info"
                title="Component checks"
                showInfo={false}
                description={line}
                action={<SegmentedControl options={CHECK_VIEWS} value={view} onChange={setView} label="Component checks view" />}
              />
            );
          })()}
          {view === 'gate' && !model.gateDays.length ? (
            <EmptyState size="lane" mark="🚦" title="No run recorded" line="Neither GitHub CI nor CHIP has a gate run on record yet." />
          ) : view === 'gate' ? (
            // her pick "C · Apple style" (22 Nov): bars per half hour, failures red with a cross, a callout on hover or
            // the arrow keys, D W M Y; BELLA's BarChart draws it from the runs CHIP and GitHub recorded
            <GateBars runs={model.gateRuns} readAt={model.gateReadAt} />
          ) : (
            // her pick "C · Weather rows" (22 Nov): one row per check, a block per 5 parts against the dashed
            // target, the count at the right; no divider under the last row. Each failing check's fix is in
            // Needs you below, so a row carries no action of its own.
            <ListRowGroup ariaLabel="Component checks">
              {rows.map((r, i) => (
                <CheckRow key={r.id} layout="weather" title={r.short ?? r.title} passed={r.pass} total={n} value={`${r.pass}/${n}`} target={TARGET} showDivider={i < rows.length - 1} />
              ))}
            </ListRowGroup>
          )}
        </Flow>
      </Card>
      <NeedsYouCard rows={rows} fixCount={model.fixCount} verb={verb} send={send} sending={sending} />
      <AuditsSection />
    </>
  );
}

