import React, { useEffect, useState } from 'react';
import { usageFigures } from './answers.js';
import Card from '@bella/components/Card/Card';
import PageHeader from '@bella/components/PageHeader/PageHeader';
import Section from '@bella/components/Section/Section';
import SidebarLayout from '@bella/components/SidebarLayout/SidebarLayout';
import NavList from '@bella/components/NavList/NavList';
import Stat from '@bella/components/Stat/Stat';
import ScoreStrip, { ScoreLegend } from '@bella/components/ScoreStrip/ScoreStrip';
import DataTable from '@bella/components/DataTable/DataTable';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Button from '@bella/components/Button/Button';
import { Checks, Coverage, failingTokens, useChecks } from './Checks.jsx';
import { openReview } from './ReviewSheet.jsx';

// the gap is the loud one: passing states stay quiet, so a row's problem is what you see
function Pill({ ok, word }) {
  return <StatusPill variant={ok ? 'quiet' : 'attention'}>{word}</StatusPill>;
}

const yes = (v) => (v ? 1 : 0);

const COLUMNS = [
  { key: 'name', label: 'Component', sortable: true },
  { key: 'hasStory', label: 'Story', sortable: true, sortValue: (c) => yes(c.hasStory),
    render: (c) => <Pill ok={c.hasStory} word={c.hasStory ? 'present' : 'missing'} /> },
  { key: 'inDsds', label: 'DSDS spec', sortable: true, sortValue: (c) => yes(c.inDsds),
    render: (c) => <Pill ok={c.inDsds} word={c.inDsds ? 'present' : 'missing'} /> },
  { key: 'contract', label: 'Contract', sortable: true, sortValue: (c) => c.health.contract.status,
    render: (c) => <Pill ok={c.health.contract.status === 'pass'} word={c.health.contract.status} /> },
  { key: 'contrast', label: 'Contrast', sortable: true, sortValue: (c) => c.health.contrast.status,
    render: (c) => <Pill ok={c.health.contrast.status !== 'fail'} word={c.health.contrast.status.replace('-', ' ')} /> },
  { key: 'parts', label: 'Anatomy parts', numeric: true, sortable: true, sortValue: (c) => c.parts.length,
    render: (c) => c.parts.length },
  { key: 'tokens', label: 'Tokens', numeric: true, sortable: true, sortValue: (c) => c.tokens.count,
    render: (c) => c.tokens.count },
];


const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const time = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// What stayed on this machine this week, from data/usage.jsonl (GET /usage).
function Usage() {
  const [u, setU] = useState(null);
  useEffect(() => {
    fetch('/usage')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => (Array.isArray(d?.days) ? setU(d) : setU(false)))
      .catch(() => setU(false));
  }, []);
  if (u === false) return <p className="label">The usage ledger could not be read (is the CHIP server running?).</p>;
  if (!u) return <p className="label">Reading the usage ledger…</p>;
  const f = usageFigures(u);
  const days = `answers kept local per day, last 7 days: ${u.days.join(', ')}`;
  return (
    <Card>
      <div className="hero-stats">
        <Stat label="Answers this week" value={f.answers.value} delta={f.answers.delta} series={u.days} seriesLabel={days} />
        <Stat label="Tokens kept local" value={f.tokens.value} delta={f.tokens.delta} />
        <Stat label="Value at API rates" value={f.value.value} delta={f.value.delta} />
        <Stat label="Stayed on this laptop" value={f.local.value} delta={f.local.delta} />
      </div>
    </Card>
  );
}

const SECTIONS = [
  { href: '#coverage', label: 'Coverage' },
  { href: '#checks', label: 'Checks' },
  { href: '#failures', label: 'Gaps to close' },
  { href: '#components', label: 'Components' },
  { href: '#readiness', label: 'Readiness map' },
  { href: '#usage', label: 'Usage' },
];

