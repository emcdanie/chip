// Health · content: the code twin of the Figma slot fill (CHIP Dashboard
// 601:111049). States as a prop, as in Figma: the gate run (none, running,
// passed, failed); "all clear" follows from the data (nothing left to fix).
// BELLA parts and the template's Flow only; no page CSS.
//
// Stand-ins and gaps (parts-dev):
// - System health is Figma's segmented arc gauge; BELLA has no gauge part
//   yet, so the published StatCard with a bar stands in, and the failing
//   checks it lists under the arc are left out (StatCard has no list slot).
// - Fix actions run an agent: Figma's model menu needs a button-with-menu
//   part; plain buttons until then.
// - Needs you cards: Figma draws a brain icon well; no brain icon in BELLA.
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import StatCard from '@bella/components/StatCard/StatCard';
import CheckRow from '@bella/components/CheckRow/CheckRow';
import ListRow from '@bella/components/ListRow/ListRow';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';
import { TARGET } from './healthModel.js';

export const GATE_RUNS = ['none', 'running', 'passed', 'failed'];

/* The gate banner, Figma's words per state. `run` carries the live numbers. */
function GateBanner({ run }) {
  if (!run || run.state === 'none') return null;
  if (run.state === 'running')
    return <Notification tone="info" icon="RefreshDouble" title={`Running the gate · ${run.done} of ${run.of} checks`} message={`Now running ${run.now}. You can keep working.`} />;
  if (run.state === 'passed') return <Notification tone="success" title="Gate passed" message={`${run.of} of ${run.of} checks · just now`} />;
  return <Notification tone="danger" title={`Gate failed: ${run.failed}`} message={run.why} />;
}

/* A card CHIP has no data for: its head and the Empty state (StatCard has no empty slot). */
function NoData({ title, icon, tone, mark, empty, line }) {
  return (
    <Card>
      <Flow gap={8}>
        <SectionHead icon={icon} iconTone={tone} title={title} titleLevel={3} />
        <EmptyState size="lane" mark={mark} title={empty} line={line} />
      </Flow>
    </Card>
  );
}

function GateCard({ gate, run }) {
  if (!gate) return <NoData title="Gate" icon="ShieldCheck" tone="success" mark="🚦" empty="No gate runs yet" line="Run the gate once and I'll keep the tally." />;
  if (run?.state === 'running')
    return <StatCard title="Gate" icon="ShieldCheck" tone="info" value={run.done} unit={`of ${run.of} so far`} chart="segments" meter={{ segments: run.of, done: run.done }} context={`Running ${run.now}`} caption="Started just now" />;
  const failed = run?.state === 'failed';
  const ok = failed ? run.of - 1 : run?.state === 'passed' ? run.of : gate.ok;
  const of = run && run.state !== 'none' ? run.of : gate.of;
  return (
    <StatCard
      title="Gate"
      icon="ShieldCheck"
      tone={ok === of ? 'success' : 'warning'}
      value={ok}
      unit={`of ${of}`}
      chart="segments"
      meter={{ segments: of, done: ok }}
      context={run && run.state !== 'none' ? 'Last run just now' : `Last run ${gate.when}`}
      caption={failed ? run.why : ok === of ? 'All pass, every commit' : `${of - ok} failing`}
    />
  );
}

