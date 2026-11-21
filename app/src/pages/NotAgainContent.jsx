// Not again · content: the code twin of the Figma slot fill (CHIP Dashboard
// 612:73919), on CHIP's own data (user test 21 Nov, item 5). The fix card
// follows the "Add contrast pair" run (/runs) on the parts the contrast check
// finds (/gaps); its buttons start, stop, accept or undo that run. The stats
// count CHIP's run log since Monday; with no run this week they are the Empty
// state (Elleta, 19 Nov). The Library holds the fixes CHIP can run.
// Built from BELLA parts and the template's Flow only; no page CSS.
//
// Gaps: the model menu (Auto, local first) waits
// for a Menu part, so a run goes to CHIP's default.
import { useEffect, useRef, useState } from 'react';
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Step from '@bella/components/Step/Step';
import Tag from '@bella/components/Tag/Tag';
import ListRow from '@bella/components/ListRow/ListRow';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import StatCard from '@bella/components/StatCard/StatCard';
import Toast from '@bella/components/Toast/Toast';
import Flow from '../templates/Flow.jsx';
import Toasts from '../templates/Toasts.jsx';
import useCached from '../templates/useCached.js';
import { FIX, LIBRARY, stateOf, stepsOf, useNotAgain } from './notAgainModel.js';
import { handOff } from './healthModel.js';

export const STATES = ['suggested', 'running', 'your-call', 'kept', 'gate-fails', 'library'];

/* Stats CHIP does not count yet: Elleta's words (19 Nov 2026), Belfast mode. */

/** States whose card holds the committing action: New task is white there (her y28 B). */
export const COMMITS = new Set(['suggested', 'gate-fails', 'your-call']);

const LEAD = { suggested: 'Suggested', running: 'Running', 'your-call': 'Maintainer’s call', kept: 'Kept', 'gate-fails': 'Stopped' };
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

/* Start, stop, accept or undo a run, with feedback on the button and a toast. */
function useAct(reload) {
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const act = async (key, fn, done) => {
    setBusy(key);
    try {
      await fn();
      setNotice({ tone: 'success', text: done });
      reload?.();
      window.dispatchEvent(new Event('chip:changed'));
    } catch (e) {
      setNotice({ tone: 'danger', text: `That didn’t go through: ${e.message}. Nothing changed.` });
    } finally {
      setBusy(null);
    }
  };
  const toast = notice ? (
    <Toasts>
      <Toast tone={notice.tone} onClose={() => setNotice(null)}>
        {notice.text}
      </Toast>
    </Toasts>
  ) : null;
  return { busy, act, toast };
}
const post = async (url) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'CHIP did not answer');
  return d;
};
const start = (check, parts, name) => handOff({ id: check, title: check, missing: parts, action: name });

