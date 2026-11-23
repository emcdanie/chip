// New (her pick A, 23 Nov: "The header's start button is New, with a plus"; mock docs/reference/screens/2026-11-23-new/).
// One place to start anything. The button opens the reading drawer with two big choices:
//   Task     the jobs she repeats, each with its target read live from CHIP (GET /starts), one free line, who does it;
//            "See the plan" opens the same plan sheet every run uses (RunPlan.jsx: approve, edit or close). The button
//            itself starts nothing and costs nothing.
//   Project  a dropped MD file or folder, Connect a folder, or one line. CHIP shows what it understood (fields only where
//            it is unsure, each with its guess), a Set up plan, then a result to Accept or Undo (POST/DELETE /projects).
// BELLA gaps, named (BELLA has none of these yet; built from existing parts, no new styling, to be proposed in BELLA):
//   DropZone    a file/folder drop target with rest, drag over, reading, error. Here: a Card (a real button) + file input + drag events.
//   ChoiceTile  a big selectable card. Here: Card onClick.
//   Icon Plus   the button's plus. Here: a "+" glyph, aria-hidden, like BranchGroup's.
import { useCallback, useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Card from '@bella/components/Card/Card';
import BranchGroup from '@bella/components/BranchGroup/BranchGroup';
import Icon from '@bella/components/Icon/Icon';
import Input from '@bella/components/Input/Input';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import Notification from '@bella/components/Notification/Notification';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import Select from '@bella/components/Select/Select';
import Tag from '@bella/components/Tag/Tag';
import TextStack from '@bella/components/TextStack/TextStack';
import Toast from '@bella/components/Toast/Toast';
import Tooltip from '@bella/components/Tooltip/Tooltip';
import Flow from './Flow.jsx';
import ReadingDrawer, { Inset } from './ReadingDrawer.jsx';
import Toasts from './Toasts.jsx';
import { planRun } from './RunPlan.jsx';
import { fetchCached } from './useCached.js';

const WHO = [
  { value: 'auto', label: 'Auto (local model first)' },
  { value: 'claude', label: 'Claude' },
];
// what the plan says in plain words before Approve (runs go through Claude Code today, so both say so)
const WHO_SAYS = {
  auto: 'Auto: the local model reads first. The change itself is made by Claude through Claude Code, which uses your plan.',
  claude: 'Claude through Claude Code. It uses your plan.',
};
const FIELDS = [
  ['name', 'Name', true],
  ['purpose', 'What it is for', false],
  ['repo', 'Folder or repo', false],
  ['branches', 'Branches', false],
  ['rules', 'Rules it follows', false],
  ['figma', 'Figma file', false],
  ['forWhom', 'Who it is for', false],
];
const TEXT_OK = /\.(md|markdown|txt)$/i;

const post = (url, body, method = 'POST') => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => {
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error || d.ok === false) throw Object.assign(new Error(d.message || d.error || 'CHIP did not answer'), { data: d });
  return d;
});

/* a dropped folder: its CLAUDE.md, AGENTS.md or README.md, read in the browser (a browser never hands over the path) */
const readEntryFile = (e) => new Promise((res, rej) => e.file((f) => f.text().then(res, rej), rej));
async function textOfDrop(dt) {
  const entry = dt.items?.[0]?.webkitGetAsEntry?.();
  if (entry?.isDirectory) {
    const all = await new Promise((res, rej) => entry.createReader().readEntries(res, rej));
    const note = ['CLAUDE.md', 'README.md', 'AGENTS.md'].map((n) => all.find((e) => e.isFile && e.name === n)).find(Boolean);
    if (!note) throw new Error('That folder has no CLAUDE.md, README.md or AGENTS.md to read. Say what it is instead.');
    return { text: await readEntryFile(note), name: entry.name, folder: true };
  }
  const f = dt.files?.[0];
  if (!f) throw new Error('Nothing came through. Choose a file instead.');
  if (!TEXT_OK.test(f.name)) throw new Error('CHIP reads MD and text files. Choose one of those.');
  return { text: await f.text(), name: f.name };
}

