// Gaps to close, one component at a time (4 Nov): each card's components are
// selectable, alone or several at once, and each card says who can fix its
// gap: CHIP on its own, Claude, or you. "Review the fix" opens a report built
// from GET /gaps/report: per component, what is missing with its evidence
// (file and field, measured values, the Figma comparison), the recommended
// fix and the rule behind it, the alternatives, what it changes and how to
// undo it. She acts in the report: Apply (the review card path: a local
// BELLA branch, BELLA's gate, then Accept or Undo), Skip, Not now. "Open in
// a session" stays, second, for what CHIP can't do on its own.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import ListRow from '@bella/components/ListRow/ListRow';
import BellaCodeBlock from '@bella/components/CodeBlock/CodeBlock';
import BellaStatusPill from '@bella/components/StatusPill/StatusPill';
import { LinkButton, Sheet, StatusPill } from './kit/index.jsx';
import { changed } from './ReviewSheet.jsx';
import './DoNext.css';

const JSON_HEADERS = { 'content-type': 'application/json' };
// a diff: every line starts with +, - or a space, and at least one is a change
const isDiff = (t) => {
  const ls = (t ?? '').split('\n').filter(Boolean);
  return ls.length > 0 && ls.every((l) => /^[+\- ]/.test(l)) && ls.some((l) => /^[+-]/.test(l)) && !ls.some((l) => /^ *</.test(l.slice(1)));
};
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
// who can fix it, as a pill: CHIP is the good news, the others need someone
const CAN_TONE = { chip: 'pass', claude: 'needs', you: 'needs' };
const CAN_PILL = { chip: 'success', claude: 'attention', you: 'attention' };

