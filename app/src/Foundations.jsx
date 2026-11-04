// Foundations, as the approved mock draws it (chip-mock-03 #foundations): six
// tabs in a segmented control. Colour, Who uses what and Tokenized? are
// tables; Type, Shape and space and Motion draw BELLA's scales to size.
// Colour values and usage come from bella.json (palette, tokenUsage); refs,
// scales, the font contract and the CSS count from foundations.json
// (scripts/sync-foundations.mjs). A tab with nothing behind it says
// "Not measured".
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import { DataTable, PageHeader, Segmented, segPanelProps, Sheet } from './kit/index.jsx';
import './Foundations.css';

const SVG = (d) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {d}
  </svg>
);
const TABS = [
  { id: 'colours', label: 'Colour', icon: SVG(<><circle cx="12" cy="12" r="9" /><path className="fd-solid" d="M12 3a9 9 0 0 0 0 18z" /></>) },
  { id: 'matrix', label: 'Who uses what', icon: SVG(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></>) },
  { id: 'type', label: 'Type', icon: <span className="fd-ticon" aria-hidden="true">Aa</span> },
  { id: 'shape', label: 'Shape and space', icon: SVG(<path d="M4 20V10a6 6 0 0 1 6-6h10" />) },
  { id: 'motion', label: 'Motion', icon: SVG(<path d="M3 17c4 0 5-10 9-10s5 10 9 10" />) },
  { id: 'tokenized', label: 'Tokenized?', icon: SVG(<path d="M5 12l4 4 10-10" />) },
];

/* ---------- contrast: one number per role, the mock's pairing rule, measured
   against BELLA's own surfaces. A text or edge colour sits on the card; a
   surface sits under the primary text ---------- */
const hexRgb = (h) => {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(h || '');
  if (!m || (m[2] && m[2].toLowerCase() !== 'ff')) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const lum = (c) => c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const TEXTISH = /^(text|link|icon|border|danger-text|success-text|highlight-text|highlight-edge|focus-ring|signal|accent-raised-edge|chip-text|danger-border|success-border|accent-border)/;
const grade = (r) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? '3:1' : 'fails');
const SEM = '--color-semantic-';

function contrastOf(t, P) {
  const L = hexRgb(t.light);
  if (!L) return null;
  const isText = TEXTISH.test(t.role);
  const r = ratio(L, hexRgb(isText ? P['surface-card']?.light : P['text-primary']?.light) ?? [255, 255, 255]);
  if (/^border(-subtle|-faint)?$/.test(t.role)) return { r, g: 'decorative', ok: null };
  const need = /^border|edge|ring|signal/.test(t.role) || !isText ? 3 : 4.5;
  return { r, g: grade(r), ok: r >= need };
}

// every pairing for the role sheet: light on the card and the page, dark on the dark card
function pairings(t, P) {
  const L = hexRgb(t.light);
  const D = hexRgb(t.dark);
  const v = (k, th) => hexRgb(P[k]?.[th]);
  const rows = TEXTISH.test(t.role)
    ? [
        ['On the card', L, v('surface-card', 'light')],
        ['On the page', L, v('background', 'light')],
        ['Dark: on the card', D, v('surface-card', 'dark')],
      ]
    : [
        ['Primary text on it', L, v('text-primary', 'light')],
        ['Body text on it', L, v('text-body', 'light')],
        ['Dark: primary text on it', D, v('text-primary', 'dark')],
      ];
  return rows.filter(([, a, b]) => a && b).map(([k, a, b]) => ({ k, r: ratio(a, b) }));
}

// readable text on a swatch in either theme: light on a dark one, dark on a light one
const on = (v) => {
  const c = hexRgb(v);
  return c && lum(c) < 0.179 ? 'var(--code-ink)' : 'var(--on-action)';
};

const Swatch = ({ v, r }) => (
  <span className="fd-v">
    <i style={{ background: v }} />
    {/gradient/.test(String(v)) ? 'gradient' : r ?? ''} <small>{/gradient/.test(String(v)) ? '' : v}</small>
  </span>
);

