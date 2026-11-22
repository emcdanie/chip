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
import Stat from '@bella/components/Stat/Stat';
import Progress from '@bella/components/Progress/Progress';
import SystemHealth from '@bella/components/SystemHealth/SystemHealth';
import CheckRow from '@bella/components/CheckRow/CheckRow';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import TextStack from '@bella/components/TextStack/TextStack';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import Drawer from '@bella/components/Drawer/Drawer';
import { planRun } from '../templates/RunPlan.jsx';
import AuditReading from './AuditReading.jsx';
import Marker from '@bella/components/Marker/Marker';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import { useEffect, useRef, useState } from 'react';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import useNarrow from '../templates/useNarrow.js';
import { TARGET, handOff } from './healthModel.js';
import { gateSlots } from './gateSlots.js';
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
/* Gate runs: every recorded run in a slot of the range picked (the chart holds its range, we hand it that range's slots). */
function GateBars({ runs }) {
  const [range, setRange] = useState('day');
  const slots = gateSlots(runs, range);
  return (
    <BarChart
      title="Gate runs"
      showViewToggle={false}
      range={range}
      onRangeChange={setRange}
      slots={slots}
      label="Passed"
      unit="Runs"
      context="GitHub CI and CHIP's own runs · only what was recorded"
    />
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

function DriftCard({ components }) {
  const { data } = useCached(['/drift']);
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
        caption={day ? `Specs from ${day} · ${d.total - d.compared} not read from Figma` : `${d.total - d.compared} not read from Figma`}
        onOpen={() => setOpen(true)}
      />
      <Drawer open={open} onClose={closed} side="right" size="lg" label="Drift from BELLA" status={`${d.differing} of ${d.total} parts differ · most first`}>
        <Flow gap={24}>
          {/* since the last check: the trend arrow and the mini chart from the snapshots CHIP keeps (/drift history);
              with one snapshot there is no change to show yet */}
          <Stat
            label="Parts that differ"
            value={d.differing}
            unit={`of ${d.total}`}
            series={hist.length > 1 ? hist.map((x) => x.differing) : undefined}
            seriesLabels={hist.length > 1 ? hist.map((x) => new Date(x.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ` ${new Date(x.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`) : undefined}
            delta={prev ? `${Math.abs(d.differing - prev.differing) || 'No'} ${d.differing === prev.differing ? 'change' : d.differing < prev.differing ? 'fewer' : 'more'} since the last check, ${new Date(prev.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'First check kept: the change shows once BELLA moves'}
            trend={prev && d.differing !== prev.differing ? (d.differing < prev.differing ? 'down' : 'up') : undefined}
          />
          {/* three kinds of drift, sorted, words in Lexend (pin 2) */}
          <Flow gap={12} as="ul" aria-label="The three kinds of drift, most first">
            {kinds.map((k) => (
              <li key={k.label}>
                <Progress label={k.label} value={`${k.n} of ${d.total}`} fill={(k.n / d.total) * 100} tone="attention" showTarget={false} />
              </li>
            ))}
          </Flow>
        <ListRowGroup ariaLabel="Every part and what differs">
          {d.parts.map((p) => (
            <ListRow
              key={p.name}
              layout="stacked"
              statusBar={p.differ || p.specBehind.length || p.noSpec ? 'attention' : 'success'}
              title={p.name}
              description={driftLine(p)}
              trailing
              onClick={() => ((window.location.hash = `#/components/${encodeURIComponent(idOf(p.name))}`), setOpen(false))}
              // Fix opens the same plan-first sheet as every fix; nothing runs until it is approved
              actionButton={
                p.differ || p.specBehind.length || p.noSpec ? (
                  <Button variant="tertiary" size="sm" onClick={() => ((pending.current = p), setOpen(false))}>
                    Fix
                  </Button>
                ) : undefined
              }
            />
          ))}
        </ListRowGroup>
        </Flow>
      </Drawer>
    </>
  );
}

/* Gaps: what BELLA can't do yet (her presentation, 22 Nov), measured from BELLA itself (/bella-gaps): parts drawn
   and specified that have no code yet, and the parts AGENTS.md lists as not in BELLA. ↗ opens both lists; the
   specified ones can be built: Plan the build opens the plan, and nothing runs until it is approved. */
