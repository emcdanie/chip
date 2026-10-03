// Atlas: one BELLA component as an object page. Header (name, one line,
// status pills), then one job per view: Anatomy | Try a change | Facts |
// Notes. Parts, facts and gates come from data/bella.json; nothing here is
// written by hand.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Heading from '@bella/components/Heading/Heading';
import Eyebrow from '@bella/components/Eyebrow/Eyebrow';
import Link from '@bella/components/Link/Link';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import { SPECIMENS } from './specimens.jsx';
import { layout, targetsOf } from './anatomy.js';
import { forceAttr, installForcedStates } from './forcedStates.js';
import Sandbox, { baseOf, overridesOf } from './Sandbox.jsx';

const REPO_FILE = 'https://github.com/emcdanie/bella/blob/main/tokens/component.json';

function useReducedMotion() {
  const q = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** --color-semantic-surface-card -> --color-sem…surface-card: the ends carry the meaning. */
export function middle(token, max = 26) {
  if (!token || token.length <= max) return token;
  const keep = max - 1;
  return `${token.slice(0, Math.ceil(keep / 2))}…${token.slice(-Math.floor(keep / 2))}`;
}

/* ---------- Study B: numbered anatomy at rest ---------- */
const area = (z) => (z.right - z.left) * (z.bottom - z.top);

// mark the targets of the selected part so a hover-, focus- or press-only
// layer shows while it is selected
function useForced(root, parts, hl) {
  useLayoutEffect(() => {
    const el = root.current?.querySelector('[data-bella-component]');
    if (!el) return;
    const all = [el, ...el.querySelectorAll('*')];
    for (const n of all) {
      for (const a of ['data-force-hover', 'data-force-focus', 'data-force-active']) n.removeAttribute(a);
      // put back an aria-pressed we changed for a "pressed" part
      if (n.hasAttribute('data-was-pressed')) {
        n.setAttribute('aria-pressed', n.getAttribute('data-was-pressed'));
        n.removeAttribute('data-was-pressed');
      }
    }
    const part = parts.find((p) => p.key === hl);
    const force = forceAttr(part?.trigger);
    if (!force) return;
    const [attr, value] = force;
    // a Set: ':scope' targets the root itself, which must only be marked once
    for (const t of new Set([el, ...targetsOf(el, part.target)])) {
      if (attr === 'aria-pressed') {
        if (!t.hasAttribute('aria-pressed')) continue;
        t.setAttribute('data-was-pressed', t.getAttribute('aria-pressed'));
      }
      t.setAttribute(attr, value);
    }
  });
}

function Anatomy({ name, parts, hl, setHl, zoom, setZoom, overrides }) {
  const frame = useRef(null);
  const [geo, setGeo] = useState(null);
  const Render = SPECIMENS[name];
  useForced(frame, parts, hl);

  // small components are drawn larger so the pins have room, but never wider
  // than the stage leaves room for
  useLayoutEffect(() => {
    const root = frame.current?.querySelector('[data-bella-component]');
    if (!root) return;
    const w = root.offsetWidth;
    const want = w < 200 ? 2 : w < 360 ? 1.5 : 1;
    const room = (frame.current.clientWidth * 0.8) / w;
    const next = Math.max(1, Math.min(want, Math.floor(room * 2) / 2));
    if (next !== zoom) setZoom(next);
  }, [name, zoom, setZoom]);

  // zones, lines and pins are measured, so re-measure whenever the frame or
  // the specimen itself changes size (window, sidebar, fonts, a forced state)
  const measure = useCallback(() => setGeo(layout(frame.current, parts)), [parts]);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(frame.current);
    const root = frame.current.querySelector('[data-bella-component]');
    if (root) ro.observe(root);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure, name, zoom, overrides, hl]);

  return (
    <div className="stage">
      <div className="spec-frame" ref={frame}>
        <div className="spec-render" inert aria-hidden="true" style={{ zoom, ...overrides }}>
          {Render ? <Render /> : null}
        </div>
        {geo ? (
          <div className="spec-overlay" aria-hidden="true">
            {/* largest first, so a small zone inside a big one stays reachable */}
            {[...geo.parts].sort((a, b) => area(b.zone) - area(a.zone)).map((p) => (
              <div
                key={p.key}
                className="zone"
                data-hl={hl === p.key || undefined}
                onMouseEnter={() => setHl(p.key)}
                style={{ left: p.zone.left, top: p.zone.top, width: p.zone.right - p.zone.left, height: p.zone.bottom - p.zone.top }}
              />
            ))}
            <svg className="leaders" width={geo.width} height={geo.height} viewBox={`0 0 ${geo.width} ${geo.height}`}>
              {geo.parts.map((p) => (
                <g key={p.key} data-hl={hl === p.key || undefined}>
                  <line x1={p.pin[0]} y1={p.pin[1]} x2={p.anchor[0]} y2={p.anchor[1]} />
                  <circle className="anc" cx={p.anchor[0]} cy={p.anchor[1]} r={hl === p.key ? 6 : 4.5} />
                </g>
              ))}
            </svg>
            {geo.parts.map((p) => (
              <div key={p.key} className="pin" data-hl={hl === p.key || undefined} onMouseEnter={() => setHl(p.key)} style={{ left: p.pin[0], top: p.pin[1] }}>
                {p.n}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Legend({ name, parts, hl, setHl }) {
  return (
    <ul className="legend" aria-label={`${name} anatomy`}>
      {parts.map((p) => (
        <li key={p.key}>
          <button
            type="button"
            aria-pressed={hl === p.key}
            onMouseEnter={() => setHl(p.key)}
            onFocus={() => setHl(p.key)}
            onClick={() => setHl(p.key)}
          >
            <span className="n">{p.n}</span>
            <span className="legend-name">{p.title}</span>
            <span className="legend-line">{p.detail}</span>
            <span className="legend-token" title={p.token}>
              {middle(p.token)}
              {p.trigger && p.trigger !== 'rest' ? ` · on ${p.trigger}` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Study D: exploded layers, flat labels ---------- */
const OPEN = { rx: 56, rz: -22 };

function Exploded({ name, parts, hl, setHl, zoom, overrides }) {
  const stage = useRef(null);
  const rig = useRef(null);
  const lines = useRef(null);
  const labels = useRef({});
  const [rot, setRot] = useState({ rx: 0, rz: 0, open: false });
  const drag = useRef(null);
  const raf = useRef(0);
  const Render = SPECIMENS[name];
  const mid = (parts.length - 1) / 2;

  // mark each card's target so its layer can be isolated by kind
  useLayoutEffect(() => {
    for (const card of rig.current.querySelectorAll('.card')) {
      const root = card.querySelector('[data-bella-component]');
      const part = parts.find((p) => p.key === card.dataset.key);
      for (const el of targetsOf(root, part.target)) el.setAttribute('data-anat-target', '');
    }
  }, [parts, name]);

  const place = useCallback(() => {
    if (!stage.current) return;
    const sr = stage.current.getBoundingClientRect();
    const pts = [...rig.current.querySelectorAll('.card')].map((c) => {
      const a = c.querySelector('.card-anchor').getBoundingClientRect();
      return { key: c.dataset.key, x: a.left - sr.left, y: a.top - sr.top };
    });
    // labels in top-to-bottom screen order, at least 64px apart (more when a
    // label is taller than that), kept inside the stage
    const order = pts.sort((a, b) => a.y - b.y);
    const tallest = Math.max(...Object.values(labels.current).map((el) => el?.offsetHeight ?? 0));
    const gap = Math.max(64, tallest + 8);
    let prev = -1e9;
    for (const o of order) {
      o.ly = Math.max(o.y, prev + gap);
      prev = o.ly;
    }
    const top = order.length ? order[0].ly - tallest / 2 : 0;
    if (top < 8) for (const o of order) o.ly += 8 - top;
    const over = prev - (sr.height - 40);
    if (over > 0) for (const o of order) o.ly -= over;
    let svg = '';
    for (const o of order) {
      const el = labels.current[o.key];
      if (!el) continue;
      el.style.top = `${o.ly}px`;
      const lx = el.offsetLeft;
      svg += `<path d="M${o.x} ${o.y} C ${o.x + 40} ${o.y}, ${lx - 40} ${o.ly}, ${lx - 4} ${o.ly}"/><circle cx="${o.x}" cy="${o.y}" r="3.5"/>`;
    }
    lines.current.innerHTML = svg;
  }, []);

  const track = useCallback(
    (ms) => {
      const t0 = performance.now();
      cancelAnimationFrame(raf.current);
      const f = () => {
        place();
        if (performance.now() - t0 < ms) raf.current = requestAnimationFrame(f);
      };
      f();
    },
    [place]
  );

  useEffect(() => {
    const t = setTimeout(() => setRot({ ...OPEN, open: true }), 30);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => track(900), [rot.open, track]);
  useEffect(() => {
    const on = () => place();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [place]);

  function down(e) {
    if (e.target.closest('.label')) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, rx: rot.rx, rz: rot.rz };
    stage.current.setPointerCapture(e.pointerId);
    stage.current.dataset.drag = '';
  }
  function move(e) {
    if (!drag.current) return;
    const d = drag.current;
    setRot((r) => ({
      ...r,
      rz: d.rz + (e.clientX - d.x) * 0.35,
      rx: Math.max(10, Math.min(80, d.rx - (e.clientY - d.y) * 0.35)),
    }));
    requestAnimationFrame(place);
  }
  function up() {
    drag.current = null;
    delete stage.current.dataset.drag;
  }

  return (
    <div
      className="exploded"
      ref={stage}
      data-open={rot.open || undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div
        className="rig"
        ref={rig}
        aria-hidden="true"
        inert
        style={{ transform: rot.open ? `rotateX(${rot.rx}deg) rotateZ(${rot.rz}deg)` : 'none' }}
        data-dragging={drag.current ? '' : undefined}
      >
        {parts.map((p, i) => (
          <div
            key={p.key}
            className="card"
            data-key={p.key}
            data-kind={p.kind}
            data-hl={hl === p.key || undefined}
            style={{ transform: rot.open ? `translateZ(calc(${i - mid} * var(--spacing-20)))` : 'none' }}
          >
            <div className="card-layer" style={{ zoom, ...overrides }}>
              {Render ? <Render /> : null}
            </div>
            <span className="card-anchor" />
          </div>
        ))}
      </div>
      <svg className="ex-lines" ref={lines} aria-hidden="true" />
      <ul className="ex-labels" aria-label={`${name} layers`}>
        {[...parts].reverse().map((p) => (
          <li key={p.key}>
            <button
              type="button"
              className="label"
              ref={(el) => (labels.current[p.key] = el)}
              aria-pressed={hl === p.key}
              onMouseEnter={() => setHl(p.key)}
              onFocus={() => setHl(p.key)}
              onClick={() => setHl(p.key)}
            >
              <span className="n">{p.n}</span>
              <b>{p.title}</b>
              <small>
                {p.token}
                {p.trigger ? ` · on ${p.trigger}` : ''}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- views ---------- */
const VIEWS = [
  { id: 'anatomy', label: 'Anatomy' },
  { id: 'try', label: 'Try a change' },
  { id: 'facts', label: 'Facts' },
  { id: 'notes', label: 'Notes' },
];

function pill(status, word) {
  const pass = status === 'pass' || status === true;
  return <StatusPill variant={pass ? 'success' : 'info'}>{word}</StatusPill>;
}

function Facts({ c, notify }) {
  const focusable = c.states.includes('focus');
  async function copy(t) {
    try {
      await navigator.clipboard.writeText(`var(${t})`);
      notify(`Copied var(${t})`);
    } catch {
      notify(`Could not copy ${t}`);
    }
  }
  return (
    <div className="facts-view">
      <dl className="facts">
        <div><dt>Variants</dt><dd>{c.variants.length ? c.variants.join(', ') : 'None'}</dd></div>
        <div><dt>States</dt><dd>{c.states.length ? c.states.join(', ') : 'Not recorded'}</dd></div>
        <div><dt>Min target</dt><dd>{c.minTarget ? `${c.minTarget.value}` : 'Not a control'}</dd></div>
        <div><dt>Focus</dt><dd>{focusable ? '3px ring, 3px offset, keyboard focus only' : 'Not focusable'}</dd></div>
        <div><dt>Tokens</dt><dd>{c.tokens.count}</dd></div>
        <div><dt>Story</dt><dd>{c.storyUrl ? <Link href={c.storyUrl} external>Open the story</Link> : 'None published'}</dd></div>
      </dl>
      <h2 className="view-title">Tokens</h2>
      <ul className="token-rows">
        {c.tokens.list.map((t) => (
          <li key={t}>
            <span className="legend-token" title={t}>{middle(t, 34)}</span>
            <ActionChip onClick={() => copy(t)} ariaLabel={`Copy ${t}`}>Copy</ActionChip>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Notes({ c, notes }) {
  return notes.length ? (
    <ul className="note-list">
      {[...notes].reverse().map((n) => (
        <li key={n.at}>
          <p className="label">
            <time dateTime={n.at}>{new Date(n.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
            {n.question ? ` · ${n.question}` : ''}
          </p>
          <p className="note-text">{n.text.length > 400 ? `${n.text.slice(0, 400)}…` : n.text}</p>
        </li>
      ))}
    </ul>
  ) : (
    <p className="label">No notes for {c.name} yet. Save one from an OBI answer.</p>
  );
}

// the rendered specimen's height in layout pixels (the stage's zoom does not count)
function specimenHeight() {
  const el = document.querySelector('.atlas .spec-render [data-bella-component], .atlas .card-layer [data-bella-component]');
  return el ? el.offsetHeight : null;
}

export default function Atlas({ c, bella, theme, notes = [], view, setView }) {
  const reduced = useReducedMotion();
  const [exploded, setExploded] = useState(false);
  const [hl, setHl] = useState(null);
  const [toast, setToast] = useState('');
  const [zoom, setZoom] = useState(1);
  const [drafted, setDrafted] = useState({ id: null, v: {} });
  const [heights, setHeights] = useState({ base: null, now: null });
  const parts = c?.parts ?? [];
  // the draft belongs to one component; a stale one is never applied
  const draft = c && drafted.id === c.id ? drafted.v : c ? baseOf(c) : {};
  const setDraft = useCallback(
    (fn) => setDrafted((d) => ({ id: c.id, v: typeof fn === 'function' ? fn(d.id === c.id ? d.v : baseOf(c)) : fn })),
    [c]
  );
  const overrides = c ? overridesOf(c, draft) : {};
  const changed = Object.keys(overrides).length > 0;

  useEffect(() => installForcedStates(), []);
  useEffect(() => {
    setExploded(false);
    setHl(null);
    setHeights({ base: null, now: null });
  }, [c?.id]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  // measure after every render that can move the specimen; the base height is
  // whatever it measures with no change applied
  useLayoutEffect(() => {
    const h = specimenHeight();
    setHeights((o) => {
      const base = changed ? o.base : h;
      return o.base === base && o.now === h ? o : { base, now: h };
    });
  });

  if (!c) return <p className="loading">Loading BELLA…</p>;
  const Render = SPECIMENS[c.name];
  const showExplode = parts.length > 0 && !reduced;
  const short = c.description?.split(/(?<=\.)\s/)[0] ?? '';

  return (
    <div className="atlas">
      <header className="atlas-head">
        <Eyebrow>Atlas · {c.category ?? 'No contract yet'}</Eyebrow>
        <Heading tier="page" as="h1">{c.name}</Heading>
        {c.description ? (
          <details className="atlas-desc">
            <summary>
              <span className="desc-line">{short}</span>
              {short !== c.description ? <span className="more">More</span> : null}
            </summary>
            <p>{c.description}</p>
          </details>
        ) : null}
        <p className="atlas-pills">
          {pill(c.health.contrast.status, `Contrast ${c.health.contrast.status}`)}
          {pill(c.health.contract.status, `Parity ${c.health.contract.status}`)}
          {pill(c.hasStory, c.hasStory ? 'Story present' : 'Story missing')}
          {pill(c.inDsds, c.inDsds ? 'DSDS present' : 'DSDS missing')}
        </p>
      </header>

      <Tabs tabs={VIEWS} value={view} onChange={setView} label={`${c.name} views`} idBase="atlas" className="atlas-tabs" />

      <div {...tabPanelProps('atlas', 'anatomy', view === 'anatomy')}>
        {view === 'anatomy' ? (
          parts.length ? (
            <div className="anatomy-view">
              <div className="anatomy-bar">
                <p className="label">
                  {parts.length} parts, bottom layer first. Hover or focus a part to find it.
                </p>
                {showExplode ? (
                  <SegmentedControl
                    label="Anatomy view"
                    value={exploded ? 'exploded' : 'rest'}
                    onChange={(v) => setExploded(v === 'exploded')}
                    options={[
                      { value: 'rest', label: 'At rest' },
                      { value: 'exploded', label: 'Exploded' },
                    ]}
                  />
                ) : null}
              </div>
              {exploded && showExplode ? (
                <Exploded name={c.name} parts={parts} hl={hl} setHl={setHl} zoom={zoom} overrides={overrides} />
              ) : (
                <div className="anatomy-split">
                  <Anatomy name={c.name} parts={parts} hl={hl} setHl={setHl} zoom={zoom} setZoom={setZoom} overrides={overrides} />
                  <Legend name={c.name} parts={parts} hl={hl} setHl={setHl} />
                </div>
              )}
            </div>
          ) : (
            <div className="anatomy-split">
              <div className="stage">
                <div className="spec-frame spec-frame--plain">
                  <div className="spec-render" inert aria-hidden="true">
                    {Render ? <Render /> : null}
                  </div>
                </div>
              </div>
              <div className="no-anatomy">
                <p>No anatomy recorded for {c.name} yet.</p>
                <p className="label">Add it in BELLA at {c.anatomySource}</p>
                <Link href={REPO_FILE} external>Open the contract file</Link>
              </div>
            </div>
          )
        ) : null}
      </div>

      <div {...tabPanelProps('atlas', 'try', view === 'try')}>
        {view === 'try' ? (
          <Sandbox bella={bella} c={c} draft={draft} setDraft={setDraft} heights={heights} theme={theme} notify={setToast}>
            <div className="stage">
              <div className="spec-frame spec-frame--plain">
                <div className="spec-render" inert aria-hidden="true" style={overrides}>
                  {Render ? <Render /> : null}
                </div>
              </div>
            </div>
          </Sandbox>
        ) : null}
      </div>

      <div {...tabPanelProps('atlas', 'facts', view === 'facts')}>{view === 'facts' ? <Facts c={c} notify={setToast} /> : null}</div>
      <div {...tabPanelProps('atlas', 'notes', view === 'notes')}>
        {view === 'notes' ? <Notes c={c} notes={notes.filter((n) => n.component === c.name)} /> : null}
      </div>

      <p className="toast" role="status" aria-live="polite" data-show={toast ? '' : undefined}>
        {toast}
      </p>
    </div>
  );
}
