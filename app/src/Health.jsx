import React from 'react';
import Card from '@bella/components/Card/Card';
import Heading from '@bella/components/Heading/Heading';
import Eyebrow from '@bella/components/Eyebrow/Eyebrow';
import Stat from '@bella/components/Stat/Stat';
import ScoreStrip, { ScoreLegend } from '@bella/components/ScoreStrip/ScoreStrip';

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

      <section id="failures" aria-labelledby="failures-h" className="block">
        <h2 id="failures-h" className="block-title">Failures</h2>
        <Card>
          {failures.length ? (
            <ul className="failures">
              {failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            <p>No failures.</p>
          )}
        </Card>
      </section>
    </div>
  );
}