export default function HealthContent({ model, run }) {
  const narrow = useNarrow();
  if (!model) return null;
  const { health, contrast, rows, fixes, fixCount, n } = model;
  const pairs = [rows.slice(0, 2), rows.slice(2, 4), rows.slice(4, 6)];
  return (
    <>
      <GateBanner run={run} />
      <Flow span={4} gap={24} fill>
        {health ? (
          <StatCard
            title="System health"
            icon="Activity"
            tone={health.pct >= TARGET ? 'success' : 'warning'}
            value={health.pct}
            unit="%"
            chart="bar"
            meter={{ fill: health.pct, target: TARGET }}
            context={`${health.passed} of ${health.total} pass`}
            caption={health.failing.length ? `Healthy means ${TARGET}% or more pass. ${health.failing.length} checks still fail.` : `Healthy means ${TARGET}% or more pass. Every check passes.`}
          />
        ) : (
          <NoData title="System health" icon="Activity" tone="info" mark="🩺" empty="No components yet" line="Point me at BELLA and I'll take its pulse." />
        )}
      </Flow>
      <Flow span={4} gap={24} fill>
        <GateCard gate={model.gate} run={run} />
        <NoData title="Drift from BELLA" icon="Activity" tone="info" mark="🧭" empty="Nothing compared yet" line="Take a Figma baseline and I'll spot what drifted." />
      </Flow>
      <Flow span={4} gap={24} fill>
        {contrast ? (
          <StatCard
            title="Contrast coverage"
            icon="SunLight"
            tone={contrast.pct >= TARGET ? 'success' : 'warning'}
            value={contrast.pct}
            unit="%"
            chart="bar"
            meter={{ fill: contrast.pct, target: TARGET }}
            context={`${contrast.pass} of ${contrast.of} have pairs${contrast.toGo ? ` · ${contrast.toGo} to go` : ''}`}
            caption={`Target ${TARGET}%`}
          />
        ) : null}
        <NoData title="Lowest contrast" icon="SunLight" tone="success" mark="🔍" empty="No pairs measured yet" line="Declare a pair and I'll find the weakest one." />
      </Flow>
      <Card>
        <Flow gap={24}>
          <SectionHead icon="ShieldCheck" iconTone="info" title="Component checks" description={`Six checks across ${n} components`} number={n} words={`components · target ${TARGET}%`} />
          <Flow gap={16}>
            {pairs.map((pair) => (
              <Flow key={pair[0].id} direction={narrow ? 'column' : 'row'} gap={24} fill>
                {pair.map((r) => (
                  <CheckRow
                    key={r.id}
                    as="div"
                    status={r.missing.length ? 'fail' : 'pass'}
                    title={r.title}
                    subtitle={r.line}
                    value={`${r.pass}/${n}`}
                    fill={r.fill}
                    target={TARGET}
                    actionLabel={r.missing.length ? r.action : undefined}
                  />
                ))}
              </Flow>
            ))}
          </Flow>
        </Flow>
      </Card>
      <Card>
        <Flow gap={24}>
          <SectionHead icon="WarningCircle" iconTone="warning" title="Needs you" description="Fixes that wait on you" number={fixCount} words="to fix" />
          {fixes.length ? (
            <>
              {/* Wide: a card per fix, as Figma. Narrow: a card inside a card
                  leaves no room, so the fixes are plain rows. */}
              {narrow ? (
                <Flow as="ul" gap={8} aria-label="Fixes">
                  {fixes.map((f) => (
                    <ListRow key={f.id} layout="stacked" title={f.title} description={f.names} actionButton={<Button variant="secondary" size="sm">{f.action}</Button>} />
                  ))}
                </Flow>
              ) : (
                <Flow direction="row" gap={24} wrap fill>
                  {fixes.map((f) => (
                    <Card key={f.id}>
                      <ListRow
                        as="div"
                        layout="stacked"
                        title={f.title}
                        description={f.names}
                        actionButton={
                          <Button variant="secondary" size="sm">
                            {f.action}
                          </Button>
                        }
                      />
                    </Card>
                  ))}
                </Flow>
              )}
              <Flow as="ul" gap={4} aria-label="All fixes">
                <ListRow layout="inline" title={`See all ${fixCount} fixes`} trailing href="#/health-old" />
              </Flow>
            </>
          ) : (
            <EmptyState size="lane" mark="🎉" title="Every check passes" line="Not a thing to fix. Away you go and put your feet up." />
          )}
        </Flow>
      </Card>
    </>
  );
}

