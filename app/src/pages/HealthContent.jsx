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
import ListRow from '@bella/components/ListRow/ListRow';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import TextStack from '@bella/components/TextStack/TextStack';
import Tag from '@bella/components/Tag/Tag';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import { useState } from 'react';
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
    return <Notification tone="info" icon="RefreshDouble" title={`Running the gate · ${run.done} of ${run.of} checks`} message={`Now running ${run.now}. You can keep working.`} />;
  if (run.state === 'passed') return <Notification tone="success" title="Gate passed" message={`${run.of} of ${run.of} checks · just now`} />;
  return <Notification tone="danger" title={`Gate failed: ${run.failed}`} message={run.why} />;
}

/* A card CHIP has no data for: its head and the Empty state (StatCard has no empty slot). */
function NoData({ title, icon, tone, mark, empty, line }) {
  return (
    <Card>
      <Flow gap={8}>
        <SectionHead size="card" icon={icon} iconTone={tone} title={title} titleLevel={3} />
        <EmptyState size="lane" mark={mark} title={empty} line={line} />
      </Flow>
    </Card>
  );
}

/* Figma's Drift from BELLA card (601:109235): how many parts differ from Figma,
   the worst as chips, when it was compared and the action. Real data from
   /figma-baseline; with no baseline the same layout says so in one line
   (audit 10: Figma's layout, an honest empty line, no stray icon). */
