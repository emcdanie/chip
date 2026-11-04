// BELLA's checks, from GET /checks: the gate scripts and the bench, run in a
// clean copy of BELLA as its next commit would be. Overview lists them; a
// row opens CheckSheet: what passing means, what failed, Run now, and the
// review card when there is a change to review.
import React, { useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import { Sheet, StatusPill } from './kit/index.jsx';
import { openReview } from './ReviewSheet.jsx';

const JSON_HEADERS = { 'content-type': 'application/json' };
// one word per state, the mark from the kit pill's tone
export const STATUS = {
  passed: { tone: 'pass', word: 'Passed' },
  failed: { tone: 'fail', word: 'Failed' },
  waiting: { tone: 'needs', word: 'Waiting on you' },
  running: { tone: 'neutral', word: 'Running' },
  'not-run': { tone: 'neutral', word: 'Not run yet' },
};
export const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');
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
  const run = async (id) => {
    const r = await fetch(`/checks/${id}/run`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
    const j = r.ok ? null : await r.json();
    load();
    return j?.error ?? null;
  };
  return { data, error, reload: load, run };
}

/** Tokens named in the last contrast check's failures: one definition of a
 * contrast failure for Coverage, Gaps and each component's tests. */
// the first token in a failure line is the one judged ("wash vs the page":
// the wash fails, not the page)
export const failingTokens = (checks) => [...new Set((checks?.data?.checks.find((c) => c.id === 'contrast')?.failures ?? []).map((f) => f.match(/--[\w-]+/)?.[0]).filter(Boolean))];

/** One check in the sheet: what it means, what it found, and what you can do. */
export function CheckSheet({ c, onClose, run }) {
  const [err, setErr] = useState(null);
  useEffect(() => setErr(null), [c?.id]);
  const st = STATUS[c?.status] ?? STATUS['not-run'];
  const reviewable = c && (c.status === 'failed' || c.status === 'waiting' || !!c.improve) && c.id !== 'bench-agents';
  const runIt = async () => setErr(await run(c.id));
  return (
    <Sheet
      open={!!c}
      title={c?.name ?? ''}
      onClose={onClose}
      footer={
        c && (
          <>
            {reviewable ? (
              <Button variant="primary" onClick={() => openReview(c.id)}>
                Open the review card
              </Button>
            ) : null}
            {!c.manual ? (
              <Button variant={reviewable ? 'secondary' : 'primary'} onClick={runIt} disabled={c.status === 'running'}>
                {c.status === 'running' ? 'Running…' : `Run now${c.slow ? ' (about 3 min)' : ''}`}
              </Button>
            ) : null}
          </>
        )
      }
    >
      {c ? (
        <>
          <p>
            <StatusPill tone={st.tone}>{st.word}</StatusPill>
          </p>
          <p>{c.plain}</p>
          {c.improve ? (
            <p>
              <b>A change is ready:</b> {c.improve}.
            </p>
          ) : null}
          {c.failures?.length ? (
            <>
              <h3>{c.status === 'failed' ? 'What failed' : 'Findings'}</h3>
              <ul className="sheet-list">
                {c.failures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          ) : null}
          <dl>
            <dt>Last result</dt>
            <dd>{c.summary ?? 'No result yet.'}</dd>
            <dt>Ran</dt>
            <dd>
              {when(c.ranAt)}
              {c.ms != null ? `, took ${dur(c.ms)}` : ''}
            </dd>
            {c.commit ? (
              <>
                <dt>On</dt>
                <dd>
                  <code>{c.commit}</code>
                  {c.target?.kind === 'staged' ? ` plus the ${c.target.files} files staged in ~/DEV/bella` : ''}
                </dd>
              </>
            ) : null}
            <dt>Runs</dt>
            <dd>{c.schedule}</dd>
            <dt>Costs</dt>
            <dd>{c.cost}</dd>
            {c.parts ? (
              <>
                <dt>Parts</dt>
                <dd>
                  {Object.entries(c.parts)
                    .map(([k, v]) => `${k} ${v ?? 'n/a'}`)
                    .join(' · ')}
                </dd>
              </>
            ) : null}
            {c.previous ? (
              <>
                <dt>Before</dt>
                <dd>
                  {c.previous.ok ? 'Passed' : 'Failed'}
                  {c.previous.score != null ? ` (${c.previous.score})` : ''}, {when(c.previous.ranAt)}
                </dd>
              </>
            ) : null}
          </dl>
          {c.manual ? <p className="k-sub">Spends plan usage, so CHIP never starts it: Needs you has the command when it is due.</p> : null}
          {err ? (
            <p className="k-note" role="alert">
              {err}
            </p>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
