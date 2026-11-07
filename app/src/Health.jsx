// Health: Coverage, Gate and Drift, moved from Overview as they were (concept
// lock, 7 Nov), then Connectors, which Health took in at step 8 (the System map
// is cut: it repeated the table). What to do next lives on Today.
// Colour flags only exceptions: red for failing, yellow for needs-you, ink and
// grey for normal. Every number comes from bella.json (components,
// history[].gate) or GET /checks; where nothing measures it, the page says
// "Not measured" instead of a number.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import { LinkButton, Overflow, Segmented, segPanelProps, Sheet, StatusPill } from './kit/index.jsx';
import { CheckSheet, failingTokens, useChecks, when } from './Checks.jsx';
import { openReview } from './ReviewSheet.jsx';
import { GapReport, useGapFixes } from './DoNext.jsx';
import Connectors from './Connectors.jsx';

// the six things a component needs; the mock counts an unchecked contrast
// pair as a gap (16 gaps), so it does here
export const COLS = [
  { short: 'Story', long: 'Story', of: (c) => c.hasStory, why: 'No story means no visual review in Storybook.', fix: 'Write stories' },
  { short: 'Docs', long: 'Docs', of: (c) => c.hasDocs, why: 'People have nothing to read.', fix: 'Write docs pages' },
  { short: 'Contract', long: 'Token contract', of: (c) => c.hasContract, why: 'Agents build from the contract.', fix: 'Add token contracts' },
  { short: 'DSDS', long: 'DSDS spec', of: (c) => c.inDsds, why: 'Without one, an agent can’t find it in the spec.', fix: 'Add DSDS entries' },
  { short: 'Contrast', long: 'Contrast pairs', of: (c, failing) => c.health?.contrast?.status === 'pass' && !(c.tokens?.list ?? []).some((t) => failing.includes(t)), why: 'Contrast is unchecked, not passing.', fix: 'Add contrast pairs, or mark them colourless' },
  { short: 'A11y', long: 'A11y notes', of: (c) => c.hasA11yNotes, why: 'The contract can’t say how it behaves for a screen reader.', fix: 'Write a11y notes' },
];
// biggest first, the mock's order on a tie
export const GAP_ORDER = [3, 4, 0, 5, 1, 2];

const fmt = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const STATUS_WORD = { failed: 'failing', passed: 'passing', waiting: 'waiting on you', running: 'running', 'not-run': 'not run' };

// what Refresh compares: BELLA's version, each check's status, the gap count
function snapshot(bella, checksData) {
  const failing = failingTokens({ data: checksData });
  const comps = bella?.components ?? [];
  const gaps = comps.reduce((s, c) => s + COLS.filter((k) => !k.of(c, failing)).length, 0);
  return { version: bella?.source?.version, gaps, checks: Object.fromEntries((checksData?.checks ?? []).map((c) => [c.id, { name: c.name, status: c.status }])) };
}
function changesBetween(a, b) {
  const out = [];
  if (a.version !== b.version) out.push({ text: `BELLA ${a.version} → ${b.version}` });
  for (const [id, c] of Object.entries(b.checks)) {
    const was = a.checks[id]?.status;
    if (was && was !== c.status) out.push({ text: `${c.name} is now ${STATUS_WORD[c.status] ?? c.status}`, good: c.status === 'passed', bad: c.status === 'failed' });
  }
  if (a.gaps !== b.gaps) out.push({ text: `Gaps ${a.gaps} → ${b.gaps}`, good: b.gaps < a.gaps, bad: b.gaps > a.gaps });
  return out;
}

const ICON = {
  cov: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </svg>
  ),
  gate: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
  drift: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8h15m-4-4 4 4-4 4M21 16H6m4-4-4 4 4 4" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// history entries with a gate result: [sha, day, ok, of, passed]