const NotMeasured = ({ what }) => (
  <p className="fd-none">
    <b>Not measured.</b> {what}
  </p>
);

export default function Foundations({ bella, onSession, onOpenAtlas }) {
  const [tab, setTab] = useState('colours');
  const [f, setF] = useState(null);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState(null);
  useEffect(() => {
    fetch('/data/foundations.json')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setF)
      .catch(() => setFailed(true));
  }, []);

  const P = useMemo(() => Object.fromEntries(Object.entries(bella?.palette ?? {}).map(([k, v]) => [k.slice(SEM.length), v])), [bella]);
  const roles = useMemo(
    () =>
      Object.entries(bella?.palette ?? {}).map(([k, v]) => ({
        token: k,
        role: k.slice(SEM.length),
        light: v.light,
        dark: v.dark,
        lref: f?.refs[k]?.light ?? null,
        dref: f?.refs[k]?.dark ?? null,
        usedBy: bella.tokenUsage[k] ?? [],
      })),
    [bella, f],
  );
  const orphans = roles.filter((t) => !t.usedBy.length);
  const idOf = (name) => bella?.components.find((c) => c.name === name)?.id;

  const close = () => setSheet(null);
  const whoSheet = (t) =>
    setSheet({
      title: `${t.role}: ${t.usedBy.length} component${t.usedBy.length === 1 ? '' : 's'}`,
      body: (
        <>
          <p>
            Every component whose CSS reads <code>{t.token}</code>, directly or through its own tokens.
          </p>
          <ul className="fd-plain">
            {t.usedBy.map((c) => (
              <li key={c}>
                <button type="button" className="k-rowbtn" onClick={() => (close(), onOpenAtlas(idOf(c)))}>
                  {c}
                </button>
                <code>{idOf(c)}</code>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  const roleSheet = (t) => {
    const ps = pairings(t, P);
    const fails = ps.some((p) => p.r < 3);
    setSheet({
      title: t.role,
      body: (
        <>
          <p className="fd-meta">{TEXTISH.test(t.role) ? 'A text or edge colour: measured on the surfaces it sits on.' : 'A surface: measured with the text that sits on it.'}</p>
          <div className="fd-sw2">
            <span style={{ background: t.light, color: on(t.light) }}>
              light <code>{t.lref}</code>
            </span>
            <span style={{ background: t.dark, color: on(t.dark) }}>
              dark <code>{t.dref}</code>
            </span>
          </div>
          {ps.length ? (
            <dl>
              {ps.map((p) => (
                <React.Fragment key={p.k}>
                  <dt>{p.k}</dt>
                  <dd>
                    {p.r.toFixed(2)}:1 <span className={p.r >= 3 ? 'fd-pass' : 'fd-fail'}>{p.r >= 3 && p.r < 4.5 ? '3:1 UI' : grade(p.r) === 'fails' ? 'Fails' : grade(p.r)}</span>
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            <p className="fd-meta">Has transparency or a gradient, so contrast depends on what sits under it.</p>
          )}
          <p className="fd-meta">{t.usedBy.length ? `Used by ${t.usedBy.length}: ${t.usedBy.slice(0, 4).join(', ')}${t.usedBy.length > 4 ? '…' : ''}` : <b className="fd-failt">Used by no component</b>}</p>
          {ps.length ? fails ? <p>One pairing fails. Darken or lighten the role a step, or stop using it there.</p> : <p className="fd-pass">Every pairing this role is used in passes.</p> : null}
        </>
      ),
      footer: fails ? (
        <Button variant="primary" onClick={() => (close(), onSession(`Fix the contrast of the ${t.role} colour role in BELLA: ${ps.filter((p) => p.r < 3).map((p) => `${p.k.toLowerCase()} ${p.r.toFixed(2)}:1`).join(', ')}.`))}>
          Fix in a session
        </Button>
      ) : null,
    });
  };
  function OrphanList() {
    const [off, setOff] = useState([]);
    const picked = orphans.filter((t) => !off.includes(t.role));
    const brief = (verb) => `${verb} ${picked.length} BELLA colour roles no component uses: ${picked.map((t) => t.role).join(', ')}.`;
    return (
      <>
        <p>Each one is either app-only (the site uses it, no BELLA component does) or dead. Untick any you want to keep as they are.</p>
        <ul className="fd-plain">
          {orphans.map((t) => (
            <li key={t.role}>
              <label className="k-chk">
                <input type="checkbox" checked={!off.includes(t.role)} onChange={(e) => setOff((o) => (e.target.checked ? o.filter((x) => x !== t.role) : [...o, t.role]))} /> <code>{t.role}</code>
              </label>
              <Swatch v={t.light} r={null} />
            </li>
          ))}
        </ul>
        <div className="fd-row2">
          <Button variant="primary" disabled={!picked.length} onClick={() => (close(), onSession(brief('Retire')))}>
            Retire selected in a session
          </Button>
          <Button disabled={!picked.length} onClick={() => (close(), onSession(brief('Mark as app-only (not dead)')))}>
            Mark selected app-only
          </Button>
        </div>
      </>
    );
  }

  if (!bella) return null;
  const panel = (id) => segPanelProps('fd', id, tab);

  return (
    <div className="fd-page k-chrome">
      <PageHeader
        title="Foundations"
        lede={
          <>
            Every token, which components use it, and what still isn't a token. Read from <code>primitive.json</code>, <code>semantic</code>, <code>component.json</code> and each component's CSS.
          </>
        }
      />

      <div className="fd-tabs">
        <Segmented id="fd" label="Foundations" items={TABS} value={tab} onChange={setTab} />
      </div>

      <div {...panel('colours')} tabIndex={0} className="fd-panel">
        <p className="fd-sublede">One row per colour role, light and dark, with its contrast. Select a role for every pairing; select the count to see who uses it.</p>
        {orphans.length ? (
          <div className="fd-actline">
            <p>
              <b>
                {orphans.length} colour role{orphans.length === 1 ? ' isn’t' : 's aren’t'} used by any component.
              </b>{' '}
              Some only the site uses; some are dead. Review them to retire the dead ones and mark the rest app-only, and this count goes to zero.
            </p>
            <Button variant="primary" onClick={() => setSheet({ title: `${orphans.length} roles no component uses`, body: <OrphanList /> })}>
              Review the {orphans.length}
            </Button>
          </div>
        ) : null}
        <div className="fd-tok">
          <DataTable
            label="colour roles"
            rowKey={(r) => r.token}
            chips={[
              { id: 'all', label: 'All', test: () => true },
              { id: 'used', label: 'Used', test: (r) => r.usedBy.length > 0 },
              { id: 'orphan', label: 'Used by nothing', test: (r) => !r.usedBy.length },
            ]}
            onRow={whoSheet}
            cols={[
              {
                key: 'role',
                label: 'Role',
                render: (r) => (
                  <button type="button" className="fd-qvb" onClick={() => roleSheet(r)}>
                    {r.role}
                  </button>
                ),
              },
              { key: 'light', label: 'Light', sortVal: (r) => r.lref ?? '', render: (r) => <Swatch v={r.light} r={r.lref} /> },
              { key: 'dark', label: 'Dark', sortVal: (r) => r.dref ?? '', render: (r) => <Swatch v={r.dark} r={r.dref} /> },
              {
                key: 'cr',
                label: 'Contrast',
                sortVal: (r) => contrastOf(r, P)?.r ?? 0,
                render: (r) => {
                  const c = contrastOf(r, P);
                  if (!c) return <span className="fd-sub2">Depends on what’s under it</span>;
                  return (
                    <span className={`fd-badge ${c.ok === null ? 'grey' : c.ok ? 'green' : 'red'}`}>
                      <span aria-hidden="true">{c.ok === null ? '○' : c.ok ? '✓' : '✕'}</span> <span className="fd-crv">{c.r.toFixed(2)} · </span>
                      {c.g}
                    </span>
                  );
                },
              },
              {
                key: 'n',
                label: 'Used by',
                end: true,
                sortVal: (r) => r.usedBy.length,
                render: (r) =>
                  r.usedBy.length ? (
                    <button type="button" className="k-rowbtn" onClick={() => whoSheet(r)}>
                      {r.usedBy.length}
                      <span className="fd-ubw"> components</span>
                    </button>
                  ) : (
                    <span className="fd-nobody">None</span>
                  ),
              },
            ]}
            rows={[...roles].sort((a, b) => b.usedBy.length - a.usedBy.length)}
          />
        </div>
      </div>

      <div {...panel('matrix')} tabIndex={0} className="fd-panel">
        <p className="fd-sublede">Roles down, components across. Hover a cell to follow its row and column.</p>
        <Matrix roles={roles} bella={bella} />
      </div>

      <div {...panel('type')} tabIndex={0} className="fd-panel">
        <p className="fd-sublede">
          BELLA’s type scale from <code>primitive.json</code>, each step drawn at its real size.
        </p>
        {f ? <TypePanel f={f} onSession={onSession} setSheet={setSheet} close={close} /> : <NotMeasured what={failed ? 'data/foundations.json is missing: run node scripts/sync-foundations.mjs.' : 'Loading…'} />}
      </div>

      <div {...panel('shape')} tabIndex={0} className="fd-panel">
        <p className="fd-sublede">Radius and spacing, drawn to scale.</p>
        {f ? <ShapePanel f={f} /> : <NotMeasured what={failed ? 'data/foundations.json is missing: run node scripts/sync-foundations.mjs.' : 'Loading…'} />}
      </div>

      <div {...panel('motion')} tabIndex={0} className="fd-panel">
        <p className="fd-sublede">Durations to scale, easings as their curve. Select any one to play it: durations run linear, easings run over 900ms.</p>
        {f ? <MotionPanel f={f} /> : <NotMeasured what={failed ? 'data/foundations.json is missing: run node scripts/sync-foundations.mjs.' : 'Loading…'} />}
      </div>

      <div {...panel('tokenized')} tabIndex={0} className="fd-panel">
        <p className="fd-sublede">Every declaration in BELLA’s component CSS, by property: how many read a token, and the ones that don’t.</p>
        {f ? <TokenizedPanel f={f} roles={roles.length} onColour={() => setTab('colours')} onSession={onSession} setSheet={setSheet} close={close} /> : <NotMeasured what={failed ? 'No CSS count: data/foundations.json is missing (node scripts/sync-foundations.mjs).' : 'Loading…'} />}
      </div>

      <Sheet open={!!sheet} title={sheet?.title ?? ''} onClose={close} footer={sheet?.footer}>
        {sheet?.body}
      </Sheet>
    </div>
  );
}

/* ---------- who uses what: roles down, components across, sticky head and
   first column, crosshair on hover ---------- */
function Matrix({ roles, bella }) {
  const [q, setQ] = useState('');
  const [by, setBy] = useState('use');
  const [hov, setHov] = useState(null);
  const sortRef = useRef(null);
  const nameToId = Object.fromEntries(bella.components.map((c) => [c.name, c.id]));
  const comps = [...new Set(roles.flatMap((t) => t.usedBy))].map((n) => nameToId[n] ?? n).sort();
  const max = Math.max(1, ...roles.map((t) => t.usedBy.length));
  let list = roles.filter((t) => t.usedBy.length && t.role.includes(q.trim().toLowerCase()));
  list = by === 'az' ? [...list].sort((a, b) => a.role.localeCompare(b.role)) : [...list].sort((a, b) => b.usedBy.length - a.usedBy.length);
  const sortBtn = (k, label) => (
    <button
      type="button"
      className="fd-mxsort"
      onClick={() => {
        setBy(k);
        sortRef.current = k;
      }}
    >
      {label}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={by === k ? (k === 'az' ? 'M12 19V5M6 11l6-6 6 6' : 'M12 5v14M6 13l6 6 6-6') : 'M8 9l4-4 4 4M8 15l4 4 4-4'} />
      </svg>
    </button>
  );
  return (
    <>
      <div className="k-tbar">
        <label className="k-search">
          <span className="k-vh">Filter roles</span>
          <input placeholder="Filter roles…" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="k-count" aria-live="polite">
          {list.length} roles · {comps.length} components
        </span>
      </div>
      <div className="fd-matrix" tabIndex={0} role="region" aria-label="Who uses what" onMouseLeave={() => setHov(null)}>
        <table>
          <caption className="k-vh">
            Colour roles by component, {list.length} roles, {comps.length} components
          </caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={by === 'az' ? 'ascending' : 'none'}>
                {sortBtn('az', 'Role')}
              </th>
              <th scope="col" className="fd-nc" aria-sort={by === 'use' ? 'descending' : 'none'}>
                {sortBtn('use', 'Used by')}
              </th>
              {comps.map((c, i) => (
                <th scope="col" key={c} className={hov?.c === i ? 'fd-xc' : undefined}>
                  <span>{c}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((t, ri) => {
              const ids = new Set(t.usedBy.map((n) => nameToId[n] ?? n));
              return (
                <tr key={t.role} className={hov?.r === ri ? 'fd-xr' : undefined} onMouseOver={() => hov?.r !== ri && setHov((h) => ({ ...h, r: ri }))}>
                  <th scope="row" onMouseOver={() => setHov({ r: ri, c: null })}>
                    {t.role}
                  </th>
                  <td className="fd-nc" onMouseOver={() => setHov({ r: ri, c: null })}>
                    <span className="fd-nbar">
                      <i style={{ width: `${(t.usedBy.length / max) * 100}%` }} />
                    </span>
                    {t.usedBy.length}
                  </td>
                  {comps.map((c, ci) => (
                    <td key={c} className={[ids.has(c) && 'fd-hit', hov?.c === ci && 'fd-xc'].filter(Boolean).join(' ') || undefined} onMouseOver={() => (hov?.r !== ri || hov?.c !== ci) && setHov({ r: ri, c: ci })}>
                      <span className="k-vh">{ids.has(c) ? `${c} uses it` : 'not used'}</span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length ? <p className="fd-empty">No role matches.</p> : null}
      </div>
    </>
  );
}

/* ---------- type: the faces against the contract, then every size ---------- */
// a size is drawn in the face and line height its name points to
const LH = (name, lineHeights) => lineHeights.find((l) => l.name === (/^display/.test(name) ? 'display' : /^quote/.test(name) ? 'quote' : 'normal'));
const FAMILY = (name) => (/^(display|quote)/.test(name) ? 'var(--display)' : /^(tag|mono)/.test(name) ? 'var(--code)' : 'var(--sans)');
function TypePanel({ f, onSession, setSheet, close }) {
  const { families, sizes, lineHeights } = f.type;
  // one row per size; two names on one value share it (base · body)
  const rows = [];
  for (const s of [...sizes].filter((s) => s.max).sort((a, b) => b.max - a.max)) {
    const same = rows.find((r) => r.value === s.value);
    if (same) same.names.push(s.name);
    else rows.push({ ...s, names: [s.name] });
  }
  const FONT = { display: 'var(--display)', body: 'var(--sans)', mono: 'var(--code)' };
  const compare = (fam) =>
    setSheet({
      title: 'The contract and the tokens disagree',
      body: (
        <>
          <div className="fd-vs">
            <figure>
              <span style={{ fontFamily: FONT[fam.name] }}>The keycap is the brand mark</span>
              <figcaption>
                The token today: <b>{fam.face}</b>
              </figcaption>
            </figure>
            <figure>
              <span style={{ fontFamily: `'${fam.contractFace}', var(--sans)` }}>The keycap is the brand mark</span>
              <figcaption>
                The contract: <b>{fam.contractFace}</b>
                {document.fonts?.check(`16px '${fam.contractFace}'`) ? '' : ' (not loaded here, so drawn in a fallback)'}
              </figcaption>
            </figure>
          </div>
          <p>
            <code>{fam.token}</code> is <b>{fam.face}</b>. BELLA’s contract (<code>bella.dsds.yaml</code>) says: “{fam.contract}”
          </p>
          <p>Agents build from the contract, so anything an agent makes will use the wrong face, and the gate can’t catch it because the contract is what it checks against.</p>
          <p>
            <b>Pick one source of truth:</b>
          </p>
        </>
      ),
      footer: (
        <>
          <Button variant="primary" onClick={() => (close(), onSession(`Update BELLA's contract (bella.dsds.yaml) so ${fam.token} says ${fam.face}, as the token does.`))}>
            Update the contract
          </Button>
          <Button onClick={() => (close(), onSession(`Switch BELLA's ${fam.token} token to ${fam.contractFace}, as the contract says.`))}>Switch the token to {fam.contractFace}</Button>
        </>
      ),
    });
  return (
    <>
      <div className="fd-fams">
        {families.map((fam) => (
          <div className="fd-fam" key={fam.name}>
            <span className={`fd-fam-a ${fam.name}`} style={{ fontFamily: FONT[fam.name] }} aria-hidden="true">
              Aa
            </span>
            <b>
              {fam.face}
              {fam.weights?.length ? ` ${fam.weights.join(' · ')}` : ''}
            </b>
            <span>{fam.role}</span>
            {fam.matches === null ? <span className="fd-pillk">Not in the contract</span> : fam.matches ? <span className="fd-pillk ok">Matches</span> : <span className="fd-pillk bad">Contract says {fam.contractFace}</span>}
            {fam.matches === false ? <Button onClick={() => compare(fam)}>Compare and fix</Button> : null}
          </div>
        ))}
      </div>
      <div className="fd-tscale" role="list" aria-label="Type sizes">
        {rows.map((s) => {
          const lh = LH(s.names[0], lineHeights);
          return (
          <div className="fd-tspec" role="listitem" key={s.value}>
            <span className="fd-lbox" style={{ fontFamily: FAMILY(s.names[0]), '--fd-size': `${s.max}px`, lineHeight: lh?.value }} aria-hidden="true">
              The keycap
            </span>
            <span className="fd-anno">
              <b>{s.max}</b>
              {s.names.join(' · ')}
              {s.fluid ? ` · ${s.min} → ${s.max}` : ''}
              {lh ? ` · ${lh.value}` : ''}
              <span className="k-vh">{s.fluid ? `, fluid from ${s.min} pixels` : ''}{lh ? `, line height ${lh.token}` : ''}</span>
            </span>
          </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- shape and space, to scale ---------- */
function ShapePanel({ f }) {
  // two names on one value share a tile (full · pill); the pill-sized ones last
  const radii = [];
  for (const r of [...f.radius].sort((a, b) => (a.px >= 999) - (b.px >= 999))) {
    const same = radii.find((x) => x.value === r.value);
    if (same) same.names.push(r.name);
    else radii.push({ ...r, names: [r.token] });
  }
  return (
    <div className="fd-stack">
      <section className="fd-card" aria-labelledby="fdRad">
        <h2 className="fd-h3s" id="fdRad">
          Radius
        </h2>
        <ul className="fd-radii">
          {radii.map((r) => (
            <li className="fd-rad" key={r.name}>
              <i style={{ borderTopLeftRadius: `${Math.min(r.px ?? 0, 72)}px` }} aria-hidden="true" />
              <code>{r.names.join(' · ')}</code>
              <span>{r.value}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="fd-card" aria-labelledby="fdSp">
        <h2 className="fd-h3s" id="fdSp">
          Spacing
        </h2>
        <ul className="fd-spaces">
          {[...f.spacing].sort((a, b) => a.px - b.px).map((s) => (
            <li className="fd-spc" key={s.name}>
              <span>
                <code>{s.token}</code> · {s.value}
              </span>
              <i style={{ width: `${s.px * 3}px` }} aria-hidden="true" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ---------- motion: select one to play it. The dot rides the easing curve:
   x is time, y is progress, both from the same cubic-bezier ---------- */
const bez = (p1, p2, s) => 3 * (1 - s) ** 2 * s * p1 + 3 * (1 - s) * s * s * p2 + s ** 3;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function play(btn) {
  const t = btn.querySelector('.fd-trk');
  btn.style.setProperty('--w', `${t.offsetWidth}px`);
  btn.classList.remove('play');
  void btn.offsetWidth;
  btn.classList.add('play');
}
function ride(svg, [a, b, c, d]) {
  const dot = svg.querySelector('circle');
  if (reduced()) {
    dot.setAttribute('cx', 64);
    dot.setAttribute('cy', 16);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / 900);
    let lo = 0;
    let hi = 1;
    let s = t;
    for (let k = 0; k < 20; k++) {
      s = (lo + hi) / 2;
      bez(a, c, s) < t ? (lo = s) : (hi = s);
    }
    dot.setAttribute('cx', 8 + bez(a, c, s) * 56);
    dot.setAttribute('cy', 64 - bez(b, d, s) * 48);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function MotionPanel({ f }) {
  const { durations, easings } = f.motion;
  const longest = Math.max(...durations.map((d) => d.ms));
  const P = (x, y) => `${8 + x * 56} ${64 - y * 48}`;
  return (
    <div className="fd-motion2">
      <section className="fd-card" aria-labelledby="fdDur">
        <h2 className="fd-h3s" id="fdDur">
          Duration
        </h2>
        <div className="fd-durs">
          {[...durations].sort((a, b) => a.ms - b.ms).map((d) => (
            <button type="button" className="fd-dur" key={d.name} style={{ '--t': d.value }} onClick={(e) => play(e.currentTarget)} aria-label={`Play ${d.token}, ${d.value}`}>
              <code>{d.token}</code>
              <span className="fd-trk">
                <i style={{ width: `${(d.ms / longest) * 100}%` }} />
                <b />
              </span>
              <span>{d.value}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="fd-card" aria-labelledby="fdEase">
        <h2 className="fd-h3s" id="fdEase">
          Easing
        </h2>
        <div className="fd-eases">
          {easings.map((e) => {
            const [a, b, c, d] = e.points ?? [0, 0, 1, 1];
            return (
              <button
                type="button"
                className="fd-ease"
                key={e.name}
                style={{ '--e': e.value }}
                aria-label={`Play ${e.token}, ${e.value}`}
                onClick={(ev) => {
                  play(ev.currentTarget);
                  ride(ev.currentTarget.querySelector('svg'), [a, b, c, d]);
                }}
              >
                <code>{e.token}</code>
                <svg viewBox="0 0 72 72" aria-hidden="true">
                  <path d={`M${P(0, 0)} C${P(a, b)} ${P(c, d)} ${P(1, 1)}`} />
                  <circle cx="8" cy="64" r="4" />
                </svg>
                <span className="fd-trk">
                  <b />
                </span>
                <span>{e.value}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ---------- tokenized? every declaration in src/components/*.module.css ---------- */
function TokenizedPanel({ f, roles, onColour, onSession, setSheet, close }) {
  const props = f.tokenized.rows;
  const done = props.filter((r) => r.decl && !r.not.length).length;
  const not = props.flatMap((r) => r.not);
  const comps = [...new Set(not.map((n) => n.component))];
  const rows = [{ p: 'Colour', tokens: roles, colour: true, not: [] }, ...props];
  const see = (r) =>
    setSheet({
      title: `${r.p}: ${r.not.length} not a token`,
      body: (
        <>
          <p>
            Each declaration below sets a {r.p.toLowerCase()} value directly instead of reading a BELLA token. Keywords such as <code>0</code>, <code>none</code> and <code>inherit</code> aren’t counted.
          </p>
          <ul className="fd-plain">
            {r.not.map((n) => (
              <li key={`${n.file}:${n.line}`}>
                <span>
                  <b>{n.component}</b> <code>{n.decl}</code>
                </span>
                <code className="fd-muted">
                  {n.file.replace('src/components/', '')}:{n.line}
                </code>
              </li>
            ))}
          </ul>
        </>
      ),
      footer: (
        <Button variant="primary" onClick={() => (close(), onSession(`In BELLA, replace these hard-coded ${r.p.toLowerCase()} values with tokens: ${r.not.map((n) => `${n.file}:${n.line} (${n.decl})`).join('; ')}.`))}>
          Fix in a session
        </Button>
      ),
    });
  return (
    <>
      <div className="fd-tzsum">
        <div>
          <b>
            {done} of {props.length}
          </b>
          <span>properties fully tokenized</span>
        </div>
        <div>
          <b>{not.length}</b>
          <span>declarations not read as a token</span>
        </div>
        <div>
          <b>{comps.length}</b>
          <span>{comps.length ? `component${comps.length === 1 ? '' : 's'} with a hard-coded value: ${comps.join(', ')}` : 'components with a hard-coded value'}</span>
        </div>
      </div>
      <div className="fd-tz">
        <DataTable
          label="properties"
          search={false}
          rowKey={(r) => r.p}
          chips={[
            { id: 'all', label: 'All', test: () => true },
            { id: 'done', label: 'Fully tokenized', test: (r) => !r.colour && r.decl > 0 && !r.not.length },
            { id: 'not', label: 'Has hard-coded values', test: (r) => r.not.length > 0 },
          ]}
          cols={[
            { key: 'p', label: 'Property', render: (r) => <b className="fd-ink">{r.p}</b> },
            { key: 'tokens', label: 'Tokens' },
            {
              key: 'pct',
              label: 'Read a token',
              end: true,
              sortVal: (r) => (r.colour ? 2 : r.decl ? r.ok / r.decl : 0),
              render: (r) =>
                r.colour ? (
                  '—'
                ) : r.decl ? (
                  <>
                    <span className={`fd-tzbar${r.ok === r.decl ? ' full' : ''}`}>
                      <i style={{ width: `${(r.ok / r.decl) * 100}%` }} />
                    </span>
                    <span className="fd-tzn">{Math.round((r.ok / r.decl) * 100)}%</span> <small>
                      {r.ok} of {r.decl}
                    </small>
                  </>
                ) : (
                  'Not measured'
                ),
            },
            {
              key: 'not',
              label: 'Not a token',
              sort: false,
              render: (r) =>
                r.colour ? (
                  <button type="button" className="fd-link" onClick={onColour}>
                    Counted per role on the Colour tab
                  </button>
                ) : r.not.length ? (
                  [...new Set(r.not.map((n) => n.component))].map((c) => `${c} ${r.not.filter((n) => n.component === c).map((n) => n.decl.split(': ')[1]).join(', ')}`).join('; ')
                ) : (
                  <span className="fd-pillk ok">None</span>
                ),
            },
            {
              key: 'act',
              label: 'Action',
              sort: false,
              render: (r) =>
                r.not.length ? (
                  <Button className="fd-tzact" onClick={() => see(r)}>
                    See the {r.not.length}
                  </Button>
                ) : null,
            },
          ]}
          rows={rows}
        />
      </div>
      <p className="fd-src">
        {f.tokenized.files} component CSS files, BELLA @ <code>{f.source.commit}</code>
      </p>
    </>
  );
}