function FixCard({ state, data, busy, act }) {
  // a Steps row (her 21 Nov pick, question 4 A) wherever the card has room for four steps side by side
  // (150 each); stacked below that. Measured on the card, not the window, so 1100 gets the row.
  const [narrow, setNarrow] = useState(true);
  const stepsBox = useRef(null);
  useEffect(() => {
    const el = stepsBox.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 600));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const { parts, pairable, run } = data;
  // n: the parts with no pair; p: those with colours of their own, the only ones the fix can add a pair for
  const n = parts.length;
  const p = pairable.length;
  const runUrl = run ? `/runs/${encodeURIComponent(run.id)}` : null;
  const footer =
    state === 'your-call' ? (
      <Flow direction="row" gap={8} justify="end" wrap>
        <Button variant="secondary" disabled={!!busy} onClick={() => act('undo', () => post(`${runUrl}/undo`), `Undone: the branch ${run.branch} is gone.`)}>
          {busy === 'undo' ? 'Undoing…' : 'Undo'}
        </Button>
        <Button variant="primary" disabled={!!busy} onClick={() => act('keep', () => post(`${runUrl}/keep`), `Accepted: ${run.branch} is kept. Merging it is a maintainer’s step.`)}>
          {busy === 'keep' ? 'Accepting…' : 'Accept'}
        </Button>
      </Flow>
    ) : state === 'running' && run?.status !== 'gate' ? (
      <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => act('stop', () => post(`${runUrl}/stop`), 'Stopped. Nothing was kept.')}>
        {busy === 'stop' ? 'Stopping…' : 'Stop'}
      </Button>
    ) : (state === 'suggested' || state === 'gate-fails') && p ? (
      <Button variant="primary" size="sm" disabled={!!busy} onClick={() => act('run', () => start(FIX.check, pairable, FIX.name), `Sent to the agent: ${FIX.name} on ${plural(p, 'part')}. It shows here and on Work.`)}>
        {busy === 'run' ? 'Starting…' : state === 'gate-fails' ? 'Send back' : `Run on ${p}`}
      </Button>
    ) : undefined;
  if (state === 'suggested' && !n) return <EmptyState size="lane" mark="🎉" title="Every part has a pair" line="The contrast check finds nothing for this fix today." />;
  if (state === 'suggested' && !p)
    return <EmptyState size="lane" mark="🎉" title="Nothing to pair" line={`The ${plural(n, 'part')} with no pair ${n === 1 ? 'has' : 'have'} no colours of ${n === 1 ? 'its' : 'their'} own.`} />;
  const steps = stepsOf(state, p, run);
  return (
    // Figma's audited fix: the card's action sits in its footer, bottom right
    <Card footerAction={footer}>
      <Flow gap={8}>
        <SectionHead icon="Book" iconTone="info" title={`${LEAD[state]}: ${FIX.name}`} description={p ? `${plural(p, 'component')} with colours of ${p === 1 ? 'its' : 'their'} own ${p === 1 ? 'has' : 'have'} no declared pair` : 'The parts it fixed now have a pair'} />
        <Flow gap={16} ref={stepsBox}>
          {/* the parts as Tags (her 21 Nov pick, question 4 A), wrapping, never a clipped comma list */}
          {p ? (
            <Flow as="ul" direction="row" wrap gap={8} aria-label={`The ${plural(p, 'part')} it fixes`}>
              {pairable.map((name) => (
                <li key={name}>
                  <Tag>{name}</Tag>
                </li>
              ))}
            </Flow>
          ) : null}
          <Flow as="ol" direction={narrow ? 'column' : 'row'} gap={4} aria-label="How the fix runs">
            {steps.map((step, i) => (
              <Step key={step.title} layout={narrow ? 'vertical' : 'horizontal'} state={step.state} title={step.title} detail={step.detail} showConnector={i < steps.length - 1} />
            ))}
          </Flow>
        </Flow>
      </Flow>
    </Card>
  );
}

function Banner({ state, data, busy, act }) {
  if (state === 'gate-fails' || state === 'running' || state === 'your-call') return null;
  const n = data.parts.length;
  const p = data.pairable.length;
  if (state === 'kept' && data.run)
    return (
      <Notification
        tone="success"
        title="Kept"
        message={`${FIX.name}: ${data.run.branch} is kept. Logged in History.`}
        action={{ label: busy === 'undo' ? 'Undoing…' : 'Undo', onClick: () => act('undo', () => post(`/runs/${encodeURIComponent(data.run.id)}/undo`), `Undone: the branch ${data.run.branch} is gone.`) }}
      />
    );
  return (
    <Notification
      tone="info"
      title="What is Not again?"
      message={
        n
          ? `${plural(n, 'part')} ${n === 1 ? 'has' : 'have'} no contrast pair. ${p ? `This saved fix adds pairs for the ${p} with colours of their own.` : `None of them has colours of its own, so there is no pair to add.`} When a check fails, the agent repeats a saved fix and a reviewer only presses Accept.`
          : 'A saved fix: when a check fails, the agent repeats it and a reviewer only presses Accept.'
      }
    />
  );
}

/* CHIP's run log, this week: how many saved fixes ran and how many a maintainer kept. Only the runs of the
   fixes in the Library count, never every hand-off in the log; a run that found nothing to change is "no
   change", not "stopped" (data check, 22 Nov). A run still going, waiting at the end, or stopped is named once. */
const RUNNING = new Set(['starting', 'running', 'gate']);
const STOPPED = new Set(['failed', 'login']);
function useWeek() {
  const { data } = useCached(['/runs']);
  const runs = data?.[0]?.runs ?? [];
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const saved = (r) => LIBRARY.some((f) => String(r.title ?? '').startsWith(f.name));
  const week = runs.filter((r) => saved(r) && new Date(r.startedAt) >= monday);
  const count = (f) => week.filter((r) => f(r.status)).length;
  const last = week.reduce((a, r) => (a && new Date(a) > new Date(r.startedAt) ? a : r.startedAt), null);
  return {
    total: week.length,
    kept: count((x) => x === 'kept'),
    undone: count((x) => x === 'undone'),
    waiting: count((x) => x === 'passed'),
    running: count((x) => RUNNING.has(x)),
    stopped: count((x) => STOPPED.has(x)),
    nochange: count((x) => x === 'nochange'),
    last,
  };
}

