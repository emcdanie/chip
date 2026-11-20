// Work's drawer, in the new shell: what a board card opens, so no click on
// Work or Health leaves for the old app (user test 21 Nov, item 1). Built from
// published CHIP · Dashboard:
//   - a fix to review: Flow 12 "3 · A session's run: Accept or Undo"
//     (791:264033): title, who and when, the one-line outcome, the gate, the
//     change, and Undo then Accept at the bottom right. Undo is secondary,
//     never the primary blue; Accept keeps the branch (merging stays a
//     maintainer's own step, so the drawer says so).
//   - a check that failed: the same drawer, its why and the change CHIP
//     proposes, with Run the fix (CHIP makes the branch, through the gate).
//   - a pull or other command: Flow 12 "4 · Terminal" (791:264846), the
//     shell opened in its repo with the command typed, not run.
// Server calls are the old review sheet's (/review/:check, /runs/:id and
// their accept, keep and undo), so nothing about what a click does changes.
import { useEffect, useState } from 'react';
import Drawer from '@bella/components/Drawer/Drawer';
import Button from '@bella/components/Button/Button';
import CodeBlock from '@bella/components/CodeBlock/CodeBlock';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import TextStack from '@bella/components/TextStack/TextStack';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Flow from '../templates/Flow.jsx';
import { TermScreen } from '../Terminal.jsx';

