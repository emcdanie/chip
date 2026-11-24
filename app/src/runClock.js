// Feedback and sense of time (23 Nov 2026): what the header indicator, the Activity list and the Work cards say
// about runs, from the run records alone (server/lib/runs.mjs). Pure, so both read one answer and a test can hold it.
// Elleta: "she can never tell whether something is running", so a quiet screen must never be ambiguous.

export const ACTIVE = ['starting', 'running', 'gate'];
const AFTER_WORKING = (r) => r.status === 'kept' && !!r.after?.startedAt && !r.after.endedAt && !r.afterError;
export const isGoing = (r) => ACTIVE.includes(r.status) || AFTER_WORKING(r);

/* the four plain steps of a CHIP run (workModel RUN_STEPS): sign-in check, the agent, the gate, her Accept. */
const AT = { starting: 0, login: 0, running: 1, gate: 2, passed: 3, kept: 4, failed: 1 };

/** How a run stands: done and total steps (the four plain ones), the step now, when it began and when its last step ended. */
export function standing(r) {
  const at = AT[r.status] ?? 0;
  return {
    done: Math.min(at, 4),
    total: 4,
    now: r.step ?? null,
    since: r.after?.startedAt && r.status === 'kept' ? r.after.startedAt : r.startedAt ?? null,
    lastStepAt: r.lastStepAt ?? r.steps?.at(-1)?.endedAt ?? null,
  };
}

/** The pill's state and its words, from every run: idle, running (one or many), or the one that just ended (within `fresh` ms). */
export function indicator(runs, { now = Date.now(), fresh = 10_000, seen = null } = {}) {
  const going = runs.filter(isGoing);
  if (going.length) {
    const r = going[0];
    return { state: 'running', count: going.length, id: r.id, title: r.title, ...standing(r) };
  }
  // a run that ended in the last `fresh` ms and that she has not yet looked at
  const ended = runs
    .filter((r) => r.endedAt && now - Date.parse(r.endedAt) < fresh && r.id !== seen)
    .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt))[0];
  if (ended) return { state: ended.status === 'failed' || ended.status === 'login' ? 'failed' : 'done', count: 1, id: ended.id, title: ended.title };
  return { state: 'idle', count: 0 };
}

/** Why a run did not land, in her words (24 Nov: her contrast run "failed on port 6006"): a held port is said as such. */
export function plainStop(error) {
  const e = String(error ?? '');
  if (/port \d+ is in use|EADDRINUSE|address already in use/i.test(e)) return 'Did not run: another program held the port it needs';
  return `Did not land: ${e.replace(/\.$/, '') || 'it stopped'}`;
}
/** Open runs first, the rest under Earlier (24 Nov): a run is open while it works, waits for her Accept, or is the
 *  newest of its job that did not land; closed, kept, undone, changed-nothing and replaced runs are earlier. */
export function splitRuns(runs = []) {
  const newer = (r) => runs.some((o) => o.title === r.title && Date.parse(o.startedAt) > Date.parse(r.startedAt));
  const open = (r) => isGoing(r) || r.status === 'passed' || (['failed', 'login'].includes(r.status) && !newer(r));
  return { open: runs.filter(open), earlier: runs.filter((r) => !open(r)) };
}

/** The header light with her Claude sessions in it (24 Nov: it said "Nothing running" while sessions ran): CHIP's runs
 *  going plus the sessions whose turn is open. One thing: its own name and step; more: how many. Nothing going: what the
 *  runs alone say (idle, or a run that just ended). Sessions come from /work/board (server/lib/lanes.mjs sessionTasks). */
export function lightOf(runs, sessions = [], opts = {}) {
  const base = indicator(runs, opts);
  const working = (sessions ?? []).filter((s) => s.working);
  const goingRuns = runs.filter(isGoing);
  const count = goingRuns.length + working.length;
  if (!working.length) return base;
  if (count > 1) return { state: 'running', count, title: `${count} running`, id: null };
  const s = working[0];
  const total = s.steps?.length ?? 0;
  const done = (s.steps ?? []).filter((x) => x.status === 'completed').length;
  return { state: 'running', count: 1, id: s.id, title: s.title, ...(total ? { done, total } : {}) };
}

/** "usually 4 to 7 min" from the server's range ({ n, minMs, maxMs }); nothing under three finished runs. */
export function usually(usual) {
  if (!usual || usual.minMs == null) return null;
  const lo = Math.max(1, Math.round(usual.minMs / 60_000));
  const hi = Math.max(1, Math.round(usual.maxMs / 60_000));
  return lo === hi ? `usually ${lo} min` : `usually ${lo} to ${hi} min`;
}

const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const took = (ms) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`);

/** One job for the Activity list, newest first: its state, one line saying when, how long and how far, or why it did not land. */
export function activityRow(r, usual) {
  const going = isGoing(r);
  const s = standing(r);
  const failed = r.status === 'failed' || r.status === 'login';
  const state = going ? 'running' : failed || r.status === 'nochange' ? 'failed' : 'done';
  // closed: it no longer asks anything of her (server/lib/runs.mjs closedWhy), so it never reads "waiting for your Accept"
  const line = going
    ? [`${clock(s.since)} to now`, `step ${Math.min(s.total, s.done + 1)} of ${s.total}`, usually(usual)].filter(Boolean).join(' · ')
    : r.status === 'closed'
      ? [clock(r.startedAt), `Closed: ${r.closedWhy ?? 'nothing is left to decide'}`].join(' · ')
    : failed
      ? [clock(r.startedAt), plainStop(r.error)].join(' · ')
      : r.status === 'nochange'
        ? [clock(r.startedAt), r.durationMs != null ? took(r.durationMs) : null, 'Did not land: it changed nothing'].filter(Boolean).join(' · ')
        : [clock(r.startedAt), r.durationMs != null ? took(r.durationMs) : null, { passed: 'waiting for your Accept', kept: 'kept, not merged', undone: 'undone', dry: 'stopped before the agent' }[r.status] ?? r.status].filter(Boolean).join(' · ');
  return { id: r.id, title: r.title ?? 'Run', state, line, stepDone: s.done, stepTotal: s.total, startedAt: r.startedAt };
}

/** Progress follows Vitaly Friedman (22 Nov): none under 1 s, a skeleton for 1 to 3, a determinate bar for 3 to 10, and for
 * long work a bar plus a steps line. `ms` is how long the wait has lasted. */
export function waitStage(ms) {
  if (ms < 1000) return 'none';
  if (ms < 3000) return 'skeleton';
  if (ms < 10_000) return 'bar';
  return 'steps';
}

/** What a fresh read found, in words: it either matched the last one or it did not. */
export const found = (before, after) => (before == null ? 'first read' : JSON.stringify(before) === JSON.stringify(after) ? 'nothing changed' : 'something changed');
export const tookWords = took;
export const clockWords = clock;

/** A quiet line for a live change (second pass M26: "updated 14:31, drift +1"): the figures that moved between two reads, each with its
 * sign, or null when none moved. `named` is [[label, before, after], ...]. */
export function changeNote(named) {
  const moved = named.filter(([, a, b]) => a != null && b != null && a !== b).map(([label, a, b]) => `${label} ${b - a > 0 ? '+' : '−'}${Math.abs(b - a)}`);
  return moved.length ? moved.join(', ') : null;
}
