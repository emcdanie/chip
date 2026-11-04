// Overview, as the approved mock draws it (chip-mock-03 #overview): the
// banner, Now and This week, the Coverage · Gate · Drift card, Checks, Scout,
// By component and Gaps to close. Every number comes from bella.json
// (components, history[].gate) or GET /checks; where nothing measures what
// the mock shows, the page says "Not measured" instead of a number.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import { Segmented, segPanelProps, Sheet } from './kit/index.jsx';
import { CheckSheet, failingTokens, useChecks, when } from './Checks.jsx';
import { openReview } from './ReviewSheet.jsx';

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
const GAP_ORDER = [3, 4, 0, 5, 1, 2];

const fmt = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

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

function Rings({ rings }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 80);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="ringwrap">
      <svg className="rings" viewBox="0 0 168 168" role="img" aria-label={rings.map((x) => `${x.k} ${x.n} of ${x.of} ${x.unit}`).join(', ')}>
        {rings.map((x) => (
          <React.Fragment key={x.k}>
            <circle className={`trk ${x.cls}`} r={x.r} cx="84" cy="84" pathLength="100" />
            <circle className={`val ${x.cls}`} r={x.r} cx="84" cy="84" pathLength="100" strokeDasharray={on ? `${((x.n / x.of) * 100).toFixed(1)} 100` : '0 100'} />
          </React.Fragment>
        ))}
      </svg>
      <dl className="rleg">
        {rings.map((x) => (
          <div key={x.k}>
            <dt>{x.k}</dt>
            <dd>
              <b>
                {x.n}
                <small>/{x.of}</small>
              </b>
              {x.unit}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function Health({ bella, onOpenAtlas, onSession, onRefresh }) {
  const checks = useChecks();
  const failing = failingTokens(checks);
  const [view, setView] = useState('cov');
  const [openAll, setOpenAll] = useState(false);
  const [sheet, setSheet] = useState(null); // { title, body, footer }
  const [checkId, setCheckId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

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

  if (!bella) return <p className="k-sub">Reading BELLA…</p>;

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

  // when the gate turned red: the first failing commit after the last pass
  const lastPass = G.map((g) => g.pass).lastIndexOf(true);
  const redSince = lastPass >= 0 && lastPass < G.length - 1 ? G[lastPass + 1] : null;
  const red = redSince ? G.length - 1 - lastPass : 0;

  // This week: today against the last BELLA snapshot a week ago or older
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const hist = bella.history ?? [];
  const then = [...hist].reverse().find((h) => new Date(h.committedAt) <= weekAgo) ?? hist[0];
  const storiesThen = then ? Math.round((then.storyCoverage / 100) * then.components) : null;
  const storyDelta = storiesThen == null ? null : withStory - storiesThen;
  const weekDay = fmt(weekAgo.toISOString());
  const latestGate = G[G.length - 1];
  const trends = [
    {
      big: `${withStory} of ${n}`,
      what: 'components have a story',
      note: storyDelta == null ? 'Not measured: BELLA’s history has no earlier snapshot.' : storyDelta === 0 ? `Same as on ${weekDay} (${storiesThen}).` : `${Math.abs(storyDelta)} ${storyDelta > 0 ? 'more' : 'fewer'} than on ${weekDay} (${storiesThen}).`,
      k: 'ok',
    },
    { big: `${gaps}`, what: 'gaps left to close', note: `Not measured on ${weekDay}: BELLA’s history keeps no gap count.`, k: 'ok' },
    latestGate && !latestGate.pass
      ? {
          big: 'Failing',
          what: `the gate, since ${redSince ? fmt(redSince.day) : 'its first run'}`,
          note: redSince ? `It passed every commit until ${fmt(redSince.day)}. ${plural(red, 'commit')} since ${red === 1 ? 'has' : 'have'} failed it.` : 'It has not passed yet.',
          k: 'bad',
        }
      : { big: 'Passing', what: 'the gate', note: latestGate ? `Every commit since ${fmt(G[G.map((g) => g.pass).lastIndexOf(false) + 1]?.day ?? latestGate.day)}.` : 'Not measured.', k: 'ok' },
  ];

  /* ---------- sheets ---------- */
  const compSheet = (r) =>
    setSheet({
      title: r.name,
      body: (
        <>
          <p>{r.n} of 6 checks pass.</p>
          <ul className="plain">
            {r.v.map((x, i) => (
              <li key={i}>
                <span>{COLS[i].long}</span>
                <span className={x ? 'pass' : 'fail'}>{x ? '✓ passes' : '✕ missing'}</span>
              </li>
            ))}
          </ul>
          {r.n < 6 ? <p>{r.v.map((x, i) => (x ? '' : COLS[i].why)).filter(Boolean).join(' ')}</p> : null}
        </>
      ),
      footer: (
        <>
          <Button variant="primary" onClick={() => (setSheet(null), onOpenAtlas(r.c.id))}>
            Open in Components
          </Button>
          {r.n < 6 ? <Button onClick={() => (setSheet(null), onSession(`Fix ${r.name} in BELLA: ${r.v.map((x, i) => (x ? '' : COLS[i].long.toLowerCase())).filter(Boolean).join(', ')}.`))}>Fix in a session</Button> : null}
        </>
      ),
    });
  const colSheet = (i) => {
    const miss = rows.filter((r) => !r.v[i]);
    setSheet({
      title: `${COLS[i].long}: ${miss.length} missing`,
      body: (
        <>
          <p>{COLS[i].why}</p>
          <ul className="plain">
            {miss.length ? (
              miss.map((r) => (
                <li key={r.name}>
                  <span>{r.name}</span>
                  <span className="k-pill fail">✕ missing</span>
                </li>
              ))
            ) : (
              <li>Every component passes.</li>
            )}
          </ul>
        </>
      ),
      footer: miss.length ? (
        <Button variant="primary" onClick={() => (setSheet(null), onSession(`${COLS[i].fix} in BELLA for ${miss.map((r) => r.name).join(', ')}.`))}>
          Fix in a session
        </Button>
      ) : null,
    });
  };
  const acts = GAP_ORDER.map((i) => ({ i, who: rows.filter((r) => !r.v[i]).map((r) => r.name) }))
    .filter((a) => a.who.length)
    .sort((a, b) => b.who.length - a.who.length);
  const withGaps = rows.filter((r) => r.n < 6);

  /* ---------- the banner: the first failing gate check, in one sentence ---------- */
  const first = failingGate[0];
  const pair = first?.failures?.[0]?.match(/^([\w-]+): (.+?) is ([\d.]+:1).*?needs ([\d.]+:1)/);
  const theme = pair?.[1].replace(/-/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());
  const banner = first ? (
    <>
      <b>Not ready to merge.</b>{' '}
      {pair ? `The ${theme} ${pair[2].replace(/ vs .*/, '')} is ${pair[3]} and the gate needs ${pair[4]}` : `${first.name} fails`}
      {redSince ? `, so nothing merged since ${fmt(redSince.day)} is proven safe` : ', so BELLA accepts no commit'}.
      {failingGate.length > 1 ? ` ${failingGate.length - 1 === 1 ? 'One more gate check fails' : `${failingGate.length - 1} more gate checks fail`} too.` : ''}{' '}
      <button type="button" className="k-link" onClick={() => setCheckId(first.id)}>
        See the check
      </button>
    </>
  ) : null;

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([checks.reload(), onRefresh?.()]);
    setRefreshing(false);
  };
  const lastRan = list.reduce((m, c) => (c.ranAt && c.ranAt > m ? c.ranAt : m), '');

  /* ---------- the wide card's three views ---------- */
  const lastG = G.slice(-6);
  const W = 600;
  const H = 56;
  const pts = G.map((g, k) => [(k / Math.max(1, G.length - 1)) * W, H - 8 - (g.ok / Math.max(1, g.of)) * (H - 20)]);
  const cut = lastPass >= 0 ? lastPass : 0;
  const path = (a) => a.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const tokensBuilt = byId['tokens-built'];
  const contract = byId.contract;
  const SRC = [
    { k: 'Figma', s: '?', v: 'Not measured' },
    { k: 'Storybook', s: withStory === n ? '✓' : '!', v: `${withStory}/${n}` },
    { k: 'Code', s: '✓', v: `${n}/${n}` },
    { k: 'Contract', s: withContract === n ? '✓' : '!', v: `${withContract}/${n}` },
    { k: 'Docs', s: withDocs === n ? '✓' : '!', v: `${withDocs}/${n}` },
    { k: 'Tokens', s: !tokensBuilt ? '?' : tokensBuilt.status === 'passed' ? '✓' : '!', v: !tokensBuilt ? 'Not measured' : tokensBuilt.status === 'passed' ? 'built' : tokensBuilt.word },
  ];
  const SUB = { cov: 'Checks passed · Components missing one', gate: redSince ? `Checks per commit · ${red} red since ${fmt(redSince.day)}` : 'Checks per commit', drift: 'Figma · Storybook · Code' };
  const TITLE = { cov: 'Coverage', gate: 'Gate', drift: 'Drift' };
  const DLT = { cov: 'By component', gate: 'By day', drift: 'By pair' };
  const days = [...new Set(G.map((g) => g.day))].slice(-6).reverse();

  return (
    <div className="ov-page k-chrome">
      <div id="hhead">
        <div className="tline">
          <h1 className="k-h1" tabIndex={-1}>
            Overview
          </h1>
          <div className="hsync">
            <p className="k-meta">
              <b>BELLA {bella.source.version}</b> · checked {lastRan ? when(lastRan) : 'never'}
            </p>
            <Button onClick={refresh} disabled={refreshing}>
              {ICON.refresh}
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </div>
        {gateFailed && banner ? (
          <div className="alertline" role="alert">
            <p>{banner}</p>
            <Button variant="primary" onClick={() => openReview(first.id)}>
              Fix it
            </Button>
          </div>
        ) : null}
      </div>

      <div className="sumgrid ov">
        <section className="scard2 c-health" aria-labelledby="ovRT">
          <h2 id="ovRT" className="ovh">
            Now
          </h2>
          <Rings
            rings={[
              { k: 'Coverage', n: passed, of: cells, unit: 'checks', r: 70, cls: 'rc' },
              { k: 'Contracts', n: withContract, of: n, unit: 'components', r: 46, cls: 'rk' },
            ]}
          />
        </section>
        <section className="scard2 c-trend" aria-labelledby="ovTT">
          <h2 id="ovTT" className="ovh">
            This week, compared with {weekDay}
          </h2>
          <ul className="trends">
            {trends.map((t) => (
              <li key={t.what} className={t.k}>
                <b>{t.big}</b> <span className="w">{t.what}</span>
                <span className="d">{t.note}</span>
              </li>
            ))}
          </ul>
        </section>
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
              return (
                <button type="button" key={k.short} className={`hcol${pct < 0.9 ? ' low' : ''}`} style={{ gridColumn: i + 1 }} aria-label={`${k.long}, ${ok} of ${n}`} aria-haspopup="dialog" onClick={() => colSheet(i)}>
                  <span className="hl">{k.short}</span>
                  <span className="tube">
                    <i style={{ height: filled ? `calc((100% - 8px) * ${pct})` : 0 }} />
                  </span>
                  <span className="hv">
                    <i className={`vdot ${pct < 0.9 ? 'low' : 'ok'}`} aria-hidden="true" />
                    {ok}/{n}
                  </span>
                </button>
              );
            })}
            <span className="hrule" aria-hidden="true" />
          </div>
        </div>
        <div {...segPanelProps('hv', 'gate', view)}>
          <div className="hstrip wind" role="img" aria-label={`Gate, last ${lastG.length} commits${lastG.length ? `: the latest passed ${lastG[lastG.length - 1].ok} of ${lastG[lastG.length - 1].of} checks` : ''}. Over all ${G.length} commits with a gate, ${G.filter((g) => g.pass).length} passed${redSince ? `, then ${red} failed from ${fmt(redSince.day)}` : ''}.`}>
            {lastG.map((g, k) => (
              <span key={g.sha} className="wcol" aria-hidden="true">
                <span className="hl">{k === lastG.length - 1 ? 'Now' : fmt(g.day)}</span>
                <span className="wv">
                  {g.ok}/{g.of}
                </span>
                <span className="wu">checks</span>
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

      <div className="sumgrid ov ov2">
        <section className="scard2 c-checks" aria-labelledby="ckT">
          <h2 id="ckT" className="ovh">
            Checks <span className="sub2">{list.length} scheduled checks. Select one to see its last run.</span>
          </h2>
          {checks.error ? (
            <p className="k-sub">The checks could not be read (is the CHIP server running?).</p>
          ) : !data ? (
            <p className="k-sub">Reading the checks…</p>
          ) : (
            <ul className="cklist">
              <li className="ckhead" aria-hidden="true">
                <span>Check</span>
                <span>Status</span>
                <span>Last result</span>
                <span>Runs</span>
              </li>
              {list.map((c) => {
                const v = c.status === 'failed' ? ['bad', '✕ Failed'] : c.status === 'waiting' ? ['you', '● Waiting on you'] : c.status === 'passed' ? ['ok', '✓ Passed'] : ['', c.word];
                return (
                  <li key={c.id} className="rowlink" onClick={(e) => e.target.closest('button') || setCheckId(c.id)}>
                    <button type="button" className="rowbtn" aria-haspopup="dialog" onClick={() => setCheckId(c.id)}>
                      {c.name}
                    </button>
                    <span className={`ckv ${v[0]}`}>{v[1]}</span>
                    <span className="ckres">{c.status === 'running' ? 'Running now…' : (c.status === 'failed' ? c.failures?.[0] : null) ?? c.summary ?? 'No result yet.'}</span>
                    <span className="cksched">
                      {c.schedule} · last {c.ranAt ? fmt(c.ranAt) : 'never'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="scard2 c-scout" aria-labelledby="sScT">
          <h2 id="sScT" className="ovh">
            Scout · this week
          </h2>
          <div className="scoutrow">
            <p>
              <b>Not measured.</b> CHIP has no scout yet: nothing reads new standards and tools each week and tries them on BELLA.
            </p>
            <span className="k-pill">Not built</span>
          </div>
        </section>
      </div>

      <section className="wx-card daily" aria-labelledby="dlT">
        <h2 className="dlt" id="dlT">
          {DLT[view]}
        </h2>
        <div className="dl">
          {view === 'cov' ? (
            <table className="cktab">
              <caption className="k-vh">Checks per component</caption>
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  {COLS.map((k) => (
                    <th scope="col" key={k.short}>
                      {k.short}
                    </th>
                  ))}
                  <th scope="col">Score</th>
                </tr>
              </thead>
              <tbody>
                {(openAll ? rows : withGaps).map((r) => (
                  <tr key={r.name}>
                    <th scope="row">
                      <button type="button" className="rowbtn" aria-haspopup="dialog" onClick={() => compSheet(r)}>
                        {r.name}
                      </button>
                    </th>
                    {r.v.map((x, i) => (
                      <td key={i}>{x ? <span className="ck yes" aria-label="passes">✓</span> : <span className="ck no" aria-label="missing">✕</span>}</td>
                    ))}
                    <td className="sc">{r.n}/6</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={8}>
                    <button type="button" className="k-link" aria-expanded={openAll} onClick={() => setOpenAll((o) => !o)}>
                      {openAll ? 'Hide' : 'Show'} the {rows.length - withGaps.length} complete components
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : view === 'gate' ? (
            <div role="list">
              {days.map((d, k) => {
                const cs = G.filter((g) => g.day === d);
                const bad = cs.filter((g) => !g.pass).length;
                return (
                  <div className="drow" role="listitem" key={d}>
                    <span className="dn">{k === 0 ? 'Latest' : fmt(d)}</span>
                    <span className="track" aria-hidden="true">
                      {cs.map((g) => (
                        <i key={g.sha} className={g.pass ? 'y' : 'f'} style={{ height: `${(g.ok / Math.max(1, g.of)) * 100}%` }} />
                      ))}
                    </span>
                    <span className="d1">{plural(cs.length, 'commit')}</span>
                    <span className="d2">{bad ? `${bad} red` : 'green'}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div role="list">
              <div className="drow" role="listitem">
                <span className="dn">Figma ↔ code</span>
                <span className="range" aria-hidden="true" />
                <span className="d1">Not measured</span>
                <span className="d2">—</span>
              </div>
              <div className="drow" role="listitem">
                <span className="dn">Storybook ↔ code</span>
                <span className="range" aria-hidden="true">
                  {withStory < n ? <i className="warn" style={{ left: 0, width: `${((n - withStory) / n) * 100}%` }} /> : null}
                </span>
                <span className="d1">{withStory < n ? `${plural(n - withStory, 'component')} without a story` : 'Every component has a story'}</span>
                <span className="d2">{withStory < n ? 'differs' : 'in step'}</span>
              </div>
              <div className="drow" role="listitem">
                <span className="dn">Contract ↔ code</span>
                <span className="range" aria-hidden="true" />
                <span className="d1">{contract?.summary ?? 'Not measured'}</span>
                <span className="d2">{!contract ? '—' : contract.status === 'passed' ? 'in step' : 'differs'}</span>
              </div>
              <div className="drow" role="listitem">
                <span className="dn">Tokens ↔ built files</span>
                <span className="range" aria-hidden="true" />
                <span className="d1">{tokensBuilt?.summary ?? 'Not measured'}</span>
                <span className="d2">{!tokensBuilt ? '—' : tokensBuilt.status === 'passed' ? 'in step' : 'differs'}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {acts.length ? (
        <section className="gapsec" aria-labelledby="gapT">
          <div className="actline">
            <div>
              <h2 className="dlt" id="gapT">
                Gaps to close
              </h2>
              <p>
                {gaps} gaps across {withGaps.length} components, biggest first. None blocks a merge; each makes BELLA harder for an agent or a reviewer to use.
              </p>
            </div>
            <Button onClick={() => onSession(`Close BELLA's ${gaps} coverage gaps, biggest first: ${acts.map((a) => `${COLS[a.i].fix} (${a.who.join(', ')})`).join('; ')}.`)}>Close all {gaps} in a session</Button>
          </div>
          <ol className="gaplist">
            {acts.map((a, k) => (
              <li key={a.i} className={`gap1${k ? '' : ' first'}`}>
                <span className="n">
                  {a.who.length}
                  <small>component{a.who.length === 1 ? '' : 's'}</small>
                </span>
                <div>
                  <button type="button" className="rowbtn" id={`gap-${k}`} aria-haspopup="dialog" onClick={() => colSheet(a.i)}>
                    {COLS[a.i].fix}
                  </button>
                  {k ? null : <span className="k-pill needs">Do next</span>}
                  <span className="why">{COLS[a.i].why}</span>
                  <span className="who">
                    {a.who.map((w) => (
                      <span key={w}>{w}</span>
                    ))}
                  </span>
                </div>
                <Button onClick={() => onSession(`${COLS[a.i].fix} in BELLA for ${a.who.join(', ')}.`)}>Fix in a session</Button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <Sheet open={!!sheet} title={sheet?.title ?? ''} onClose={() => setSheet(null)} footer={sheet?.footer}>
        {sheet?.body}
      </Sheet>
      <CheckSheet c={checkId ? byId[checkId] : null} onClose={() => setCheckId(null)} run={checks.run} />
    </div>
  );
}
