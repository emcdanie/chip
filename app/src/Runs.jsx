// The run report (4 Nov): "Fix in a session" hands the brief to Claude Code
// headless (POST /runs) and this sheet shows the outcome, not a conversation:
// a one-line verdict, what Claude did, its summary, the diff and the gate's
// answer, then Accept (keep the branch to merge) or Undo (delete it). When
// Claude can't start (not signed in), it says so and gives the one step.
// "Open in the terminal instead" types the same brief into claude in BELLA.
import React, { useCallback, useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import { Sheet, StatusPill } from './kit/index.jsx';
import { changed } from './ReviewSheet.jsx';

const JSON_HEADERS = { 'content-type': 'application/json' };
export const openRun = (id) => window.dispatchEvent(new CustomEvent('chip:run', { detail: { id } }));

/** Starts a run for a brief. Its progress shows in the work panel's Sessions
 * tree (chip:run-started), whose row opens this report. Returns the run or throws. */
export async function startRun(brief, title, from) {
  const r = await fetch('/runs', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ brief, title, from }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  window.dispatchEvent(new CustomEvent('chip:run-started', { detail: { id: j.id } }));
  return j;
}

/** Every run CHIP knows, kept fresh while one is going (the Sessions tree). */
export function useRuns(live) {
  return useRunsRead(live).runs;
}

// read: null until /runs first answers, false once it fails, so "no runs" and "couldn't read them" stay apart
export function useRunsRead(live) {
  const [runs, setRuns] = useState([]);
  const [read, setRead] = useState(null);
  const load = useCallback(
    () =>
      fetch('/runs')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
        .then((j) => (setRuns(j.runs ?? []), setRead(true)))
        .catch(() => setRead(false)),
    [],
  );
  useEffect(() => {
    load();
    window.addEventListener('chip:run-started', load);
    window.addEventListener('chip:changed', load);
    return () => (window.removeEventListener('chip:run-started', load), window.removeEventListener('chip:changed', load));
  }, [load]);
  const going = runs.some((r) => ['starting', 'running', 'gate'].includes(r.status));
  useEffect(() => {
    if (!going && !live) return;
    const t = setInterval(load, going ? 2000 : 10000);
    return () => clearInterval(t);
  }, [going, live, load]);
  return { runs, read };
}

// a run as the tree shows it: state, and one line
export const runState = (r) =>
  ({ starting: ['working', 'Starting'], running: ['working', 'Claude working'], gate: ['working', 'Gate running'], passed: ['you', 'Waiting on you'], login: ['failed', 'Can’t start'], failed: ['failed', 'Failed'], nochange: ['done', 'No change'], kept: ['done', 'Accepted'], undone: ['done', 'Undone'] })[r.status] ?? ['idle', r.status];
export const runLine = (r) =>
  r.status === 'passed'
    ? `Gate passed on ${r.branch}: Accept or Undo.`
    : ['starting', 'running', 'gate'].includes(r.status)
      ? `${r.step ?? 'Working'}${r.steps?.filter((s) => s.claude).length ? ` · ${r.steps.filter((s) => s.claude).at(-1).step}` : ''}`
      : r.status === 'failed' || r.status === 'login'
        ? r.error
        : r.status === 'kept'
          ? `${r.branch} waits for you to merge.`
          : r.status === 'nochange'
            ? 'Claude changed no file.'
            : `${r.branch} deleted.`;

// the verdict line and its pill, per state
const VERDICT = {
  starting: ['neutral', 'Starting', () => 'Getting a branch ready for Claude.'],
  running: ['needs', 'Claude is working', (r) => `Claude is making the change on ${r.branch}. You don’t need to do anything.`],
  gate: ['needs', 'Gate running', () => 'Claude is done. BELLA’s gate is checking the change (a few minutes).'],
  passed: ['pass', 'Gate passed', (r) => `Done, and the gate passed. ${r.branch} is ${r.sha}, one commit on ${r.base}. Accept keeps it for you to merge; Undo deletes it.`],
  kept: ['pass', 'Accepted', (r) => `Accepted. ${r.branch} (${r.sha}) waits for you to merge it into ${r.base}. CHIP never merges.`],
  undone: ['neutral', 'Undone', (r) => `Undone. ${r.branch} is deleted; ${r.base} never moved.`],
  nochange: ['needs', 'No change made', () => 'Claude finished without changing a file. Its summary says why.'],
  failed: ['fail', 'Not done', (r) => `${r.error}. Nothing changed in BELLA.`],
  login: ['fail', 'Claude can’t start', (r) => `${r.error} One step fixes it: run ${r.fix} in the terminal, then run this again.`],
};

export default function RunSheet() {
  const [id, setId] = useState(null);
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = (e) => (setId(e.detail.id), setRun(null), setError(null));
    window.addEventListener('chip:run', on);
    return () => window.removeEventListener('chip:run', on);
  }, []);
  const load = useCallback(() => (id ? fetch(`/runs/${id}`).then((r) => r.json()).then((j) => (j.error ? setError(j.error) : setRun(j))) : null), [id]);
  useEffect(() => {
    load();
  }, [load]);
  const live = ['starting', 'running', 'gate'].includes(run?.status);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [live, load]);
  useEffect(() => {
    if (run && !live) changed();
  }, [run?.status]);

  async function act(verb) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/runs/${id}/${verb}`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRun(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const again = () => startRun(run.brief, run.title).catch((e) => setError(e.message));
  const terminal = (command) => window.dispatchEvent(new CustomEvent('chip:terminal', { detail: { repo: 'bella', command } }));
  const [tone, word, say] = VERDICT[run?.status] ?? VERDICT.starting;
  const claudeSteps = (run?.steps ?? []).filter((s) => s.claude);
  const edits = claudeSteps.filter((s) => /^(Edited|Wrote)/.test(s.step));

  return (
    <Sheet
      open={!!id}
      onClose={() => setId(null)}
      title={run?.title ?? 'Starting the run…'}
      className="gr-sheet run-sheet"
      footer={
        run ? (
          <>
            {run.status === 'passed' ? (
              <Button variant="primary" onClick={() => act('keep')} disabled={busy}>
                Accept
              </Button>
            ) : null}
            {['passed', 'kept'].includes(run.status) ? (
              <Button onClick={() => act('undo')} disabled={busy}>
                Undo
              </Button>
            ) : null}
            {run.status === 'login' ? (
              <Button variant="primary" onClick={() => terminal(run.fix)}>
                Sign in to Claude in the terminal
              </Button>
            ) : null}
            {['failed', 'nochange', 'login', 'undone'].includes(run.status) ? <Button onClick={again}>Run it again</Button> : null}
            {run.status === 'running' ? (
              <Button onClick={() => act('stop')} disabled={busy}>
                Stop Claude
              </Button>
            ) : null}
            {!live ? (
              <Button variant="tertiary" onClick={() => terminal(run.terminal)}>
                Open in the terminal instead
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {!run ? (
        <p>{error ?? 'Starting…'}</p>
      ) : (
        <div className="gr run">
          <p className="run-verdict">
            <StatusPill tone={tone}>{word}</StatusPill> <b>{say(run)}</b>
          </p>
          {error ? (
            <p className="dn-caveat" role="alert">
              {error}
            </p>
          ) : null}
          {live ? (
            <ol className="gr-steps" aria-live="polite">
              {claudeSteps.slice(-6).map((s, i) => (
                <li key={i}>✓ {s.step}</li>
              ))}
              {run.step ? <li aria-current="step">● {run.step}…</li> : null}
            </ol>
          ) : null}
          {run.summary ? (
            <section className="run-sec">
              <h3>What Claude did</h3>
              <p className="run-summary">{run.summary.replace(/\*\*|`/g, '')}</p>
              {run.files.length ? <p className="gr-how">Files: {run.files.join(', ')}</p> : null}
            </section>
          ) : null}
          {run.diff ? (
            <Disclosure title="Show the diff" summary={`${run.files.length} file${run.files.length === 1 ? '' : 's'}`}>
              <pre className="dn-code">{run.diff}</pre>
            </Disclosure>
          ) : null}
          {run.gate && !run.gate.passed ? (
            <Disclosure title="What the gate said">
              {run.gate.blockers?.shots?.map((s) => (
                <img key={s.id} src={s.img} alt={`${s.id}: baseline, difference, now`} className="run-shot" />
              ))}
              <pre className="dn-code">{run.gate.log}</pre>
            </Disclosure>
          ) : null}
          {!live && claudeSteps.length ? (
            <Disclosure title="Every step Claude took" summary={`${claudeSteps.length} steps, ${edits.length} edit${edits.length === 1 ? '' : 's'}`}>
              <ol className="gr-steps">
                {claudeSteps.map((s, i) => (
                  <li key={i}>{s.step}</li>
                ))}
              </ol>
            </Disclosure>
          ) : null}
          <Disclosure title="The brief Claude got">
            <pre className="dn-code">{run.brief}</pre>
          </Disclosure>
          <p className="gr-how">
            Claude worked in its own copy of BELLA on {run.branch}; it can’t commit, push or merge. CHIP commits through BELLA’s gate. Your checkout in ~/DEV/bella isn’t touched.
            {run.cost != null ? ` Cost of this run: $${run.cost.toFixed(2)}.` : ''}
          </p>
        </div>
      )}
    </Sheet>
  );
}
