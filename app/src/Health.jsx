import React, { useEffect, useState } from 'react';
import { usageFigures } from './answers.js';
import Card from '@bella/components/Card/Card';
import Heading from '@bella/components/Heading/Heading';
import Eyebrow from '@bella/components/Eyebrow/Eyebrow';
import Stat from '@bella/components/Stat/Stat';
import ScoreStrip, { ScoreLegend } from '@bella/components/ScoreStrip/ScoreStrip';
import DataTable from '@bella/components/DataTable/DataTable';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Link from '@bella/components/Link/Link';

function Pill({ ok, word }) {
  return <StatusPill variant={ok ? 'success' : 'info'}>{word}</StatusPill>;
}

const yes = (v) => (v ? 1 : 0);

const COLUMNS = [
  { key: 'name', label: 'Component', sortable: true },
  { key: 'hasStory', label: 'Story', sortable: true, sortValue: (c) => yes(c.hasStory),
    render: (c) => <Pill ok={c.hasStory} word={c.hasStory ? 'present' : 'missing'} /> },
  { key: 'inDsds', label: 'DSDS', sortable: true, sortValue: (c) => yes(c.inDsds),
    render: (c) => <Pill ok={c.inDsds} word={c.inDsds ? 'present' : 'missing'} /> },
  { key: 'contract', label: 'Contract', sortable: true, sortValue: (c) => c.health.contract.status,
    render: (c) => <Pill ok={c.health.contract.status === 'pass'} word={c.health.contract.status} /> },
  { key: 'contrast', label: 'Contrast', sortable: true, sortValue: (c) => c.health.contrast.status,
    render: (c) => <Pill ok={c.health.contrast.status === 'pass'} word={c.health.contrast.status} /> },
  { key: 'parts', label: 'Anatomy parts', numeric: true, sortable: true, sortValue: (c) => c.parts.length,
    render: (c) => c.parts.length },
  { key: 'tokens', label: 'Tokens', numeric: true, sortable: true, sortValue: (c) => c.tokens.count,
    render: (c) => c.tokens.count },
];


const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const time = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// one stat tile: the figure, its change since the previous BELLA commit and
// the sparkline over the history (only when there are two real points)
function trendOf(history, key, unit = '') {
  const pts = history.filter((h) => h[key] != null);
  if (pts.length < 2) return {};
  const series = pts.map((h) => h[key]);
  const diff = series.at(-1) - series.at(-2);
  return {
    series,
    trend: diff > 0 ? 'up' : diff < 0 ? 'down' : undefined,
    delta: diff ? `${Math.abs(diff)}${unit} since the previous BELLA commit` : 'no change since the previous BELLA commit',
    seriesLabel: (label) => `${label}: ${series[0]}${unit} to ${series.at(-1)}${unit} over ${series.length} commits`,
  };
}

function Tile({ label, value, t, action }) {
  return (
    <div className="tile">
      <Stat label={label} value={value} delta={t.delta} trend={t.trend} series={t.series} seriesLabel={t.seriesLabel?.(label)} />
      {action}
    </div>
  );
}

// What stayed on this machine this week, from data/usage.jsonl (GET /usage).
function Usage({ onRun }) {
  const [u, setU] = useState(null);
  useEffect(() => {
    fetch('/usage')
      .then((r) => r.json())
      .then(setU)
      .catch(() => setU(false));
  }, []);
  if (u === false) return <p className="label">The CHIP server is not answering, so there is no usage to show.</p>;
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
      <div className="usage-actions">
        <ActionChip onClick={() => onRun('/usage')}>Ask OBI for /usage</ActionChip>
      </div>
    </Card>
  );
}

