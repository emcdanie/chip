// The reading panel under a picked Processes step (Elleta, 22 Nov 2026: "see the skill, harness whatever to see
// highlights of how its working why.. and get ai to give suggestions on how to improve the workflow, show gaps,
// recommend an audit"). Six blocks in the shared reading look (bullets, key words marked, the first block open):
// What it is · How it works · Why it matters · How it is working · Gaps · Suggestions.
// Everything is read live: the skill or script behind the step, its saved results and the gaps come from GET
// /step-facts (server/lib/step-facts.mjs); the file opens in the reading drawer from GET /step-file, read only and
// allow-listed. A suggestion's button opens the plan sheet first; nothing here starts a run.
import { useState } from 'react';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Button from '@bella/components/Button/Button';
import TextStack from '@bella/components/TextStack/TextStack';
import Marker from '@bella/components/Marker/Marker';
import LineChart from '@bella/components/LineChart/LineChart';
import TypingDots from '@bella/components/TypingDots/TypingDots';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import useAsk from '../templates/useAsk.jsx';
import ReadingDrawer, { Inset } from '../templates/ReadingDrawer.jsx';
import { planRun } from '../templates/RunPlan.jsx';
import { DocBody, day as longDay, size } from './DocReader.jsx';
import Source from '../templates/Source.jsx';

const dayOf = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const ago = (d) => Math.floor((Date.now() - new Date(`${d}T12:00:00`).getTime()) / 86_400_000);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function Bullets({ items, label }) {
  return (
    <Flow as="ul" gap={8} bullets aria-label={label}>
      {items.map((b, i) => (
        <li key={i}>
          <TextStack body={b} />
        </li>
      ))}
    </Flow>
  );
}

/** The skill's or script's file, read only, in the one reading drawer. */
function FileDrawer({ id, onClose }) {
  const { data, error } = useCached([`/step-file?id=${encodeURIComponent(id)}`]);
  const doc = data?.[0];
  const status = doc ? `${doc.kind} · updated ${longDay(doc.updated)} · ${size(doc.bytes)}` : error ? 'Not found' : 'Reading…';
  return (
    <ReadingDrawer open onClose={onClose} label={doc?.title ?? 'File'} status={status} lead="Read only. Nothing here changes the file or runs it.">
      {error ? (
        <Inset>
          <TextStack body="CHIP could not read this file. It may have moved." />
        </Inset>
      ) : null}
      {doc ? <DocBody doc={doc} /> : null}
    </ReadingDrawer>
  );
}

