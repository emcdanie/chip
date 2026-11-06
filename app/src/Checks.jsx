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

/** One short result for a check's row, from its own result; the sheet keeps the
 * full text. With no short form it says "See check" rather than guess. */
export function shortResult(c) {
  if (c.status === 'running') return 'Running now…';
  const f = c.status === 'failed' ? c.failures?.[0] : null;
  if (f) {
    const more = c.failures.length > 1 ? ` +${c.failures.length - 1} more` : '';
    const pair = f.match(/is ([\d.]+:1).*?needs ([\d.]+:1)/);
    if (pair) return `${pair[1]}, needs ${pair[2]}${more}`;
    const shot = f.match(/^([\w-]+): a picture is ([\d.]+%) different/);
    if (shot) return `${shot[1]} ${shot[2]} off baseline${more}`;
  }
  if (c.score != null) return `Score ${c.score}`;
  if (!c.summary) return 'No result yet.';
  const s = c.summary.replace(/\s*\(.*\)$/, '');
  return s.length <= 40 ? s : 'See check';
}

/** GET /checks, refreshed while anything runs and whenever a review changes BELLA. */
export function useChecks() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  // strict (Refresh) hands the error and the new data back to the caller
  const load = (strict) =>
    fetch('/checks')
      .then((r) => {
        if (!r.ok) throw new Error(`/checks answered ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setError(false);
        return d;
      })
      .catch((e) => {
        setError(true);
        if (strict) throw e;
      });
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
  return { data, error, reload: () => load(true), run };
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
