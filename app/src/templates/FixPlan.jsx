// A finding ends in a plan to start (Elleta, 23 Nov: "give me the recommended fix and an Execute now, with detail on how long it
// will take, what I have to do, what I can expect ... then it shows in the Work board"; CHIP CLAUDE.md "Fix plans"). One
// shared body for the reading drawers of Drift, Contrast coverage and Checks: what the finding is, the recommended plan already
// written and editable, how long it takes, what she does and what to expect, then one Start.
// The actions sit in the drawer's footer, never in the content (23 Nov evening: "Drawer actions sit in the footer only, in
// one row"): useFixPlan returns the body for the drawer's content and the footer and footerNote for BELLA Drawer.
//   Start puts the plan on the Work board as a card in Next with its brief; nothing runs and nothing is paid.
//   Execute now opens the existing plan sheet (RunPlan), where the agent run still needs her approval.
// plan: { title, from, summary, scope?: { value, options: [{ value, label }], onChange }, brief, outline?, minutes?, youDo, expect }
// minutes: a measured line ("About 6 min: the average of your last 4 runs") or null; null says it is not measured yet.
import { useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Input from '@bella/components/Input/Input';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';
import { Facts, Inset, ListHead } from './ReadingDrawer.jsx';
import { planRun } from './RunPlan.jsx';

const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? 'CHIP did not answer');
    return j;
  });

/** "About 6 min: the average of your last 4 runs", from the runs CHIP kept; null when none finished. */
export function measuredMinutes(runs = []) {
  const took = runs
    .filter((r) => ['passed', 'kept'].includes(r.status) && r.startedAt && r.endedAt)
    .map((r) => (Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 60000)
    .filter((m) => m > 0 && m < 180);
  if (!took.length) return null;
  const avg = Math.max(1, Math.round(took.reduce((a, b) => a + b, 0) / took.length));
  return `About ${avg} min: the average of your last ${took.length} ${took.length === 1 ? 'run' : 'runs'}`;
}

export function useFixPlan(plan, onBefore) {
  const [brief, setBrief] = useState(plan?.brief ?? '');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  // read first, edit on request (second-pass review M27: a read-only plan view wherever a plan can start; D4: the plan
  // was a 144px box to scroll inside)
  const [editing, setEditing] = useState(false);
  const [allSteps, setAllSteps] = useState(false);
  // choosing a scope writes a new plan; her edits are kept until she does
  useEffect(() => {
    setBrief(plan?.brief ?? '');
    setDone(null);
    setEditing(false);
  }, [plan?.brief]);
  if (!plan) return { body: null, footer: undefined, footerNote: undefined };
  const lines = brief.split('\n').map((l) => l.trim()).filter(Boolean);
  const lead = lines[0]?.startsWith('- ') ? null : lines[0];
  // a plan may give a short line per step for reading (plan.outline); the full brief is what Edit shows and what runs.
  // Her edits win: once the brief differs from the plan's, the read view shows her text.
  const steps = plan.outline && brief === plan.brief ? plan.outline : lines.slice(lead ? 1 : 0).map((l) => l.replace(/^- /, ''));
  const SHOWN = 7;
  const start = async () => {
    setBusy(true);
    try {
      await post('/work/ideas', { title: plan.title, brief, lane: 'next' });
      window.dispatchEvent(new Event('chip:changed'));
      setDone({ tone: 'success', text: 'On your Work board, in Next, with this plan. Nothing has run.' });
    } catch (e) {
      setDone({ tone: 'danger', text: `Not added: ${e.message.replace(/\.$/, '')}.` });
    }
    setBusy(false);
  };
  const execute = () => {
    onBefore?.(); // the drawer closes first, so the plan sheet opens on top, never under it
    setTimeout(() => planRun({ title: plan.title, from: plan.from, brief }).catch(() => {}), 150);
  };
  const body = (
    <Inset gap={16}>
      <Flow gap={4} id="fix-plan">
        <TextStack title="Recommended plan" />
        <TextStack body={plan.summary} />
      </Flow>
      {plan.scope ? (
        <Flow direction="row" gap={8} wrap align="center" role="group" aria-label="What the plan covers">
          {plan.scope.options.map((o) => (
            <FilterChip key={o.value} size="compact" pressed={plan.scope.value === o.value} onClick={() => plan.scope.onChange(o.value)}>
              {o.label}
            </FilterChip>
          ))}
        </Flow>
      ) : null}
      {/* the steps' count and the toggles sit above the steps (ListHead), so Show fewer is where she pressed Show all */}
      <ListHead
        shown={editing ? steps.length : allSteps ? steps.length : Math.min(SHOWN, steps.length)}
        total={steps.length}
        unit="steps"
        open={!editing && allSteps}
        onToggle={editing ? undefined : () => setAllSteps(!allSteps)}
        extra={
          <Button variant="tertiary" size="sm" ariaExpanded={editing} onClick={() => setEditing(!editing)}>
            {editing ? 'Done editing' : 'Edit the plan'}
          </Button>
        }
      />
      {editing ? (
        <Input label="The plan: edit it" multiline value={brief} onChange={setBrief} />
      ) : (
        <Flow gap={8}>
          {lead ? <TextStack body={lead} /> : null}
          <Flow as="ol" gap={4} bullets aria-label="The plan's steps">
            {(allSteps ? steps : steps.slice(0, SHOWN)).map((t, i) => (
              <li key={i}>
                <TextStack body={t} />
              </li>
            ))}
          </Flow>
        </Flow>
      )}
      {/* one card she approves whole (template plan): three inline lead-ins, not three headings */}
      <Facts
        label="About this plan"
        facts={[
          { label: 'Takes', value: plan.minutes ?? 'Not measured yet: CHIP has no finished run to time. The first one sets it.' },
          { label: 'You do', value: plan.youDo },
          { label: 'Expect', value: plan.expect },
        ]}
      />
    </Inset>
  );
  // after Start the footer says what happened and its primary becomes See it on the board; a failure says why
  const footer = done?.tone === 'success' ? (
    <Button variant="primary" onClick={() => (onBefore?.(), (window.location.hash = '#/work'))}>
      See it on the board
    </Button>
  ) : (
    <>
      <Button variant="secondary" onClick={execute}>
        Execute now
      </Button>
      <Button variant="primary" busy={busy} onClick={start}>
        Start
      </Button>
    </>
  );
  // what the buttons do, before she presses them (second-pass review S17), on the buttons' row
  const footerNote = done ? done.text : 'Start puts it on Work; nothing runs yet.';
  return { body, footer, footerNote };
}
