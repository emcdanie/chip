import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Heading from '@bella/components/Heading/Heading';
import Eyebrow from '@bella/components/Eyebrow/Eyebrow';
import Button from '@bella/components/Button/Button';
import Link from '@bella/components/Link/Link';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import { SPECIMENS } from './specimens.jsx';
import { layout, targetsOf } from './anatomy.js';

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

/* ---------- Study B: numbered anatomy at rest ---------- */
const area = (z) => (z.right - z.left) * (z.bottom - z.top);

function Anatomy({ name, parts, hl, setHl, zoom, setZoom }) {
  const frame = useRef(null);
  const [geo, setGeo] = useState(null);
  const Render = SPECIMENS[name];

  // small components are drawn larger so the pins have room; zones, lines
  // and pins are measured after the zoom, so they stay in one space
  useLayoutEffect(() => {
    const root = frame.current?.querySelector('[data-bella-component]');
    if (!root) return;
    const w = root.getBoundingClientRect().width / zoom;
    const next = w < 200 ? 2 : w < 360 ? 1.5 : 1;
    if (next !== zoom) setZoom(next);
  }, [name, zoom, setZoom]);

  const measure = useCallback(() => setGeo(layout(frame.current, parts)), [parts]);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame.current);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure, name, zoom]);

  return (
    <div className="anatomy">
      <div className="stage">
        <div className="spec-frame" ref={frame}>
          <div className="spec-render" inert aria-hidden="true" style={{ zoom }}>
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
                  style={{
                    left: p.zone.left,
                    top: p.zone.top,
                    width: p.zone.right - p.zone.left,
                    height: p.zone.bottom - p.zone.top,
                  }}
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
                <div
                  key={p.key}
                  className="pin"
                  data-hl={hl === p.key || undefined}
                  onMouseEnter={() => setHl(p.key)}
                  style={{ left: p.pin[0], top: p.pin[1] }}
                >
                  {p.n}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <Legend name={name} parts={parts} hl={hl} setHl={setHl} />
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
            <b>{p.title}</b>
            <small>
              {p.detail} · {p.token}
            </small>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Study D: exploded layers, flat labels ---------- */
const OPEN = { rx: 56, rz: -22 };

function Exploded({ name, parts, hl, setHl, zoom }) {
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
            <div className="card-layer" style={{ zoom }}>
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
              <small>{p.token}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- right panel ---------- */
function Pill({ status }) {
  const pass = status === 'pass' || status === true;
  const word = status === true ? 'present' : status === false ? 'missing' : status;
  return <StatusPill variant={pass ? 'success' : 'info'}>{word}</StatusPill>;
}

function Panel({ c, parts, hl, onAsk, notify }) {
  const focusable = c.states.includes('focus');
  const selected = parts.find((p) => p.key === hl);
  const token = selected?.token ?? c.tokens.list[0];
  async function copy() {
    try {
      await navigator.clipboard.writeText(`var(${token})`);
      notify(`Copied var(${token})`);
    } catch {
      notify(`Could not copy ${token}`);
    }
  }
  return (
    <aside className="spec-panel" aria-label={`${c.name} facts and actions`}>
      <section aria-labelledby="facts-h">
        <h2 id="facts-h" className="panel-title">Facts</h2>
        <dl className="facts">
          <div>
            <dt>Variants</dt>
            <dd>{c.variants.length ? c.variants.join(', ') : 'none'}</dd>
          </div>
          <div>
            <dt>States</dt>
            <dd>{c.states.length ? c.states.join(', ') : 'not recorded'}</dd>
          </div>
          <div>
            <dt>Min target</dt>
            <dd>{c.minTarget ? `${c.minTarget.value} (${c.minTarget.token})` : 'not a control'}</dd>
          </div>
          <div>
            <dt>Focus</dt>
            <dd>{focusable ? '3px ring, 3px offset, focus-visible only (--ring-focus-color)' : 'not focusable'}</dd>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd>{c.tokens.count}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="gates-h">
        <h2 id="gates-h" className="panel-title">Gate results</h2>
        <dl className="gates">
          <div>
            <dt>Contrast</dt>
            <dd><Pill status={c.health.contrast.status} /></dd>
          </div>
          <div>
            <dt>Contract parity</dt>
            <dd><Pill status={c.health.contract.status} /></dd>
          </div>
          <div>
            <dt>Story</dt>
            <dd><Pill status={c.hasStory} /></dd>
          </div>
          <div>
            <dt>DSDS</dt>
            <dd><Pill status={c.inDsds} /></dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="actions-h" className="actions">
        <h2 id="actions-h" className="panel-title">Actions</h2>
        <Button variant="secondary" onClick={copy}>Copy token</Button>
        <p className="meta">{token}</p>
        {c.storyUrl ? <Link href={c.storyUrl} external>Open story</Link> : <p className="meta">No story published</p>}
        <Button variant="tertiary" onClick={() => onAsk(c.name)}>Ask CHIP about {c.name}</Button>
      </section>
    </aside>
  );
}

/* ---------- the view ---------- */
export default function Specimen({ c, onAsk }) {
  const reduced = useReducedMotion();
  const [exploded, setExploded] = useState(false);
  const [hl, setHl] = useState(null);
  const [toast, setToast] = useState('');
  const [zoom, setZoom] = useState(1);
  const parts = c?.parts ?? [];

  useEffect(() => {
    setExploded(false);
    setHl(null);
  }, [c?.id]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!c) return <p className="loading">Loading BELLA…</p>;
  const Render = SPECIMENS[c.name];
  const showExplode = parts.length > 0 && !reduced;

  return (
    <div className="specimen">
      <div className="spec-main">
        <header className="spec-head">
          <Eyebrow>Specimen</Eyebrow>
          <Heading tier="section" as="h1">
            {c.name}
          </Heading>
          {c.description ? <p className="block-lead">{c.description}</p> : null}
        </header>

        {parts.length ? (
          <>
            {showExplode ? (
              <div className="spec-bar">
                <Button variant="secondary" onClick={() => setExploded((x) => !x)}>
                  {exploded ? 'Put it back together' : 'Explode'}
                </Button>
                {exploded ? <p className="meta">Drag to turn</p> : null}
              </div>
            ) : null}
            {exploded && showExplode ? (
              <Exploded name={c.name} parts={parts} hl={hl} setHl={setHl} zoom={zoom} />
            ) : (
              <Anatomy name={c.name} parts={parts} hl={hl} setHl={setHl} zoom={zoom} setZoom={setZoom} />
            )}
          </>
        ) : (
          <div className="anatomy">
            <div className="stage">
              <div className="spec-frame spec-frame--plain">
                <div className="spec-render" inert aria-hidden="true">
                  {Render ? <Render /> : null}
                </div>
              </div>
            </div>
            <div className="no-anatomy">
              <p>No anatomy recorded for {c.name} yet.</p>
              <p className="meta">Add it in BELLA at {c.anatomySource}</p>
              <Link href={REPO_FILE} external>Open the contract file</Link>
            </div>
          </div>
        )}
      </div>

      <Panel c={c} parts={parts} hl={hl} onAsk={onAsk} notify={setToast} />

      <p className="toast" role="status" aria-live="polite" data-show={toast ? '' : undefined}>
        {toast}
      </p>
    </div>
  );
}