// The Overview template (layout foundation): On this page beside the
// sections; the page header, then one Section per block.
export default function Health({ bella, health, failures, onOpenAtlas, onAsk, onRun, narrow }) {
  const checks = useChecks();
  if (!bella) return <p className="loading">Loading BELLA health…</p>;
  const gate = checks.data?.gate;
  const failing = failingTokens(checks);
  // the sync's gaps plus what the last contrast check says, so Coverage and
  // Gaps count the same things
  const gaps = [...failures, ...bella.components.filter((c) => (c.tokens?.list ?? []).some((t) => failing.includes(t)) && c.health?.contrast?.status !== 'fail').map((c) => `${c.name}: contrast (${failing.filter((t) => c.tokens.list.includes(t)).join(', ')} fails in the last check)`)];
  const firstFail = checks.data?.checks.find((c) => c.gate && (c.status === 'failed' || c.status === 'waiting'));

  const stations = bella.stations;
  const measured = stations.filter((s) => s.score !== null);
  const overall = measured.length
    ? Math.round(measured.reduce((n, s) => n + s.score, 0) / measured.length)
    : null;
  const source = (
    <>
      BELLA {bella.source.version} @ <span className="mono">{bella.source.commit}</span>
    </>
  );
  const onThisPage = (
    <NavList
      label="On this page"
      groups={[{ label: 'On this page', items: SECTIONS.filter((x) => x.href !== '#failures' || failures.length) }]}
    />
  );

  const content = (
    <>
      <PageHeader
        meta={
          <>
            {source} · synced {health?.indexedAt ? `${day(health.indexedAt)}, ${time(health.indexedAt)}` : 'never'}
          </>
        }
        title="Overview"
        lede="BELLA read from the repo and checked by its own gate scripts, on this machine. What needs you is at the top."
      />

      {gate && firstFail ? (
        <div className="alert" role="status">
          <p>
            <strong>{firstFail.status === 'waiting' ? 'Waiting on you.' : 'Not ready to merge.'}</strong>{' '}
            {firstFail.status === 'waiting' ? `A fix for ${firstFail.name.toLowerCase()} is on its own branch, gate green: merge it or undo it.` : `${firstFail.failures?.[0] ?? firstFail.summary}. ${gate.summary}`}
          </p>
          <Button variant="primary" onClick={() => openReview(firstFail.id)}>
            {firstFail.status === 'waiting' ? 'Open the review card' : 'Review the fix'}
          </Button>
        </div>
      ) : null}

      <Section id="coverage" heading="Coverage" lede="What each component has, from BELLA's repo. Select a column to see what is missing.">
        <Coverage bella={bella} onOpenAtlas={onOpenAtlas} failing={failing} />
      </Section>

      <Section id="checks" heading="Checks" lede="BELLA's gate scripts and the Design System Bench, run against BELLA as its next commit would be. Select one to see its last run.">
        <Checks checks={checks} />
      </Section>

      {gaps.length ? (
        <Section id="failures" heading={`Gaps to close (${gaps.length})`} lede="Per component: what Coverage counts as missing, one row each.">
          <DataTable
            columns={[
              { key: 'name', label: 'Component' },
              { key: 'issue', label: 'What fails' },
            ]}
            rows={gaps.map((f, i) => {
              const at = f.indexOf(': ');
              return { id: i, name: f.slice(0, at), issue: f.slice(at + 2) };
            })}
            rowKey="id"
            caption="Gaps to close"
          />
        </Section>
      ) : null}

      <Section id="components" heading="Components" lede={failures.length ? '"Not covered" means no check exists yet; it is not counted as a failure.' : 'Every component passes.'}>
        <DataTable
          columns={COLUMNS}
          rows={bella.components}
          rowKey="id"
          caption="Per-component results"
          defaultSort={{ key: 'name', direction: 'ascending' }}
        />
      </Section>
      <Section
        id="readiness"
        heading="Readiness map"
        lede={`${measured.length} of ${stations.length} stations measured from the repo. The other ${stations.length - measured.length} are self-assessed, so they have no score.`}
      >
        <Card>
          <div className="readiness">
            <ScoreStrip
              name="BELLA"
              kind={`Mean of the ${measured.length} measured stations only`}
              score={overall}
              cells={stations.map((s) => ({ label: s.name, name: s.name, value: s.score }))}
            />
            <ScoreLegend />
            <details className="basis">
              <summary>How each station is scored</summary>
              <dl>
                {stations.map((s) => (
                  <div key={s.id}>
                    <dt>{s.name}</dt>
                    <dd>{s.basis}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        </Card>
      </Section>

      <Section
        id="usage"
        heading="Usage"
        lede="What OBI answered this week and where: from BELLA data, a local model, or the cloud. Tokens are counted by Ollama and Claude."
        actions={<ActionChip onClick={() => onRun('/usage')}>Ask OBI for /usage</ActionChip>}
      >
        <Usage />
      </Section>

    </>
  );

  // below 832px On this page lives in the Menu drawer
  return narrow ? content : <SidebarLayout aside={onThisPage} asideLabel="On this page">{content}</SidebarLayout>;
}