export default function Health({ bella, health, failures, onOpenAtlas, onAsk, onRun }) {
  if (!bella) return <p className="loading">Loading BELLA health…</p>;

  const history = bella.history ?? [];
  const pct = (n) => Math.round((n / bella.counts.components) * 100);
  const gateOk = bella.gates.contrastPairs.ok && bella.gates.contractParity.ok;
  // green or red per commit, from the gate scripts that existed at that commit
  const gateHistory = history.filter((h) => h.gate).map((h) => ({ ok: h.gate.ok }));
  const greenCommits = gateHistory.filter((h) => h.ok).length;
  const stations = bella.stations;
  const measured = stations.filter((s) => s.score !== null);
  const overall = measured.length
    ? Math.round(measured.reduce((n, s) => n + s.score, 0) / measured.length)
    : null;

  return (
    <div className="view">
      <section id="overview" aria-labelledby="overview-h" className="block">
        <Eyebrow>
          BELLA {bella.source.version} @ {bella.source.commit} · synced {health?.indexedAt ? `${day(health.indexedAt)}, ${time(health.indexedAt)}` : 'never'}
        </Eyebrow>
        <Heading tier="page" as="h1" id="overview-h">
          System health
        </Heading>
        <p className="block-lead">BELLA read from the repo, checked by its own gate scripts, on this machine.</p>
        <Card>
          <div className="hero">
            <div className="hero-head">
              <p className="chip-word">
                CHIP<span className="chip-dot" aria-hidden="true" />
              </p>
              <p className="hero-intro">
                Your design system, measured: {bella.counts.components} components,{' '}
                {failures.length ? <Link href="#failures">{failures.length} open failures</Link> : 'no open failures'},{' '}
                {health ? `${health.chunks.toLocaleString('en')} chunks of your docs` : 'your docs'} indexed for OBI.
              </p>
            </div>
            <div className="hero-stats">
              <Tile
                label="Components"
                value={bella.counts.components}
                t={trendOf(history, 'components')}
                action={<ActionChip onClick={() => onOpenAtlas()}>Open Atlas</ActionChip>}
              />
              <Tile
                label="Story coverage"
                value={`${pct(bella.counts.withStory)}%`}
                t={trendOf(history, 'storyCoverage', '%')}
                action={<ActionChip onClick={() => onAsk('Which components have no story?')}>Which have none?</ActionChip>}
              />
              <Tile
                label="Contract coverage"
                value={`${pct(bella.counts.withContract)}%`}
                t={trendOf(history, 'contractCoverage', '%')}
                action={<ActionChip onClick={() => onAsk('Which components have no contract?')}>Which have none?</ActionChip>}
              />
              <Tile
                label="Gate"
                value={gateOk ? 'Green' : 'Red'}
                t={{ series: gateHistory.length >= 2 ? gateHistory.map((h) => (h.ok ? 1 : 0)) : undefined, seriesLabel: () => `Gate over ${gateHistory.length} commits: ${greenCommits} green, ${gateHistory.length - greenCommits} red`, delta: `${greenCommits} of ${gateHistory.length} recent commits green` }}
                action={<ActionChip onClick={() => onRun('/audit')}>Run /audit</ActionChip>}
              />
            </div>
          </div>
        </Card>
      </section>

      <section id="readiness" aria-labelledby="readiness-h" className="block">
        <h2 id="readiness-h" className="block-title">Readiness map</h2>
        <p className="block-lead">
          The ten-station AI-readiness inspection, pointed at BELLA. {measured.length} of {stations.length} stations
          are measured from the repo; the rest are self-assessed until they have a source.
        </p>
        <Card>
          <div className="readiness">
            <ScoreStrip
              name="BELLA"
              kind={`Design system · overall is the mean of ${measured.length} measured`}
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
      </section>

      <section id="usage" aria-labelledby="usage-h" className="block">
        <h2 id="usage-h" className="block-title">Usage</h2>
        <p className="block-lead">What OBI answered this week and where: from BELLA data, a local model, or the cloud. Tokens are counted by Ollama and Claude.</p>
        <Usage onRun={onRun} />
      </section>

      {failures.length ? (
        <section id="failures" aria-labelledby="failures-h" className="block">
          <h2 id="failures-h" className="block-title">Open failures</h2>
          <DataTable
            columns={[
              { key: 'name', label: 'Component' },
              { key: 'issue', label: 'What fails' },
            ]}
            rows={failures.map((f, i) => {
              const at = f.indexOf(': ');
              return { id: i, name: f.slice(0, at), issue: f.slice(at + 2) };
            })}
            rowKey="id"
            caption={`${failures.length} open failures`}
          />
        </section>
      ) : null}

      <section id="components" aria-labelledby="components-h" className="block">
        <h2 id="components-h" className="block-title">Components</h2>
        <p className="block-lead">
          {failures.length ? `${failures.length} failing: ${failures.join(', ')}.` : 'Every component passes.'}
        </p>
        <DataTable
          columns={COLUMNS}
          rows={bella.components}
          rowKey="id"
          caption={`Per-component results, BELLA @ ${bella.source.commit}`}
          defaultSort={{ key: 'name', direction: 'ascending' }}
          maxHeight="calc(var(--spacing-20) * 6)"
        />
      </section>
    </div>
  );
}