// a line a person can act on: the model's bullets (or lines), no marks, no pins, no lead-in or follow-up lines
const linesOf = (reply) => {
  const all = String(reply ?? '').split('\n').map((l) => l.trim());
  const bullets = all.filter((l) => /^(?:[-*•]|\d+[.)])\s/.test(l));
  return (bullets.length ? bullets : all)
    .map((l) => l.replace(/^(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*|`|\[\d+\]/g, '').replace(/\s+([.,])/g, '$1').trim())
    .filter((l) => l.length > 12 && !/:$/.test(l) && !/^Next:/i.test(l))
    .slice(0, 3);
};

export default function StepPanel({ mapId, step, what, feeds, waits, state, onOpenWaits }) {
  const { data } = useCached([`/step-facts?map=${mapId}&step=${step.id}`]);
  const facts = data?.[0] ?? null;
  const [file, setFile] = useState(null);
  const [open, setOpen] = useState({ what: true });
  const asker = useAsk();
  const ask = (name) => ({ open: Boolean(open[name]), onToggle: (on) => setOpen((o) => ({ ...o, [name]: on })) });

  const src = facts?.source?.found ? facts.source : null;
  const runs = facts?.runs ?? [];
  const last = facts?.last ?? null;
  // gaps: what the server found, plus what the page knows (who waits on it, whether anything runs it)
  const owner = Boolean(src || step.run || step.href);
  const gaps = [...(facts?.gaps ?? [])];
  if (facts && !owner && !gaps.some((g) => /No skill or script/.test(g))) gaps.push('No owner: no skill, script or run is wired to this step');
  if (facts && !owner && gaps.some((g) => /No skill or script/.test(g))) gaps.splice(gaps.findIndex((g) => /No skill or script/.test(g)), 1, 'No owner: no skill, script or run is wired to this step');
  for (const w of waits) if (w.state === 'bad' || w.state === 'red') gaps.push(`Waits on ${w.name}, which is failing`);

  // suggestions CHIP works out itself, without asking a model
  const failing = state === 'Failing';
  const sure = [];
  if (last && ago(last.day) > 7 && step.run)
    sure.push({ key: 'rerun', text: `Run ${step.name} again: last run ${dayOf(last.day)}, ${ago(last.day)} days ago`, brief: step.run.brief, title: `Run ${step.name}` });
  if (failing && !owner)
    sure.push({ key: 'owner', text: `Give ${step.name} an owner: it is failing and nothing is wired to run it`, brief: `${step.name} is failing in CHIP's ${mapId} map and nothing runs it. Propose who or what should own it and how it gets run. Plan only, change nothing.`, title: `Find an owner for ${step.name}` });

  const plan = (title, brief) => planRun({ title, from: 'Processes', brief, steps: [{ id: 'do', title, line: brief }] }).catch(() => null);

  // the ways to improve that apply, decided here from the measured facts (never by the model); the two shown above are left out
  const ways = [];
  if (src?.kind === 'script' && facts?.inGuard === false) ways.push(`Add ${src.name} to the pre-commit hook: it is not in the hook, the guard or an npm script`);
  if (facts && !last) ways.push(`Recommend an audit of ${step.name}: no saved report`);
  if (last?.red > 0) ways.push(`Fix the ${last.red} failing ${last.red === 1 ? 'item' : 'items'} in ${step.name} first`);
  for (const w of waits) if (w.state === 'bad' || w.state === 'red') ways.push(`Fix ${w.name} first: ${step.name} waits on it and it is failing`);
  if (last?.yellow > 0 && !(last?.red > 0)) ways.push(`Work through the ${last.yellow} items in ${step.name} that need work`);

  // the measured facts sent to the router: this step's own numbers, nothing else
  const record = () => {
    const rows = [
      `Step: ${step.name} (${mapId} map). State: ${state}.`,
      step.line ? `Measured: ${step.line}.` : 'Measured: nothing is measured for this step.',
      last ? `Latest saved result: ${last.value} ${last.unit}, ${last.red} failing, ${last.yellow} need work, ${last.green} healthy, ran ${last.day}.` : 'No saved result.',
      runs.length > 1 ? `Earlier results: ${runs.slice(0, -1).map((r) => `${r.day} ${r.value}`).join(', ')}.` : null,
      src ? `Behind it: the ${src.kind} ${src.name}.` : 'Behind it: no skill or script.',
      gaps.length ? `Gaps: ${gaps.join('; ')}.` : 'Gaps: none found.',
      waits.length ? `Waits on: ${waits.map((w) => `${w.name} (${w.label})`).join(', ')}.` : null,
      feeds.length ? `Feeds: ${feeds.map((f) => `${f.name} (${f.label})`).join(', ')}.` : null,
      ways.length ? `Ways to improve ${step.name} that apply: ${ways.join('; ')}.` : `No further way to improve ${step.name} applies.`,
    ].filter(Boolean);
    return { id: `${mapId}:${step.id}`, title: step.name, text: rows.join('\n') };
  };
  const send = () =>
    asker.ask(
      `Which ways to improve ${step.name} does the record list? Say each as one short bullet starting with a verb, no label, at most three.`,
      'processes',
      record(),
      `Suggestions for ${step.name}`,
    );
  const a = asker.answer;
  const asked = a ? linesOf(a.reply) : [];

  const points = runs.map((r) => ({ label: dayOf(r.day), value: r.value }));
  const first = runs[0];
  const trend = runs.length > 1 && last.unit === first.unit ? last.value - runs.at(-2).value : null;

  return (
    <Flow gap={8}>
      <Disclosure title="What it is" {...ask('what')}>
        {open.what ? <Bullets label={`${step.name}: what it is`} items={[what]} /> : null}
      </Disclosure>

      <Disclosure title="How it works" summary={src ? cap(src.kind) : undefined} {...ask('works')}>
        {open.works ? (
          <Flow gap={12}>
            {!facts ? (
              <TextStack subtitle="Reading the files…" />
            ) : src ? (
              <>
                <Bullets
                  label={`${step.name}: how it works`}
                  items={[
                    <>
                      {`The ${src.kind} `}
                      <Marker>{src.name}</Marker>
                      {' stands behind this step.'}
                    </>,
                    ...facts.bullets,
                  ]}
                />
                <Flow direction="row" gap={8}>
                  <Button variant="secondary" size="sm" onClick={() => setFile(src.id)}>
                    {`Open the ${src.kind}`}
                  </Button>
                </Flow>
              </>
            ) : (
              <Bullets label={`${step.name}: how it works`} items={[facts.source ? `The ${facts.source.kind} ${facts.source.name} is not on this Mac, so CHIP cannot read it.` : 'No skill or script is wired to this step, so there is nothing to read.']} />
            )}
          </Flow>
        ) : null}
      </Disclosure>

      <Disclosure title="Why it matters" {...ask('why')}>
        {open.why ? (
          <Flow gap={12}>
            <Bullets label={`${step.name}: why it matters`} items={[facts?.why ?? (facts ? 'No rule in CLAUDE.md names this step yet.' : 'Reading the rules…')]} />
            {facts?.why && facts?.whyHeading ? <Source id="chip-claude" heading={facts.whyHeading} /> : null}
          </Flow>
        ) : null}
      </Disclosure>

      <Disclosure title="How it is working" summary={state} {...ask('working')}>
        {open.working ? (
          <Flow gap={12}>
            {points.length >= 3 ? (
              <LineChart variant="compact" label={`${step.name}: score over ${points.length} results`} tone="neutral" unit={last.unit} summary={`${step.name} over its last ${points.length} saved results`} points={points} />
            ) : runs.length ? (
              <TextStack subtitle={`${runs.length} ${runs.length === 1 ? 'result' : 'results'} recorded`} />
            ) : null}
            <Bullets
              label={`${step.name}: latest result`}
              items={
                last
                  ? [
                      <>
                        {'Latest: '}
                        <Marker>{`${last.value} ${last.unit}`}</Marker>
                        {`, ran ${dayOf(last.day)}.`}
                      </>,
                      last.checks ? `${last.red} failing, ${last.yellow} need work, ${last.green} healthy.` : null,
                      trend != null ? `${trend === 0 ? 'Unchanged' : trend > 0 ? `Up ${trend}` : `Down ${-trend}`} since ${dayOf(runs.at(-2).day)}.` : null,
                    ].filter(Boolean)
                  : [step.line ? <>{'Latest: '}<Marker>{step.line}</Marker>{'.'}</> : 'Not measured: nothing saves a result for this step.']
              }
            />
          </Flow>
        ) : null}
      </Disclosure>

      <Disclosure title="Gaps" summary={facts ? String(gaps.length) : undefined} {...ask('gaps')}>
        {open.gaps ? <Bullets label={`${step.name}: gaps`} items={facts ? (gaps.length ? gaps : ['No gap found.']) : ['Reading the files…']} /> : null}
      </Disclosure>

      <Disclosure title="Suggestions" summary={sure.length ? String(sure.length) : undefined} {...ask('ideas')}>
        {open.ideas ? (
          <Flow gap={16}>
            {sure.length ? (
              <Flow as="ul" gap={12} aria-label={`${step.name}: suggestions CHIP worked out`}>
                {sure.map((s) => (
                  <li key={s.key}>
                    <Flow gap={8}>
                      <TextStack body={s.text} />
                      <Flow direction="row" gap={8}>
                        <Button variant="secondary" size="sm" onClick={() => plan(s.title, s.brief)}>
                          Plan it
                        </Button>
                      </Flow>
                    </Flow>
                  </li>
                ))}
              </Flow>
            ) : null}
            <Flow gap={8}>
              {!a ? (
                <>
                  <Flow direction="row" gap={8}>
                    <Button variant="secondary" size="sm" onClick={send} disabled={!facts}>
                      Ask for suggestions
                    </Button>
                  </Flow>
                  <TextStack subtitle="Sends this step's measured facts to the local model on this Mac. Free." />
                </>
              ) : null}
              {a?.status === 'thinking' ? (
                <Flow direction="row" justify="between" align="center" gap={8}>
                  <TypingDots name="BELLA" />
                  <Button variant="tertiary" size="sm" onClick={asker.stop}>
                    Stop
                  </Button>
                </Flow>
              ) : null}
              {a?.status === 'answer' || (a?.status === 'thinking' && asked.length) ? (
                <Flow gap={12} aria-live="polite">
                  {asked.length ? (
                    <Flow as="ul" gap={12} aria-label={`${step.name}: suggestions from the model`}>
                      {asked.map((s) => (
                        <li key={s}>
                          <Flow gap={8}>
                            <TextStack body={s} />
                            <Flow direction="row" gap={8}>
                              <Button variant="secondary" size="sm" onClick={() => plan(`${step.name}: ${s.split(/[.:]/)[0].slice(0, 60)}`, `${s} (step: ${step.name}, ${mapId} map). Plan only; change nothing until approved.`)}>
                                Plan it
                              </Button>
                            </Flow>
                          </Flow>
                        </li>
                      ))}
                    </Flow>
                  ) : (
                    <TextStack body="The model had no suggestion from these facts." />
                  )}
                  <TextStack subtitle={`${a.model ? `Answered by ${a.model}` : 'Answered locally'}${a.route?.why ? ` · ${a.route.why}` : ' · free, on this Mac'}.`} />
                  <Flow direction="row" gap={8}>
                    <Button variant="tertiary" size="sm" onClick={send}>
                      Ask again
                    </Button>
                  </Flow>
                </Flow>
              ) : null}
              {a?.status === 'weak' || a?.status === 'error' || a?.status === 'stopped' ? (
                <Flow gap={8}>
                  <TextStack body={a.status === 'stopped' ? 'Stopped before it answered.' : 'The model did not answer.'} />
                  <Flow direction="row" gap={8}>
                    <Button variant="secondary" size="sm" onClick={send}>
                      Try again
                    </Button>
                  </Flow>
                </Flow>
              ) : null}
            </Flow>
          </Flow>
        ) : null}
      </Disclosure>
      {file ? <FileDrawer id={file} onClose={() => setFile(null)} /> : null}
    </Flow>
  );
}
