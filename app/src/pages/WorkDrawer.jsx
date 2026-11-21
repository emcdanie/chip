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
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import ListRow from '@bella/components/ListRow/ListRow';
import TourStep from '@bella/components/TourStep/TourStep';
import Flow from '../templates/Flow.jsx';
import { planRun } from '../templates/RunPlan.jsx';
import { Words, AnswerLines } from '../templates/useAsk.jsx';
import ActionChip from '@bella/components/ActionChip/ActionChip';
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
/* Why the gate stopped a run, from its own log, in the approved drawer's shape (Flow 12, 791:264033):
   one strong line, then the facts on one meta line (how many tests, which file, whether the agent
   touched it). Plain words, never the log. */
function gateReason(d) {
  const log = String(d.gate?.log ?? '');
  const files = [...new Set([...log.matchAll(/at (src\/[\w./-]+\.(?:tsx?|jsx?))/g)].map((m) => m[1]))];
  const n = Number(log.match(/Test Suites:\s*(\d+) failed/)?.[1] ?? 0);
  const what = n ? `${n} story ${n === 1 ? 'test' : 'tests'} ${/timeout/i.test(log) ? 'timed out' : 'failed'}` : 'a gate check failed';
  const touched = files.some((f) => (d.files ?? []).some((c) => String(c).endsWith(f)));
  return {
    line: '**BELLA’s gate stopped the commit.** Nothing was kept.',
    facts: [what, ...files.map((f) => f.split('/').pop()), files.length && !touched ? 'not a file the agent changed' : null].filter(Boolean).join(' · '),
  };
}
const said = async (r) => {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'CHIP did not answer');
  return d;
};

/* A unified diff, file by file: its path, new / deleted / changed, lines added and removed, and the
   hunks only (the git headers become the file row, so the code starts at the change). */
export function parseDiff(diff) {
  return String(diff ?? '')
    .split(/^(?=diff --git )/m)
    .filter((f) => f.startsWith('diff --git'))
    .map((f) => {
      const path = f.match(/^\+\+\+ b\/(.+)$/m)?.[1] ?? f.match(/^--- a\/(.+)$/m)?.[1] ?? f.match(/^diff --git a\/(\S+)/)?.[1];
      const body = f.slice(f.search(/^@@/m) >= 0 ? f.search(/^@@/m) : f.length).trimEnd();
      const lines = body.split('\n');
      const add = lines.filter((l) => l.startsWith('+')).length;
      const del = lines.filter((l) => l.startsWith('-')).length;
      const kind = /^new file mode/m.test(f) ? 'new' : /^deleted file mode/m.test(f) ? 'deleted' : 'changed';
      return { path, kind, add, del, body };
    });
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fileLine = (f) => (f.kind === 'new' ? `new · ${plural(f.add, 'line')}` : f.kind === 'deleted' ? `deleted · ${plural(f.del, 'line')}` : `${f.add} added · ${f.del} removed`);

/* "Help me understand" for a diff (her mock, 19 Nov): what each part of the change means, a step at a
   time, numbered. Only the parts this diff has. */
function diffSteps(f) {
  const hunk = f.body.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,(\d+))? @@/m);
  return [
    'The line above the code is the file the change is in. Each / is a folder inside the one before.',
    hunk ? `The line starting @@ says where the change sits: from line ${hunk[2]} of the file${hunk[3] ? `, ${hunk[3]} lines` : ''}.` : null,
    f.add ? `Lines starting + are added. They have the green band.` : null,
    f.del ? `Lines starting − are taken out. They have the red band.` : null,
    'Lines with neither mark are unchanged, there to show where it sits.',
  ].filter(Boolean);
}

function Tour({ steps, onClose }) {
  const [i, setI] = useState(0);
  const end = i === steps.length - 1;
  return (
    <TourStep number={i + 1} count={`${i + 1} of ${steps.length}`} isEnd={end} onBack={i ? () => setI(i - 1) : undefined} onNext={() => (end ? onClose() : setI(i + 1))} onClose={onClose}>
      {steps[i]}
    </TourStep>
  );
}

/* Code as proof (her 21 Nov: "apply the design from the help me understand and things like we did in
   the history"): one plain line on what the change shows, then the change folded: a row per file
   (name, new · 57 lines), each file's code with its added and removed bands, and Help me understand. */
