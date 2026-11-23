// A finding ends in a plan to start (Elleta, 23 Nov: "give me the recommended fix and an Execute now, with detail on how long it
// will take, what I have to do, what I can expect ... then it shows in the Work board"; CHIP CLAUDE.md "Fix plans"). One
// shared body for the reading drawers of Drift, Contrast coverage and Checks: what the finding is, the recommended plan already
// written and editable, how long it takes, what she does and what to expect, then one Start.
//   Start puts the plan on the Work board as a card in Next with its brief; nothing runs and nothing is paid.
//   Execute now opens the existing plan sheet (RunPlan), where the agent run still needs her approval.
// plan: { title, from, summary, scope?: { value, options: [{ value, label }], onChange }, brief, outline?, minutes?, youDo, expect }
// minutes: a measured line ("About 6 min: the average of your last 4 runs") or null; null says it is not measured yet.
import { useEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Input from '@bella/components/Input/Input';
import Notification from '@bella/components/Notification/Notification';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';
import { Facts, Inset } from './ReadingDrawer.jsx';
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

export default function FixPlan({ plan, onBefore }) {
  const [brief, setBrief] = useState(plan.brief);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  // read first, edit on request (second-pass review M27: a read-only plan view wherever a plan can start; D4: the plan
  // was a 144px box to scroll inside)
  const [editing, setEditing] = useState(false);
  const [allSteps, setAllSteps] = useState(false);
  const said = useRef(null);
  // choosing a scope writes a new plan; her edits are kept until she does
  useEffect(() => {
    setBrief(plan.brief);
    setDone(null);
    setEditing(false);
  }, [plan.brief]);
  // after Start the result and its "See it on the board" come into view
  useEffect(() => {
    if (done) requestAnimationFrame(() => said.current?.scrollIntoView({ block: 'nearest' }));
  }, [done]);
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
  return (
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
      <Flow direction="row" gap={8} justify="end" wrap>
        {!editing && steps.length > SHOWN ? (
          <Button variant="tertiary" size="sm" ariaExpanded={allSteps} onClick={() => setAllSteps(!allSteps)}>
            {allSteps ? 'Show fewer steps' : `Show all ${steps.length} steps`}
          </Button>
        ) : null}
        <Button variant="tertiary" size="sm" ariaExpanded={editing} onClick={() => setEditing(!editing)}>
          {editing ? 'Done editing' : 'Edit the plan'}
        </Button>
      </Flow>
      {/* one card she approves whole (template plan): three inline lead-ins, not three headings */}
      <Facts
        label="About this plan"
        facts={[
          { label: 'Takes', value: plan.minutes ?? 'Not measured yet: CHIP has no finished run to time. The first one sets it.' },
          { label: 'You do', value: plan.youDo },
          { label: 'Expect', value: plan.expect },
        ]}
      />
      {done ? (
        <div ref={said}>
        <Notification
          tone={done.tone}
          message={done.text}
          action={done.tone === 'success' ? { label: 'See it on the board', onClick: () => (onBefore?.(), (window.location.hash = '#/work')) } : undefined}
        />
        </div>
      ) : null}
      <Flow direction="row" gap={8} justify="end" wrap>
        <Button variant="secondary" onClick={execute}>
          Execute now
        </Button>
        <Button variant="primary" busy={busy} disabled={Boolean(done?.tone === 'success')} onClick={start}>
          Start
        </Button>
      </Flow>
      {/* what each button does, before she presses it (second-pass review S17) */}
      <TextStack subtitle="Start adds a card to Work, in Next; nothing runs. Execute now opens the run plan, and nothing runs until you approve it." />
    </Inset>
  );
}