function gateRuns(bella) {
  return (bella?.history ?? [])
    .filter((h) => h.gate)
    .map((h) => {
      const parts = [h.gate.contrastPairs, h.gate.contractParity].filter((x) => x != null);
      return { sha: h.commit, day: h.committedAt.slice(0, 10), ok: parts.filter(Boolean).length, of: parts.length, pass: h.gate.ok };
    });
}

export default function Health({ bella, onOpenAtlas, onSession, onRefresh }) {
  const checks = useChecks();
  const fixes = useGapFixes(bella);
  const failing = failingTokens(checks);
  const [view, setView] = useState('cov');
  const [sheet, setSheet] = useState(null); // { title, body, footer }
  const [checkId, setCheckId] = useState(null);
  const [report, setReport] = useState(null); // [[gap, Name], …] in the gap report
  const [baseline, setBaseline] = useState(null); // Compare with Figma, every component (Connectors)
  useEffect(() => {
    fetch('/figma-baseline').then((r) => r.json()).then(setBaseline).catch(() => {});
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [sync, setSync] = useState(null); // { at, changes } | { at, error }
  const lastLook = useRef(Date.now());

  const comps = bella?.components ?? [];
  const rows = useMemo(
    () =>
      comps
        .map((c) => {
          const v = COLS.map((k) => (k.of(c, failing) ? 1 : 0));
          return { c, name: c.name, v, n: v.filter(Boolean).length };
        })
        .sort((a, b) => a.n - b.n || a.name.localeCompare(b.name)),
    [bella, failing.join()],
  );
  const G = useMemo(() => gateRuns(bella), [bella]);

  // the strip's columns animate up once, like the mock's capsules
  const strip = useRef(null);
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (view !== 'cov' || !rows.length) return;
    setFilled(false);
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setFilled(true)));
    return () => cancelAnimationFrame(t);
  }, [view, rows.length]);

  if (!bella)
    return (
      <div className="ov-page">
        <h1 className="k-h1" tabIndex={-1}>
          Health
        </h1>
        <p className="k-sub">Reading BELLA…</p>
      </div>
    );

  const n = comps.length;
  const cells = n * COLS.length;
  const passed = rows.reduce((s, r) => s + r.n, 0);
  const gaps = cells - passed;
  const withStory = comps.filter((c) => c.hasStory).length;
  const withContract = comps.filter((c) => c.hasContract).length;
  const withDocs = comps.filter((c) => c.hasDocs).length;
  const data = checks.data;
  const list = data?.checks ?? [];
  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  const gateFailed = data?.gate.status === 'failed';
  const failingGate = list.filter((c) => c.gate && c.status === 'failed');
  const gc = data?.gate.counts;

  // when the gate turned red: the first failing commit after the last pass
  const lastPass = G.map((g) => g.pass).lastIndexOf(true);
  const redSince = lastPass >= 0 && lastPass < G.length - 1 ? G[lastPass + 1] : null;
  const red = redSince ? G.length - 1 - lastPass : 0;

  const latestGate = G[G.length - 1];

  /* ---------- sheets ---------- */
  // the gap behind a coverage column, and who can fix one component's
  const gapKey = (i) => COLS[i].short.toLowerCase();
  const canOf = (i, name) => fixes.data?.gaps?.[gapKey(i)]?.[name]?.can;
  const CanPill = ({ can }) => (can ? <StatusPill tone={can.who === 'chip' ? 'pass' : 'needs'}>{can.label}</StatusPill> : null);
  const colSheet = (i) => {
    const miss = rows.filter((r) => !r.v[i]);
    const gap = gapKey(i);
    const items = fixes.data?.gaps?.[gap] ?? {};
    const rule = Object.values(items)[0]?.why;
    const nClaude = miss.filter((r) => items[r.name]?.can?.who === 'claude').length;
    setSheet({
      title: `${COLS[i].long}: ${miss.length ? `${miss.length} missing` : 'all pass'}`,
      body: (
        <div className="ov-detail">
          <section>
            <h3>What it means</h3>
            <p>
              <b>{COLS[i].why}</b> {rule ? `${rule.rule} ` : ''}
              {rule ? <span className="ov-src">{rule.source}</span> : null}
            </p>
          </section>
          <section>
            <h3>Which components</h3>
            <ul className="plain">
              {miss.length ? (
                miss.map((r) => (
                  <li key={r.name}>
                    <span>
                      {r.name}
                      {items[r.name]?.missing ? <span className="ov-why">{items[r.name].missing}</span> : null}
                    </span>
                    <CanPill can={items[r.name]?.can} />
                  </li>
                ))
              ) : (
                <li>Every component passes.</li>
              )}
            </ul>
          </section>
          {miss.length ? (
            <section>
              <h3>On Today</h3>
              <p>The same {miss.length} are the “{COLS[i].fix}” row.</p>
            </section>
          ) : null}
        </div>
      ),
      footer: miss.length ? (
        <>
          <Button variant="primary" onClick={() => (setSheet(null), setReport(miss.map((r) => [gap, r.name])))}>
            Review the fix{miss.length > 1 ? 'es' : ''}
          </Button>
          {nClaude ? (
            <Button variant="tertiary" onClick={() => (setSheet(null), onSession(`${COLS[i].fix} in BELLA for ${miss.filter((r) => items[r.name]?.can?.who === 'claude').map((r) => r.name).join(', ')} only.\n\n${miss.map((r) => items[r.name]?.brief).filter(Boolean).join('\n\n')}`, `${COLS[i].fix}: ${nClaude}`))}>
              Fix {nClaude} with Claude
            </Button>
          ) : null}
        </>
      ) : null,
    });
  };
  // a day on the gate strip: which commits failed, which check, and the fix
  const gateSheet = (d) => {
    const cs = G.filter((g) => g.day === d);
    const bad = cs.filter((g) => !g.pass);
    setSheet({
      title: `Gate on ${fmt(d)}`,
      body: (
        <div className="ov-detail">
          <section>
            <h3>What it means</h3>
            <p>
              <b>{bad.length ? `${bad.length} of ${plural(cs.length, 'commit')} failed BELLA’s gate.` : `All ${plural(cs.length, 'commit')} passed BELLA’s gate.`}</b> A red one means that commit isn’t proven safe to merge. BELLA’s history keeps {cs[0]?.of ?? 0} of the gate’s {gc?.total ?? '…'} checks per commit: contrast and contract parity.
            </p>
          </section>
          <section>
            <h3>Commits</h3>
            <ul className="plain">
              {cs.map((g) => (
                <li key={g.sha}>
                  <span className="mono">{g.sha.slice(0, 7)}</span>
                  <StatusPill tone={g.pass ? 'pass' : 'fail'}>
                    {g.ok}/{g.of} kept
                  </StatusPill>
                </li>
              ))}
            </ul>
          </section>
          {failingGate.length ? (
            <section>
              <h3>Failing now</h3>
              <ul className="plain">
                {failingGate.map((c) => (
                  <li key={c.id}>
                    <span>
                      {c.name}
                      <span className="ov-why">{c.failures?.[0] ?? c.summary}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ),
      footer: failingGate.length ? (
        <>
          <Button variant="primary" onClick={() => (setSheet(null), openReview(failingGate[0].id))}>
            Review the fix
          </Button>
          <Button onClick={() => (setSheet(null), setCheckId(failingGate[0].id))}>See the check</Button>
        </>
      ) : null,
    });
  };
  // a drift pair: what it compares, what differs, and what to do about it
  const driftSheet = (k) => {
    const storyMiss = rows.filter((r) => !r.c.hasStory).map((r) => r.name);
    const fig = baseline?.at ? baseline : null;
    const diff = fig ? fig.rows.filter((r) => r.found && r.score != null && r.score < 100).sort((a, b) => a.score - b.score) : [];
    const absent = fig ? fig.rows.filter((r) => !r.found) : [];
    const body = {
      figma: (
        <div className="ov-detail">
          <section>
            <h3>What it means</h3>
            <p>
              <b>{fig ? `${fig.found} of ${fig.total} components are in Figma; average match with code ${fig.average}%.` : 'Not compared yet.'}</b> Compare with Figma reads each component set and checks its property names, states, target size and colour bindings against code.
            </p>
          </section>
          {diff.length ? (
            <section>
              <h3>Differ from code</h3>
              <ul className="plain">
                {diff.map((r) => (
                  <li key={r.id}>
                    <span>
                      <button type="button" className="k-link" onClick={() => (setSheet(null), onOpenAtlas(r.id))}>
                        {r.name}
                      </button>
                      <span className="ov-why">{r.failing.map((f) => f.what).join(' ')}</span>
                    </span>
                    <StatusPill tone="needs">{r.score}%</StatusPill>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {absent.length ? (
            <section>
              <h3>Not in the Figma file</h3>
              <p>{absent.map((r) => r.name).join(', ')}.</p>
            </section>
          ) : null}
        </div>
      ),
      story: (
        <div className="ov-detail">
          <section>
            <h3>What it means</h3>
            <p>
              <b>{storyMiss.length ? `${plural(storyMiss.length, 'component')} without a story.` : 'Every component has a story.'}</b> Storybook is where code is reviewed visually; the gate renders every story.
            </p>
          </section>
          {storyMiss.length ? <p>The same components are the “Write stories” row on Today: {storyMiss.join(', ')}.</p> : null}
        </div>
      ),
    }[k];
    const footer = {
      figma: (
        <>
          <Button
            variant="primary"
            onClick={() =>
              fetch('/figma-baseline/run', { method: 'POST', headers: { 'content-type': 'application/json' } })
                .then((r) => r.json())
                .then((b) => (setBaseline(b), setSheet(null)))
            }
          >
            Compare with Figma again
          </Button>
          {diff[0] ? <Button onClick={() => (setSheet(null), onOpenAtlas(diff[0].id))}>Open {diff[0].name}</Button> : null}
        </>
      ),
      story: storyMiss.length ? (
        <>
          <Button variant="primary" onClick={() => (setSheet(null), setReport(storyMiss.map((n) => ['story', n])))}>
            Review the fix{storyMiss.length > 1 ? 'es' : ''}
          </Button>
        </>
      ) : null,
    }[k];
    setSheet({ title: k === 'figma' ? 'Figma ↔ code' : 'Storybook ↔ code', body, footer });
  };
  // no banner (rule 9): a failing gate is Today's first row

  // Refresh re-reads BELLA and the checks, then says what changed since the last look
  const refresh = async () => {
    if (refreshing) return;
    const before = snapshot(bella, data);
    const since = lastLook.current;
    setRefreshing(true);
    try {
      const [d, b] = await Promise.all([checks.reload(), onRefresh?.()]);
      const at = Date.now();
      setSync({ at, since, changes: changesBetween(before, snapshot(b ?? bella, d)) });
      lastLook.current = at;
    } catch (e) {
      setSync({ at: Date.now(), since, error: e.message || 'the CHIP server did not answer' });
    }
    setRefreshing(false);
  };
  const lastRan = list.reduce((m, c) => (c.ranAt && c.ranAt > m ? c.ranAt : m), '');

  /* ---------- the wide card's three views ---------- */
  // runs of commits with the same result: "1/2" six times over says nothing six times
  const runs = G.reduce((a, g) => {
    const r = a[a.length - 1];
    if (r && r.ok === g.ok && r.of === g.of && r.pass === g.pass) {
      r.n += 1;
      r.to = g.day;
    } else a.push({ ok: g.ok, of: g.of, pass: g.pass, n: 1, from: g.day, to: g.day, sha: g.sha });
    return a;
  }, []).slice(-6);
  const span = (r) => (r.from === r.to ? fmt(r.from) : `${fmt(r.from)} to ${fmt(r.to)}`);
  const W = 600;
  const H = 56;
  const pts = G.map((g, k) => [(k / Math.max(1, G.length - 1)) * W, H - 8 - (g.ok / Math.max(1, g.of)) * (H - 20)]);
  const cut = lastPass >= 0 ? lastPass : 0;
  const path = (a) => a.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const tokensBuilt = byId['tokens-built'];
  const contract = byId.contract;
  const SRC = [
    baseline?.at ? { k: 'Figma', s: baseline.average >= 90 ? '✓' : '!', v: `${baseline.average}% match` } : { k: 'Figma', s: '?', v: 'Not compared' },
    { k: 'Storybook', s: withStory === n ? '✓' : '!', v: `${withStory}/${n}` },
    { k: 'Code', s: '✓', v: `${n}/${n}` },
    { k: 'Contract', s: withContract === n ? '✓' : '!', v: `${withContract}/${n}` },
    { k: 'Docs', s: withDocs === n ? '✓' : '!', v: `${withDocs}/${n}` },
    { k: 'Tokens', s: !tokensBuilt ? '?' : tokensBuilt.status === 'passed' ? '✓' : '!', v: !tokensBuilt ? 'Not measured' : tokensBuilt.status === 'passed' ? 'built' : tokensBuilt.word },
  ];
  const SUB = { cov: 'Components passing each check · yellow under 90%', gate: `BELLA’s history keeps ${latestGate?.of ?? 0} of the ${gc?.total ?? '…'} gate checks per commit (contrast, contract parity)${redSince ? ` · ${red} red since ${fmt(redSince.day)}` : ''}`, drift: 'Figma · Storybook · Code' };
  const TITLE = { cov: 'Coverage', gate: 'Gate', drift: 'Drift' };
  const DLT = { gate: 'By day', drift: 'By pair' };
  const days = [...new Set(G.map((g) => g.day))].slice(-6).reverse();

  const syncLine = refreshing ? (
    'Checking BELLA and the checks…'
  ) : !sync ? null : sync.error ? (
    <>
      <b>Refresh failed:</b> {sync.error}. Showing what CHIP read at {hhmm(sync.since)}.
    </>
  ) : sync.changes.length ? (
    <>
      <b>{plural(sync.changes.length, 'change')}</b> · Checked {hhmm(sync.at)}:{' '}
      {sync.changes.map((c, k) => (
        <React.Fragment key={k}>
          {k ? '; ' : ''}
          <span className={c.good ? 'up' : c.bad ? 'down' : undefined}>
            {c.good ? '✓ ' : ''}
            {c.text}
          </span>
        </React.Fragment>
      ))}
    </>
  ) : (
    `No change since ${hhmm(sync.since)} · Checked ${hhmm(sync.at)}`
  );

  return (
    <div className="ov-page k-chrome">
      <div id="hhead">
        <div className="tline">
          <h1 className="k-h1" tabIndex={-1}>
            Health
          </h1>
          <div className="hsync">
            <p className="k-meta">
              <b>BELLA {bella.source.version}</b> · checks last ran {lastRan ? when(lastRan) : 'never'}
            </p>
            <Overflow label="More" text="More">
              <LinkButton disabled={refreshing} onClick={refresh}>
                {refreshing ? 'Checking…' : 'Read everything again'}
              </LinkButton>
            </Overflow>
          </div>
        </div>
        <p className={`syncline${sync?.error ? ' err' : ''}`} role="status" aria-live="polite">
          {syncLine}
        </p>
      </div>

      <section className="wx-card" aria-labelledby="wcTitle">
        <div className="wc-head">
          <div>
            <h2 className="wc-t" id="wcTitle">
              {TITLE[view]}
            </h2>
            <p className="wc-s">{SUB[view]}</p>
          </div>
          <Segmented
            id="hv"
            label="Health view"
            value={view}
            onChange={setView}
            items={[
              { id: 'cov', label: 'Coverage', icon: ICON.cov },
              { id: 'gate', label: 'Gate', icon: ICON.gate },
              { id: 'drift', label: 'Drift', icon: ICON.drift },
            ]}
          />
        </div>
        <div {...segPanelProps('hv', 'cov', view)}>
          <div className="hstrip caps" ref={strip}>
            {COLS.map((k, i) => {
              const ok = rows.filter((r) => r.v[i]).length;
              const pct = n ? ok / n : 0;
              // red: a component misses contrast because of a token the gate fails on
              const bad = k.short === 'Contrast' && rows.some((r) => (r.c.tokens?.list ?? []).some((t) => failing.includes(t)));
              const low = pct < 0.9;
              const tone = bad ? ' bad' : low ? ' low' : ' ok';
              const label = <span className="hp">{Math.round(pct * 100)}%</span>;
              return (
                // a column every component passes has nothing to fix: it reads, it doesn't open
                ok === n ? (
                  <div key={k.short} className={`hcol full${tone}`} style={{ gridColumn: i + 1 }} role="group" aria-label={`${k.short} ${ok}/${n}, ${k.long}, all pass`}>
                  <span className="hl">{k.short}</span>
                  {label}
                  <span className="tube">
                    <i style={{ height: filled ? `calc((100% - 8px) * ${pct})` : 0 }} />
                  </span>
                  <span className="hv">
                    {low ? <i className="vdot low" aria-hidden="true" /> : null}
                    {ok}/{n}
                  </span>
                </div>
                ) : (
                // named by its own text ("DSDS 33/37"), the long name and the warning after it
                <button type="button" key={k.short} className={`hcol${tone}`} style={{ gridColumn: i + 1 }} aria-haspopup="dialog" onClick={() => colSheet(i)}>
                  <span className="hl">{k.short}</span>{' '}
                  {label}{' '}
                  <span className="tube">
                    <i style={{ height: filled ? `calc((100% - 8px) * ${pct})` : 0 }} />
                  </span>
                  <span className="hv">
                    {low ? <i className="vdot low" aria-hidden="true" /> : null}
                    {ok}/{n}
                  </span>
                  <span className="k-vh">
                    , {k.long}
                    {bad ? ', fails the gate' : low ? ', under 90%' : ''}
                  </span>
                </button>
                )
              );
            })}
            <span className="hrule" aria-hidden="true" />
          </div>
        </div>
        <div {...segPanelProps('hv', 'gate', view)}>
          <div className="hstrip wind" role="img" aria-label={`Gate history${latestGate ? `: the latest commit on record, ${fmt(latestGate.day)}, passed ${latestGate.ok} of ${latestGate.of} kept checks` : ''}. Over all ${G.length} commits with a gate, ${G.filter((g) => g.pass).length} passed${redSince ? `, then ${red} failed from ${fmt(redSince.day)}` : ''}.`}>
            {runs.map((r) => (
              <span key={r.sha} className={`wcol${r.pass ? '' : ' bad'}`} aria-hidden="true">
                <span className="hl">{span(r)}</span>
                <span className="wv">
                  {r.ok}/{r.of}
                </span>
                <span className="wu">{plural(r.n, 'commit')}</span>
              </span>
            ))}
            <svg className="wline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              <path className="ok" d={path(pts.slice(0, cut + 1))} />
              {cut < pts.length - 1 ? <path className="bad" d={path(pts.slice(cut))} /> : null}
            </svg>
            <span className="wdot" aria-hidden="true" />
          </div>
        </div>
        <div {...segPanelProps('hv', 'drift', view)}>
          <div className="hstrip cond">
            {SRC.map((x) => (
              <span key={x.k} className="ccol">
                <span className="hl">{x.k}</span>
                <span className={`cicon ${x.s === '✓' ? 'ok' : x.s === '!' ? 'warn' : 'q'}`}>
                  <span aria-hidden="true">{x.s}</span>
                  <span className="k-vh">{x.s === '✓' ? 'in step' : x.s === '!' ? 'warning' : 'unknown'}</span>
                </span>
                <span className="hv">{x.v}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {view !== 'cov' ? (
      <section className="wx-card daily" aria-labelledby="dlT">
        <h2 className="dlt" id="dlT">
          {DLT[view]}
        </h2>
        <div className="dl">
          {view === 'gate' ? (
            <div role="list">
              {days.map((d, k) => {
                const cs = G.filter((g) => g.day === d);
                const bad = cs.filter((g) => !g.pass).length;
                return (
                  <div className="drow" role="listitem" key={d}>
                    <button type="button" className="dn rowbtn" aria-haspopup="dialog" onClick={() => gateSheet(d)}>
                      {k === 0 ? 'Latest' : fmt(d)}
                    </button>
                    <span className="track" aria-hidden="true">
                      {cs.map((g) => (
                        <i key={g.sha} className={g.pass ? 'y' : 'f'} style={{ height: `${(g.ok / Math.max(1, g.of)) * 100}%` }} />
                      ))}
                    </span>
                    <span className="d1">{plural(cs.length, 'commit')}</span>
                    <span className={`d2${bad ? ' bad' : ''}`}>{bad ? `${bad} failed` : 'all passed'}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div role="list">
              <div className="drow" role="listitem">
                <button type="button" className="dn rowbtn" aria-haspopup="dialog" onClick={() => driftSheet('figma')}>
                  Figma ↔ code
                </button>
                <span className="range" aria-hidden="true">
                  {baseline?.at && baseline.average < 100 ? <i className="warn" style={{ left: 0, width: `${100 - baseline.average}%` }} /> : null}
                </span>
                <span className="d1">{baseline?.at ? `${baseline.found} of ${baseline.total} in Figma · ${baseline.rows.filter((r) => r.found && r.score < 100).length} differ` : 'Not compared yet'}</span>
                <span className="d2">{!baseline?.at ? '—' : baseline.average === 100 ? 'in step' : 'differs'}</span>
              </div>
              <div className="drow" role="listitem">
                <button type="button" className="dn rowbtn" aria-haspopup="dialog" onClick={() => driftSheet('story')}>
                  Storybook ↔ code
                </button>
                <span className="range" aria-hidden="true">
                  {withStory < n ? <i className="warn" style={{ left: 0, width: `${((n - withStory) / n) * 100}%` }} /> : null}
                </span>
                <span className="d1">{withStory < n ? `${plural(n - withStory, 'component')} without a story` : 'Every component has a story'}</span>
                <span className="d2">{withStory < n ? 'differs' : 'in step'}</span>
              </div>
              <div className="drow" role="listitem">
                <button type="button" className="dn rowbtn" aria-haspopup="dialog" onClick={() => setCheckId('contract')}>
                  Contract ↔ code
                </button>
                <span className="range" aria-hidden="true" />
                <span className="d1">{contract?.summary ?? 'Not measured'}</span>
                <span className="d2">{!contract ? '—' : contract.status === 'passed' ? 'in step' : 'differs'}</span>
              </div>
              <div className="drow" role="listitem">
                <button type="button" className="dn rowbtn" aria-haspopup="dialog" onClick={() => setCheckId('tokens-built')}>
                  Tokens ↔ built files
                </button>
                <span className="range" aria-hidden="true" />
                <span className="d1">{tokensBuilt?.summary ?? 'Not measured'}</span>
                <span className="d2">{!tokensBuilt ? '—' : tokensBuilt.status === 'passed' ? 'in step' : 'differs'}</span>
              </div>
            </div>
          )}
        </div>
      </section>
      ) : null}

      <Connectors />

      <Sheet open={!!sheet} title={sheet?.title ?? ''} onClose={() => setSheet(null)} footer={sheet?.footer}>
        {sheet?.body}
      </Sheet>
      <CheckSheet c={checkId ? byId[checkId] : null} onClose={() => setCheckId(null)} run={checks.run} />
      <GapReport items={report} onClose={() => setReport(null)} onSession={(b, t) => (setReport(null), onSession(b, t))} />
    </div>
  );
}