function Change({ diff, proves, branch }) {
  const files = parseDiff(diff);
  const [tour, setTour] = useState(null);
  if (!files.length) return null;
  return (
    <Flow gap={8}>
      {/* Figma Flow 12 heads each drawer group with a Section head (parts-motion read 791:264033) */}
      <SectionHead title="What changed" titleLevel={3} />
      <TextStack body={proves} />
      {branch ? <TextStack subtitle={`Branch ${branch}`} /> : null}
      <Disclosure flush title="Show the change" summary={plural(files.length, 'file')}>
        <Flow gap={16}>
          <Flow as="ul" gap={4} aria-label="Files it changes">
            {files.map((f) => (
              <ListRow key={f.path} layout="stacked" title={f.path.split('/').pop()} description={fileLine(f)} />
            ))}
          </Flow>
          {files.map((f) => (
            <Flow key={f.path} gap={8}>
              <Flow direction="row">
                <Button variant="tertiary" size="sm" onClick={() => setTour(tour === f.path ? null : f.path)}>
                  Help me understand
                </Button>
              </Flow>
              {tour === f.path ? <Tour steps={diffSteps(f)} onClose={() => setTour(null)} /> : null}
              <CodeBlock code={f.body} language="diff" title={f.path} copy />
            </Flow>
          ))}
        </Flow>
      </Disclosure>
    </Flow>
  );
}

/* The agent's notes, in the chat answer's shape (her 21 Nov: "follow the pattern from history and
   chat"; Figma Flow 12 Agent notes): its first sentence as the verdict with the key phrase bold, at
   most three bullets (what it asks first, under its own bold label), a chip to say yes to it,
   and the whole note folded. Everything is the agent's own words, cut, never rewritten. */
function shapeNotes(t) {
  const text = String(t ?? '').trim();
  if (!text) return null;
  const [lead = '', ...rest] = text.split(/\n\s*\n/);
  const sentences = lead.replace(/`/g, '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const verdict = sentences[0] ?? '';
  const points = [];
  const questions = [];
  for (const block of rest) {
    for (const line of block.split('\n')) {
      const m = line.replace(/`/g, '').match(/^\s*-\s*\*\*(.+?)\*\*\s*(.*)$/);
      if (!m) continue;
      const label = m[1].replace(/[.:]$/, '');
      const first = m[2].split(/(?<=[.!?])\s+/)[0];
      if (/your say|want you|should I|\?\s*$/i.test(m[2])) questions.push({ label, line: first });
      else points.push(`**${label}:** ${first}`);
    }
  }
  const bold = verdict.length <= 40 ? `**${verdict}**` : verdict.replace(/^((?:\S+\s){0,3}\S+)/, '**$1**');
  const asks = questions.map((q) => `**${q.label}:** ${q.line}`);
  return { verdict: bold, bullets: [...asks, ...points, ...sentences.slice(1)].slice(0, 3), questions, all: text };
}

function Notes({ summary, onAnswer }) {
  const n = shapeNotes(summary);
  if (!n) return null;
  return (
    <Flow gap={8}>
      <SectionHead title="Agent notes" titleLevel={3} />
      <AnswerLines shaped={n} />
      {n.questions.length && onAnswer ? (
        <Flow direction="row" gap={8} wrap aria-label="Add what the agent asked">
          {n.questions.map((q) => (
            <ActionChip key={q.label} onClick={() => onAnswer(q)}>
              {n.questions.length === 1 ? 'Yes, add it' : `Add: ${q.label}`}
            </ActionChip>
          ))}
        </Flow>
      ) : null}
      <Disclosure flush title="All the agent’s notes">
        <Flow gap={8}>
          {n.all.split(/\n\s*\n/).map((para) => (
            <TextStack key={para} body={<Words text={para.replace(/^\s*-\s*/gm, '').replace(/\n/g, ' ')} />} />
          ))}
        </Flow>
      </Disclosure>
    </Flow>
  );
}

