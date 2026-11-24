// The plan before any agent run (Figma Flow 3, screens 4 and 5, 651:116769), for every page.
// Rule (22 Nov, after the click test started a paid run from one click): every button
// that starts an agent run opens its plan first, to approve, edit or close. A page
// never posts /runs itself: it calls planRun(), this drawer shows the steps, and only
// Approve plan sends the brief, marked approved (the server refuses a run without it).
// One host is mounted at the root (main.jsx), so the rule holds on every page.
import { useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import ReadingDrawer from './ReadingDrawer.jsx';
import ListRow from '@bella/components/ListRow/ListRow';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Toast from '@bella/components/Toast/Toast';
import Flow from './Flow.jsx';
import Toasts from './Toasts.jsx';

/** Asks for a run: opens its plan. Resolves with the run once she approves it,
 *  with null when she closes the plan; rejects when the run could not start.
 *  plan: { title, from, brief, steps?: [{ id, title, line }], subtitle?, summary? } */
export function planRun(plan) {
  return new Promise((resolve, reject) => window.dispatchEvent(new CustomEvent('chip:plan', { detail: { ...plan, resolve, reject } })));
}

/* A brief's own lines as steps, when the page has none of its own: "- " lines, else numbered ones. */
const stepsOf = (brief) => {
  const lines = String(brief).split('\n').map((l) => l.trim());
  const listed = lines.filter((l) => /^(-|\d+\.)\s/.test(l)).map((l) => l.replace(/^(-|\d+\.)\s+/, ''));
  return (listed.length ? listed : [lines.find(Boolean) ?? 'Do what the brief says']).map((t, i) => ({ id: `s${i}`, title: t.split(/(?<=\.)\s/)[0].slice(0, 120) }));
};

function RunPlan({ plan, onDone }) {
  const steps = plan.steps?.length ? plan.steps : stepsOf(plan.brief);
  const [brief, setBrief] = useState(plan.brief);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      const r = await fetch('/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief, title: plan.title, from: plan.from, approved: true }) });
      const run = await r.json().catch(() => ({}));
      if (!r.ok || run.error) throw new Error(run.error || 'CHIP did not answer');
      if (run.status === 'login' || run.status === 'failed') throw new Error(run.error || 'The agent could not start');
      window.dispatchEvent(new Event('chip:changed'));
      window.dispatchEvent(new CustomEvent('chip:run-started', { detail: { id: run.id } }));
      // what is true once it lands, kept by run id for the toast that says so (RunStatus.jsx)
      if (plan.doneSays) rememberDoneSays(run.id, plan.doneSays);
      onDone({ run, toast: { tone: 'success', text: `Running: ${plan.title}. Its card is on Work with its steps.`, card: run.id } });
    } catch (e) {
      e.shown = true; // the plan's own toast says it; the page adds nothing
      onDone({ error: e, toast: { tone: 'danger', text: `Not sent: ${e.message.replace(/\.$/, '')}.` } });
    }
  };
  return (
    <ReadingDrawer
      open
      onClose={() => (busy ? undefined : onDone({ closed: true }))}
      side="right"
      size="lg"
      label={plan.title}
      subtitle={plan.subtitle ?? `Plan ready · from ${plan.from ?? 'CHIP'}`}
      footerNote="Works on a copy; main is untouched."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done editing' : 'Edit plan'}
          </Button>
          <Button variant="primary" size="sm" busy={busy} onClick={busy ? undefined : approve}>
            {busy ? 'Sending…' : 'Approve plan'}
          </Button>
        </>
      }
    >
      <Flow gap={16}>
        <Flow inset>
          <SectionHead icon="WarningCircle" iconTone="warning" title={`${steps.length} ${steps.length === 1 ? 'step' : 'steps'}, then the gate`} showInfo={false} description={plan.summary ?? 'Nothing runs until you approve.'} />
        </Flow>
        {editing ? (
          <Flow inset>
            <Input multiline label="The brief the agent gets" value={brief} onChange={setBrief} />
          </Flow>
        ) : (
          <Flow as="ul" gap={0} aria-label={`The plan: ${plan.title}`}>
            {[...steps, { id: 'gate', title: 'Run the gate on the agent’s copy', line: 'Then a reviewer accepts or undoes it on Work' }].map((x, i, all) => (
              // one line per step, numbered, one divider (23 Nov evening: a list item in a drawer is one line). A Pin would sit
              // 7px under the title: ListRow centres a leading item on the row with its divider, not on the title line
              <ListRow key={x.id} layout="inline" divider={i < all.length - 1} title={`${i + 1}. ${x.title}`} description={x.line} />
            ))}
          </Flow>
        )}
      </Flow>
    </ReadingDrawer>
  );
}

/* "What is now true" per run, kept in this browser (a convenience: the toast falls back to the run's title) */
const DONE_KEY = 'chip-done-says';
export function rememberDoneSays(id, text) {
  try {
    const all = JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}');
    all[id] = text;
    localStorage.setItem(DONE_KEY, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-40))));
  } catch {}
}
export function doneSaysOf(id) {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}')[id] ?? null;
  } catch {
    return null;
  }
}

/** Mounted once at the root: shows the plan any page asked for, and its toast. */
export default function RunPlanHost() {
  const [plan, setPlan] = useState(null);
  const [toast, setToast] = useState(null);
  useEffect(() => {
    const on = (e) => setPlan((p) => (p ? (e.detail.resolve(null), p) : e.detail));
    window.addEventListener('chip:plan', on);
    return () => window.removeEventListener('chip:plan', on);
  }, []);
  const done = ({ run, error, closed, toast: t }) => {
    if (closed) plan.resolve(null);
    else if (error) plan.reject(error);
    else plan.resolve(run);
    setPlan(null);
    if (t) setToast(t);
  };
  return (
    <>
      {plan ? <RunPlan key={plan.title} plan={plan} onDone={done} /> : null}
      {toast ? (
        <Toasts>
          {/* Take me to the board opens Work on this run's card: scrolled to, outlined, opened (#/work?card=<id>, her test 24 Nov) */}
          <Toast tone={toast.tone} onClose={() => setToast(null)} action={toast.card ? { label: 'Take me to the board', onClick: () => ((window.location.hash = `#/work?card=${encodeURIComponent(toast.card)}`), setToast(null)) } : undefined}>
            {toast.text}
          </Toast>
        </Toasts>
      ) : null}
    </>
  );
}
