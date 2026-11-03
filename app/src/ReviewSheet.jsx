// The review card (phase 6 G): one sheet for a failing check. Top to bottom:
// state, why it fails, the exact change (before and after, with the pairs it
// moves), what it won't touch, how far it reaches, then "This will · Undo"
// and the two buttons. Accept runs on the server (a local BELLA branch,
// committed through BELLA's gate); Undo deletes that branch. Opened from
// anywhere with openReview(check): Overview, Needs you, a component's tests,
// the system map.
import React, { useEffect, useRef, useState } from 'react';
import Drawer from '@bella/components/Drawer/Drawer';
import Button from '@bella/components/Button/Button';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Section from '@bella/components/Section/Section';

const JSON_HEADERS = { 'content-type': 'application/json' };
export const openReview = (check) => window.dispatchEvent(new CustomEvent('chip:review', { detail: { check } }));
// tell the rest of the page a check, a branch or Needs you changed
export const changed = () => window.dispatchEvent(new CustomEvent('chip:changed'));

const STATE = {
  failed: { variant: 'danger', word: '✕ Failed' },
  accepting: { variant: 'attention', word: '● Accepting' },
  accepted: { variant: 'attention', word: '● Waiting on you: merge or undo' },
  passed: { variant: 'success', word: '✓ Passed' },
  improve: { variant: 'success', word: '✓ Passes · a change is ready' },
  'not-run': { variant: 'neutral', word: 'Not run yet' },
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
          ✓ {s.step} <span className="label">{secs(i ? done[i - 1].endedAt : job.startedAt, s.endedAt)} s</span>
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

  return (
    <Drawer open={!!check} onClose={close} label={card?.title ?? (card ? 'Review' : 'Opening the review…')} side="right" className="sheet">
      {!card ? (
        <p className="label">{error ?? 'Reading the check…'}</p>
      ) : (
        <div className="review">
          <p className="review-state">
            <StatusPill variant={st.variant}>{st.word}</StatusPill>
            <span className="label">
              {card.ranAt ? `Checked ${when(card.ranAt)} on ${card.base ?? 'BELLA'} @ ${card.commit}` : null}
              {card.target?.kind === 'staged' ? ` plus ${card.target.files} staged files` : ''}
            </span>
          </p>
          {note ? (
            <p className="review-note" role="status">
              {note}
            </p>
          ) : null}
          {error ? (
            <p className="review-error" role="alert">
              {error}
            </p>
          ) : null}

          {card.state === 'passed' ? <p>{card.summary}. Nothing to review.</p> : null}

          {card.noFix ? (
            <>
              <Section heading="Why it fails">
                <ul className="review-list">
                  {(card.failures?.length ? card.failures : [card.summary]).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </Section>
              <p>{card.noFix}</p>
              <pre className="review-code">{card.brief}</pre>
              <div className="review-actions">
                <Button variant="primary" onClick={() => copy(card.brief)}>
                  Copy the brief
                </Button>
              </div>
            </>
          ) : null}

          {card.change ? (
            <>
              <Section heading={card.state === 'improve' ? 'Why change it' : 'Why it fails'}>
                <p>{card.why}</p>
              </Section>

              <Section heading="The exact change">
                <p>{card.change.sentence}</p>
                {card.change.before ? (
                <table className="review-table">
                    <caption className="sr-only">Before and after</caption>
                    <thead>
                      <tr>
                        <th scope="col">Token</th>
                        <th scope="col">Before</th>
                        <th scope="col">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">{card.change.before.token}</th>
                        <td>
                          <Swatch hex={card.change.before.hex} label="Before" /> <span className="mono">{card.change.before.value}</span> <span className="mono">{card.change.before.hex}</span>
                        </td>
                        <td>
                          <Swatch hex={card.change.after.hex} label="After" /> <span className="mono">{card.change.after.value}</span> <span className="mono">{card.change.after.hex}</span>
                        </td>
                      </tr>
                      {card.change.ratios.map((r) => (
                        <tr key={r.pair}>
                          <th scope="row">
                            {r.pair} <span className="label">needs {fmt(r.need)}</span>
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
                    <pre className="review-code">{card.change.preview}</pre>
                  </Disclosure>
                ) : null}
                <p className="label">Files: {card.change.files.join(', ')}</p>
              </Section>

              <Section heading="What it won't touch">
                <ul className="review-list">
                  {card.wontTouch.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Section>

              <Section heading="How far it reaches">
                <p>{card.blast.sentence}</p>
                {card.blast.apps.some((a) => a.count) ? (
                  <Disclosure title="Where it is used">
                    <ul className="review-list">
                      {card.blast.sourceFiles.map((f) => (
                        <li key={f} className="mono">
                          BELLA · {f}
                        </li>
                      ))}
                      {card.blast.apps.flatMap((a) =>
                        a.files.map((f) => (
                          <li key={a.name + f} className="mono">
                            {a.name} · {f}
                          </li>
                        ))
                      )}
                    </ul>
                  </Disclosure>
                ) : null}
              </Section>

              {card.state === 'accepting' ? <Steps job={card.job} /> : null}
              {att && (att.blockers || att.rules?.length) ? (
                <Section heading={att.fresh ? 'The gate found more' : `Last time you pressed Accept (${when(att.at)}), the gate refused it`}>
                  <p>
                    With the change in, BELLA's gate ran every story and refused the commit. None of this comes from the change itself (only {card.blast.components.join(', ') || 'one file'} reads what it changes): it comes from the {card.target?.kind === 'staged' ? `${card.target.files} staged files it carries` : 'branch it starts from'}.
                  </p>
                  {att.blockers?.shots?.map((s) => (
                    <figure key={s.id} className="review-shot">
                      <img src={s.img} alt={`${s.id}: the accepted baseline, the difference, and the story as it renders now`} />
                      <figcaption className="label">
                        <span className="mono">{s.id}</span>
                        {s.percent != null ? ` · ${s.percent.toFixed(1)}% of pixels differ from its baseline. Left: the baseline; middle: the difference; right: now.` : ''}
                      </figcaption>
                    </figure>
                  ))}
                  {att.rules?.length ? (
                    <ul className="review-list">
                      {att.rules.map((r) => (
                        <li key={r.story + r.rule}>
                          <span className="mono">{r.story}</span>: {r.rule} ({r.measured}).
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {att.rules?.length ? (
                    <p>
                      <strong>This needs a decision CHIP won't make for you:</strong> whether that story keeps its own theme in the dark pass (opt it out with <span className="mono">parameters.bella.themeIntegrity = false</span>) or the staged theme change is reconsidered. Hand it to a session with the brief, or decide it in the story.
                    </p>
                  ) : null}
                  <div className="review-actions">
                    {att.blockers?.suites?.length && !att.rules?.length ? (
                      <Button variant="primary" onClick={() => act('accept', { baselines: att.blockers.suites })} disabled={busy}>
                        Accept the change and the new baseline
                      </Button>
                    ) : null}
                    <Button variant={att.rules?.length ? 'primary' : 'secondary'} onClick={() => copy(brief(card, att))}>
                      Copy a brief for a session
                    </Button>
                  </div>
                </Section>
              ) : null}
              {card.job?.status === 'failed' && card.job.log ? (
                <Disclosure title="What the gate said">
                  <pre className="review-code">{card.job.log}</pre>
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
                  <pre className="review-code">{card.job.diff}</pre>
                </Disclosure>
              ) : null}

              <p className="this-will">
                <strong>This will:</strong> {card.state === 'accepted' ? `nothing more until you merge ${card.branch} into ${card.base} yourself.` : card.thisWill}{' '}
                <strong>Undo:</strong> {card.undo}
              </p>
              <div className="review-actions">
                {card.state === 'accepted' ? (
                  <Button variant="primary" onClick={() => act('undo')} disabled={busy}>
                    {busy ? 'Undoing…' : `Undo: delete ${card.branch}`}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => act('accept')} disabled={busy || card.state === 'accepting'}>
                    {card.state === 'accepting' ? 'Accepting… the gate is running' : busy ? 'Starting…' : 'Accept'}
                  </Button>
                )}
                <Button variant="tertiary" onClick={close}>
                  Not now
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