/* A fix waiting on a reviewer, from a check (review card) or an agent run. */
function useItem(item, tick) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!item || item.kind === 'terminal' || item.kind === 'push') return undefined;
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
      outcome: failed ? (d.gate && d.gate.passed === false ? gateReason(d).line : `**${String(d.error ?? 'The run stopped before it finished').replace(/\.$/, '')}.** Nothing was kept.`) : d.status === 'kept' ? '**Accepted:** the branch is kept.' : d.status === 'passed' ? `**${firstLine(d.summary) || 'The gate passed.'}**` : d.step || 'Working.',
      gate: d.gate?.passed ? `Gate passed · ${d.sha ? '1 commit' : 'no commit'}` : failed && d.gate && d.gate.passed === false ? gateReason(d).facts : null,
      notes: d.summary ?? null,
      // what the change shows, in one line: what the agent wrote and what the gate made of it
      proves: `The agent ${failed ? 'wrote' : 'made'} ${plural(parseDiff(d.diff).length, 'file')}${d.gate ? (d.gate.passed ? '; BELLA’s gate ran on them and passed.' : '; BELLA’s gate didn’t pass them, so none of it is kept.') : '.'}`,
      again: failed && d.brief ? { brief: d.brief, title: d.title, from: d.from } : null,
      diff: d.diff ?? null,
      branch: d.branch,
      can: waiting ? 'decide' : ['starting', 'running'].includes(d.status) ? 'stop' : null,
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
    outcome: decide ? `**The gate passed.** The fix is on its own branch, ${d.branch}.` : d.state === 'accepting' ? 'Making the fix on its own branch. About 3 minutes.' : d.failure ?? d.summary ?? null,
    why: d.why ?? null,
    change: d.change?.sentence ?? null,
    files: d.change?.files ?? [],
    branch: d.branch,
    can: decide ? 'decide' : (d.state === 'failed' || d.state === 'improve') && d.change ? 'run' : null,
    kept: !!d.kept,
    thisWill: d.thisWill,
  };
}

