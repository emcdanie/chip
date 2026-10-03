import React from 'react';
import Card from '@bella/components/Card/Card';
import Heading from '@bella/components/Heading/Heading';
import Eyebrow from '@bella/components/Eyebrow/Eyebrow';
import Stat from '@bella/components/Stat/Stat';
import ScoreStrip, { ScoreLegend } from '@bella/components/ScoreStrip/ScoreStrip';
import DataTable from '@bella/components/DataTable/DataTable';
import StatusPill from '@bella/components/StatusPill/StatusPill';

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

// Short cell labels for the ten stations; the full name is what gets spoken.
const SHORT = {
  coverage: 'Cov',
  'best-practices': 'Best',
  a11y: 'A11y',
  'shared-language': 'Lang',
  testing: 'Test',
  orchestration: 'Orch',
  governance: 'Gov',
  docs: 'Docs',
  'machine-readable': 'MRead',
  'agent-access': 'Agent',
};

const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const time = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function Health({ bella, health, failures }) {
  if (!bella) return <p className="loading">Loading BELLA health…</p>;

  const stations = bella.stations;
  const measured = stations.filter((s) => s.score !== null);
  const overall = measured.length
    ? Math.round(measured.reduce((n, s) => n + s.score, 0) / measured.length)
    : null;

  return (
    <div className="view">
      <section id="overview" aria-labelledby="overview-h" className="block">
        <Eyebrow>BELLA {bella.source.version} @ {bella.source.commit}</Eyebrow>
        <Heading tier="section" as="h1" id="overview-h">
          System health
        </Heading>
        <Card>
          <div className="stats">
            <Stat label="Components" value={bella.counts.components} delta={`${bella.counts.withStory} with a story`} />
            <Stat label="Failures" value={failures.length} delta="across story, docs, contract, contrast" />
            <Stat label="Indexed" value={health ? health.chunks.toLocaleString('en') : '…'} delta="search chunks" />
            <Stat
              label="Last sync"
              value={health?.indexedAt ? day(health.indexedAt) : health ? 'Never' : '…'}
              delta={health?.indexedAt ? `at ${time(health.indexedAt)}` : undefined}
            />
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
              cells={stations.map((s) => ({ label: SHORT[s.id] ?? s.name, name: s.name, value: s.score }))}
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
