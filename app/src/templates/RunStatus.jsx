// The running indicator (Elleta, 23 Nov 2026: "she can never tell whether something is running"; CLAUDE.md "Running work is
// always visible"). One pill, always there: Nothing running, or the run, its step and the time so far, then Done or Did not
// land for 10 s. It counts her Claude sessions whose turn is open as well as CHIP's own runs (24 Nov: it said "Nothing
// running" while sessions ran); one thing shows its name and step, more show how many. Clicking it opens the Sessions panel (WorkDock): her Claude sessions as a live tree and CHIP's runs, a
// Stop on the one running (CLAUDE.md "Sessions in CHIP like the Claude app's sidebar"; the Activity drawer it opened
// before is that panel's runs list now). It reads the run records the Work board reads (/runs), so the two cannot
// disagree. PLACEMENT is the header's: put <RunStatus /> in the top bar's actions; it brings its own toast.
import { useCallback, useEffect, useRef, useState } from 'react';
import Toast from '@bella/components/Toast/Toast';
import RunIndicator from '@bella/components/RunIndicator/RunIndicator';
import Toasts from './Toasts.jsx';
import { openRun } from '../Runs.jsx';
import { doneSaysOf } from './RunPlan.jsx';
import { confetti } from './confetti.js';
import { isGoing, lightOf } from '../runClock.js';
import { openWork } from './WorkDock.jsx';

/** The run records and the server's clock, kept fresh: every 2 s while one is going, every 10 s otherwise. */
function useRunClock() {
  const [read, setRead] = useState({ runs: [], clock: null });
  const load = useCallback(() => fetch('/runs').then((r) => r.json()).then((j) => setRead({ runs: j.runs ?? [], clock: j.clock ?? null })).catch(() => {}), []);
  const going = read.runs.some(isGoing);
  useEffect(() => {
    load();
    window.addEventListener('chip:run-started', load);
    window.addEventListener('chip:changed', load);
    return () => (window.removeEventListener('chip:run-started', load), window.removeEventListener('chip:changed', load));
  }, [load]);
  useEffect(() => {
    const t = setInterval(load, going ? 2000 : 10000);
    return () => clearInterval(t);
  }, [going, load]);
  return { ...read, going, reload: load };
}

/** Her Claude sessions, read every 15 s (the same records the Sessions panel and the Work board read). */
function useSessions() {
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    let on = true;
    const load = () => fetch('/work/sessions').then((r) => r.json()).then((j) => on && setSessions(j.sessions ?? [])).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => ((on = false), clearInterval(t));
  }, []);
  return sessions;
}

export default function RunStatus() {
  const { runs } = useRunClock();
  const sessions = useSessions();
  const [open, setOpen] = useState(false); // the Sessions panel, told by WorkDock
  const [seen, setSeen] = useState(null);
  const [toast, setToast] = useState(null);
  const [tick, setTick] = useState(0);
  const before = useRef(new Map());
  const first = useRef(true);

  // the finished state lasts 10 s, then the pill goes idle: tick once a second while a run has just ended
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // a run that was going and now is not: a toast that says how it ended and opens its card
  useEffect(() => {
    if (first.current) {
      first.current = false;
      runs.forEach((r) => before.current.set(r.id, isGoing(r)));
      return;
    }
    for (const r of runs) {
      if (before.current.get(r.id) && !isGoing(r)) {
        const bad = r.status === 'failed' || r.status === 'login' || r.status === 'nochange';
        // landed and passed: what is now true (the plan's own line, kept at Approve), and a short burst (her review, 24 Nov)
        const says = doneSaysOf(r.id);
        setToast({ id: r.id, tone: bad ? 'danger' : 'success', text: bad ? `Did not land: ${r.title}. ${r.status === 'nochange' ? 'It changed nothing.' : (r.error ?? '')}` : says ? `${says[0].toUpperCase()}${says.slice(1)}. ${r.title} passed its gate.` : `Done: ${r.title}.` });
        if (r.status === 'passed') confetti();
      }
      before.current.set(r.id, isGoing(r));
    }
  }, [runs]);

  // eslint-disable-next-line no-unused-expressions
  tick;
  const view = lightOf(runs, sessions, { seen });
  useEffect(() => {
    const on = (e) => {
      setOpen(!!e.detail?.open);
      // a finished run she has opened the panel on goes back to idle
      if (!e.detail?.open && view.state !== 'running') setSeen(view.id ?? null);
    };
    window.addEventListener('chip:work-open', on);
    return () => window.removeEventListener('chip:work-open', on);
  }, [view.state, view.id]);

  return (
    <>
      <RunIndicator
        state={view.state}
        count={view.count}
        title={view.title}
        stepDone={view.done}
        stepTotal={view.total}
        since={view.state === 'running' ? view.since : undefined}
        // a run that just ended ("Did not land: …", "Done: …") opens that run; otherwise the Sessions list (her review, 24 Nov)
        onOpen={() => (view.state !== 'running' && view.state !== 'idle' && view.id ? openRun(view.id) : openWork('sessions'))}
        expanded={open}
      />
      {toast ? (
        <Toasts>
          <Toast tone={toast.tone} onClose={() => setToast(null)} action={{ label: 'Open', onClick: () => (openRun(toast.id), setToast(null)) }}>
            {toast.text}
          </Toast>
        </Toasts>
      ) : null}
    </>
  );
}