function FixDrawer({ item, onClose, onNotice, onChanged, onAccepted }) {
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(null);
  const { data, error } = useItem(item, tick);
  // a run that is going is read again every 3 s, so its step and its Stop stay current
  const going = item.kind === 'run' && ['starting', 'running', 'gate'].includes(data?.status);
  useEffect(() => {
    if (!going) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, [going]);
  const shell = (label, status, body, footer) => (
    <Drawer open onClose={onClose} side="right" size="lg" label={label} status={status} footer={footer}>
      {/* one left edge with the sheet's title (audit 4, item 5) */}
      <Flow inset>{body}</Flow>
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
      // Accept: the drawer closes and the card leaves the board (motion item 6)
      if (verb === 'keep' && onAccepted) return onAccepted();
      onChanged();
      setTick((t) => t + 1);
    } catch (e) {
      onNotice({ tone: 'danger', title: 'That didn’t go through', message: `${e.message}. Nothing changed.` });
    } finally {
      setBusy(null);
    }
  };
  // a failed run goes again with its own brief: its plan opens first (approve, edit or close), then a new run
  const again = async (a) => {
    setBusy('again');
    try {
      const run = await planRun({ ...a, subtitle: 'Run again · the same brief, on a new branch' });
      if (run) {
        onChanged();
        onClose();
      }
    } catch (e) {
      if (!e.shown) onNotice({ tone: 'danger', title: 'Not started', message: `${e.message}.` });
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
    ) : s.can === 'stop' ? (
      // a running run always has Stop: nothing is kept, the branch stays for a look
      <Flow direction="row" justify="end" gap={8}>
        <Button variant="secondary" disabled={!!busy} onClick={() => act('stop', { title: 'Stopped', message: `${s.title}: the agent stopped. Nothing was kept.` })}>
          {busy === 'stop' ? 'Stopping…' : 'Stop'}
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
  // Add it: a new run on the same brief with the agent's question and her answer added
  const answer = item.kind === 'run' && data.brief ? (q) => again({ title: `${data.title}: ${q.label}`, from: data.from, brief: `${data.brief}\n\n---\nThe last run asked: ${q.label}. ${q.line}\nElleta's answer: add it.` }) : undefined;
  return shell(s.title, s.status, <FixBody s={s} onAnswer={answer} />, footer ?? undefined);
}

/* The approved drawer's order (Flow 12, 791:264033): the outcome in one strong line with its facts
   under it, what changed, then the agent's notes. */
function FixBody({ s, onAnswer }) {
  return (
    <Flow gap={24}>
      {s.outcome ? (
        <Flow gap={4}>
          <TextStack body={<Words text={s.outcome} />} />
          {s.gate ? <TextStack subtitle={s.gate} /> : null}
        </Flow>
      ) : null}
      {s.kept ? <TextStack body={`Kept on ${s.branch}. Merging and pushing stay with a maintainer.`} /> : null}
      {s.why ? (
        <Flow gap={8}>
          <SectionHead title="Why" titleLevel={3} />
          <TextStack body={s.why} />
        </Flow>
      ) : null}
      {s.change ? (
        <Flow gap={8}>
          <SectionHead title="What changed" titleLevel={3} />
          <TextStack body={s.change} subtitle={s.files?.length ? s.files.join(' · ') : undefined} />
        </Flow>
      ) : null}
      {s.diff ? <Change diff={s.diff} proves={s.proves} branch={s.branch} /> : null}
      {s.notes ? <Notes summary={s.notes} onAnswer={onAnswer} /> : null}
      {s.merge ? <TextStack subtitle="CHIP doesn’t merge. Keep branch marks it ready for a maintainer to merge in git; Undo deletes it." /> : null}
      {s.can === 'run' && s.thisWill ? <TextStack subtitle={`Run the fix will ${s.thisWill}`} /> : null}
    </Flow>
  );
}

// CHIP never types a push: a push is outward-facing, so she types it herself (click test, 22 Nov)
const NO_TYPE = /\bgit\s+push\b/;

/* What a push would send (Needs you's push card): the branch, where it goes, each commit GitHub
   hasn't seen and the files. Open a shell gives a plain shell in that repo with nothing typed. */
function PushDrawer({ item, onClose }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [shell, setShell] = useState(false);
  const [status, setStatus] = useState('connecting');
  useEffect(() => {
    fetch(`/push/${encodeURIComponent(item.repo)}`)
      .then(said)
      .then(setP)
      .catch((e) => setError(e.message));
  }, [item.repo]);
  const n = p?.commits.length ?? 0;
  return (
    <Drawer
      open
      onClose={onClose}
      side="right"
      size="lg"
      label={p ? `Push ${p.branch}?` : 'Push'}
      status={p ? `${p.name} · ${n} ${n === 1 ? 'commit' : 'commits'} to ${p.upstream ?? 'nowhere yet'}` : undefined}
      footer={
        shell ? undefined : (
          <Flow direction="row" justify="end" gap={8}>
            <Button variant="secondary" disabled={!p} onClick={() => setShell(true)}>
              Open a shell
            </Button>
          </Flow>
        )
      }
    >
      <Flow inset gap={16}>
        {error ? <EmptyState size="lane" title="Couldn’t read it" line={`${error}. Close this and try again.`} /> : null}
        {!p && !error ? <EmptyState size="lane" title="Reading it" line="Asking git what a push would send." /> : null}
        {p ? (
          <>
            <TextStack body={`A push sends these ${n} ${n === 1 ? 'commit' : 'commits'} (${p.files} ${p.files === 1 ? 'file' : 'files'}) to GitHub, where other people see ${n === 1 ? 'it' : 'them'} and CI runs. CHIP doesn’t push: if you want it, type git push in a shell yourself.`} />
            <Flow as="ul" gap={0} aria-label="Commits a push would send">
              {p.commits.map((c, i) => (
                <ListRow key={c.sha} layout="stacked" title={c.subject} description={`${c.sha} · ${when(c.date)}`} divider={i < n - 1} />
              ))}
            </Flow>
          </>
        ) : null}
        {shell ? (
          <Flow gap={8}>
            <TextStack subtitle={status === 'open' ? `A shell in ${p.name}’s folder, nothing typed. Type git push to send it.` : status === 'closed' ? 'The shell stopped. Close this and open it again.' : 'Starting the shell…'} />
            <TermScreen t={{ id: `push-${item.repo}`, repo: item.repo, kind: 'shell', typed: null }} active onStatus={setStatus} onActivity={() => {}} register={() => {}} />
          </Flow>
        ) : null}
      </Flow>
    </Drawer>
  );
}

function TermDrawer({ item, onClose }) {
  const [status, setStatus] = useState('connecting');
  const command = item.command && !NO_TYPE.test(item.command) ? item.command : null;
  const t = { id: `drawer-${item.repo}`, repo: item.repo, kind: 'shell', typed: command };
  return (
    <Drawer open onClose={onClose} side="right" size="lg" label="Terminal" status={`${item.repo} · ${item.title ?? 'a shell'}`}>
      <Flow gap={8}>
        <TextStack subtitle={status === 'open' ? (command ? `${command} is typed, not run. Press Return in the terminal to run it.` : `A shell in ${item.repo}’s folder.`) : status === 'closed' ? 'The shell stopped. Close this and open it again.' : 'Starting the shell…'} />
        <TermScreen t={t} active onStatus={setStatus} onActivity={() => {}} register={() => {}} />
      </Flow>
    </Drawer>
  );
}

/** item: { kind: 'review', check } | { kind: 'run', id } | { kind: 'terminal', repo, command, title }; null = closed. */
export default function WorkDrawer({ item, onClose, onNotice, onChanged, onAccepted }) {
  if (!item) return null;
  if (item.kind === 'push') return <PushDrawer key={item.repo} item={item} onClose={onClose} />;
  if (item.kind === 'terminal') return <TermDrawer key={`${item.repo}-${item.command}`} item={item} onClose={onClose} />;
  return <FixDrawer key={item.id ?? item.check} item={item} onClose={onClose} onNotice={onNotice} onChanged={onChanged} onAccepted={onAccepted} />;
}
