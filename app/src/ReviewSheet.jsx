// The review card (phase 6 G): one sheet for a failing check, in the kit
// sheet's order. What this is; the state, with what the check found and what
// the gate said last time; why it matters; what to do (the exact change,
// before and after with the pairs it moves, what it won't touch, how far it
// reaches); then Accept and Not now, each with what it changes and its undo.
// Accept runs on the server (a local BELLA branch, committed through BELLA's
// gate); Undo deletes that branch. Opened from anywhere with
// openReview(check): Overview, Needs you, a component's tests, the system map.
import React, { useEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import { Facts, Sheet, SheetPart, StatusPill } from './kit/index.jsx';

const JSON_HEADERS = { 'content-type': 'application/json' };
export const openReview = (check) => window.dispatchEvent(new CustomEvent('chip:review', { detail: { check } }));
// tell the rest of the page a check, a branch or Needs you changed
export const changed = () => window.dispatchEvent(new CustomEvent('chip:changed'));

// the kit pill adds the mark (✓ ! ●) from its tone
const STATE = {
  failed: { tone: 'fail', word: 'Failed' },
  accepting: { tone: 'needs', word: 'Accepting' },
  accepted: { tone: 'needs', word: 'Waiting on you: merge or undo' },
  passed: { tone: 'pass', word: 'Passed' },
  improve: { tone: 'pass', word: 'Passes · a change is ready' },
  'not-run': { tone: 'neutral', word: 'Not run yet' },
};

const fmt = (r) => `${r.toFixed(2)}:1`;
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const secs = (a, b) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 1000));

function Swatch({ hex, label }) {
  // the colour is data from BELLA's token file, painted as it is
  return <span className="swatch" style={{ backgroundColor: hex }} role="img" aria-label={`${label}: ${hex}`} />;
}

function Steps({ job }) {
  if (!job) return null;
  const done = job.steps ?? [];
  return (
    <ol className="review-steps">
      {done.map((s, i) => (
        <li key={i}>
          ✓ {s.step} <span className="k-sub">{secs(i ? done[i - 1].endedAt : job.startedAt, s.endedAt)} s</span>
        </li>
      ))}
      {job.step ? <li aria-current="step">● {job.step}…</li> : null}
    </ol>
  );
}

const brief = (card, att) =>
  [
    `BELLA ${card.base} @ ${card.commit}${card.target?.kind === 'staged' ? ` plus the ${card.target.files} staged files in ~/DEV/bella` : ''}: ${card.failure ?? card.title}.`,
    `CHIP's fix: ${card.change?.sentence ?? ''}`,
    att?.blockers?.suites?.length ? `With it in, the visual audit refused: ${att.blockers.suites.join(', ')} (${att.blockers.shots.map((s) => `${s.id} ${s.percent?.toFixed(1)}%`).join(', ')}).` : '',
    ...(att?.rules ?? []).map((r) => `Rule: ${r.story}: ${r.rule} (${r.measured}).`),
    'Decide the theme question, make the gate green on a local branch (npm run gate), commit only when green. Do not push.',
  ]
    .filter(Boolean)
    .join('\n');

