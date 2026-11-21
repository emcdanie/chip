// Not again's data: real, from CHIP (user test 21 Nov, item 5). The fix is
// "Add contrast pair" on BELLA's contrast check: the parts that miss a pair
// come from /gaps, and the fix's own run from /runs (its title starts with the
// fix's name). The card's state follows that run, so every word on it is
// measured. Words and layout follow Figma (CHIP Dashboard, Not again · content
// 612:73919); "the agent", never a model name; the role, never "you".
import { useMemo } from 'react';
import useCached from '../templates/useCached.js';

export const FIX = { name: 'Add contrast pair', check: 'contrast', trigger: 'Contrast check' };

/* Library: the saved fixes CHIP can run, each on a check it measures. Figma's
   other five (Draw in Figma, Polish pass, Interface critique, Pixel check in
   Figma, Lock then verify) have no check or brief in CHIP, so they wait. */
export const LIBRARY = [
  FIX,
  { name: 'Fill behaviour lines', check: 'contract', trigger: 'Contract check' },
  { name: 'Accessibility audit', check: 'a11y', trigger: 'a11y field empty' },
];

const RUNNING = new Set(['starting', 'running']);
/* The card's state from the fix's latest run (Figma's six states, library aside). */
export function stateOf(run) {
  if (!run || run.status === 'undone') return 'suggested';
  if (RUNNING.has(run.status) || run.status === 'gate') return 'running';
  if (run.status === 'passed') return 'your-call';
  if (run.status === 'kept') return 'kept';
  return 'gate-fails';
}

const hhmm = (t) => (t ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');

/* The four steps, Figma's words with the real count and the run's own step. n is the parts a pair can be added
   for (colours of their own), never the parts with nothing to pair. */
export function stepsOf(state, n, run) {
  const pairs = `${n} ${n === 1 ? 'pair' : 'pairs'}`;
  const found = { title: 'Trigger: Contrast check', detail: `Found ${n} ${n === 1 ? 'component' : 'components'} with colours and no pair.`, state: 'done' };
  const added = { title: 'The agent runs the script', detail: `Added ${pairs}, one commit.`, state: 'done' };
  const gateWaits = { title: 'The gate', detail: '5 checks must pass.', state: 'pending' };
  const keeper = { title: 'Maintainer', detail: 'Accept, or Undo.', state: 'pending' };
  if (state === 'suggested') return [{ ...found, detail: 'Finds a component with no pair declared.', state: 'pending' }, { ...added, detail: `Adds the ${pairs}, one commit.`, state: 'pending' }, gateWaits, keeper];
  if (state === 'running')
    return run?.status === 'gate'
      ? [found, added, { ...gateWaits, detail: 'Checking now.', state: 'current' }, keeper]
      : [found, { ...added, detail: run?.step ? `${run.step.replace(/\.$/, '')}.` : 'Working now.', state: 'current' }, gateWaits, keeper];
  if (state === 'your-call') return [found, added, { title: 'The gate', detail: 'The gate passed.', state: 'done' }, { ...keeper, detail: 'Waiting on a maintainer.', state: 'current' }];
  if (state === 'kept') return [found, added, { title: 'The gate', detail: 'The gate passed.', state: 'done' }, { ...keeper, detail: `Kept ${hhmm(run?.endedAt ?? run?.startedAt)}.`, state: 'done' }];
  // stopped by a maintainer: the agent's step says so and the gate never ran; else the gate refused it
  if (/^Stopped by/.test(run?.error ?? '')) return [found, { ...added, detail: `${run.error} before a commit.`, state: 'current' }, gateWaits, keeper];
  return [found, run?.diff ? added : { ...added, detail: 'Stopped before a commit.', state: 'done' }, { title: 'The gate', detail: run?.error ?? 'The gate refused the commit.', state: 'current' }, keeper];
}

/** The fix's parts (/gaps), its latest run and every run (/runs); `reload` reads them again. */
export function useNotAgain() {
  const { data, error, reload } = useCached(['/gaps', '/runs']);
  return useMemo(() => {
    if (!data) return { error, reload };
    const gaps = data[0]?.gaps ?? {};
    const runs = data[1]?.runs ?? [];
    const mine = (name) => runs.filter((r) => String(r.title ?? '').startsWith(name));
    const run = mine(FIX.name)[0] ?? null; // newest first
    const fixGaps = gaps[FIX.check] ?? {};
    // the parts with no pair, and of those the ones with colours of their own: only those can get a pair
    // (data check, 22 Nov: Icon, Columns and the rest draw in the text colour or none, so there is nothing to pair)
    const parts = Object.keys(fixGaps);
    const pairable = parts.filter((p) => !fixGaps[p]?.noSuggest);
    return { parts, pairable, gaps, runs, run, mine, reload };
  }, [data, error, reload]);
}
