// The plan before any agent run (Figma Flow 3, screens 4 and 5, 651:116769), for every page.
// Rule (22 Nov, after the click test started a paid run from one click): every button
// that starts an agent run opens its plan first, to approve, edit or close. A page
// never posts /runs itself: it calls planRun(), this drawer shows the steps, and only
// Approve plan sends the brief, marked approved (the server refuses a run without it).
// One host is mounted at the root (main.jsx), so the rule holds on every page.
import { useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import Drawer from '@bella/components/Drawer/Drawer';
import ListRow from '@bella/components/ListRow/ListRow';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Tag from '@bella/components/Tag/Tag';
import TextStack from '@bella/components/TextStack/TextStack';
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
      onDone({ run, toast: { tone: 'success', text: `Sent to the agent: ${plan.title}. It works on a copy; its card is on Work, with Stop while it runs.` } });
    } catch (e) {
      e.shown = true; // the plan's own toast says it; the page adds nothing
      onDone({ error: e, toast: { tone: 'danger', text: `Not sent: ${e.message.replace(/\.$/, '')}.` } });
    }
  };
  return (
    <Drawer
      open
      onClose={() => (busy ? undefined : onDone({ closed: true }))}
      side="right"
      size="lg"
      label={plan.title}
      subtitle={plan.subtitle ?? `Plan ready · from ${plan.from ?? 'CHIP'}`}
      footer={
        <Flow gap={16}>
          <TextStack subtitle="The agent in CHIP · works on a copy, main untouched" />
          <Flow direction="row" gap={8} justify="end" wrap>
            <Button variant="secondary" size="sm" onClick={() => setEditing((e) => !e)}>
              {editing ? 'Done editing' : 'Edit plan'}
            </Button>
            <Button variant="primary" size="sm" busy={busy} onClick={busy ? undefined : approve}>
              {busy ? 'Sending…' : 'Approve plan'}
            </Button>
          </Flow>
        </Flow>
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
              <ListRow key={x.id} layout="stacked" statusBar={x.id === 'gate' ? 'neutral' : 'attention'} divider={i < all.length - 1} title={x.title} description={x.line} tag={<Tag variant="line">{`Step ${i + 1}`}</Tag>} />
            ))}
          </Flow>
        )}
      </Flow>
    </Drawer>
  );
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
          <Toast tone={toast.tone} onClose={() => setToast(null)}>
            {toast.text}
          </Toast>
        </Toasts>
      ) : null}
    </>
  );
}
