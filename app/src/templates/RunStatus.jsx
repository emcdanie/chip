// The running indicator (Elleta, 23 Nov 2026: "she can never tell whether something is running"; CLAUDE.md "Running work is
// always visible"). One pill, always there: Nothing running, or the run, its step and the time so far, then Done or Did not
// land for 10 s. Clicking it opens Activity in a reading drawer: every run going or finished today, a Stop on the one
// running. It reads the run records the Work board reads (/runs), so the two cannot disagree. PLACEMENT is the header's
// (page-chrome owns Screen.jsx): put <RunStatus /> in the top bar's actions; it brings its own drawer and toast.
import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Toast from '@bella/components/Toast/Toast';
import RunIndicator from '@bella/components/RunIndicator/RunIndicator';
import TimelineRow from '@bella/components/TimelineRow/TimelineRow';
import TextStack from '@bella/components/TextStack/TextStack';
import ReadingDrawer from './ReadingDrawer.jsx';
import Flow from './Flow.jsx';
import Toasts from './Toasts.jsx';
import { openRun } from '../Runs.jsx';
import Progress from '@bella/components/Progress/Progress';
import { activityRow, indicator, isGoing, usually, waitStage } from '../runClock.js';

const JSON_HEADERS = { 'content-type': 'application/json' };

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

export default function RunStatus() {
  const { runs, clock, going, reload } = useRunClock();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
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
        setToast({ id: r.id, tone: bad ? 'danger' : 'success', text: bad ? `Did not land: ${r.title}. ${r.status === 'nochange' ? 'It changed nothing.' : (r.error ?? '')}` : `Done: ${r.title}.` });
      }
      before.current.set(r.id, isGoing(r));
    }
  }, [runs]);

  // eslint-disable-next-line no-unused-expressions
  tick;
  const view = indicator(runs, { seen });
  const rows = runs.slice(0, 12).map((r) => activityRow(r, clock?.usual));
  const stop = async (id) => {
    setError(null);
    try {
      const r = await fetch(`/runs/${id}/stop`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Could not stop it');
      reload();
    } catch (e) {
      setError(e.message);
    }
  };
  const goingNow = runs.filter(isGoing);

  return (
    <>
      <RunIndicator
        state={view.state}
        count={view.count}
        title={view.title}
        stepDone={view.done}
        stepTotal={view.total}
        since={view.state === 'running' ? view.since : undefined}
        onOpen={() => setOpen((o) => !o)}
        expanded={open}
      />
      {open ? (
        <ReadingDrawer
          open
          onClose={() => (setOpen(false), view.state !== 'running' && setSeen(view.id ?? null))}
          label="Activity"
          status={going ? `${goingNow.length} running` : 'Nothing running'}
          lead={going ? `${goingNow[0].title} is going.${usually(clock?.usual) ? ` Runs like it are ${usually(clock.usual)}.` : ''}` : 'Everything CHIP ran, newest first. Open one to read how it ended.'}
        >
          <Flow gap={12} inset>
            {error ? <TextStack body={`Not stopped: ${error}.`} /> : null}
            {rows.length ? (
              rows.map((row) => (
                <Flow key={row.id} gap={8}>
                  <TimelineRow title={row.title} line={row.line} state={row.state} stepDone={row.stepDone} stepTotal={row.stepTotal} onOpen={() => openRun(row.id)} />
                  {row.state === 'running' && waitStage(Date.now() - Date.parse(row.startedAt)) !== 'none' ? (
                    // long work (Friedman, CLAUDE.md Progress rule): a bar and a steps line, never a bar alone
                    <Flow gap={8}>
                      <Progress label="Steps done" value={`${row.stepDone} of ${row.stepTotal}`} fill={(row.stepDone / row.stepTotal) * 100} />
                      <TextStack body={`${row.stepTotal - row.stepDone - 1} left after this step`} />
                    </Flow>
                  ) : null}
                  {row.state === 'running' ? (
                    <Flow direction="row" justify="end">
                      <Button variant="secondary" size="sm" onClick={() => stop(row.id)}>
                        Stop
                      </Button>
                    </Flow>
                  ) : null}
                </Flow>
              ))
            ) : (
              <TextStack title="Nothing has run yet" body="A run shows here the moment you approve its plan." />
            )}
          </Flow>
        </ReadingDrawer>
      ) : null}
      {toast ? (
        <Toasts>
          <Toast tone={toast.tone} onClose={() => setToast(null)} action={{ label: 'Open the card', onClick: () => (openRun(toast.id), setToast(null)) }}>
            {toast.text}
          </Toast>
        </Toasts>
      ) : null}
    </>
  );
}