function GapsCard() {
  const { data } = useCached(['/bella-gaps']);
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
        context={`${g.notInCode.length} specified, not in code · ${g.notInBella.length} not in BELLA yet`}
        caption="What BELLA can't do yet"
        onOpen={() => setOpen(true)}
      />
      <Drawer
        open={open}
        onClose={closed}
        side="right"
        size="lg"
        label="Gaps"
        status={`${plural(total, 'part')} BELLA can't give yet`}
        footer={g.notInCode.length ? <Button variant="primary" onClick={plan}>Plan the build</Button> : undefined}
      >
        <Flow gap={24}>
          <Flow gap={8}>
            <SectionHead title="Specified, not in code" description={`${g.notInCode.length} parts have a spec from Figma and no code part yet`} showInfo={false} />
            <ListRowGroup ariaLabel="Specified, not in code">
              {g.notInCode.map((n) => <ListRow key={n} layout="inline" statusBar="attention" title={n} />)}
            </ListRowGroup>
          </Flow>
          <Flow gap={8}>
            <SectionHead title="Not in BELLA yet" description="Listed in BELLA's AGENTS.md: ask before building" showInfo={false} />
            <ListRowGroup ariaLabel="Not in BELLA yet">
              {g.notInBella.map((n) => <ListRow key={n} layout="inline" statusBar="neutral" title={n} />)}
            </ListRowGroup>
          </Flow>
        </Flow>
      </Drawer>
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
      caption={failed ? run.why : gate.failing.length ? `Failing: ${gate.failing.join('; ')}` : gate.notRun.length ? `Not run yet: ${gate.notRun.join('; ')}` : `All ${of} pass`}
      href={onOpen ? undefined : '#/history'}
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
            <Button variant="tertiary" size="sm" icon="ArrowUpRight" href="#/components?filter=needs">
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
   the day it ran, red and yellow; ↗ opens the report read in the drawer, explained (AuditReading.jsx). Run all opens a plan first. */
const dayOf = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const AUDIT_ICON = { product: 'ViewGrid', figma: 'Palette', ds: 'ShieldCheck', tokens: 'Key', a11y: 'Eye', agents: 'Brain' };
function AuditCard({ a }) {
  const [open, setOpen] = useState(false);
  if (!a.ran) return <NoData title={a.title} icon={AUDIT_ICON[a.id] ?? 'Activity'} context={`${a.skill}`} caption="Not run: no saved report yet" />;
  const lights = a.red == null ? 'Red and yellow not counted' : `${a.red} red · ${a.yellow} yellow`;
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
      <Drawer open={open} onClose={() => setOpen(false)} side="right" size="lg" label={`${a.title} audit`} status={`Ran ${dayOf(a.ran)} · ${lights}`}>
        <AuditReading a={a} day={dayOf(a.ran)} />
      </Drawer>
    </>
  );
}

function AuditsSection() {
  const { data } = useCached(['/audits']);
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

export default function HealthContent({ model, run, checked, onCheck, loading, view: startView = 'coverage' }) {
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
        {checked ? <TextStack subtitle={`Checked ${checked}`} /> : null}
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
      <Flow span={4} gap={24} fill>
        {health ? (
          <SystemHealth
            subtitle="Component checks that pass"
            value={health.pct}
            status={health.pct >= TARGET ? 'Healthy' : 'Below target'}
            target={TARGET}
            passed={`${health.passed} of ${health.total} pass`}
            // the failing checks show once, in Component checks below with their fix (user test 21 Nov, item 6)
            why={`Healthy means ${TARGET}% or more pass (the blue tick). ${health.failing.length ? `${health.failing.reduce((s, r) => s + r.missing.length, 0)} checks still fail; each is in Component checks below.` : 'Every check passes.'}`}
            // the way to the parts themselves: Components on Needs work, the same count it shows there
            failing={health.needsWork ? [{ name: 'Parts that need work', count: health.needsWork, ofTotal: `of ${n} parts`, href: '#/components?filter=needs' }] : []}
          />
        ) : (
          <NoData title="System health" icon="Activity" context="Component checks that pass" caption="No components yet: point CHIP at BELLA" />
        )}
      </Flow>
      <Flow span={4} gap={24} fill>
        {/* ↗ opens the gate's recorded runs in Component checks and brings that card into view (click test 22 Nov: it switched the view out of sight, so it read as doing nothing) */}
        <GateCard gate={model.gate} run={run} onOpen={model.gateDays.length ? () => (setView('gate'), requestAnimationFrame(() => [...document.querySelectorAll('[role="heading"], h2, h3')].find((h) => h.textContent === 'Component checks')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))) : undefined} />
        <DriftCard components={model.components ?? []} />
        <GapsCard />
      </Flow>
      <Flow span={4} gap={24} fill>
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
            context={model.lowest.below ? `${model.lowest.below} text pairs below ${model.lowest.bar}:1` : 'Every pair clears the target'}
            caption={`Target ${model.lowest.bar}:1 · ${model.lowest.checked ? `${model.lowest.checked} checks${model.lowest.declared ? ` across ${model.lowest.declared} pairs in 4 themes` : ''}` : model.lowest.failing ? `the pairs check fails (${model.lowest.failing})` : 'not counted'}`}
            href="#/foundations"
          />
        ) : (
          <NoData title="Lowest contrast" icon="HalfMoon" context="The weakest text pair" caption="No pairs measured yet" />
        )}
      </Flow>
      <Card>
        <Flow gap={24}>
          {(() => {
            const days = model.gateDays;
            const runs = days.reduce((t, d) => t + d.runs, 0);
            // what the view reports, each number once
            const line =
              view === 'gate' ? `${runs} recorded ${runs === 1 ? 'run' : 'runs'} · ${days.length} ${days.length === 1 ? 'day' : 'days'} · GitHub CI and CHIP`
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
            <GateBars runs={model.gateRuns} />
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

