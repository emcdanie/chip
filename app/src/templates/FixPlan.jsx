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
import { Inset, ListHead, ReadingTable } from './ReadingDrawer.jsx';
import Marker from '@bella/components/Marker/Marker';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import { planRun } from './RunPlan.jsx';

const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? 'CHIP did not answer');
    return j;
  });

/* The keyword marker on the few words a skimmer needs (22 Nov rule): markLead marks a line's first count ("32 of 42
   parts"); markPhrase marks one given phrase where it appears. Never a title or a part name. */
export function markLead(text) {
  const m = /\d+(?: of \d+)?(?: [a-z]+)?/.exec(text ?? '');
  if (!m) return text;
  return <>{text.slice(0, m.index)}<Marker>{m[0]}</Marker>{text.slice(m.index + m[0].length)}</>;
}
export function markPhrase(text, phrase) {
  const i = (text ?? '').toLowerCase().indexOf(phrase);
  if (i < 0) return text;
  return <>{text.slice(0, i)}<Marker>{text.slice(i, i + phrase.length)}</Marker>{text.slice(i + phrase.length)}</>;
}

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
  // a step list of "Part: what to do" lines reads as a compact table (part, the fix, the fields), not a sentence per part
  // (23 Nov evening, her Drift drawer: "super text heavy"); any other list stays short bullets
  const parsed = steps.map((t, i) => {
    const m = /^([^:]{1,40}):\s*(.+)$/.exec(t);
    if (!m) return null;
    const n = /\bon (\d+) fields?\b/.exec(m[2]);
    const fix = m[2].replace(/\s*on \d+ fields?\b/, '').replace(/\.$/, '');
    return { key: String(i), part: m[1], fix: fix[0].toUpperCase() + fix.slice(1), fields: n ? Number(n[1]) : null };
  });
  const rowsOk = parsed.filter(Boolean);
  const asTable = !editing && rowsOk.length >= 3 && rowsOk.length >= steps.length * 0.8;
  const others = steps.filter((_, i) => !parsed[i]); // a closing instruction ("Follow BELLA AGENTS.md…"): one bullet under the table
  const edit = (
    <Button variant="tertiary" size="sm" ariaExpanded={editing} onClick={() => setEditing(!editing)}>
      {editing ? 'Done editing' : 'Edit the plan'}
    </Button>
  );
  const first = (plan.summary ?? '').match(/^.+?[.!?](?=\s|$)/)?.[0] ?? plan.summary;
  const [took, why] = (plan.minutes ?? '').split(/:\s*/);
  const body = (
    <Inset gap={16} data-glide="rows">
      {/* the plan's own heading, one step under the drawer's title (SectionHead card size, 16/600), its one line with the
          count marked; the rest of the summary is said by Expect below */}
      <Flow gap={4} id="fix-plan">
        <SectionHead size="card" titleLevel={3} title="Recommended plan" showInfo={false} />
        {first ? <TextStack body={markLead(first)} /> : null}
      </Flow>
      {plan.scope ? (
        <Flow direction="row" gap={8} swipe align="center" role="group" aria-label="What the plan covers">
          {plan.scope.options.map((o) => (
            <FilterChip key={o.value} size="compact" pressed={plan.scope.value === o.value} onClick={() => plan.scope.onChange(o.value)}>
              {o.label}
            </FilterChip>
          ))}
        </Flow>
      ) : null}
      {asTable ? (
        <ReadingTable
          caption="The plan's steps"
          unit="steps"
          density="compact"
          first={7}
          headExtra={edit}
          nested
          rows={rowsOk}
          columns={[
            { key: 'part', label: 'Part' },
            { key: 'fix', label: 'Fix', stackUnder: true },
            ...(rowsOk.some((r) => r.fields != null) ? [{ key: 'fields', label: 'Fields', numeric: true, render: (r) => r.fields ?? '—' }] : []),
          ]}
        />
      ) : null}
      {asTable && others.length ? (
        <Flow as="ul" gap={4} bullets aria-label="Also in the plan">
          {others.map((t) => (
            <li key={t}>
              <TextStack body={t} />
            </li>
          ))}
        </Flow>
      ) : null}
      {asTable ? null : (
        <>
          {/* the steps' count and the toggles sit above the steps (ListHead), so Show fewer is where she pressed Show all */}
          <ListHead
            shown={editing ? steps.length : allSteps ? steps.length : Math.min(SHOWN, steps.length)}
            total={steps.length}
            unit="steps"
            open={!editing && allSteps}
            onToggle={editing ? undefined : () => setAllSteps(!allSteps)}
            extra={edit}
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
        </>
      )}
      {/* three short bullets, the label first, the key words marked (23 Nov evening: "even the starts of Takes, You do and
          Expect could be bullets"; READ FIRST: short bullets with the few key words marked) */}
      <Flow as="ul" gap={8} bullets aria-label="About this plan">
        <li>
          <TextStack body={<><strong>Takes:</strong> {plan.minutes ? <><Marker>{took}</Marker>{why ? `, ${why[0].toLowerCase()}${why.slice(1)}` : ''}</> : <>not timed yet; <Marker>the first run</Marker> sets it.</>}</>} />
        </li>
        <li>
          <TextStack body={<><strong>You do:</strong> {plan.youDo ?? <>press <Marker>Start</Marker>, run it from the card, approve, then Accept or Undo.</>}</>} />
        </li>
        <li>
          <TextStack body={<><strong>Expect:</strong> {markPhrase(plan.expect ?? 'a card on Work; nothing is pushed.', 'nothing is pushed')}</>} />
        </li>
      </Flow>
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
