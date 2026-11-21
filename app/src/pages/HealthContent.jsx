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

/* A card CHIP has no data for: the same Stat card at zero, an empty bar, and the
   footer saying why (StatCard chart="empty", her 21 Nov pick A). */
function NoData({ title, icon, of, context, caption, button }) {
  return <StatCard title={title} icon={icon} tone="neutral" chart="empty" value={0} emptyTotal={of != null ? `of ${of}` : undefined} context={context} caption={caption} button={button} />;
}

/* Drift from BELLA as a Stat card (21 Nov publish): how many parts differ from
   Figma, the worst named, when it was compared and the action. Real data from
   /figma-baseline; with no baseline, the empty card (0 of the parts, her A). */
const SHOW = 3;
function DriftCard({ parts }) {
  const { data, reload } = useCached(['/figma-baseline']);
  const [busy, setBusy] = useState(false);
  const base = data?.[0] ?? null;
  const rows = (base?.rows ?? []).filter((r) => r.found);
  const differ = rows.filter((r) => r.failing.length).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const running = busy || !!base?.running;
  const compare = () => {
    setBusy(true);
    fetch('/figma-baseline/run', { method: 'POST', headers: { 'content-type': 'application/json' } })
      .catch(() => {})
      .finally(() => {
        setBusy(false);
        reload();
      });
  };
  const button = (
    <Button variant="secondary" size="sm" onClick={compare} disabled={running}>
      {running ? 'Comparing…' : 'Compare'}
    </Button>
  );
  // Figma couldn't be read for any part: nothing was measured, so no 0 that reads as "no drift" (data check, 22 Nov;
  // rule Real: "Where nothing is measured it says Not measured")
  // never compared at all is the same: Not measured
  if (!base?.at || (!rows.length && base.notRead === base.total))
    return <StatCard title="Drift from BELLA" icon="Activity" tone="neutral" chart="empty" emptyCount="Not measured" emptyTotal="" context={base?.at ? "Figma couldn't be read for any part" : 'Not compared with Figma yet'} caption={base?.at ? `Tried ${new Date(base.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Compare reads Figma'} button={button} />;
  // Figma was read but holds none of the parts: measured, and none to compare
  if (!rows.length) return <NoData title="Drift from BELLA" icon="Activity" of={parts} context="Parts that differ from Figma" caption="Figma had none of them" button={button} />;
  const worst = differ.slice(0, SHOW).map((r) => (r.score != null ? `${r.name} ${r.score}%` : r.name));
  return (
    <StatCard
      title="Drift from BELLA"
      icon="Activity"
      tone={differ.length ? 'warning' : 'success'}
      chart="none"
      value={differ.length}
      unit={`of ${rows.length}`}
      context={differ.length ? `Most: ${worst.join(', ')}${differ.length > SHOW ? ` +${differ.length - SHOW}` : ''}` : 'No part differs from Figma'}
      caption={`Compared ${new Date(base.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
      button={button}
    />
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
  { value: 'drift', label: 'Drift' },
];

export default function HealthContent({ model, run, checked, onCheck, loading, view: startView = 'coverage' }) {
  const narrow = useNarrow();
  const [view, setView] = useState(startView);
  // handing a check's gaps to the agent: the button says Sending…, then a toast
  const [sending, setSending] = useState(null);
  const [notice, setNotice] = useState(null);
  const send = async (row) => {
    setSending(row.id);
    try {
      await handOff(row);
      setNotice({ tone: 'success', text: `Sent to the agent: ${row.action}. It works on its own branch; its card is on Work, where a reviewer Accepts or Undoes it.` });
    } catch (e) {
      setNotice({ tone: 'danger', text: `Not sent: ${e.message}.` });
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
        <GateCard gate={model.gate} run={run} onOpen={model.gateDays.length ? () => setView('gate') : undefined} />
        <DriftCard parts={n} />
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
              : view === 'drift' ? `Each part against its Figma set · ${n} parts`
              : `Seven checks, six measured · ${n} parts · target ${TARGET}%`;
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
          {view === 'drift' ? (
            <EmptyState size="lane" mark="🧭" title="Nothing compared yet" line="Take a Figma baseline and I'll spot what drifted." />
          ) : view === 'gate' && !model.gateDays.length ? (
            <EmptyState size="lane" mark="🚦" title="No run recorded" line="Neither GitHub CI nor CHIP has a gate run on record yet." />
          ) : (
            // 24 between check rows, more than anything inside a row, so each row reads as its own group
            // (READ FIRST [10]: "24 between groups"; audit 3, item 12). The row's own layout is BELLA's Check row.
            <Flow gap={24}>
              {(view === 'gate'
                ? model.gateDays.map((d) => ({ id: d.id, missing: d.passed < d.runs ? [1] : [], title: d.title, line: d.line, value: `${d.passed}/${d.runs}`, fill: Math.round((d.passed / d.runs) * 100) }))
                : rows.map((r) => ({ ...r, value: `${r.pass}/${n}` }))
              )
                .map((r, i, all) => (i % 2 ? null : all.slice(i, i + 2)))
                .filter(Boolean)
                .map((pair) => (
                  <Flow key={pair[0].id} direction={narrow ? 'column' : 'row'} gap={24} equal>
                    {pair.map((r) => (
                      <CheckRow
                        key={r.id}
                        as="div"
                        status={r.missing.length ? 'fail' : 'pass'}
                        title={r.title}
                        subtitle={r.line}
                        value={r.value}
                        fill={r.fill}
                        target={TARGET}
                        actionLabel={r.missing.length && r.action ? verb(r) : undefined}
                        onAction={r.missing.length && r.action && !sending ? () => send(r) : undefined}
                      />
                    ))}
                    {/* a lone last row keeps its half, as the rows above */}
                    {pair.length === 1 && !narrow ? <div aria-hidden="true" /> : null}
                  </Flow>
                ))}
            </Flow>
          )}
        </Flow>
      </Card>
    </>
  );
}