const SHOW = 3;
function DriftCard() {
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
  const footer = base?.at ? `Compared ${new Date(base.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Not run';
  return (
    <Card
      footerText={footer}
      footerAction={
        <Button variant="secondary" size="sm" onClick={compare} disabled={running}>
          {running ? 'Comparing…' : base?.at ? 'Compare again' : 'Compare now'}
        </Button>
      }
    >
      <Flow gap={12}>
        <SectionHead size="card" icon="Activity" iconTone="info" title="Drift from BELLA" titleLevel={3} />
        {!base?.at ? (
          <TextStack body="Not compared yet: there is no Figma baseline to measure against." />
        ) : (
          <>
            <TextStack title={rows.length ? `${differ.length} of ${rows.length} parts differ` : 'Figma had none of the parts'} />
            {differ.length ? (
              <Flow direction="row" gap={8} wrap>
                {differ.slice(0, SHOW).map((r) => (
                  <Tag key={r.id} variant="flat">{r.score != null ? `${r.name} ${r.score}%` : r.name}</Tag>
                ))}
                {differ.length > SHOW ? <Tag variant="flat">{`+${differ.length - SHOW}`}</Tag> : null}
              </Flow>
            ) : null}
          </>
        )}
      </Flow>
    </Card>
  );
}

function GateCard({ gate, run, onOpen }) {
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
      href={onOpen ? undefined : '#/history'}
      onOpen={onOpen}
    />
  );
}

/* Figma's views of the Component checks card: coverage per check, the gate per day, drift from Figma. */
const CHECK_VIEWS = [
  { value: 'coverage', label: 'Coverage' },
  { value: 'gate', label: 'Gate' },
  { value: 'drift', label: 'Drift' },
];

export default function HealthContent({ model, run, checked, onCheck, view: startView = 'coverage' }) {
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
  if (!model) return <EmptyState size="lane" mark="⏳" title="Reading BELLA" line="Counting every part and its checks." />;
  const { health, contrast, rows, fixes, fixCount, n } = model;
  return (
    <>
      {/* Control bar, as on Work: the last check and Check again, one group on the left. */}
      <Flow direction="row" gap={8} align="center">
        {checked ? <TextStack subtitle={`Checked ${checked}`} /> : null}
        <Button variant="tertiary" size="sm" icon="RefreshDouble" leadingIcon onClick={onCheck}>
          Check again
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
            why={`Healthy means ${TARGET}% or more pass (the blue tick). ${health.failing.length ? `${health.failing.reduce((s, r) => s + r.missing.length, 0)} checks still fail:` : 'Every check passes.'}`}
            failing={health.failing.map((r) => ({ name: r.title, count: r.missing.length, ofTotal: `of ${n} parts`, href: '#/components' }))}
          />
        ) : (
          <NoData title="System health" icon="Activity" tone="info" mark="🩺" empty="No components yet" line="Point me at BELLA and I'll take its pulse." />
        )}
      </Flow>
      <Flow span={4} gap={24} fill>
        <GateCard gate={model.gate} run={run} onOpen={model.gateDays.length ? () => setView('gate') : undefined} />
        <DriftCard />
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
            caption={`Target ${model.lowest.bar}:1 · ${model.lowest.checked} checked`}
            href="#/foundations"
          />
        ) : (
          <NoData title="Lowest contrast" icon="HalfMoon" tone="success" mark="🔍" empty="No pairs measured yet" line="Declare a pair and I'll find the weakest one." />
        )}
      </Flow>
      <Card>
        <Flow gap={24}>
          {(() => {
            const days = model.gateDays;
            const runs = days.reduce((t, d) => t + d.runs, 0);
            const head =
              view === 'gate' ? { description: `${days.length} days of gate runs`, number: runs, words: `runs · target ${TARGET}%` }
              : view === 'drift' ? { description: 'Each part against its Figma set', number: n, words: 'components' }
              : { description: `Seven checks; six measured across ${n} parts`, number: n, words: `components · target ${TARGET}%` };
            return <SectionHead icon="ShieldCheck" iconTone="info" title="Component checks" {...head} />;
          })()}
          {/* the view switch at the right, as Figma */}
          <Flow direction="row" justify="end">
            <SegmentedControl options={CHECK_VIEWS} value={view} onChange={setView} label="Component checks view" />
          </Flow>
          {view === 'drift' ? (
            <EmptyState size="lane" mark="🧭" title="Nothing compared yet" line="Take a Figma baseline and I'll spot what drifted." />
          ) : view === 'gate' && !model.gateDays.length ? (
            <EmptyState size="lane" mark="🚦" title="No gate runs yet" line="Run the gate once and I'll keep the tally." />
          ) : (
            <Flow gap={16}>
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
                        onAction={r.missing.length && !sending ? () => send(r) : undefined}
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
      <Card>
        <Flow gap={24}>
          <SectionHead icon="WarningCircle" iconTone="warning" title="Needs you" description="Fixes that need a reviewer" number={fixCount} words="to fix" />
          {fixes.length ? (
            <>
              {/* Wide: a card per fix, as Figma. Narrow: a card inside a card
                  leaves no room, so the fixes are plain rows. */}
              {narrow ? (
                <Flow as="ul" gap={16} aria-label="Fixes">
                  {fixes.map((f) => (
                    // ListRow moves the button under the names on a narrow row (parts-dev b69a5de)
                    <ListRow key={f.id} layout="stacked" title={f.title} description={f.who ? `${f.names} · ${f.who}` : f.names} actionButton={<Button variant="secondary" size="sm" disabled={!!sending} onClick={() => send(f.row)}>{verb(f.row)}</Button>} />
                  ))}
                </Flow>
              ) : (
                <Flow gap={24}>
                  {/* two to a row, equal widths, as Figma */}
                  {fixes.map((f, i) => (i % 2 ? null : [f, fixes[i + 1]])).filter(Boolean).map((two) => (
                    <Flow key={two[0].id} direction="row" gap={24} equal>
                      {two.map((f) =>
                        f ? (
                          <Card key={f.id}>
                            <ListRow
                              as="div"
                              layout="stacked"
                              title={f.title}
                              description={f.who ? `${f.names} · ${f.who}` : f.names}
                              actionButton={
                                <Button variant="secondary" size="sm" disabled={!!sending} onClick={() => send(f.row)}>
                                  {verb(f.row)}
                                </Button>
                              }
                            />
                          </Card>
                        ) : (
                          <div key="empty" aria-hidden="true" />
                        ),
                      )}
                    </Flow>
                  ))}
                </Flow>
              )}
              <Flow as="ul" gap={4} aria-label="All fixes">
                <ListRow layout="inline" title={`See all ${fixCount} fixes`} trailing href="#/components?filter=needs" />
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

