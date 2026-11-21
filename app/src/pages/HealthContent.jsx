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
import SystemHealth from '@bella/components/SystemHealth/SystemHealth';
import CheckRow from '@bella/components/CheckRow/CheckRow';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import TextStack from '@bella/components/TextStack/TextStack';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import Drawer from '@bella/components/Drawer/Drawer';
import { planRun } from '../templates/RunPlan.jsx';
import Marker from '@bella/components/Marker/Marker';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import { useEffect, useRef, useState } from 'react';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import useNarrow from '../templates/useNarrow.js';
import { TARGET, handOff } from './healthModel.js';
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
function DriftCard({ components }) {
  const { data } = useCached(['/drift']);
  const [open, setOpen] = useState(false);
  const d = data?.[0] ?? null;
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
        context={`${d.drifting} differ from Figma · ${d.specBehind} specs behind the code · ${d.noSpec} with no spec`}
        caption={day ? `Specs from ${day} · ${d.total - d.compared} not read from Figma` : `${d.total - d.compared} not read from Figma`}
        onOpen={() => setOpen(true)}
      />
      <Drawer open={open} onClose={() => setOpen(false)} side="right" size="lg" label="Drift from BELLA" status={`${d.differing} of ${d.total} parts differ · most first`}>
        <ListRowGroup ariaLabel="Every part and what differs">
          {d.parts.map((p) => (
            <ListRow key={p.name} layout="stacked" statusBar={p.differ || p.specBehind.length || p.noSpec ? 'attention' : 'success'} title={p.name} description={driftLine(p)} trailing onClick={() => ((window.location.hash = `#/components/${encodeURIComponent(idOf(p.name))}`), setOpen(false))} />
          ))}
        </ListRowGroup>
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
  const g = data?.[0] ?? null;
  if (!g) return <NoData title="Gaps" icon="WarningCircle" context="What BELLA can't do yet" caption="Reading BELLA" />;
  const total = g.notInCode.length + g.notInBella.length;
  const brief = ['Build these BELLA parts in code from their specs (specs/components/<Name>.spec.yaml), one at a time, each with a story:', ...g.notInCode.map((n) => `- ${n}`), 'Follow BELLA AGENTS.md; no new tokens; ask before changing a public API.'].join('\n');
  const plan = () => (setOpen(false), planRun({ title: `Build ${plural(g.notInCode.length, 'part')} from their specs`, from: 'Health · Gaps', brief, steps: g.notInCode.map((n) => ({ id: n, title: `Build ${n} from its spec` })) }).catch(() => {}));
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
        onClose={() => setOpen(false)}
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
            caption={`Target ${TARGET}%`}
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
              view === 'gate' ? `${runs} recorded ${runs === 1 ? 'run' : 'runs'} · ${days.length} ${days.length === 1 ? 'day' : 'days'} · GitHub CI and CHIP · target ${TARGET}%`
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
            // 24 between check rows, more than anything inside a row, so each row reads as its own group
            // (READ FIRST [10]: "24 between groups"; audit 3, item 12). The row's own layout is BELLA's Check row.
            <Flow gap={24}>
              {model.gateDays
                .map((d) => ({ id: d.id, missing: d.passed < d.runs ? [1] : [], title: d.title, line: d.line, value: `${d.passed}/${d.runs}`, fill: Math.round((d.passed / d.runs) * 100) }))
                .map((r, i, all) => (i % 2 ? null : all.slice(i, i + 2)))
                .filter(Boolean)
                .map((pair) => (
                  <Flow key={pair[0].id} direction={narrow ? 'column' : 'row'} gap={24} equal>
                    {pair.map((r) => (
                      <CheckRow key={r.id} as="div" status={r.missing.length ? 'fail' : 'pass'} title={r.title} subtitle={r.line} value={r.value} fill={r.fill} target={TARGET} />
                    ))}
                    {/* a lone last row keeps its half, as the rows above */}
                    {pair.length === 1 && !narrow ? <div aria-hidden="true" /> : null}
                  </Flow>
                ))}
            </Flow>
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
    </>
  );
}

