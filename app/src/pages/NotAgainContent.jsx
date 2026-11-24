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
import StatusDot from '@bella/components/StatusDot/StatusDot';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import Toast from '@bella/components/Toast/Toast';
import Flow from '../templates/Flow.jsx';
import Toasts from '../templates/Toasts.jsx';
import useCached from '../templates/useCached.js';
import { FIX, LIBRARY, stateOf, stepsOf, useNotAgain } from './notAgainModel.js';
import { handOff } from './healthModel.js';
import { planRun } from '../templates/RunPlan.jsx';
import { markOf } from '../templates/marks.js';

export const STATES = ['suggested', 'running', 'your-call', 'kept', 'gate-fails', 'library'];

/* Stats CHIP does not count yet: Elleta's words (19 Nov 2026), Belfast mode. */

/** States whose card holds the committing action: New task is white there (her y28 B). */
export const COMMITS = new Set(['suggested', 'gate-fails', 'your-call']);

const LEAD = { suggested: 'Suggested', running: 'Running', 'your-call': 'Maintainer’s call', kept: 'Kept', 'gate-fails': 'Stopped' };
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const fixes = (n) => `${n} saved ${n === 1 ? 'fix' : 'fixes'}`;

/* Start, stop, accept or undo a run, with feedback on the button and a toast. */
function useAct(reload) {
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const act = async (key, fn, done) => {
    setBusy(key);
    try {
      // a run opens its plan first: closing it (null) changes nothing and says nothing; the plan toasts its own send
      const out = await fn();
      if (out === null) return;
      if (!out?.planned) setNotice({ tone: 'success', text: done });
      reload?.();
      window.dispatchEvent(new Event('chip:changed'));
    } catch (e) {
      if (!e.shown) setNotice({ tone: 'danger', text: `That didn’t go through: ${e.message}. Nothing changed.` });
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
const start = (check, parts, name) => handOff({ id: check, title: check, missing: parts, action: name }).then((run) => run && { planned: run });

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
  // the Suggested card draws only with parts lacking a pair (designed-features, Not again); with none there is nothing to
  // suggest, so nothing is drawn: never a loose "Nothing to pair" outside a card (review 24 Nov). The Library tab says it.
  if (state === 'suggested' && !p) return null;
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
  if (state === 'kept' && data.run)
    return (
      <Notification
        tone="success"
        title="Kept"
        message={`${FIX.name}: ${data.run.branch} is kept. Logged in History.`}
        action={{ label: busy === 'undo' ? 'Undoing…' : 'Undo', onClick: () => act('undo', () => post(`/runs/${encodeURIComponent(data.run.id)}/undo`), `Undone: the branch ${data.run.branch} is gone.`) }}
      />
    );
  // no explainer bar: "What keeps coming back" and "Closed loops" say what the page is in their own lines, so the list
  // leads (visual study, 23 Nov: the four-line "What is Not again?" notice was the first thing seen)
  return null;
}

/* Every saved fix CHIP can run: its trigger, how often it ran and was kept
   (the run log, the stats' source), and Run on the parts its check finds now. */
/* Run them all (review 24 Nov): one plan for every saved fix that has parts to work on now, one step per fix, opened to
   approve, edit or close first; nothing runs before. Each part's own brief comes from /gaps, as a single fix's run does. */
async function runAll(todo) {
  const r = await fetch('/gaps');
  const gaps = (await r.json().catch(() => ({}))).gaps ?? {};
  const lines = todo.flatMap(({ f, parts }) => [`${f.name} (${plural(parts.length, 'part')}):`, ...parts.map((n) => `- ${gaps[f.check]?.[n]?.brief ?? `${f.name}: ${n}`}`)]);
  const brief = [`Run ${fixes(todo.length)} from the Library, one after the other. For each part:`, ...lines, 'Change only what each line names. Ask before changing a token.'].join('\n');
  const steps = todo.map(({ f, parts }) => ({ id: f.check, title: f.name, line: `${plural(parts.length, 'part')}: ${parts.slice(0, 4).join(', ')}${parts.length > 4 ? ` and ${parts.length - 4} more` : ''}` }));
  const total = todo.reduce((s, x) => s + x.parts.length, 0);
  const run = await planRun({ title: `Run ${fixes(todo.length)}`, from: 'Not again', brief, steps, summary: `${fixes(todo.length)} on ${plural(total, 'part')}, one run, its card on Work` });
  return run ? { planned: run } : null;
}

function Library({ data, busy, act }) {
  // one log: every run the board shows is counted here, in its fix's row or under Other agent runs
  const other = data.runs.filter((r) => !LIBRARY.some((f) => String(r.title ?? '').startsWith(f.name)));
  // the contrast fix acts only on parts with colours of their own (nothing to pair otherwise)
  const partsOf = (f) => (f.check === FIX.check ? data.pairable : Object.keys(data.gaps[f.check] ?? {}));
  const todo = LIBRARY.map((f) => ({ f, parts: partsOf(f) })).filter((x) => x.parts.length);
  const allButton = (
    // the plan opens first, as Make it permanent's does; nothing runs before it is approved
    <Button variant="secondary" size="sm" disabled={!!busy || !todo.length} ariaLabel={todo.length ? `Run all ${fixes(todo.length)}` : 'Run all: nothing to fix now'} onClick={() => runAll(todo).then(() => data.reload?.()).catch(() => {})}>
      Run all
    </Button>
  );
  return (
    <Card>
      <Flow gap={24}>
        <SectionHead icon="Book" iconTone="info" title="Library" description={todo.length ? `Fixes saved as steps · ${todo.length} with parts to work on now` : 'Fixes saved as steps · nothing to fix now'} number={LIBRARY.length} words="fixes" action={allButton} />
        <Flow as="ul" gap={8} aria-label="Saved fixes">
          {LIBRARY.map((f) => {
            const mine = data.mine(f.name);
            const kept = mine.filter((r) => r.status === 'kept').length;
            const parts = partsOf(f);
            const ran = mine.length ? `${plural(mine.length, 'run')} · ${kept} kept` : 'Not run yet';
            return (
              <ListRow
                key={f.name}
                layout="stacked"
                title={f.name}
                description={`When: ${f.trigger} · ${ran}${parts.length ? '' : ' · nothing to fix now'}`}
                // every row has its button (review 24 Nov: Add contrast pair had none); with nothing to fix it is there, off,
                // and the line says why
                actionButton={
                  <Button variant="secondary" ariaLabel={parts.length ? `Run ${f.name} on ${plural(parts.length, 'part')}` : `Run ${f.name}: nothing to fix now`} disabled={!!busy || !parts.length} onClick={() => act(f.name, () => start(f.check, parts, f.name), `Sent to the agent: ${f.name} on ${plural(parts.length, 'part')}. Its card is on Work.`)}>
                    {busy === f.name ? 'Starting…' : parts.length ? `Run on ${parts.length}` : 'Run'}
                  </Button>
                }
              />
            );
          })}
          {other.length ? (
            <ListRow layout="stacked" title="Other agent runs" description={`${plural(other.length, 'run')} from other buttons · ${other.filter((r) => r.status === 'failed').length} stopped · ${other.filter((r) => r.status === 'kept').length} kept · in History`} />
          ) : null}
        </Flow>
      </Flow>
    </Card>
  );
}

/** state: forces one of Figma's states (stories); the page reads it from the fix's run. */
/* A, the page (Elleta, 22 Nov): what keeps coming back, ranked, last 14 days: how many times, when it last happened, which
   way it is going, and one next step. C, Closed loops, beside it as the proof: each permanent fix that was kept, when it
   landed, what changed, and how often it came back before and after. Read from the logs CHIP keeps
   (/not-again/recurring); "Too early" or "Not recorded" where nothing is kept, never a made-up number. */
const dayOf = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const TREND = { up: 'more often than the week before', down: 'less often than the week before', same: 'as often as the week before' };
/* Make it permanent: the plan opens first (approve, edit or close; nothing runs before). Approving starts the agent run
   and logs the fix as planned in the permanent-fix log; it becomes a Closed loop when she accepts the run and its commit
   lands (server/lib/runs.mjs keepRun, server/lib/fixes.mjs). */
async function makePermanent(r, reload) {
  const title = `Make permanent: ${r.name}`;
  const brief = [
    `The gate check "${r.name}" (${r.id}) failed ${r.count} ${r.count === 1 ? 'time' : 'times'} in the last 14 days. Make it stop failing for good. Steps:`,
    '- Read what the check reports and find why it fails, not only where.',
    '- Fix the cause in BELLA, not the symptom, and change only what that needs.',
    '- Run the check and the gate; it must pass before the commit.',
  ].join('\n');
  const steps = [
    { id: 'why', title: `Find why ${r.name} fails`, line: `Failed ${r.count} ${r.count === 1 ? 'time' : 'times'} in 14 days, last ${dayOf(r.last)}` },
    { id: 'fix', title: 'Fix the cause, change nothing else', line: 'On a copy; main is untouched' },
    { id: 'check', title: 'Run the check and the gate', line: 'It must pass before the commit' },
  ];
  const run = await planRun({ title, from: 'Not again', brief, steps, summary: `Closes "${r.name}" for good. Its before and after show in Closed loops once you accept it.` });
  if (!run) return null;
  await fetch('/not-again/fixes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: title, closes: r.name, check: r.id, runTitle: run.title ?? title }) });
  reload();
  return run;
}

function Recurring() {
  const { data, reload } = useCached(['/not-again/recurring'], { live: true });
  const d = data?.[0];
  // while the gate's 14 days are read, the two cards already stand at about their size, so the page doesn't jump
  // when the rows arrive (interaction study, 23 Nov: 0.20 layout shift on load). BELLA has no skeleton part yet
  // (a named gap); the lane-size empty state holds the space and says what is happening.
  if (!d) {
    return (
      <>
        <Flow span={12} fill>
          <Card>
            <Flow gap={16}>
              <SectionHead icon="Book" iconTone="info" title="What keeps coming back" description="The gate's failures in the last 14 days, most often first. Make it permanent opens a plan to approve first; nothing runs before." />
              <EmptyState size="lane" {...markOf('⏳')} title="Reading the last 14 days" line="The gate's failures, most often first." />
            </Flow>
          </Card>
        </Flow>
        <Flow span={12} fill>
          <Card>
            <Flow gap={16}>
              <SectionHead icon="CheckCircle" iconTone="success" title="Closed loops" description="Permanent fixes that landed; the tag counts failures in the 14 days before → after" />
              <EmptyState size="lane" {...markOf('⏳')} title="Reading the fixes that landed" line="Each with its before and after." />
            </Flow>
          </Card>
        </Flow>
      </>
    );
  }
  const rows = d.recurring ?? [];
  const loops = d.loops ?? [];
  const planned = d.planned ?? [];
  return (
    <>
      <Flow span={12} fill>
        <Card>
          <Flow gap={16}>
            <SectionHead icon="Book" iconTone="info" title="What keeps coming back" description="The gate's failures in the last 14 days, most often first. Make it permanent opens a plan to approve first; nothing runs before." number={rows.length || undefined} words={rows.length ? 'checks' : undefined} showInfo={Boolean(rows.length)} />
            {rows.length ? (
              <ListRowGroup ariaLabel="What keeps coming back">
                {rows.map((r) => (
                  <ListRow
                    key={r.id}
                    layout="stacked"
                    title={r.name}
                    statusDot={<StatusDot tone={r.trend === 'up' ? 'danger' : 'attention'} label={r.trend === 'up' ? 'Coming back more' : 'Still coming back'} showLabel={false} />}
                    description={`${r.trend === 'up' ? 'Coming back more' : 'Still coming back'} · ${r.count} ${r.count === 1 ? 'time' : 'times'} · last ${dayOf(r.last)} · ${TREND[r.trend]}`}
                    actionButton={
                      <Flow direction="row" gap={8} wrap>
                        <Button variant="tertiary" size="sm" ariaLabel={`History of ${r.name}`} onClick={() => (window.location.hash = `#/system/history?q=${encodeURIComponent(r.name)}`)}>
                          History
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => makePermanent(r, reload).catch(() => {})}>
                          Make it permanent
                        </Button>
                      </Flow>
                    }
                  />
                ))}
              </ListRowGroup>
            ) : (
              <EmptyState size="lane" {...markOf('✅')} title="Nothing came back" line="No gate check failed in the last 14 days." />
            )}
          </Flow>
        </Card>
      </Flow>
      <Flow span={12} fill>
        <Card>
          <Flow gap={16}>
            <SectionHead icon="CheckCircle" iconTone="success" title="Closed loops" description="Permanent fixes that landed; the tag counts failures in the 14 days before → after" number={loops.length || undefined} words={loops.length ? 'landed' : undefined} showInfo={Boolean(loops.length)} />
            {loops.length || planned.length ? (
              <ListRowGroup ariaLabel="Closed loops">
                {planned.map((p, i) => (
                  <ListRow key={`p-${p.planned}-${i}`} layout="stacked" title={p.kind} statusDot={<StatusDot tone="attention" label="Planned" showLabel={false} />} description={`Planned ${dayOf(p.planned)} · closes ${p.closes} · not landed yet`} />
                ))}
                {loops.slice(0, 8).map((l, i) => (
                  <ListRow
                    key={`${l.landed}-${i}`}
                    layout="stacked"
                    title={l.kind}
                    statusDot={<StatusDot tone="success" label="Landed" showLabel={false} />}
                    description={`Landed ${dayOf(l.landed)} (${l.commit ?? 'no commit'}) · closes ${l.closes}${l.changed ? ` · ${l.changed}` : ''}`}
                    tag={<Tag variant="line">{!l.measured ? 'Not recorded' : l.after == null ? 'Too early' : `${l.before} → ${l.after}`}</Tag>}
                  />
                ))}
              </ListRowGroup>
            ) : (
              <EmptyState size="lane" {...markOf('🕰️')} title="Nothing landed yet" line="Make a recurring check permanent, accept the fix, and its before and after show here." />
            )}
          </Flow>
        </Card>
      </Flow>
    </>
  );
}

export default function NotAgainContent({ state: forced, tab = 'flow' }) {
  const data = useNotAgain();
  const { busy, act, toast } = useAct(data.reload);
  if (!data.parts) return data.error ? <EmptyState size="lane" title="Not again isn’t answering" line="CHIP couldn’t read its checks just now. Refresh and I’ll try again." /> : <EmptyState size="lane" {...markOf('⏳')} title="Reading the fix" line="Fetching its parts and runs." />;
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
      <Recurring />
      <FixCard state={state} data={data} busy={busy} act={act} />
      {toast}
    </>
  );
}

/** The live state, for the page's header button (New task is white while the card commits). */
export function useNotAgainState() {
  const data = useNotAgain();
  return data.parts ? stateOf(data.run) : 'suggested';
}