const lastRun = (at) => {
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString() ? 'Last run today' : `Last run ${d.toLocaleDateString('en-GB', { weekday: 'long' })}`;
};

function Stats() {
  const w = useWeek();
  /* No run this week: the same Stat cards at zero, an empty bar and the footer
     saying why (StatCard chart="empty", her 21 Nov pick A). */
  if (w.total === 0)
    return (
      <>
        <Flow span={6} fill>
          <StatCard icon="ShieldCheck" tone="neutral" chart="empty" title="Runs this week" value={0} context="Saved fixes run since Monday" caption="Nothing run yet this week" href="#/history" />
        </Flow>
        <Flow span={6} fill>
          <StatCard icon="ShieldCheck" tone="neutral" chart="empty" title="Kept" value={0} context="Accept a fix and it lands here" caption="Undone runs stay in History" href="#/history" />
        </Flow>
      </>
    );
  // Figma names the one thing besides undone: running, else stopped, else waiting
  const besides = w.running ? `${w.running} running` : w.stopped ? `${w.stopped} stopped` : w.nochange ? `${w.nochange} made no change` : `${w.waiting} waiting on a maintainer`;
  return (
    <>
      <Flow span={6} fill>
        <StatCard icon="ShieldCheck" tone="neutral" chart="none" title="Runs this week" value={w.total} context="Saved fixes run since Monday" caption={lastRun(w.last)} href="#/history" />
      </Flow>
      <Flow span={6} fill>
        <StatCard
          icon="ShieldCheck"
          tone="success"
          title="Kept"
          value={w.kept}
          unit={`of ${w.total}`}
          meter={{ fill: Math.round((w.kept / w.total) * 100), valueText: `${w.kept} of ${w.total}` }}
          context={`${w.undone} undone · ${besides}`}
          caption="Undone runs stay in History"
          href="#/history"
        />
      </Flow>
    </>
  );
}

/* Every saved fix CHIP can run: its trigger, how often it ran and was kept
   (the run log, the stats' source), and Run on the parts its check finds now. */
function Library({ data, busy, act }) {
  return (
    <Card>
      <Flow gap={24}>
        <SectionHead icon="Book" iconTone="info" title="Library" description="Fixes saved as steps" number={LIBRARY.length} words="fixes" />
        <Flow as="ul" gap={8} aria-label="Saved fixes">
          {LIBRARY.map((f) => {
            const mine = data.mine(f.name);
            const kept = mine.filter((r) => r.status === 'kept').length;
            // the contrast fix acts only on parts with colours of their own (nothing to pair otherwise)
            const parts = f.check === FIX.check ? data.pairable : Object.keys(data.gaps[f.check] ?? {});
            const ran = mine.length ? `${plural(mine.length, 'run')} · ${kept} kept` : 'Not run yet';
            return (
              <ListRow
                key={f.name}
                layout="stacked"
                title={f.name}
                description={`When: ${f.trigger} · ${ran}${parts.length ? '' : ' · nothing to fix now'}`}
                actionButton={
                  parts.length ? (
                    <Button variant="secondary" ariaLabel={`Run ${f.name} on ${plural(parts.length, 'part')}`} disabled={!!busy} onClick={() => act(f.name, () => start(f.check, parts, f.name), `Sent to the agent: ${f.name} on ${plural(parts.length, 'part')}. Its card is on Work.`)}>
                      {busy === f.name ? 'Starting…' : 'Run'}
                    </Button>
                  ) : undefined
                }
              />
            );
          })}
        </Flow>
      </Flow>
    </Card>
  );
}

/** state: forces one of Figma's states (stories); the page reads it from the fix's run. */
export default function NotAgainContent({ state: forced, tab = 'flow' }) {
  const data = useNotAgain();
  const { busy, act, toast } = useAct(data.reload);
  if (!data.parts) return data.error ? <EmptyState size="lane" title="Not again isn’t answering" line="CHIP couldn’t read its checks just now. Refresh and I’ll try again." /> : <EmptyState size="lane" mark="⏳" title="Reading the fix" line="Fetching its parts and runs." />;
  if (tab === 'library' || forced === 'library')
    return (
      <>
        <Library data={data} busy={busy} act={act} />
        {toast}
      </>
    );
  const state = forced ?? stateOf(data.run);
  return (
    <>
      <Banner state={state} data={data} busy={busy} act={act} />
      <FixCard state={state} data={data} busy={busy} act={act} />
      <Stats />
      {toast}
    </>
  );
}

/** The live state, for the page's header button (New task is white while the card commits). */
export function useNotAgainState() {
  const data = useNotAgain();
  return data.parts ? stateOf(data.run) : 'suggested';
}