const POST = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
// when it ran, with its day: "today 10:26", "20 Nov, 19:04"
const when = (t) => {
  if (!t) return null;
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `today ${time}` : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
};
// an agent's report reads as words: no markdown marks or code ticks, every sentence kept
const plainNotes = (t) => String(t ?? '').replace(/\*\*|`/g, '').replace(/^\s*-\s*/gm, '').replace(/\s+/g, ' ').trim();
const firstLine = (t) => plainNotes(t).split(/(?<=\.)\s/)[0];
/* Why the gate stopped a run, from its own log: how many test suites failed, in which files,
   and whether the agent touched them. Plain words, never the log. */
function gateReason(d) {
  const log = String(d.gate?.log ?? '');
  const files = [...new Set([...log.matchAll(/at (src\/[\w./-]+\.(?:tsx?|jsx?))/g)].map((m) => m[1]))];
  const n = Number(log.match(/Test Suites:\s*(\d+) failed/)?.[1] ?? 0);
  const what = n ? `${n} story ${n === 1 ? 'test' : 'tests'} ${/timeout/i.test(log) ? 'timed out' : 'failed'}` : 'a gate check failed';
  const touched = files.some((f) => (d.files ?? []).some((c) => String(c).endsWith(f)));
  return `BELLA’s gate stopped the commit: ${what}${files.length ? ` in ${files.join(', ')}` : ''}.${files.length && !touched ? ' The agent didn’t change that file.' : ''} Nothing was kept.`;
}
const said = async (r) => {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'CHIP did not answer');
  return d;
};

/* A fix waiting on a reviewer, from a check (review card) or an agent run. */
function useItem(item, tick) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!item || item.kind === 'terminal') return undefined;
    let live = true;
    setError(null);
    fetch(item.kind === 'run' ? `/runs/${encodeURIComponent(item.id)}` : `/review/${encodeURIComponent(item.check)}`)
      .then(said)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [item, tick]);
  return { data, error };
}

/* The drawer's words and actions for one fix, in one shape for checks and runs. */
function shapeOf(item, d) {
  if (item.kind === 'run') {
    const waiting = d.status === 'passed';
    const failed = d.status === 'failed' || d.status === 'login';
    return {
      title: d.title,
      status: ['Agent', d.from ? `from ${d.from}` : null, d.startedAt ? `ran ${when(d.startedAt)}` : null].filter(Boolean).join(' · '),
      // the outcome in one plain line: a gate stop names its tests and file; the agent's notes fold, whole
      outcome: failed ? (d.gate && d.gate.passed === false ? gateReason(d) : `${String(d.error ?? 'The run stopped before it finished').replace(/\.$/, '')}. Nothing was kept.`) : d.status === 'kept' ? 'Accepted: the branch is kept.' : d.status === 'passed' ? firstLine(d.summary) || 'The gate passed.' : d.step || 'Working.',
      gate: d.gate?.passed ? `Gate passed · ${d.sha ? '1 commit' : 'no commit'}` : null,
      notes: d.summary ? plainNotes(d.summary) : null,
      again: failed && d.brief ? { brief: d.brief, title: d.title, from: d.from } : null,
      diff: d.diff ?? null,
      branch: d.branch,
      can: waiting ? 'decide' : null,
      kept: d.status === 'kept',
    };
  }
  const decide = d.state === 'accepted' && !d.kept;
  return {
    title: d.title ?? d.check,
    status: ['From CHIP’s checks', d.ranAt ? `ran ${when(d.ranAt)}` : null].filter(Boolean).join(' · '),
    // CHIP never merges: the primary keeps the branch for a maintainer to merge (audit, 21 Nov)
    merge: decide,
    gate: d.state === 'accepted' ? `Gate passed · ${d.sha ? '1 commit' : 'no commit'}` : null,
    outcome: decide ? `The fix is on its own branch, ${d.branch}, and the gate passed.` : d.state === 'accepting' ? 'Making the fix on its own branch. About 3 minutes.' : d.failure ?? d.summary ?? null,
    why: d.why ?? null,
    change: d.change?.sentence ?? null,
    files: d.change?.files ?? [],
    branch: d.branch,
    can: decide ? 'decide' : (d.state === 'failed' || d.state === 'improve') && d.change ? 'run' : null,
    kept: !!d.kept,
    thisWill: d.thisWill,
  };
}

function FixDrawer({ item, onClose, onNotice, onChanged }) {
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(null);
  const { data, error } = useItem(item, tick);
  const shell = (label, status, body, footer) => (
    <Drawer open onClose={onClose} side="right" label={label} status={status} footer={footer}>
      {body}
    </Drawer>
  );
  if (error) return shell('Fix', undefined, <EmptyState size="lane" title="Couldn’t open this one" line="CHIP didn’t answer just now. Close it and try again." />);
  if (!data) return shell('Fix', undefined, <EmptyState size="lane" title="Opening it" line="Reading the fix from CHIP." />);
  const s = shapeOf(item, data);
  const act = async (verb, done) => {
    setBusy(verb);
    try {
      const base = item.kind === 'run' ? `/runs/${encodeURIComponent(item.id)}` : `/review/${encodeURIComponent(item.check)}`;
      await said(await fetch(`${base}/${verb}`, POST));
      onNotice({ tone: 'success', title: done.title, message: done.message });
      onChanged();
      setTick((t) => t + 1);
    } catch (e) {
      onNotice({ tone: 'danger', title: 'That didn’t go through', message: `${e.message}. Nothing changed.` });
    } finally {
      setBusy(null);
    }
  };
  // a failed run goes again with its own brief: a new run, its card in the Agent lane
  const again = async (a) => {
    setBusy('again');
    try {
      await said(await fetch('/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) }));
      onNotice({ tone: 'success', title: 'Started again', message: `${a.title}: the agent works on a new branch; its card is in the Agent lane.` });
      onChanged();
      onClose();
    } catch (e) {
      onNotice({ tone: 'danger', title: 'Not started', message: `${e.message}.` });
    } finally {
      setBusy(null);
    }
  };
  const footer =
    s.can === 'decide' ? (
      <Flow direction="row" justify="end" gap={8}>
        <Button variant="secondary" disabled={!!busy} onClick={() => act('undo', { title: 'Undone', message: `The branch ${s.branch} is gone; nothing else changed.` })}>
          {busy === 'undo' ? 'Undoing…' : 'Undo'}
        </Button>
        <Button variant="primary" disabled={!!busy} onClick={() => act('keep', { title: s.merge ? 'Kept for merging' : 'Accepted', message: `${s.branch} is kept. Merging it is a maintainer’s step in git.` })}>
          {busy === 'keep' ? (s.merge ? 'Keeping…' : 'Accepting…') : s.merge ? 'Keep branch' : 'Accept'}
        </Button>
      </Flow>
    ) : s.again ? (
      <Flow direction="row" justify="end" gap={8}>
        <Button variant="primary" disabled={!!busy} onClick={() => again(s.again)}>
          {busy === 'again' ? 'Starting…' : 'Run again'}
        </Button>
      </Flow>
    ) : s.can === 'run' ? (
      <Flow direction="row" justify="end" gap={8}>
        <Button variant="primary" disabled={!!busy} onClick={() => act('accept', { title: 'Started', message: 'CHIP is making the fix on its own branch. It shows here when the gate has passed.' })}>
          {busy === 'accept' ? 'Starting…' : 'Run the fix'}
        </Button>
      </Flow>
    ) : null;
  return shell(s.title, s.status, <FixBody s={s} />, footer ?? undefined);
}

function FixBody({ s }) {
  return (
    <Flow gap={24}>
      {s.outcome ? <TextStack title={s.outcome} subtitle={s.gate ?? undefined} /> : null}
      {s.kept ? <TextStack body={`Kept on ${s.branch}. Merging and pushing stay with a maintainer.`} /> : null}
      {s.why ? <TextStack title="Why" body={s.why} /> : null}
      {s.merge ? <TextStack body="CHIP doesn’t merge. Keep branch marks it ready for a maintainer to merge in git; Undo deletes it." /> : null}
      {s.notes ? (
        <Disclosure flush title="The agent’s notes">
          <TextStack body={s.notes} />
        </Disclosure>
      ) : null}
      {s.change ? <TextStack title="The change" body={s.change} subtitle={s.files?.length ? s.files.join(' · ') : undefined} /> : null}
      {s.diff ? <CodeBlock code={s.diff} language="diff" title={s.branch ?? 'The change'} copy /> : null}
      {s.can === 'run' && s.thisWill ? <TextStack subtitle={`Run the fix will ${s.thisWill}`} /> : null}
    </Flow>
  );
}

function TermDrawer({ item, onClose }) {
  const [status, setStatus] = useState('connecting');
  const t = { id: `drawer-${item.repo}`, repo: item.repo, kind: 'shell', typed: item.command };
  return (
    <Drawer open onClose={onClose} side="right" label="Terminal" status={`${item.repo} · ${item.title ?? 'a shell'}`}>
      <Flow gap={8}>
        <TextStack subtitle={status === 'open' ? `${item.command} is typed, not run. Press Return in the terminal to run it.` : status === 'closed' ? 'The shell stopped. Close this and open it again.' : 'Starting the shell…'} />
        <TermScreen t={t} active onStatus={setStatus} onActivity={() => {}} register={() => {}} />
      </Flow>
    </Drawer>
  );
}

/** item: { kind: 'review', check } | { kind: 'run', id } | { kind: 'terminal', repo, command, title }; null = closed. */
export default function WorkDrawer({ item, onClose, onNotice, onChanged }) {
  if (!item) return null;
  if (item.kind === 'terminal') return <TermDrawer key={`${item.repo}-${item.command}`} item={item} onClose={onClose} />;
  return <FixDrawer key={item.id ?? item.check} item={item} onClose={onClose} onNotice={onNotice} onChanged={onChanged} />;
}
