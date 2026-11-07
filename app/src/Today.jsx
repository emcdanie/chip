// Today (concept lock, step 1, 7 Nov): one list of what to do next in BELLA.
// It merges GET /needs, the gaps and CHIP's runs, all real data. Nothing here
// ranks anything: what /needs says waits on her comes first in /needs' order,
// then the current Do next gap, then the rest in the order they already had.
import React, { useEffect, useMemo, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Heading from '@bella/components/Heading/Heading';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import { failingTokens, useChecks, when } from './Checks.jsx';
import { GapReport, GapRow, useGapFixes } from './DoNext.jsx';
import { COLS, GAP_ORDER } from './Health.jsx';
import { openRun, runLine, useRunsRead } from './Runs.jsx';
import { runNeed } from './WorkPanel.jsx';
import './Today.css';

const TONE = { Failed: 'danger', 'Waiting on you': 'attention', 'Ready to review': 'success' };
// the title leads with the count and the object (drawing board, 7 Nov)
const MISSING = { story: 'story', docs: 'docs page', contract: 'token contract', dsds: 'DSDS entry', contrast: 'contrast pair', a11y: 'a11y notes' };
const headline = (gap, n) => `${n} component${n === 1 ? ' has' : 's have'} no ${MISSING[gap]}`;
// the action names what it does, short; the full label stays its accessible name
const verb = (a) => (a.type === 'terminal' ? (/git pull/.test(a.command) ? 'Pull' : /git push/.test(a.command) ? 'Push' : 'Run') : a.type === 'lane' ? 'Open' : 'Review');
// the tag says the status, so the why opens with the risk, as the board does: "Medium risk. …"
const plain = (s) => s.replace(/^(High|Medium|Low): /, '').replace(/^\w/, (c) => c.toUpperCase());
const Title = ({ tone, word, children }) => (
  <>
    <StatusPill className="td-tag" variant={tone}>
      {word}
    </StatusPill>
    {children}
  </>
);
const WORKING = ['starting', 'running', 'gate'];
const STUCK = ['failed', 'login'];
const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function RunRow({ run, status, tone, label, primary, onOpen }) {
  return (
    <ListRow
      title={
        <Title tone={tone} word={status}>
          {run.title.split(': ')[0]}
        </Title>
      }
      description={`${runLine(run).replace(/\.$/, '')}. From ${run.from}.`}
      action={
        <Button variant={primary ? 'primary' : 'secondary'} ariaLabel={`${label}: ${run.title.split(': ')[0]}`} onClick={onOpen}>
          {label}
        </Button>
      }
    />
  );
}

export default function Today({ bella, needs, onSession, onRefresh, onLane, onHealth }) {
  const checks = useChecks();
  const fixes = useGapFixes(bella);
  const { runs, read: runsRead } = useRunsRead(true);
  const [tab, setTab] = useState('needs');
  const [report, setReport] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checked, setChecked] = useState(null); // { at } | { error }
  useEffect(() => {
    fetch('/figma-baseline').then((r) => r.json()).then(setBaseline).catch(() => {});
  }, []);

  const failing = failingTokens(checks);
  const comps = bella?.components ?? [];
  // every gap, biggest first, the order Overview gave them
  const gaps = useMemo(
    () =>
      GAP_ORDER.map((i) => ({ i, who: comps.filter((c) => !COLS[i].of(c, failing)).map((c) => c.name) }))
        .filter((a) => a.who.length)
        .sort((a, b) => b.who.length - a.who.length),
    [bella, failing.join()],
  );

  const items = needs?.items ?? [];
  const waiting = items.filter((n) => n.status !== 'Ready to review');
  const ready = items.filter((n) => n.status === 'Ready to review');
  // a run's result isn't in /needs. Older than /needs' own window, it stays in Sessions
  const fresh = (r) => Date.now() - Date.parse(r.startedAt) < (needs?.freshDays ?? 7) * 86400000;
  const stuck = runs.filter((r) => STUCK.includes(r.status) && fresh(r));
  const passed = runs.filter((r) => r.status === 'passed');
  const working = runs.filter((r) => WORKING.includes(r.status));
  const busy = (checks.data?.checks ?? []).filter((c) => c.status === 'running');

  const needRow = (n, primary) => (
    <ListRow
      key={n.id}
      title={
        <Title tone={TONE[n.status] ?? 'neutral'} word={n.status}>
          {(n.title ?? n.what).replace('? ', ': ')}
        </Title>
      }
      description={`${n.risk} risk. ${plain(n.riskWhy)}`}
      action={
        <Button variant={primary ? 'primary' : 'secondary'} ariaLabel={`${n.action.label}: ${n.title ?? n.what}`} onClick={() => runNeed(n.action, onLane)}>
          {verb(n.action)}
        </Button>
      }
    />
  );

  const needsCount = waiting.length + gaps.length + stuck.length;
  const readyCount = ready.length + passed.length;
  const runningCount = working.length + busy.length;
  const loaded = !!(needs && bella && (fixes.data || fixes.error) && runsRead !== null);

  /* ---------- the one line ---------- */
  const lastRan = (checks.data?.checks ?? []).reduce((m, c) => (c.ranAt && c.ranAt > m ? c.ranAt : m), '');
  const notMeasured = [
    ...(checks.data?.checks ?? []).filter((c) => c.status === 'not-run').map((c) => c.name),
    ...(baseline && !baseline.at ? ['Figma match'] : []),
    ...(fixes.error ? ['who can fix each gap'] : []),
    ...(checks.error ? ['the checks'] : []),
    ...(runsRead === false ? ['CHIP’s runs'] : []),
  ];
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([checks.reload(), onRefresh?.()]);
      window.dispatchEvent(new Event('chip:changed'));
      setChecked({ at: Date.now() });
    } catch (e) {
      setChecked({ error: e.message || 'the CHIP server did not answer' });
    }
    setRefreshing(false);
  };

  return (
    <div className="td-page">
      <div className="td-surface">
      <header className="td-head">
        <div className="td-title">
          <Heading tier="page">Today</Heading>
          <p className="td-line td-mono">
            {bella ? `BELLA ${bella.source.version}` : 'Reading BELLA…'}
            {lastRan ? ` · checked ${when(lastRan)}` : ' · never checked'}
          </p>
          {notMeasured.length ? <p className="td-line td-quiet">Not measured: {notMeasured.join(', ')}</p> : null}
        </div>
        <Button variant="secondary" disabled={refreshing} onClick={refresh}>
          {refreshing ? 'Checking…' : 'Refresh'}
        </Button>
      </header>
      <p className="td-sync" role="status" aria-live="polite">
        {checked?.error ? `Refresh failed: ${checked.error}.` : checked ? `Read again at ${hhmm(checked.at)}.` : ''}
      </p>

      <Tabs
        idBase="td"
        label="Today"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'needs', label: `Needs you ${loaded ? needsCount : '…'}` },
          { id: 'ready', label: `Ready to review ${loaded ? readyCount : '…'}` },
          { id: 'running', label: `Running ${runsRead === true ? runningCount : '…'}` },
        ]}
      />

      <div {...tabPanelProps('td', 'needs', tab === 'needs')} className="td-panel">
        {!loaded ? (
          <p className="td-line">Reading what needs you…</p>
        ) : needsCount ? (
          <ListRowGroup ariaLabel="Needs you">
            {waiting.map((n, k) => needRow(n, k === 0))}
            {gaps.map((a, k) => {
              const gap = COLS[a.i].short.toLowerCase();
              return (
                <GapRow
                  key={gap}
                  gap={gap}
                  title={COLS[a.i].fix}
                  headline={headline(gap, a.who.length)}
                  why={COLS[a.i].why}
                  who={a.who}
                  first={k === 0}
                  primary={k === 0 && !waiting.length}
                  fixes={fixes.data?.gaps?.[gap]}
                  fixesError={fixes.error}
                  decisions={fixes.data?.decisions}
                  onReview={setReport}
                  onSession={onSession}
                />
              );
            })}
            {stuck.map((r) => (
              <RunRow key={r.id} run={r} status="Run failed" tone="danger" label="See the run" onOpen={() => openRun(r.id)} />
            ))}
          </ListRowGroup>
        ) : (
          <div className="td-empty">
            <Heading tier="subsection" as="h2">
              Nothing needs you
            </Heading>
            <p>{runsRead ? 'No check is failing, no gap is open and no run is stuck.' : 'No check is failing and no gap is open. Not measured: CHIP’s runs.'}</p>
            <Button variant="secondary" onClick={onHealth}>
              See Health
            </Button>
          </div>
        )}
      </div>

      <div {...tabPanelProps('td', 'ready', tab === 'ready')} className="td-panel">
        {readyCount ? (
          <ListRowGroup ariaLabel="Ready to review">
            {ready.map((n, k) => needRow(n, k === 0))}
            {passed.map((r, k) => (
              <RunRow key={r.id} run={r} status="Ready to review" tone="success" label="Review the run" primary={k === 0 && !ready.length} onOpen={() => openRun(r.id)} />
            ))}
          </ListRowGroup>
        ) : runsRead !== true ? (
          <p className="td-line">{runsRead === false ? 'Not measured: CHIP could not read its runs.' : 'Reading the runs…'}</p>
        ) : (
          <div className="td-empty">
            <Heading tier="subsection" as="h2">
              Nothing to review
            </Heading>
            <p>A fix lands here once its gate passes on a branch.</p>
          </div>
        )}
      </div>

      <div {...tabPanelProps('td', 'running', tab === 'running')} className="td-panel">
        {runningCount ? (
          <ListRowGroup ariaLabel="Running">
            {working.map((r) => (
              <RunRow key={r.id} run={r} status="Running" tone="neutral" label="See the run" onOpen={() => openRun(r.id)} />
            ))}
            {busy.map((c) => (
              <ListRow key={c.id} title={<Title tone="neutral" word="Running">{c.name}</Title>} description={c.plain ?? c.summary} />
            ))}
          </ListRowGroup>
        ) : runsRead !== true ? (
          <p className="td-line">{runsRead === false ? 'Not measured: CHIP could not read its runs.' : 'Reading the runs…'}</p>
        ) : (
          <div className="td-empty">
            <Heading tier="subsection" as="h2">
              Nothing is running
            </Heading>
            <p>A fix you send to Claude shows here while it works.</p>
          </div>
        )}
      </div>

      </div>
      <GapReport items={report} onClose={() => setReport(null)} onSession={(b, t) => (setReport(null), onSession(b, t))} />
    </div>
  );
}
