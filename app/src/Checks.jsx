// Overview's top half (phase 6 H): Coverage from bella.json, then the
// Checks list from GET /checks (BELLA's gate scripts and the bench, run in
// a clean copy of BELLA as its next commit would be). Every row reads
// Passed, Failed or Waiting on you in words and a shape, never colour
// alone; passing is green. A row opens in place: what passing means, what
// failed, Run now, and the review card when there is a change to review.
import React, { useEffect, useState } from 'react';
import Card from '@bella/components/Card/Card';
import Section from '@bella/components/Section/Section';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Button from '@bella/components/Button/Button';
import { openReview } from './ReviewSheet.jsx';

const JSON_HEADERS = { 'content-type': 'application/json' };
export const STATUS = {
  passed: { variant: 'success', word: '✓ Passed' },
  failed: { variant: 'danger', word: '✕ Failed' },
  waiting: { variant: 'attention', word: '● Waiting on you' },
  running: { variant: 'info', word: '◌ Running' },
  'not-run': { variant: 'neutral', word: '– Not run yet' },
};
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');
const dur = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : ms < 90000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60000)} min`);

/** GET /checks, refreshed while anything runs and whenever a review changes BELLA. */
export function useChecks() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const load = () =>
    fetch('/checks')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('chip:changed', on);
    return () => window.removeEventListener('chip:changed', on);
  }, []);
  const busy = data?.checks.some((c) => c.status === 'running') || data?.rerun?.length;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [busy]);
  return { data, error, reload: load };
}

const COVERAGE = [
  { key: 'withStory', label: 'Story', of: (c) => c.hasStory, why: 'a story renders it in the gate' },
  { key: 'withDocs', label: 'Docs', of: (c) => c.hasDocs, why: 'a guidance page in docs/components' },
  { key: 'withContract', label: 'Contract', of: (c) => c.hasContract, why: 'its block in tokens/component.json' },
  { key: 'inDsds', label: 'DSDS spec', of: (c) => c.inDsds, why: 'an entry in bella.dsds.yaml' },
  { key: 'contrast', label: 'Contrast', of: (c, failing) => c.health?.contrast?.status !== 'fail' && !(c.tokens?.list ?? []).some((t) => failing.includes(t)), why: 'no failing pair on the tokens it reads, in the last contrast check' },
  { key: 'a11y', label: 'A11y notes', of: (c) => c.hasA11yNotes, why: 'verified contrast and keyboard notes' },
];

/** Tokens named in the last contrast check's failures: one definition of a
 * contrast failure for Coverage, Gaps and each component's tests. */
export const failingTokens = (checks) => [...new Set((checks?.data?.checks.find((c) => c.id === 'contrast')?.failures ?? []).flatMap((f) => f.match(/--[\w-]+/g) ?? []))];

export function Coverage({ bella, onOpenAtlas, failing = [] }) {
  const [open, setOpen] = useState(null);
  if (!bella) return null;
  const all = bella.components;
  const cols = COVERAGE.map((c) => ({ ...c, missing: all.filter((x) => !c.of(x, failing)) }));
  const total = cols.reduce((s, c) => s + all.length - c.missing.length, 0);
  const shown = cols.find((c) => c.key === open);
  return (
    <Card>
      <div className="coverage">
        <p className="coverage-sum">
          <strong>
            {total} of {all.length * cols.length}
          </strong>{' '}
          checks pass across {all.length} components. {cols.filter((c) => c.missing.length).length ? `${cols.reduce((s, c) => s + c.missing.length, 0)} gaps to close.` : 'No gaps.'}
        </p>
        <ul className="coverage-cols">
          {cols.map((c) => {
            const ok = all.length - c.missing.length;
            return (
              <li key={c.key}>
                <button type="button" className="coverage-col" aria-expanded={open === c.key} onClick={() => setOpen(open === c.key ? null : c.key)} disabled={!c.missing.length}>
                  <span className="coverage-label">{c.label}</span>
                  <meter min={0} max={all.length} value={ok} low={Math.ceil(all.length * 0.9)} optimum={all.length} aria-label={`${c.label}: ${ok} of ${all.length}`} />
                  <span className="coverage-n">
                    {c.missing.length ? '!' : '✓'} {ok}/{all.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {shown ? (
          <div className="coverage-gap">
            <p>
              <strong>
                {shown.label}: {shown.missing.length} missing.
              </strong>{' '}
              Passing means {shown.why}.
            </p>
            <p className="chips">
              {shown.missing.map((x) => (
                <ActionChip key={x.id} onClick={() => onOpenAtlas(x.id)}>
                  {x.name}
                </ActionChip>
              ))}
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Row({ c, open, onToggle, onRun }) {
  const st = STATUS[c.status] ?? STATUS['not-run'];
  const reviewable = c.status === 'failed' || c.status === 'waiting' || !!c.improve;
  return (
    <li className="check" data-open={open || undefined}>
      <div className="check-row">
        <button type="button" className="check-name" aria-expanded={open} onClick={onToggle}>
          {c.name}
        </button>
        <StatusPill variant={st.variant}>{st.word}</StatusPill>
        <span className="check-result">{c.status === 'running' ? 'Running now…' : (c.status === 'failed' ? c.failures?.[0] : null) ?? c.summary ?? 'No result yet.'}</span>
        <span className="label check-when">
          {c.schedule} · last {when(c.ranAt)}
        </span>
      </div>
      {open ? (
        <div className="check-detail">
          <p>{c.plain}</p>
          {c.improve ? <p><strong>A change is ready:</strong> {c.improve}.</p> : null}
          {c.failures?.length > 1 || (c.failures?.length && c.status !== 'failed') ? (
            <ul className="review-list">
              {c.failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : null}
          {c.parts ? (
            <p className="label">
              {Object.entries(c.parts)
                .map(([k, v]) => `${k} ${v ?? 'n/a'}`)
                .join(' · ')}
            </p>
          ) : null}
          <p className="label">
            {c.commit ? (
              <>
                On <span className="mono">{c.commit}</span>
                {c.target?.kind === 'staged' ? ` plus the ${c.target.files} files staged in ~/DEV/bella` : ''}.{' '}
              </>
            ) : null}
            {c.ms != null ? `Took ${dur(c.ms)}. ` : ''}
            {c.cost}.
            {c.previous ? ` Before: ${c.previous.ok ? 'passed' : 'failed'}${c.previous.score != null ? ` (${c.previous.score})` : ''}, ${when(c.previous.ranAt)}.` : ''}
          </p>
          <div className="check-actions">
            {reviewable && c.id !== 'bench-agents' ? (
              <Button variant="primary" onClick={() => openReview(c.id)}>
                Open the review card
              </Button>
            ) : null}
            {!c.manual ? (
              <Button variant={reviewable ? 'secondary' : 'primary'} onClick={() => onRun(c.id)} disabled={c.status === 'running'}>
                {c.status === 'running' ? 'Running…' : `Run now${c.slow ? ' (about 3 min)' : ''}`}
              </Button>
            ) : (
              <p className="label">Spends plan usage, so CHIP never starts it: Needs you has the command when it is due.</p>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function Checks({ checks }) {
  const { data, error, reload } = checks;
  const [open, setOpen] = useState(null);
  const [runErr, setRunErr] = useState(null);
  if (error) return <p className="label">The checks could not be read (is the CHIP server running?).</p>;
  if (!data) return <p className="label">Reading the checks…</p>;
  const run = async (id) => {
    setRunErr(null);
    const r = await fetch(`/checks/${id}/run`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
    if (!r.ok) setRunErr((await r.json()).error);
    reload();
  };
  const gate = data.gate;
  const gst = STATUS[gate.status] ?? STATUS['not-run'];
  return (
    <>
      <Card>
        <div className="check-gate">
          <p className="check-gate-head">
            <span className="card-title">The gate</span>
            <StatusPill variant={gst.variant}>{gst.word}</StatusPill>
          </p>
          <p>{gate.summary}</p>
          <p className="label">
            Checked on {data.base} @ <span className="mono">{data.head}</span>
            {data.staged ? ` plus the ${data.staged.files} files staged in ~/DEV/bella: what the next commit would carry` : ''}.
          </p>
          <div className="check-actions">
            <Button variant="secondary" onClick={() => run('gate')}>
              Run the whole gate (about 3 min)
            </Button>
          </div>
        </div>
      </Card>
      {runErr ? (
        <p className="review-error" role="alert">
          {runErr}
        </p>
      ) : null}
      <ul className="checks">
        {data.checks.map((c) => (
          <Row key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} onRun={run} />
        ))}
      </ul>
    </>
  );
}