export default function ReviewSheet() {
  const [check, setCheck] = useState(null);
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const poll = useRef(null);

  useEffect(() => {
    const on = (e) => {
      setCheck(e.detail.check);
      setCard(null);
      setError(null);
      setNote('');
    };
    window.addEventListener('chip:review', on);
    return () => window.removeEventListener('chip:review', on);
  }, []);

  const load = () =>
    fetch(`/review/${check}`)
      .then((r) => r.json())
      .then((c) => {
        setCard(c);
        return c;
      })
      .catch(() => setError('The CHIP server did not answer.'));
  useEffect(() => {
    if (!check) return;
    load();
    return () => clearInterval(poll.current);
  }, [check]);
  // while Accept runs, follow its steps
  useEffect(() => {
    clearInterval(poll.current);
    if (card?.state !== 'accepting') return;
    poll.current = setInterval(async () => {
      const c = await load();
      if (c?.state !== 'accepting') {
        clearInterval(poll.current);
        changed();
        if (c?.state === 'accepted') setNote(`Accepted. ${c.branch} is ${c.sha}, and the gate passed on it. Undo deletes the branch.`);
        else if (c?.job?.status === 'failed') setNote(`Not accepted: ${c.job.error}. Nothing changed in BELLA.`);
      }
    }, 2000);
    return () => clearInterval(poll.current);
  }, [card?.state]);

  async function act(kind, body = {}) {
    setBusy(true);
    setError(null);
    setNote('');
    try {
      const r = await fetch(`/review/${check}/${kind}`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (kind === 'undo') {
        setNote(`Undone. ${j.undone} (${j.sha}) is deleted; ${card.base} never moved.`);
        changed();
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const st = STATE[card?.state] ?? STATE['not-run'];
  // what the gate said about the last Accept: this run's, or the saved one
  const att = card?.job?.status === 'failed' ? { fresh: true, blockers: card.job.blockers, rules: card.job.rules, at: card.job.startedAt } : card?.lastAttempt ?? null;
  const close = () => setCheck(null);
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => setNote('Brief copied.'));

  // the buttons, each with what it changes and its undo, in the card's own words
  const actions = card?.change
    ? card.state === 'accepted'
      ? [{ label: busy ? 'Undoing…' : `Undo: delete ${card.branch}`, onClick: () => act('undo'), disabled: busy, changes: card.undo, undo: 'Open the card again and press Accept.' }]
      : [
          { label: card.state === 'accepting' ? 'Accepting… the gate is running' : busy ? 'Starting…' : 'Accept', onClick: () => act('accept'), disabled: busy || card.state === 'accepting', changes: `It will ${card.thisWill}`, undo: card.undo },
          { label: 'Not now', variant: 'tertiary', onClick: close, changes: 'Nothing. The check stays failing until you come back.' },
        ]
    : card?.noFix
      ? [{ label: 'Copy the brief', onClick: () => copy(card.brief), changes: 'Puts the brief on your clipboard, for a session to fix by hand.', undo: 'Nothing to undo.' }]
      : null;

  return (
    <Sheet open={!!check} onClose={close} kicker={card ? `Review card · ${card.check} check` : 'Review card'} title={card?.title ?? (card ? 'Review' : 'Opening the review…')} className="review-sheet" actions={actions}>
      {!card ? (
        <p className="k-sub">{error ?? 'Reading the check…'}</p>
      ) : (
        <>
          <SheetPart label="What this is">
            <p>{card.change ? 'CHIP’s fix for a failing check: one exact change, committed through BELLA’s gate on a local branch that you merge yourself.' : card.noFix ? 'A failing check CHIP has no one-click fix for. It writes a brief for a session instead.' : `The ${card.check} check.`}</p>
          </SheetPart>

          <SheetPart label="State" pill={<StatusPill tone={st.tone}>{st.word}</StatusPill>}>
            <Facts
              rows={[
                ['Checked', card.ranAt ? `${when(card.ranAt)} on ${card.base ?? 'BELLA'} @ ${card.commit}${card.target?.kind === 'staged' ? `, plus ${card.target.files} staged files` : ''}` : null],
                card.failure && ['Found', card.failure],
                card.state === 'accepted' && card.branch && ['Branch', <code>{card.branch}</code>],
              ]}
            />
            {note ? (
              <p className="k-note" role="status">
                {note}
              </p>
            ) : null}
            {error ? (
              <p className="k-note review-error" role="alert">
                {error}
              </p>
            ) : null}
            {card.state === 'passed' ? <p>{card.summary}. Nothing to review.</p> : null}
            {card.noFix ? (
              <ul className="plain">
                {(card.failures?.length ? card.failures : [card.summary]).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : null}
            {card.state === 'accepting' ? <Steps job={card.job} /> : null}
            {att && (att.blockers || att.rules?.length) ? (
              <>
                <h3>{att.fresh ? 'The gate found more' : `Last time you pressed Accept (${when(att.at)}), the gate refused it`}</h3>
                <p>
                  With the change in, BELLA's gate ran every story and refused the commit. None of this comes from the change itself (only {card.blast.components.join(', ') || 'one file'} reads what it changes): it comes from the {card.target?.kind === 'staged' ? `${card.target.files} staged files it carries` : 'branch it starts from'}.
                </p>
                {att.blockers?.shots?.map((s) => (
                  <figure key={s.id} className="review-shot">
                    <img src={s.img} alt={`${s.id}: the accepted baseline, the difference, and the story as it renders now`} />
                    <figcaption className="k-sub">
                      <code>{s.id}</code>
                      {s.percent != null ? ` · ${s.percent.toFixed(1)}% of pixels differ from its baseline. Left: the baseline; middle: the difference; right: now.` : ''}
                    </figcaption>
                  </figure>
                ))}
                {att.rules?.length ? (
                  <ul className="plain">
                    {att.rules.map((r) => (
                      <li key={r.story + r.rule}>
                        <span>
                          <code>{r.story}</code>: {r.rule} ({r.measured}).
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {att.rules?.length ? (
                  <p>
                    <strong>This needs a decision CHIP won't make for you:</strong> whether that story keeps its own theme in the dark pass (opt it out with <code>parameters.bella.themeIntegrity = false</code>) or the staged theme change is reconsidered. Hand it to a session with the brief, or decide it in the story.
                  </p>
                ) : null}
                <div className="review-actions">
                  {att.blockers?.suites?.length && !att.rules?.length ? (
                    <Button onClick={() => act('accept', { baselines: att.blockers.suites })} disabled={busy}>
                      Accept the change and the new baseline
                    </Button>
                  ) : null}
                  <Button onClick={() => copy(brief(card, att))}>Copy a brief for a session</Button>
                </div>
              </>
            ) : null}
            {card.job?.status === 'failed' && card.job.log ? (
              <Disclosure title="What the gate said">
                <pre>{card.job.log}</pre>
              </Disclosure>
            ) : null}
            {card.state === 'accepted' && card.job?.measured ? (
              <p>
                <strong>
                  Bench on the branch: {card.job.measured.before} → {card.job.measured.after}.
                </strong>{' '}
                {card.job.measured.partsAfter
                  ? Object.entries(card.job.measured.partsAfter)
                      .filter(([k, v]) => card.job.measured.partsBefore?.[k] !== v)
                      .map(([k, v]) => `${k} ${card.job.measured.partsBefore?.[k] ?? 'n/a'} → ${v ?? 'n/a'}`)
                      .join(' · ')
                  : null}
              </p>
            ) : null}
            {card.state === 'accepted' && card.job?.diff ? (
              <Disclosure title="Show the diff">
                <pre>{card.job.diff}</pre>
              </Disclosure>
            ) : null}
          </SheetPart>

          {card.why || card.noFix ? (
            <SheetPart label={card.state === 'improve' ? 'Why change it' : 'Why it matters'} source={<>BELLA’s <code>{card.check}</code> check{card.token ? <>, on <code>{card.token}</code></> : null}</>}>
              {card.why ? <p>{card.why}</p> : null}
              {card.noFix ? <p>{card.noFix}</p> : null}
            </SheetPart>
          ) : null}

          {card.change ? (
            <SheetPart label="What to do" fix>
              <p>{card.change.sentence}</p>
              {card.change.before ? (
                <table className="review-table">
                  <caption className="k-vh">Before and after</caption>
                  <thead>
                    <tr>
                      <th scope="col">Token</th>
                      <th scope="col">Before</th>
                      <th scope="col">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">
                        <code>{card.change.before.token}</code>
                      </th>
                      <td>
                        <Swatch hex={card.change.before.hex} label="Before" /> <code>{card.change.before.value}</code> <code>{card.change.before.hex}</code>
                      </td>
                      <td>
                        <Swatch hex={card.change.after.hex} label="After" /> <code>{card.change.after.value}</code> <code>{card.change.after.hex}</code>
                      </td>
                    </tr>
                    {card.change.ratios.map((r) => (
                      <tr key={r.pair}>
                        <th scope="row">
                          {r.pair} <span className="k-sub">needs {fmt(r.need)}</span>
                        </th>
                        <td>
                          {r.before >= r.need ? '✓' : '✕'} {fmt(r.before)}
                        </td>
                        <td>
                          {r.after >= r.need ? '✓' : '✕'} {fmt(r.after)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {card.change.preview ? (
                <Disclosure title="Read the file it writes" summary={`${card.change.preview.split('\n').length} lines`}>
                  <pre>{card.change.preview}</pre>
                </Disclosure>
              ) : null}
              <Facts
                rows={[
                  ['Files', card.change.files.map((f) => <code key={f}>{f} </code>)],
                  ['Reaches', card.blast.sentence],
                  ["Won't touch", <ul className="review-list">{card.wontTouch.map((w) => <li key={w}>{w}</li>)}</ul>],
                ]}
              />
              {card.blast.apps.some((a) => a.count) ? (
                <Disclosure title="Where it is used">
                  <ul className="plain">
                    {card.blast.sourceFiles.map((f) => (
                      <li key={f}>
                        <code>BELLA · {f}</code>
                      </li>
                    ))}
                    {card.blast.apps.flatMap((a) =>
                      a.files.map((f) => (
                        <li key={a.name + f}>
                          <code>
                            {a.name} · {f}
                          </code>
                        </li>
                      )),
                    )}
                  </ul>
                </Disclosure>
              ) : null}
            </SheetPart>
          ) : card.noFix ? (
            <SheetPart label="What to do" fix>
              <p>Copy the brief below into a session; it names what failed and the commit it failed on.</p>
              <pre>{card.brief}</pre>
            </SheetPart>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