export function NewStart({ variant = 'primary' }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('pick'); // pick | task | project
  const [toast, setToast] = useState(null);
  // Task
  const [jobs, setJobs] = useState(null);
  const [jobsError, setJobsError] = useState(null);
  const [picked, setPicked] = useState(null); // job id
  const [items, setItems] = useState({}); // job id -> the target as edited
  const [free, setFree] = useState('');
  const [who, setWho] = useState('auto');
  const [group, setGroup] = useState(0);
  // Project
  const [sub, setSub] = useState('give'); // give | understood | plan | result
  const [fields, setFields] = useState(null);
  const [guesses, setGuesses] = useState({});
  const [say, setSay] = useState('');
  const [note, setNote] = useState(null); // { tone, title, message }
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null);
  const [plan, setPlan] = useState(null);
  const [folders, setFolders] = useState(null);
  const [over, setOver] = useState(false);

  const loadJobs = useCallback(() => {
    setJobsError(null);
    fetchCached('/starts', { fresh: true }).then(setJobs).catch((e) => setJobsError(e.message));
  }, []);
  useEffect(() => {
    if (open && step === 'task') loadJobs();
  }, [open, step, loadJobs]);

  const all = (jobs?.groups ?? []).flatMap((g) => g.jobs);
  const job = all.find((j) => j.id === picked) ?? null;
  const itemsOf = (j) => items[j.id] ?? (j.target?.items ?? []).join(', ');
  const briefOf = (j) => (j.brief ? j.brief.replace('{items}', itemsOf(j) || 'the ones named in the target') : null);
  const canSee = job ? (job.id === 'component' ? !!free.trim() : !!briefOf(job)) : !!free.trim();

  function seePlan() {
    let brief;
    let title;
    let steps;
    if (job) {
      brief = job.id === 'component' ? `Make a new BELLA component with the new-component skill: ${free.trim()}. Figma part first, then its spec, then code once Elleta approves the Figma part.` : briefOf(job);
      if (free.trim() && job.id !== 'component') brief += `\nAlso: ${free.trim()}`;
      title = job.id === 'component' ? `New component: ${free.trim().slice(0, 60)}` : `${job.title}${job.target?.text ? ` · ${job.target.text}` : ''}`.slice(0, 110);
      steps = job.steps.map((s) => ({ ...s, line: undefined }));
    } else {
      brief = free.trim();
      title = free.trim().split('\n')[0].slice(0, 90);
    }
    // the plan opens first; nothing runs until Approve plan there. The choice stays here if she closes it.
    setOpen(false);
    planRun({ title, from: 'New', brief, steps, subtitle: `Plan ready · from New`, summary: WHO_SAYS[who] }).then((run) => run && setPicked(null), () => {});
  }

  /* ---------- Project ---------- */
  async function understood(r, foundIn) {
    if (!r.ok) throw Object.assign(new Error(r.message), { data: r });
    setFields(Object.fromEntries(FIELDS.map(([k]) => [k, r.fields[k]?.value ?? ''])));
    setGuesses(r.fields);
    setNote(foundIn ? { tone: 'info', title: 'A folder drop has no path', message: 'A browser cannot hand over a folder’s path, so CHIP read its notes only. Type the folder below, or use Connect a folder.' } : null);
    setSub('understood');
  }
  async function readText(text, name, foundIn) {
    setBusy(true);
    setNote(null);
    try {
      await understood(await post('/projects/read', { text, name }), foundIn);
    } catch (e) {
      setNote({ tone: e.data?.refused === 'private' ? 'warning' : 'danger', title: e.data?.refused === 'private' ? 'Not read' : 'Could not read that', message: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function onDrop(e) {
    e.preventDefault();
    setOver(false);
    try {
      const { text, name, folder } = await textOfDrop(e.dataTransfer);
      await readText(text, name, folder);
    } catch (er) {
      setNote({ tone: 'danger', title: 'Could not read that', message: er.message });
    }
  }
  // the file chooser is made on the press and never drawn (BELLA gap: DropZone); the Card is the visible, keyboard-reachable button
  function choose() {
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = '.md,.markdown,.txt,text/markdown,text/plain';
    el.addEventListener('change', () => onPick(el.files?.[0]));
    el.click();
  }
  async function onPick(f) {
    if (!f) return;
    if (!TEXT_OK.test(f.name)) return setNote({ tone: 'danger', title: 'Could not read that', message: 'CHIP reads MD and text files. Choose one of those.' });
    await readText(await f.text(), f.name);
  }
  async function openFolders(dir) {
    setNote(null);
    try {
      setFolders(await fetch(`/projects/folders${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`).then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error))))));
    } catch (e) {
      setNote({ tone: 'danger', title: 'Could not list folders', message: e.message });
    }
  }
  async function pickFolder(dir) {
    setBusy(true);
    try {
      await understood(await post('/projects/read', { folder: dir }));
      setFolders(null);
    } catch (e) {
      setNote({ tone: e.data?.refused === 'private' ? 'warning' : 'danger', title: e.data?.refused === 'private' ? 'Not read' : 'Could not read that folder', message: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function toPlan() {
    setBusy(true);
    try {
      setPlan(await post('/projects/plan', { fields }));
      setNote(null);
      setSub('plan');
    } catch (e) {
      setNote({ tone: 'danger', title: 'Cannot set up', message: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    setBusy(true);
    try {
      setMade(await post('/projects', { fields }));
      await fetchCached('/projects', { fresh: true }).catch(() => {});
      window.dispatchEvent(new Event('chip:changed'));
      setNote(null);
      setSub('result');
    } catch (e) {
      setNote({ tone: 'danger', title: 'Not set up', message: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    setBusy(true);
    try {
      await post(`/projects/${made.id}`, null, 'DELETE');
      await fetchCached('/projects', { fresh: true }).catch(() => {});
      window.dispatchEvent(new Event('chip:changed'));
      setToast({ tone: 'success', text: `${made.name} removed. Everything CHIP made for it is gone.` });
      reset(true);
    } catch (e) {
      setNote({ tone: 'danger', title: 'Not removed', message: e.message });
    } finally {
      setBusy(false);
    }
  }
  function reset(close) {
    setSub('give'); setFields(null); setGuesses({}); setMade(null); setPlan(null); setNote(null); setSay(''); setFolders(null);
    if (close) { setOpen(false); setStep('pick'); }
  }
  function accept() {
    setToast({ tone: 'success', text: `${made.name} is under Projects, and the Work board can filter to it.` });
    reset(true);
  }

  /* ---------- the drawer ---------- */
  const back = step === 'pick' ? undefined : sub === 'plan' ? () => setSub('understood') : step === 'project' && sub !== 'give' && sub !== 'result' ? () => (reset(false), setSub('give')) : () => (folders ? setFolders(null) : (setStep('pick'), setNote(null)));
  const label = step === 'task' ? 'New task' : step === 'project' ? 'New project' : 'New';
  const subtitle = step === 'pick' ? 'Start a job or a whole project' : step === 'task' ? 'Pick a job, check its target, then see the plan' : { give: 'Give CHIP something to read', understood: 'What CHIP understood', plan: 'The setup plan · nothing is made until you approve', result: 'Made. Accept keeps it, Undo removes it' }[sub];

  let footer;
  if (step === 'task') {
    footer = (
      <Flow gap={16}>
        <Select label="Who does it" value={who} onChange={setWho} options={WHO} />
        <Flow direction="row" gap={8} justify="end">
          <Button variant="primary" size="sm" disabled={!canSee} onClick={seePlan}>See the plan</Button>
        </Flow>
      </Flow>
    );
  } else if (step === 'project' && sub === 'understood') {
    footer = (
      <Flow direction="row" gap={8} justify="end">
        <Button variant="primary" size="sm" busy={busy} disabled={!fields?.name?.trim()} onClick={toPlan}>Set up</Button>
      </Flow>
    );
  } else if (step === 'project' && sub === 'plan') {
    footer = (
      <Flow direction="row" gap={8} justify="end">
        <Button variant="secondary" size="sm" onClick={() => setSub('understood')}>Edit</Button>
        <Button variant="primary" size="sm" busy={busy} onClick={approve}>Approve plan</Button>
      </Flow>
    );
  } else if (step === 'project' && sub === 'result') {
    footer = (
      <Flow gap={8} stretch>
        <Flow direction="row" gap={8} justify="end">
          <Button variant="secondary" size="sm" busy={busy} onClick={undo}>Undo</Button>
          <Button variant="primary" size="sm" onClick={accept}>Accept</Button>
        </Flow>
        {/* what each button does, before she presses it (second-pass review S17) */}
        <TextStack subtitle="Accept keeps the project under Projects. Undo removes it and everything CHIP made for it." />
      </Flow>
    );
  }

  const unsure = FIELDS.filter(([k, , req]) => !guesses[k]?.sure || req && !fields?.[k]);
  const sure = FIELDS.filter(([k]) => guesses[k]?.sure && !unsure.some(([u]) => u === k));

  return (
    <>
      <Tooltip label="New: start a task or a project" placement="bottom">
        <Button variant={variant} size="sm" ariaLabel="New" ariaHaspopup="dialog" onClick={() => setOpen(true)}>
          <span aria-hidden="true">+ </span>
          New
        </Button>
      </Tooltip>
      <ReadingDrawer open={open} onClose={() => setOpen(false)} onBack={back} label={label} subtitle={subtitle} footer={footer}>
        {step === 'pick' ? (
          <Inset gap={16}>
            <Card onClick={() => { setStep('task'); }} ariaLabel="Task: run a job you repeat, with its target filled in">
              <Flow direction="row" gap={16} align="center">
                <Icon name="CheckCircle" size="lg" />
                <TextStack title="Task" subtitle="One of the jobs you repeat, with its target filled in, or a line of your own" />
              </Flow>
            </Card>
            <Card onClick={() => { setStep('project'); setSub('give'); }} ariaLabel="Project: add a project from a file, a folder or a line">
              <Flow direction="row" gap={16} align="center">
                <Icon name="Folder" size="lg" />
                <TextStack title="Project" subtitle="Give CHIP a file, a folder or one line, and it sets the project up" />
              </Flow>
            </Card>
          </Inset>
        ) : null}

        {step === 'task' ? (
          <>
            {jobsError ? <Inset><Notification tone="danger" title="CHIP's list of jobs did not load" message={`${jobsError}. The free line below still works.`} /></Inset> : null}
            {!jobs && !jobsError ? <Inset><TextStack subtitle="Reading CHIP’s data for each target…" /></Inset> : null}
            <Flow inset gap={8} role="group" aria-label="Jobs you repeat">
              {(jobs?.groups ?? []).map((g, gi) => (
                <BranchGroup key={g.name} name={g.name} count={g.jobs.length} hue={g.hue} open={group === gi} onToggle={() => setGroup(group === gi ? -1 : gi)}>
                  {g.jobs.map((j) => {
                    const on = picked === j.id;
                    const can = j.id === 'component' || !!j.brief;
                    return (
                      <ListRow
                        key={j.id}
                        layout="stacked"
                        selected={on}
                        statusBar={g.hue === 'pink' ? 'attention' : g.hue === 'blue' ? 'info' : 'success'}
                        title={j.title}
                        description={can ? [j.line, j.target?.text].filter(Boolean).join(' · ') : `${j.line} · ${j.target?.text ?? 'Not measured'}`}
                        rightTag={on ? <Tag variant="line">Selected</Tag> : !can ? <Tag variant="line">Nothing to do</Tag> : undefined}
                        onClick={can ? () => setPicked(on ? null : j.id) : undefined}
                      />
                    );
                  })}
                </BranchGroup>
              ))}
            </Flow>
            {job && job.id !== 'component' && job.brief?.includes('{items}') ? (
              <Inset>
                <Input label={`Target for ${job.title}`} hint="Read from CHIP. Change it if you want other parts." value={itemsOf(job)} onChange={(v) => setItems({ ...items, [job.id]: v })} />
              </Inset>
            ) : null}
            <Inset>
              <Input
                label={job?.id === 'component' ? 'Name and one-line purpose' : 'Anything else?'}
                hint={job?.id === 'component' ? 'For example: Stepper, a control for moving through numbered steps' : 'One line for a job that is not listed; it also ends in the plan'}
                value={free}
                onChange={setFree}
                required={job?.id === 'component'}
              />
            </Inset>
          </>
        ) : null}

        {step === 'project' && sub === 'give' ? (
          <>
            {note ? <Inset><Notification tone={note.tone} title={note.title} message={note.message} /></Inset> : null}
            {folders ? (
              <Flow gap={8}>
                <Inset><SectionHead title="Connect a folder" description={folders.dir} showInfo={false} /></Inset>
                <ListRowGroup ariaLabel="Folders">
                  {folders.up ? <ListRow layout="stacked" title="Up one folder" trailing onClick={() => openFolders(folders.up)} /> : null}
                  {folders.folders.map((f) => (
                    <ListRow key={f} layout="stacked" title={f} trailing onClick={() => openFolders(`${folders.dir}/${f}`)} actionButton={<Button variant="secondary" size="sm" busy={busy} onClick={() => pickFolder(`${folders.dir}/${f}`)} ariaLabel={`Use ${f}`}>Use this</Button>} />
                  ))}
                </ListRowGroup>
                <Inset><Button variant="secondary" size="sm" disabled={busy} onClick={() => pickFolder(folders.dir)}>{`Use ${folders.dir.split('/').pop()}`}</Button></Inset>
              </Flow>
            ) : (
              <>
                <Inset>
                  <div onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={onDrop}>
                    <Card onClick={choose} ariaLabel="Drop an MD file or a folder here, or press to choose a file">
                      <Flow gap={8} align="center">
                        <Icon name="Page" size="lg" />
                        <TextStack title={busy ? 'Reading…' : over ? 'Drop it here' : 'Drop an MD file or a folder'} subtitle="CLAUDE.md, README.md or any notes file. Press to choose one." />
                      </Flow>
                    </Card>
                  </div>
                </Inset>
                <Inset>
                  <Flow direction="row" gap={8} wrap>
                    <Button variant="secondary" size="sm" icon="Folder" leadingIcon onClick={() => openFolders('')}>Connect a folder</Button>
                  </Flow>
                </Inset>
                <Inset>
                  <Input label="Say what it is" hint="One line is enough" value={say} onChange={setSay} />
                  <Flow direction="row" gap={8} justify="end">
                    <Button variant="secondary" size="sm" busy={busy} disabled={!say.trim()} onClick={() => readText(say, '')}>Read it</Button>
                  </Flow>
                </Inset>
              </>
            )}
          </>
        ) : null}

        {step === 'project' && sub === 'understood' && fields ? (
          <>
            {note ? <Inset><Notification tone={note.tone} title={note.title} message={note.message} /></Inset> : null}
            {sure.length ? (
              <Flow gap={8}>
                <Inset><SectionHead title="CHIP read these" description="Stated in what you gave it" showInfo={false} /></Inset>
                <ListRowGroup ariaLabel="Read from what you gave CHIP">
                  {sure.map(([k, name]) => (
                    <ListRow key={k} layout="stacked" statusBar="success" title={name} description={fields[k]} helperText={guesses[k].source} />
                  ))}
                </ListRowGroup>
              </Flow>
            ) : null}
            {unsure.length ? (
              <Inset>
                <SectionHead title="CHIP is not sure of these" description="Each shows its guess. Change it or leave it" showInfo={false} />
                {unsure.map(([k, name, req]) => (
                  <Input key={k} label={name} required={req} hint={guesses[k] ? `Guess · ${guesses[k].source}` : req ? 'CHIP found nothing. A name is needed' : 'CHIP found nothing. Optional'} value={fields[k]} onChange={(v) => setFields({ ...fields, [k]: v })} />
                ))}
              </Inset>
            ) : null}
          </>
        ) : null}

        {step === 'project' && sub === 'plan' && plan ? (
          <Flow gap={16}>
            {note ? <Inset><Notification tone={note.tone} title={note.title} message={note.message} /></Inset> : null}
            <Inset><SectionHead icon="WarningCircle" iconTone="warning" title={`${plan.creates.length} things CHIP will make`} description="Nothing is made until you approve. Undo removes all of it." showInfo={false} /></Inset>
            <Flow as="ul" gap={0} aria-label="What CHIP will make">
              {plan.creates.map((c, i) => (
                <ListRow key={c} layout="stacked" statusBar="attention" divider={i < plan.creates.length - 1} title={c} tag={<Tag variant="line">{`Step ${i + 1}`}</Tag>} />
              ))}
            </Flow>
          </Flow>
        ) : null}

        {step === 'project' && sub === 'result' && made ? (
          <Flow gap={16}>
            {note ? <Inset><Notification tone={note.tone} title={note.title} message={note.message} /></Inset> : null}
            <Inset><SectionHead icon="CheckCircle" iconTone="success" title={`${made.name} is set up`} description="Accept keeps it. Undo removes everything CHIP made." showInfo={false} /></Inset>
            <Flow as="ul" gap={0} aria-label="What CHIP made">
              {(plan?.creates ?? []).map((c, i, a) => (
                <ListRow key={c} layout="stacked" statusBar="success" divider={i < a.length - 1} title={c} tag={<Tag variant="line">Made</Tag>} />
              ))}
            </Flow>
          </Flow>
        ) : null}
      </ReadingDrawer>
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

export default NewStart;