export function useGapFixes(bella) {
  const [state, setState] = useState({ data: null, error: null });
  const [tick, setTick] = useState(0);
  // a Skip, an Apply or an Undo in the report reads the gaps again
  useEffect(() => {
    const again = () => setTick((t) => t + 1);
    window.addEventListener('chip:changed', again);
    return () => window.removeEventListener('chip:changed', again);
  }, []);
  useEffect(() => {
    let live = true;
    fetch('/gaps')
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(new Error(j.error || r.statusText)))))
      .then((data) => live && setState({ data, error: null }))
      .catch((e) => live && setState({ data: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [bella?.source?.version, bella?.components?.length, tick]);
  return state;
}

const THEMES = ['light', 'dark', 'warm', 'wee-dote'];

function Pairs({ pairs }) {
  return (
    <table className="dn-pairs">
      <caption className="k-vh">Suggested pairs, measured in each theme</caption>
      <thead>
        <tr>
          <th scope="col">Pair</th>
          {THEMES.map((t) => (
            <th scope="col" key={t}>
              {t}
            </th>
          ))}
          <th scope="col">Needs</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((p) => (
          <tr key={p.label}>
            <th scope="row">
              {p.label}
              {p.twin ? <span className="dn-twin">Same colours as “{p.twin}”, already checked</span> : null}
            </th>
            {THEMES.map((t) => {
              const m = p.measured.find((x) => x.theme === t);
              const bad = m && m.ratio < p.bar;
              return (
                <td key={t} className={bad ? 'bad' : undefined}>
                  {bad ? <span aria-label="fails">✕ </span> : null}
                  {m ? `${m.ratio.toFixed(2)}:1` : '—'}
                </td>
              );
            })}
            <td>{p.bar}:1</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// "CHIP fixes 2 on its own · 1 needs you", from the items' can
function whoLine(items) {
  const n = { chip: 0, claude: 0, you: 0 };
  for (const it of items) if (it?.can) n[it.can.who]++;
  return [n.chip && `CHIP fixes ${n.chip} on its own`, n.claude && `${n.claude} need${n.claude === 1 ? 's' : ''} Claude`, n.you && `${n.you} need${n.you === 1 ? 's' : ''} you`].filter(Boolean).join(' · ');
}

// a file path wraps after a slash, never inside a name
const pathBreaks = (text) =>
  text.split('/').map((part, i, all) => (
    <React.Fragment key={i}>
      {part}
      {i < all.length - 1 ? (
        <>
          /<wbr />
        </>
      ) : null}
    </React.Fragment>
  ));

// one row per gap: its count, its title (opens the gap's detail) and Review
// the fix. Review opens a sheet where she picks the components (every one not
// skipped is picked to start), then reviews them; the toggles live there, not
// on the page (density pass, 5 Nov).
// { gap, idx, title, why, who, first, fixes, fixesError, decisions, focus, onOpen, onReview, onSession }
export function GapRow({ gap, title, headline, why, who, first, primary, fixes, fixesError, decisions, onReview, onSession }) {
  const [sel, setSel] = useState([]);
  const [picking, setPicking] = useState(false);
  const skipped = (n) => decisions?.[`${gap}:${n}`]?.decision === 'skip';
  const open = who.filter((n) => !skipped(n));
  // keep the selection to components still missing this check after a refresh
  useEffect(() => setSel((s) => s.filter((n) => who.includes(n))), [who.join()]);
  const picked = who.filter((n) => sel.includes(n));
  const toggle = (n) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const brief = () =>
    `${title} in BELLA for ${picked.join(', ')} only. Leave every other component alone.\n\n` + picked.map((n) => fixes?.[n]?.brief ?? `${n}: ${title.toLowerCase()}.`).join('\n\n');
  const status = picked.length ? `${picked.length} of ${who.length} selected` : 'Select one or more';
  const can = fixesError ? null : fixes ? whoLine(who.map((n) => fixes[n])) : 'Reading who can fix them…';
  const start = () => {
    setSel(open.length ? open : who);
    setPicking(true);
  };
  return (
    <ListRow
      status={<BellaStatusPill variant={first ? 'info' : 'neutral'}>{first ? 'Do next' : 'Gap'}</BellaStatusPill>}
      title={headline}
      description={why}
      action={
        <>
          {primary ? (
            <Button variant="primary" ariaLabel={`Review ${who.length}: ${headline}`} onClick={start}>
              Review {who.length}
            </Button>
          ) : (
            <LinkButton aria-label={`Review ${who.length}: ${headline}`} onClick={start}>
              Review {who.length} →
            </LinkButton>
          )}
      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        kicker={`${who.length} component${who.length === 1 ? '' : 's'}`}
        title={title}
        footer={
          <>
            <Button variant="primary" disabled={!picked.length} onClick={() => (setPicking(false), onReview(picked.map((n) => [gap, n])))}>
              {picked.length > 1 ? `Review ${picked.length} fixes` : 'Review the fix'}
            </Button>
            {picked.some((n) => fixes?.[n]?.can?.who === 'claude') ? (
              <Button onClick={() => (setPicking(false), onSession(brief(), `${title}: ${picked.join(', ')}`))}>Fix with Claude</Button>
            ) : null}
          </>
        }
      >
        <p>
          <b>{why}</b>
          {can ? ` ${can}.` : ''} Rule: <code className="td-rule">{pathBreaks(Object.values(fixes ?? {})[0]?.why?.source ?? 'Not measured')}</code>
        </p>
        <div className="dn-pick" role="group" aria-label={`Components to fix: ${title}`}>
          {who.map((n) => (
            <button type="button" key={n} className={`k-chip dn-chip${skipped(n) ? ' skipped' : ''}`} aria-pressed={sel.includes(n)} onClick={() => toggle(n)}>
              {n}
              {skipped(n) ? <span className="dn-tag">skipped</span> : null}
            </button>
          ))}
        </div>
        <div className="dn-bar">
          <span className="dn-count" aria-live="polite">
            {status}
          </span>
          {open.length > 1 ? (
            <button type="button" className="k-link" disabled={open.every((n) => sel.includes(n))} onClick={() => setSel(open)}>
              Select all{open.length < who.length ? ' not skipped' : ''}
            </button>
          ) : null}
          {picked.length ? (
            <button type="button" className="k-link" onClick={() => setSel([])}>
              Clear
            </button>
          ) : null}
        </div>
      </Sheet>
        </>
      }
    />
  );
}

/* ---------- the report ---------- */

// the review card's state for one CHIP-fixable item, followed while the gate runs
function useCard(id) {
  const [card, setCard] = useState(null);
  const load = useCallback(() => (id ? fetch(`/review/${id}`).then((r) => r.json()).then((c) => (setCard(c), c)).catch(() => null) : Promise.resolve(null)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (card?.state !== 'accepting') return;
    const t = setInterval(async () => {
      const c = await load();
      if (c?.state !== 'accepting') changed();
    }, 2000);
    return () => clearInterval(t);
  }, [card?.state, load]);
  return [card, load];
}

function Figma({ f }) {
  if (!f) return <p>Not compared with Figma yet. Connectors › Figma › Compare all.</p>;
  if (f.missing) return <p>{f.missing}</p>;
  return (
    <p>
      Found at <code>{f.where}</code>, {f.variants} variant{f.variants === 1 ? '' : 's'}, {f.score}% match with code (read {when(f.at)} through {f.via === 'desktop' ? 'the desktop app' : 'REST'}).
      {f.failing.length ? ` Differences: ${f.failing.join(' ')}` : ' No differences.'}
    </p>
  );
}

// the one-line verdict after what's missing: who does it, and how
const VERDICT = {
  chip: () => 'CHIP can make this change itself: Apply puts it on a branch and runs BELLA’s gate.',
  claude: () => 'Claude writes it: Fix with Claude runs it and reports back here with the diff and the gate.',
  you: (it) => `It needs your call first${it.alternatives[0] ? `: ${it.alternatives[0].text.replace(/\.$/, '')}, or Skip it` : ''}.`,
};
const evidenceSummary = (it) =>
  [it.evidence.where.length && `${it.evidence.where.length} file${it.evidence.where.length === 1 ? '' : 's'}`, it.evidence.pairs && `${it.evidence.pairs.length} measured pairs`, it.evidence.figma ? (it.evidence.figma.missing ? 'not in Figma' : `Figma ${it.evidence.figma.score}% match`) : 'not compared with Figma'].filter(Boolean).join(' · ');

function ReportItem({ it, busyId, setBusyId, onSkip, onLater, onSession }) {
  const [card, load] = useCard(it.id);
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(false);
  const running = card?.state === 'accepting';
  const accepted = card?.state === 'accepted';
  useEffect(() => {
    if (running) setBusyId(it.id);
    else if (busyId === it.id) setBusyId(null);
  }, [running]);
  async function act(kind) {
    setWorking(true);
    setError(null);
    try {
      const r = await fetch(`/review/${it.id}/${kind}`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (kind !== 'accept') changed();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  const job = card?.job;
  const failed = job?.status === 'failed';
  const id = `gr-${it.gap}-${it.name}`;
  return (
    <article className="dn-fix gr-item" aria-labelledby={id}>
      <h3 id={id}>
        {it.name}
        <span className="gr-gap">{it.gapTitle}</span>
        <BellaStatusPill variant={CAN_PILL[it.can.who]}>{it.can.label}</BellaStatusPill>
        {it.decision?.decision === 'skip' ? <BellaStatusPill variant="neutral">Skipped {when(it.decision.at)}</BellaStatusPill> : null}
      </h3>
      <p className="gr-verdict">
        <b>{it.missing}</b> {VERDICT[it.can.who](it)}
      </p>
      <p className="gr-rec">
        <b>Recommended:</b> {it.recommend.text}
        {it.recommend.needed ? ` Needed: ${it.recommend.needed}` : ''}
      </p>
      {it.recommend.caveat ? <p className="dn-caveat">{it.recommend.caveat}</p> : null}
      <div className="gr-acts">
        {error ? (
          <p className="dn-caveat" role="alert">
            {error}
          </p>
        ) : null}
        {running ? (
          <ol className="gr-steps" aria-live="polite">
            {(job?.steps ?? []).map((s) => (
              <li key={s.step}>✓ {s.step}</li>
            ))}
            {job?.step ? <li aria-current="step">● {job.step}…</li> : null}
          </ol>
        ) : null}
        {failed ? (
          <>
            <p className="dn-caveat" role="status">
              Not applied: {job.error}. Nothing changed in BELLA.
            </p>
            {job.log ? (
              <Disclosure title="What the gate said">
                <pre className="dn-code">{job.log}</pre>
              </Disclosure>
            ) : null}
          </>
        ) : null}
        {accepted ? (
          <p className="gr-done" role="status">
            {card.kept
              ? `Accepted. ${card.branch} (${card.sha}) waits for you to merge it into ${card.base}; CHIP never merges.`
              : `The gate passed. ${card.branch} is ${card.sha}, one commit on ${card.base}. Accept keeps it for you to merge; Undo deletes it.`}
          </p>
        ) : null}
        <div className="gr-btns">
          {it.id && !accepted ? (
            <Button variant="primary" onClick={() => act('accept')} disabled={working || running || (busyId && busyId !== it.id) || !card}>
              {running ? 'Applying… the gate is running' : working ? 'Starting…' : failed ? 'Fix this one again' : 'Fix this one'}
            </Button>
          ) : null}
          {accepted && !card.kept ? (
            <Button variant="primary" onClick={() => act('keep')} disabled={working}>
              Accept
            </Button>
          ) : null}
          {accepted ? (
            <Button onClick={() => act('undo')} disabled={working}>
              {working ? 'Undoing…' : 'Undo'}
            </Button>
          ) : null}
          {it.can.who === 'claude' ? (
            <Button variant={it.id ? 'secondary' : 'primary'} onClick={() => onSession(it.brief, `${it.name}: ${it.gapTitle.toLowerCase()}`)}>
              Fix with Claude
            </Button>
          ) : null}
          {!accepted && !running ? (
            <Button onClick={() => onSkip(it)}>{it.decision?.decision === 'skip' ? 'Unskip' : 'Skip'}</Button>
          ) : null}
          {!running ? (
            <Button variant="tertiary" onClick={() => onLater(it)}>
              Not now
            </Button>
          ) : null}
          {it.can.who !== 'claude' && !accepted && !running ? (
            <Button variant="tertiary" onClick={() => onSession(it.brief, `${it.name}: ${it.gapTitle.toLowerCase()}`)}>
              Fix with Claude instead
            </Button>
          ) : null}
        </div>
        {it.id && busyId && busyId !== it.id && !accepted ? <p className="gr-how">Another fix is running BELLA’s gate; Apply waits for it.</p> : null}
      </div>
      <div className="gr-more">
        <Disclosure title="Evidence" summary={evidenceSummary(it)}>
          <ul className="dn-where">
            {it.evidence.where.map((w) => (
              <li key={w.file + w.field}>
                <code>{w.file}</code> · {w.field}
              </li>
            ))}
          </ul>
          {it.evidence.pairs ? <Pairs pairs={it.evidence.pairs} /> : null}
          {it.evidence.model ? (
            <blockquote className="dn-model">
              <span>{it.evidence.model.name}’s note</span>
              {it.evidence.model.text}
            </blockquote>
          ) : null}
          <Figma f={it.evidence.figma} />
        </Disclosure>
        {(card?.change?.preview ?? it.recommend.code) ? (
          <Disclosure title="Exactly what it adds">
            {card?.change?.sentence ? <p>{card.change.sentence}</p> : null}
            <BellaCodeBlock title="Lines it adds" language={/^[{[]/.test((card?.change?.preview ?? it.recommend.code).trim()) ? 'json' : isDiff(card?.change?.preview) ? 'diff' : 'jsx'} code={card?.change?.preview ?? it.recommend.code} />
          </Disclosure>
        ) : null}
        <Disclosure title="Why this fix" summary={it.why.source}>
          <p>{it.why.rule}</p>
        </Disclosure>
        <Disclosure title="Other ways" summary={`${it.alternatives.length}`}>
          <ul className="gr-alts">
            {it.alternatives.map((a) => (
              <li key={a.text}>
                {a.text} <span className="gr-who">{a.can.label}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
        <Disclosure title="What changes, and undo">
          <p>{it.change}</p>
          {it.id || (it.undo && it.undo !== '—') ? (
            <p>
              <b>Undo:</b> {it.id ? `Undo deletes the branch ${card?.branch ?? ''}; ${card?.base ?? 'the base'} never moves.` : it.undo}
            </p>
          ) : null}
          <p className="gr-how">{it.can.how}</p>
        </Disclosure>
      </div>
    </article>
  );
}

/** The report behind "Review the fix". items: [[gap, Name], …] or null. */
export function GapReport({ items, onClose, onSession }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [later, setLater] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [at, setAt] = useState(0); // one fix per view (concept step 2)
  const key = (items ?? []).map((x) => x.join(':')).join(',');
  const load = useCallback(
    () =>
      key
        ? fetch(`/gaps/report?items=${encodeURIComponent(key)}`)
            .then((r) => r.json())
            .then((j) => (j.error ? Promise.reject(new Error(j.error)) : setReport(j)))
            .catch((e) => setError(e.message))
        : null,
    [key],
  );
  useEffect(() => {
    setReport(null);
    setError(null);
    setLater([]);
    setAt(0);
    load();
  }, [load]);
  const skip = async (it) => {
    await fetch('/gaps/decide', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ gap: it.gap, name: it.name, decision: it.decision?.decision === 'skip' ? null : 'skip' }) });
    changed();
    load();
  };
  const shown = (report?.items ?? []).filter((it) => !it.gone && !later.includes(`${it.gap}:${it.name}`));
  const rest = shown.filter((it) => it.can.who === 'claude' && it.decision?.decision !== 'skip');
  const restBrief = () => `Close these BELLA gaps, nothing else:\n\n${rest.map((it) => it.brief).join('\n\n')}`;
  const i = Math.min(at, Math.max(0, shown.length - 1));
  const cur = shown[i];
  // findings by file (benchmark, 7 Nov): each file the fixes touch, with how many, to jump between
  const byFile = Object.entries(
    shown.reduce((m, it, k) => {
      const f = it.evidence?.where?.[0]?.file ?? 'Not measured';
      (m[f] ??= []).push(k);
      return m;
    }, {}),
  );
  // Apply all: every fix CHIP can make itself, one after another (each runs BELLA's gate)
  const canApply = shown.filter((it) => it.id && it.can.who === 'chip');
  const [applying, setApplying] = useState(null);
  const [stoppedAt, setStoppedAt] = useState(null);
  const applyAll = async () => {
    // one after another: Accept starts a gate job and returns, so wait for each job to end; stop at the first that fails
    let stopped = null;
    setStoppedAt(null);
    for (let k = 0; k < canApply.length && !stopped; k++) {
      const { id, name } = canApply[k];
      setApplying(`${k + 1} of ${canApply.length}`);
      try {
        const r = await fetch(`/review/${id}/accept`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        for (;;) {
          await new Promise((ok) => setTimeout(ok, 1500));
          const job = (await (await fetch(`/review/${id}`)).json())?.job;
          if (job?.status === 'running') continue;
          if (job?.status === 'failed') throw new Error(job.error || 'the gate failed');
          break;
        }
      } catch (e) {
        stopped = `${name ?? id}: ${e.message}`;
      }
    }
    setApplying(null);
    setStoppedAt(stopped);
    changed();
    load();
  };
  return (
    <Sheet
      open={!!items}
      onClose={onClose}
      title={cur ? `${cur.gapTitle}: ${cur.name}` : items?.length === 1 ? `Review the fix: ${items[0][1]}` : `Review ${items?.length ?? ''} fixes`}
      className="gr-sheet"
      footer={
        <>
          {shown.length > 1 ? (
            <>
              <Button disabled={i === 0} onClick={() => setAt(i - 1)}>
                Previous
              </Button>
              <Button disabled={i >= shown.length - 1} onClick={() => setAt(i + 1)}>
                Next fix
              </Button>
            </>
          ) : null}
          {canApply.length > 1 ? (
            <Button variant="secondary" disabled={!!applying} onClick={applyAll}>
              {applying ? `Applying ${applying}…` : `Apply all ${canApply.length}`}
            </Button>
          ) : null}
          {rest.length > 1 ? (
            <Button variant="tertiary" onClick={() => onSession(restBrief(), `${rest.length} gaps for Claude`)}>
              Send all {rest.length} to Claude
            </Button>
          ) : null}
        </>
      }
    >
      {!report ? (
        <p>{error ? `The report could not be read: ${error}.` : 'Reading BELLA’s contract, tokens and the Figma comparison…'}</p>
      ) : (
        <div className="gr">
          <p className="gr-sum" aria-live="polite">
            {cur ? `Fix ${i + 1} of ${shown.length} · ${cur.can.label}` : 'Nothing left to fix.'}
            {later.length ? ` · ${later.length} put off for now` : ''}
            {stoppedAt ? ` · Apply all stopped at ${stoppedAt}; the rest are not applied` : ''} · BELLA {report.bellaVersion ? `v${report.bellaVersion}` : ''}, read {when(report.at)}
          </p>
          {byFile.length ? (
            <ul className="gr-files" aria-label="Fixes by file">
              {byFile.map(([f, ks]) => (
                <li key={f}>
                  <button type="button" className="k-link" aria-current={ks.includes(i) ? 'true' : undefined} onClick={() => setAt(ks[0])}>
                    <code>{f}</code>
                  </button>{' '}
                  <span className="gr-n">{ks.length}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {cur ? <ReportItem key={`${cur.gap}:${cur.name}`} it={cur} busyId={busyId} setBusyId={setBusyId} onSkip={skip} onLater={(x) => setLater((l) => [...l, `${x.gap}:${x.name}`])} onSession={onSession} /> : null}
          {report.items.filter((it) => it.gone).map((it) => (
            <p key={`${it.gap}:${it.name}`}>
              {it.name}: no longer missing ({it.gap}). Refresh Today.
            </p>
          ))}
        </div>
      )}
    </Sheet>
  );
}
