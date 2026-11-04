// Atlas: one BELLA component, as the approved mock's component page
// (chip-mock-03): breadcrumb, H1 with its test and Figma status, the lede and
// actions, then twelve doc tabs as one segmented control. Every panel reads
// real data: data/bella.json, /bella-doc, /bella-spec, /bella-history,
// /component-tests, /figma-lint and BELLA's own files. Where there is no
// source, the panel says so instead of inventing it.
// CHIP's chrome (header, tabs, panel buttons) sits in k-chrome roots; every
// BELLA specimen sits outside them, so it keeps BELLA's own look.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import { Segmented, StatusPill, segPanelProps, Chips } from './kit/index.jsx';
import { SpecStage, keyboardOf } from './AtlasSpec.jsx';
import { canSee, settingsOf } from './visibility.jsx';
import { SPECIMENS, VARIANTS, SHAPES, PLAY, COMPONENTS } from './specimens.jsx';
import { layout, targetsOf } from './anatomy.js';
import { forceAttr, installForcedStates } from './forcedStates.js';
import { checkSet, overridesOf, baseOf } from './Sandbox.jsx';
import './atlas.css';

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

/** A token in full, allowed to wrap after each "-" (never cut in the middle). */
export function Token({ name }) {
  if (!name) return null;
  // never break inside the leading "--": only at the hyphens after it
  const lead = name.startsWith('--') ? '--' : '';
  const parts = name.slice(lead.length).split('-');
  return (
    <span className="token-name">
      {lead}
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 1 ? (
            <>
              -<wbr />
            </>
          ) : null}
        </React.Fragment>
      ))}
    </span>
  );
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

function Anatomy({ name, parts, hl, setHl, zoom, setZoom, overrides, children }) {
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
    // about 1.6x for small parts (v8's scale), 1x on phones
    const want = window.innerWidth < 720 ? 1 : w < 200 ? 1.6 : w < 360 ? 1.4 : 1;
    const room = (frame.current.clientWidth * 0.8) / w;
    const next = Math.max(1, Math.min(want, Math.floor(room * 10) / 10));
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
    <>
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
    {children}
    </>
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


/* ================= the component page (chip-mock-03) ================= */

const TABS = [
  { id: 'usage', label: 'Usage' },
  { id: 'play', label: 'Playground' },
  { id: 'anatomy', label: 'Anatomy' },
  { id: 'variants', label: 'Variants' },
  { id: 'states', label: 'States' },
  { id: 'spec', label: 'Spec' },
  { id: 'a11y', label: 'Accessibility' },
  { id: 'contract', label: 'Contract' },
  { id: 'source', label: 'Source' },
  { id: 'history', label: 'History' },
  { id: 'tests', label: 'Tests' },
  { id: 'figma', label: 'Figma' },
];
const TAB_KEY = 'chip-atlas-tab';
const NO_CONTRACT = 'Missing a contract';
const dontText = (u) => cap1(u.replace(/^Do not /, ''));
const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

// BELLA's own files, read in place like its components (no copy, no server)
const SOURCES = import.meta.glob('@bella/components/*/*.{tsx,css}', { query: '?raw', import: 'default' });

function useJson(url) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    setD(null);
    fetch(url)
      .then((r) => r.json())
      .then((j) => live && setD(j))
      .catch(() => live && setD({ error: true }));
    return () => {
      live = false;
    };
  }, [url]);
  return d;
}

/* ---------- small pieces ---------- */
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

// a radio group drawn as the mock's .seg (a view switch inside a panel, not tabs)
function RadioSeg({ label, items, value, onChange }) {
  const ref = useRef(null);
  function onKeyDown(e) {
    const i = items.findIndex((t) => t.id === value);
    const n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const next = items[(n + items.length) % items.length];
    onChange(next.id);
    ref.current.querySelector(`[data-id="${CSS.escape(next.id)}"]`)?.focus();
  }
  return (
    <div className="seg" role="radiogroup" aria-label={label} ref={ref} onKeyDown={onKeyDown}>
      {items.map((t) => (
        <button key={t.id} type="button" role="radio" data-id={t.id} aria-checked={t.id === value} tabIndex={t.id === value ? 0 : -1} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Panel({ name, one, below, children, insp, label }) {
  return (
    <div className={`docpanel${one ? ' one' : ''}`} data-docpanel={name}>
      <div className="fig">{children}</div>
      {insp ? (
        <aside className={`insp${below ? ' below' : ''}`} aria-label={label}>
          {insp}
        </aside>
      ) : null}
    </div>
  );
}

function Empty({ title, children }) {
  return (
    <div className="a-empty">
      <p className="h3s">{title}</p>
      <p className="sub2">{children}</p>
    </div>
  );
}

/* ---------- a specimen as JSX: the element tree the stage renders, written out ---------- */
const NAMES = new Map(Object.entries(COMPONENTS).map(([k, v]) => [v, k]));
function nameOf(t) {
  return typeof t === 'string' ? t : NAMES.get(t) || t?.displayName || t?.name || 'Component';
}
function attrOf(k, v) {
  if (typeof v === 'string') return `${k}="${v}"`;
  if (typeof v === 'function') return `${k}={() => {}}`;
  if (v === true) return k;
  return `${k}={${JSON.stringify(v)}}`;
}
function jsxLines(el, pad = '') {
  if (el == null || el === false || el === true) return [];
  if (typeof el === 'string' || typeof el === 'number') return [pad + el];
  if (Array.isArray(el)) return el.flatMap((e) => jsxLines(e, pad));
  const { children, ...props } = el.props ?? {};
  const tag = nameOf(el.type);
  const attrs = Object.entries(props).map(([k, v]) => attrOf(k, v));
  const open = `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
  if (children == null) return [`${pad}${open} />`];
  if (typeof children === 'string' || typeof children === 'number') return [`${pad}${open}>${children}</${tag}>`];
  return [`${pad}${open}>`, ...jsxLines(children, pad + '  '), `${pad}</${tag}>`];
}

function CodeBlock({ title, lines, notify, max = 6 }) {
  const [open, setOpen] = useState(false);
  const id = React.useId();
  const long = lines.length > max;
  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      notify('Copied the code');
    } catch {
      notify('Could not copy the code');
    }
  }
  return (
    <div className="excode">
      <div className="codehead k-chrome">
        <code>{title}</code>
        <Button variant="secondary" onClick={copy} ariaLabel={`Copy: ${title}`}>
          <CopyIcon />
          Copy
        </Button>
      </div>
      <pre className="exv" id={id} tabIndex={0} data-open={!long || open}>
        {lines.map((l, i) => (
          <span key={i} className="ln">
            {l || ' '}
          </span>
        ))}
      </pre>
      {long ? (
        <button type="button" className="exmore" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show full code'} <span className="n">· {plural(lines.length, 'line')}</span>
        </button>
      ) : null}
    </div>
  );
}

// a specimen in one state: BELLA's own rules, forced through attributes
function Forced({ state, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('[data-bella-component]');
    if (!el) return;
    const f = forceAttr(state === 'press' ? 'active' : state);
    if (f) el.setAttribute(f[0], f[1]);
    if (state === 'disabled') {
      if ('disabled' in el) el.disabled = true;
      else el.setAttribute('aria-disabled', 'true');
    }
  }, [state, children]);
  return (
    <div ref={ref} inert aria-hidden="true" className="a-spec">
      {children}
    </div>
  );
}

const renderOf = (c, variant) => {
  const V = VARIANTS[c.name];
  const R = SPECIMENS[c.name];
  if (variant && V) return V(variant);
  return R ? <R /> : null;
};

/* ---------- guidance: the markdown file's sections ---------- */
function sectionsOf(md) {
  const out = {};
  let head = null;
  for (const line of (md ?? '').split('\n')) {
    const h = line.match(/^##\s+(.*)/);
    if (h) {
      head = h[1].trim();
      out[head] = [];
    } else if (head) out[head].push(line);
  }
  return out;
}
const bulletsOf = (lines = []) => lines.filter((l) => /^\s*[-*]\s/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, '').replace(/`/g, ''));

// the AGENTS.md rule that names a variant: "| Main action (at most one per view) | `Button variant="primary"` |"
function agentRuleFor(doc, c, v) {
  const r = doc?.agents?.rules?.find((x) => x.text.includes(`${c.name} variant="${v}"`));
  return r ? r.text.split('|').map((s) => s.trim()).filter(Boolean)[0] : null;
}

/* ================= panels ================= */

function UsagePanel({ c, doc, notify, onOpen }) {
  const variants = VARIANTS[c.name] ? c.variants ?? [] : [];
  const [sel, setSel] = useState(variants[0] ?? null);
  useEffect(() => setSel(variants[0] ?? null), [c.id]);
  // the specimen's own element, so the JSX names the component, not its wrapper
  const shown = variants.length ? [...variants].reverse().map((v) => VARIANTS[c.name](v)) : [SPECIMENS[c.name]?.()];
  const lines = [`import { ${c.name} } from 'bella';`, '', ...shown.flatMap((el) => jsxLines(el))];
  const rule = sel ? agentRuleFor(doc, c, sel) : null;
  return (
    <Panel
      name="usage"
      label="Selected"
      insp={
        <div className="a-sel" aria-live="polite">
          <p className="insp-h">{sel ? 'Selected' : 'Guidance'}</p>
          <p className="gt">{sel ? cap1(sel) : c.name}</p>
          {rule ? <p>{rule}.</p> : sel ? null : <p>{c.rendersAs ? `Renders as ${c.rendersAs}.` : null}</p>}
          {c.usage?.length ? (
            <>
              <p className="g4">
                <i className="av ok" aria-hidden="true">✓</i>Use it for
              </p>
              <ul className="glist">
                {c.usage.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </>
          ) : null}
          {c.dont?.length ? (
            <>
              <p className="g4">
                <i className="av no" aria-hidden="true">✕</i>Don’t
              </p>
              <ul className="glist">
                {c.dont.map((u) => (
                  <li key={u}>{dontText(u)}</li>
                ))}
              </ul>
            </>
          ) : null}
          {doc?.related?.length ? (
            <div className="grel">
              <p className="insp-h">Related</p>
              <p className="rel">
                {doc.related.map((r, i) => (
                  <React.Fragment key={r.id}>
                    {i ? ' · ' : ''}
                    <a
                      href={`#/atlas/${r.id}`}
                      title={r.why}
                      onClick={(e) => {
                        e.preventDefault();
                        onOpen?.(r.id);
                      }}
                    >
                      {r.name}
                    </a>
                  </React.Fragment>
                ))}
              </p>
            </div>
          ) : null}
        </div>
      }
    >
      <p className="cap">
        {variants.length
          ? `${c.name} has ${plural(variants.length, 'tier')} of emphasis, from its contract. Select one to see its guidance.`
          : `${c.name}, as it renders. Where to use it and where not to, from its contract.`}
      </p>
      <div className="usage">
        <div className="hier grid">
          {variants.length ? (
            <ol className="a-ladder">
              {variants.map((v, i) => (
                <li key={v} style={{ order: variants.length - i }}>
                  <button type="button" className={`a-pick${sel === v ? ' gsel' : ''}`} aria-pressed={sel === v} onClick={() => setSel(v)} aria-label={`${cap1(v)}: show its guidance`}>
                    <Forced>{VARIANTS[c.name](v)}</Forced>
                  </button>
                  <span className="a-lead" aria-hidden="true" />
                  <span className="anno">
                    <b>{i + 1}</b>
                    {cap1(v)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Forced>{renderOf(c)}</Forced>
          )}
        </div>
        {c.usage?.length || c.dont?.length ? (
          <div className="pairs">
            <figure className="pair2 do">
              <figcaption>
                <b>
                  <i className="av ok" aria-hidden="true">✓</i>Do
                </b>
                <ul className="glist">
                  {(c.usage ?? []).map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </figcaption>
            </figure>
            <figure className="pair2 dont">
              <figcaption>
                <b>
                  <i className="av no" aria-hidden="true">✕</i>Don’t
                </b>
                <ul className="glist">
                  {(c.dont ?? []).map((u) => (
                    <li key={u}>{dontText(u)}</li>
                  ))}
                </ul>
              </figcaption>
            </figure>
          </div>
        ) : null}
      </div>
      <CodeBlock title="The example above · JSX" lines={lines} notify={notify} />
    </Panel>
  );
}

// the steps a padding token can take: BELLA's 4px space scale around the current value
function padSteps(base) {
  const b = parseFloat(base);
  if (!Number.isFinite(b)) return [];
  return [b - 4, b, b + 4, b + 8].filter((n) => n >= 0).map(String);
}

function PlayPanel({ c, bella, spec, theme }) {
  const P = PLAY[c.name];
  const props = (spec?.props ?? []).filter((p) => !['className', 'onClick', 'linkComponent', 'href', 'ariaLabel'].includes(p.name));
  const controls = props
    .map((p) => {
      const opts = [...String(p.values).matchAll(/'([^']+)'/g)].map((m) => m[1]);
      if (p.name === 'children') return { ...p, kind: 'text' };
      if (opts.length > 1) return { ...p, kind: 'select', opts };
      if (p.values === 'boolean') return { ...p, kind: 'check' };
      return null;
    })
    .filter(Boolean);
  const init = useCallback(() => {
    const v = { ...(P?.props ?? {}) };
    for (const k of controls) {
      if (k.kind === 'select') v[k.name] = String(k.default ?? '').replace(/'/g, '') || k.opts[0];
      if (k.kind === 'text') v.children = P?.children ?? '';
    }
    if (c.name === 'Button' && c.variants?.includes('primary')) v.variant = 'primary';
    return v;
  }, [c.id, spec]);
  const [vals, setVals] = useState(init);
  useEffect(() => setVals(init()), [init]);
  const pad = c.sandbox?.paddingX;
  const base = baseOf(c);
  const [px, setPx] = useState(base.paddingX ?? null);
  useEffect(() => setPx(baseOf(c).paddingX ?? null), [c.id]);
  const [ran, setRan] = useState(false);
  useEffect(() => setRan(false), [c.id, px]);
  const draft = { ...base, ...(px != null ? { paddingX: px } : {}) };
  const overrides = overridesOf(c, draft);
  const changed = px != null && px !== base.paddingX;
  const checks = ran ? checkSet(bella, c, draft, null, theme) : [];
  const { children, ...rest } = vals;
  const live = P ? <P.C {...rest}>{children}</P.C> : renderOf(c);
  const set = (k, v) => setVals((o) => ({ ...o, [k]: v }));
  return (
    <Panel
      name="play"
      label="Props and token"
      insp={
        <>
          <p className="insp-h">Props</p>
          {P && controls.length ? (
            controls.map((k) =>
              k.kind === 'check' ? (
                <label key={k.name} className="pgf chk2 k-chk">
                  <input type="checkbox" checked={!!vals[k.name]} onChange={(e) => set(k.name, e.target.checked)} /> <span>{k.name}</span>
                </label>
              ) : k.kind === 'select' ? (
                <label key={k.name} className="pgf">
                  <span>{k.name}</span>
                  <select value={vals[k.name] ?? ''} onChange={(e) => set(k.name, e.target.value)}>
                    {k.opts.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label key={k.name} className="pgf">
                  <span>{k.name}</span>
                  <input value={vals.children ?? ''} onChange={(e) => set('children', e.target.value)} />
                </label>
              )
            )
          ) : (
            <p className="sub2">{spec ? `No props wired for ${c.name} here yet: the preview is its specimen.` : 'Reading the props…'}</p>
          )}
          {pad ? (
            <>
              <p className="insp-h">Token</p>
              <div className="pgf">
                <span>
                  <code>{pad.token}</code>
                </span>
                <RadioSeg label="Padding" items={padSteps(base.paddingX).map((n) => ({ id: n, label: n }))} value={px} onChange={setPx} />
              </div>
            </>
          ) : null}
          {changed ? (
            <div className="pgchange k-chrome">
              <p>
                <b>1 change</b> · padding-inline {base.paddingX} → {px}
              </p>
              <Button variant="secondary" onClick={() => setRan(true)}>
                Run the checks against it
              </Button>
            </div>
          ) : null}
        </>
      }
    >
      <p className="cap">Try a change on the real component. Only this preview moves; nothing is written to BELLA.</p>
      <div className="pgcanvas grid">
        <div className="a-spec" style={overrides}>
          {live}
        </div>
      </div>
      <ol className="pgsteps" aria-label="How the playground works">
        <li>
          <b>Change</b> {pad ? 'a prop or the padding token' : 'a prop'} on the right. Only this preview moves.
        </li>
        <li>
          <b>Run the checks</b> against the change: contrast, contract, target size.
        </li>
        <li>
          <b>Take it to a session.</b> Nothing is written to BELLA from here.
        </li>
      </ol>
      {ran ? (
        <section aria-labelledby="pgKT" className="a-checks">
          <h2 className="h3s" id="pgKT">
            The checks, run against the change
          </h2>
          <ul className="k-list">
            {checks.map((k) => (
              <li key={k.key}>
                <span>
                  <b>{k.label}</b> · {k.text}
                </span>
                <StatusPill tone={k.na ? 'neutral' : k.ok ? 'pass' : 'fail'}>{k.na ? 'Not covered' : k.ok ? 'Passes' : 'Fails'}</StatusPill>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Panel>
  );
}

function AnatomyPanel({ c, reduced }) {
  const parts = c.parts ?? [];
  const [hl, setHl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState('flat');
  useEffect(() => setHl(null), [c.id]);
  if (!parts.length)
    return (
      <Panel name="anatomy" one>
        <p className="cap">The parts of {c.name}, from its contract.</p>
        <div className="canvas">
          <div className="specimen">
            <Forced>{renderOf(c)}</Forced>
          </div>
        </div>
        <Empty title="No anatomy yet">
          Add anatomy to {c.name}’s contract in BELLA ({c.anatomySource}) and its parts appear here, numbered on the stage.
        </Empty>
      </Panel>
    );
  const views = [{ id: 'flat', label: 'Flat' }, ...(reduced ? [] : [{ id: 'exploded', label: 'Exploded' }])];
  return (
    <Panel
      name="anatomy"
      below
      label="Parts"
      insp={
        <>
          <p className="insp-h">Parts</p>
          <ol className="parts" onMouseLeave={() => setHl(null)}>
            {parts.map((p) => (
              <li key={p.key} className={hl === p.key ? 'on' : undefined} onMouseEnter={() => setHl(p.key)}>
                <span className="n" aria-hidden="true">
                  {p.n}
                </span>
                <button type="button" aria-pressed={hl === p.key} onFocus={() => setHl(p.key)} onClick={() => setHl(hl === p.key ? null : p.key)}>
                  <b>{p.title}</b>
                  <code>{p.token}</code>
                  <small>
                    {p.detail}
                    {p.trigger && p.trigger !== 'rest' ? ` · on ${p.trigger}` : ''}
                  </small>
                </button>
              </li>
            ))}
          </ol>
        </>
      }
    >
      <div className="statebar">
        <p className="cap">
          {plural(parts.length, 'part')}, back to front. Hover a part or a row to find it.{reduced ? ' Exploded is off while reduced motion is on.' : ''}
        </p>
        {views.length > 1 ? <RadioSeg label="View" items={views} value={view} onChange={setView} /> : null}
      </div>
      <div className="canvas a-anat">
        {view === 'exploded' ? (
          <Exploded name={c.name} parts={parts} hl={hl} setHl={setHl} zoom={zoom} overrides={{}} />
        ) : (
          <Anatomy name={c.name} parts={parts} hl={hl} setHl={setHl} zoom={zoom} setZoom={setZoom} overrides={{}} />
        )}
      </div>
    </Panel>
  );
}

function VariantsPanel({ c, doc }) {
  const V = VARIANTS[c.name];
  const variants = V ? c.variants ?? [] : [];
  const S = SHAPES[c.name];
  const shapes = S ? c.shapes ?? [] : [];
  const tiers = bulletsOf(sectionsOf(doc?.guidance?.md)['Choosing a tier']);
  // a guidance line per tier: the bullet that names it, else the first one left
  const lineFor = useMemo(() => {
    const left = [...tiers];
    const map = {};
    for (const v of variants) {
      const i = left.findIndex((t) => t.toLowerCase().includes(v));
      if (i >= 0) map[v] = left.splice(i, 1)[0];
    }
    for (const v of variants) if (!map[v] && left.length) map[v] = left.shift();
    return map;
  }, [doc, c.id]);
  const prop = (v) => `variant="${v}"`;
  if (!variants.length)
    return (
      <Panel name="variants" one>
        <p className="cap">{c.name}’s variants, from its contract.</p>
        <div className="vgrid one">
          <figure className="vcell">
            <div className="vstage grid">
              <Forced>{renderOf(c)}</Forced>
            </div>
            <figcaption>
              <b>{c.name}</b>
              <span>{(c.variants ?? []).length ? `Its ${c.variants.length} variants have no specimen in CHIP yet.` : 'One form: the contract lists no variants. Its states are under States.'}</span>
            </figcaption>
          </figure>
        </div>
      </Panel>
    );
  return (
    <Panel
      name="variants"
      below
      label="Choosing a tier"
      insp={
        <>
          <p className="insp-h">Choosing a tier</p>
          <ol className="ladder">
            {variants.map((v) => (
              <li key={v}>
                <span className="a-mini">
                  <Forced>{V(v)}</Forced>
                </span>
                <span>{lineFor[v] ?? agentRuleFor(doc, c, v) ?? cap1(v)}</span>
              </li>
            ))}
          </ol>
          <div className="dd">
            {(c.usage ?? []).slice(0, 1).map((u) => (
              <p className="do" key={u}>
                <i className="av ok" aria-hidden="true">✓</i>
                {u}
              </p>
            ))}
            {(c.dont ?? []).slice(0, 2).map((u) => (
              <p className="dont" key={u}>
                <i className="av no" aria-hidden="true">✕</i>
                {dontText(u)}
              </p>
            ))}
          </div>
        </>
      }
    >
      <p className="cap">{`${plural(variants.length, 'tier')} of emphasis. Each cell is the real thing; the pink tag is the prop that makes it that tier.`}</p>
      <h2 className="h3s">Tiers</h2>
      <div className="vgrid">
        {variants.map((v) => (
          <figure className="vcell" key={v}>
            <div className="vstage grid">
              <span className="anno mono">{prop(v)}</span>
              <span className="a-lead" aria-hidden="true" />
              <Forced>{V(v)}</Forced>
            </div>
            <figcaption>
              <b>{cap1(v)}</b>
              {agentRuleFor(doc, c, v) ? <span>{agentRuleFor(doc, c, v)}.</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
      {shapes.length ? (
        <>
          <h2 className="h3s">Shape</h2>
          <div className="vgrid two">
            {shapes.map((s) => (
              <figure className="vcell" key={s}>
                <div className="vstage grid">
                  <span className="anno mono">{`shape="${s}"`}</span>
                  <span className="a-lead" aria-hidden="true" />
                  <Forced>{S(s)}</Forced>
                </div>
                <figcaption>
                  <b>{cap1(s)}</b>
                  {(c.usage ?? []).find((u) => u.includes(`shape ${s}`)) ? <span>{c.usage.find((u) => u.includes(`shape ${s}`))}</span> : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : null}
    </Panel>
  );
}

// the tokens a state changes: the component tokens named for it (and its tier)
function stateTokens(c, tier, state) {
  const list = c.tokens?.list ?? [];
  const word = { focus: /(-focus|ring)/, press: /-(active|press)/, active: /-(active|press)/ }[state] ?? new RegExp(`-${state}(-|$)`);
  const named = list.filter((t) => word.test(t) && (!tier || t.includes(`-${tier}-`) || !/-(primary|secondary|tertiary)-/.test(t)));
  // and the anatomy's parts that only show in this state (a hover wash, a pressed fill)
  const parts = (c.parts ?? []).filter((p) => p.trigger === state || (state === 'active' && p.trigger === 'press')).map((p) => p.token);
  return [...new Set([...named, ...parts])].filter(Boolean);
}

function StatesPanel({ c }) {
  const V = VARIANTS[c.name];
  const tiers = V ? c.variants ?? [] : [];
  const [tier, setTier] = useState(tiers[0] ?? null);
  useEffect(() => setTier(tiers[0] ?? null), [c.id]);
  const states = c.states?.length ? c.states : ['default'];
  const [sel, setSel] = useState(states[0]);
  useEffect(() => setSel(states[0]), [c.id]);
  const ref = useRef(null);
  function onKeyDown(e) {
    const i = states.indexOf(sel);
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: states.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const next = states[(n + states.length) % states.length];
    setSel(next);
    ref.current.querySelector(`[data-state="${next}"]`)?.focus();
  }
  const isRest = (s) => s === 'default' || s === 'rest';
  const delta = isRest(sel) ? [] : stateTokens(c, tier, sel);
  return (
    <Panel name="states" one>
      <div className="statebar">
        <p className="cap">Every state{tiers.length ? ' of a tier' : ''}. Select one to see which tokens change from Default.</p>
        {tiers.length ? <RadioSeg label="Tier" items={tiers.map((t) => ({ id: t, label: cap1(t) }))} value={tier} onChange={setTier} /> : null}
      </div>
      <div className="srow" role="listbox" aria-label="States" ref={ref} onKeyDown={onKeyDown} style={{ '--n': states.length }}>
        {states.map((s) => {
          const n = isRest(s) ? null : stateTokens(c, tier, s).length;
          return (
            <div key={`${tier}-${s}`} role="option" className="scell" data-state={s} aria-selected={sel === s} tabIndex={sel === s ? 0 : -1} onClick={() => setSel(s)}>
              <div className="stg grid">
                <Forced state={isRest(s) ? null : s}>{renderOf(c, tier)}</Forced>
              </div>
              <div className="meta2">
                <b>{cap1(s === 'active' ? 'press' : s)}</b>
                <span className="chg">
                  <em>{n == null ? 'at rest' : n ? plural(n, 'token') : 'no token of its own'}</em>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="sdelta" aria-live="polite">
        {isRest(sel) ? (
          <p className="sub2">Default is the resting state. Select another state to see what changes.</p>
        ) : delta.length ? (
          <>
            <p className="sub2">
              {cap1(sel)} reads {plural(delta.length, 'token')} {tier ? `on ${tier}` : ''} that rest doesn’t:
            </p>
            <ul className="a-toks">
              {delta.map((t) => (
                <li key={t}>
                  <code>{t}</code>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="sub2">{cap1(sel)} has no token named for it in {c.name}’s list; it changes through shared tokens or a pseudo-class.</p>
        )}
      </div>
    </Panel>
  );
}

function valuesOf(p) {
  const opts = [...String(p.values).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const def = p.default ? String(p.default).replace(/'/g, '') : null;
  if (opts.length > 1)
    return opts.map((o, i) => (
      <React.Fragment key={o}>
        {i ? ' · ' : ''}
        {o === def ? <code>{o}</code> : o}
      </React.Fragment>
    ));
  return p.values;
}

function SpecPanel({ c, spec }) {
  const props = (spec?.props ?? []).filter((p) => !['children', 'className'].includes(p.name));
  return (
    <Panel
      name="spec"
      below
      label="Props"
      insp={
        <>
          <p className="insp-h">Props</p>
          {spec ? (
            <div className="a-tscroll">
              <table className="ttab props">
                <tbody>
                  {props.map((p) => (
                    <tr key={p.name}>
                      <th scope="row">{p.name}</th>
                      <td>
                        {valuesOf(p)}
                        {p.description ? <small>{p.description.replace(/`/g, '').replace(/[;:]$/, '')}</small> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="sub2">Reading the props…</p>
          )}
          <p className="foot">
            From BELLA’s docgen manifest. <code>children</code> and <code>className</code> left out.
          </p>
        </>
      }
    >
      <p className="cap">Measured from the rendered component. Every number is a token.</p>
      <div className="canvas a-specstage">
        <SpecStage c={c} overrides={{}} />
      </div>
    </Panel>
  );
}

function A11yPanel({ c }) {
  const V = VARIANTS[c.name];
  const shown = V ? c.variants ?? [] : [null];
  const stage = useRef(null);
  const [rows, setRows] = useState([]);
  useLayoutEffect(() => {
    const measure = () => {
      const els = [...(stage.current?.querySelectorAll('.a-tgt [data-bella-component]') ?? [])];
      setRows(
        els.map((el) => {
          const r = el.getBoundingClientRect();
          const role = el.getAttribute('role') || { BUTTON: 'button', A: 'link', INPUT: 'textbox', SELECT: 'combobox' }[el.tagName] || el.tagName.toLowerCase();
          // BELLA's label roll renders the label twice; the name is said once
          const t = el.textContent.trim();
          const half = t.slice(0, t.length / 2);
          const name = el.getAttribute('aria-label') || (t.length % 2 === 0 && half + half === t ? half : t);
          return { role, name, w: Math.round(r.width), h: Math.round(r.height) };
        })
      );
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [c.id]);
  const target = parseFloat(c.minTarget?.value);
  const ct = c.health?.contrast ?? {};
  return (
    <Panel
      name="a11y"
      below
      label="Accessibility"
      insp={
        <div className="a11ylabels">
          <p>
            <b>Screen readers</b>
            {c.rendersAs ? `Renders as ${c.rendersAs}. ` : ''}The visible label is the name unless ariaLabel says otherwise.
          </p>
          <p>
            <b>Keyboard</b>
            {keyboardOf(c)}
          </p>
          <p>
            <b>Touch targets</b>
            {c.minTarget ? `${c.minTarget.value} minimum, from ${c.minTarget.token}: ${target >= 44 ? 'meets' : 'under'} BELLA’s 44 floor (WCAG 2.5.5); 2.5.8 asks 24.` : 'No minimum target in the contract.'}
          </p>
          <p>
            <b>Contrast</b>
            {ct.status === 'fail' ? `Failing: ${ct.failing.join('; ')}` : ct.status === 'pass' ? `${ct.pairs} of ${ct.pairs} pairs pass.` : 'No contrast pairs declared.'}
          </p>
          {c.a11y ? (
            <p className="a-wide">
              <b>Verified</b>
              {c.a11y}
            </p>
          ) : null}
        </div>
      }
    >
      <p className="cap">What a screen reader and a keyboard get, measured on the real component: tab order, role and name, and the target a finger gets.</p>
      <div className="hier grid a11yfig" ref={stage}>
        <ol className="a-ladder">
          {shown.map((v, i) => (
            <li key={v ?? 'one'}>
              <span className="a-tgt">
                <Forced>{renderOf(c, v)}</Forced>
              </span>
              <span className="a-lead" aria-hidden="true" />
              <span className="anno">
                <b>{i + 1}</b>
                {rows[i] ? `${rows[i].role} “${rows[i].name}” · ${rows[i].w} × ${rows[i].h}` : 'measuring…'}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

/* ---------- a file with line numbers and marked lines ---------- */
function useFileView({ path, text, marks, notify, label }) {
  const pre = useRef(null);
  const [on, setOn] = useState(null);
  const lines = (text ?? '').split('\n');
  const marked = new Set(marks.map((m) => m.line));
  async function copy() {
    try {
      await navigator.clipboard.writeText(text ?? '');
      notify('Copied the file');
    } catch {
      notify('Could not copy the file');
    }
  }
  function jump(line) {
    setOn(line);
    const el = pre.current?.querySelector(`[data-ln="${line}"]`);
    if (el && pre.current) pre.current.scrollTop = el.offsetTop - pre.current.clientHeight / 3;
  }
  return { jump, on, view: (
    <div className="codebox">
      <div className="codehead k-chrome">
        <code>{path}</code>
        <Button variant="secondary" onClick={copy} ariaLabel={`Copy ${path}`}>
          <CopyIcon />
          Copy
        </Button>
      </div>
      <div role="region" aria-label={label}>
        <pre className="code-v" ref={pre} tabIndex={0}>
          {text == null ? (
            <span className="ln">Reading…</span>
          ) : (
            lines.map((l, i) => (
              <span key={i} data-ln={i + 1} className={`ln${marked.has(i + 1) ? ' mk' : ''}${on === i + 1 ? ' on' : ''}`}>
                {l || ' '}
              </span>
            ))
          )}
        </pre>
      </div>
    </div>
  ) };
}

const CONTRACT_MARKS = [
  ['"description"', 'What it is'],
  ['"variants"', 'Its tiers'],
  ['"states"', 'Its states'],
  ['"dont"', 'What not to do'],
  ['"a11y"', 'Verified contrast'],
  ['"anatomy"', 'Its parts'],
  ['min-height', 'Its target size'],
];
function marksOf(kind, text) {
  const lines = (text ?? '').split('\n');
  if (kind === 'guide')
    return lines.flatMap((l, i) => (/^##\s/.test(l) ? [{ line: i + 1, title: l.replace(/^#+\s*/, ''), text: (lines[i + 2] ?? '').slice(0, 80) }] : []));
  return CONTRACT_MARKS.flatMap(([needle, title]) => {
    const i = lines.findIndex((l) => l.includes(needle));
    return i < 0 ? [] : [{ line: i + 1, title, text: lines[i].trim().slice(0, 64) }];
  }).sort((a, b) => a.line - b.line);
}

function ContractPanel({ c, bella, doc, tests, hist, notify, onOpen }) {
  const [view, setView] = useState('overview');
  const [file, setFile] = useState('contract');
  const text = file === 'contract' ? doc?.contract?.block : doc?.guidance?.md;
  const path = file === 'contract' ? `${doc?.contract?.path ?? 'tokens/component.json'} → component.${c.id.replace(/-/g, '-')}` : doc?.guidance?.path ?? `docs/components/${c.id}.md`;
  const marks = marksOf(file === 'contract' ? 'contract' : 'guide', text);
  const fv = useFileView({ path, text, marks, notify, label: file === 'contract' ? 'Contract file' : 'Guidance file' });
  const semantic = (c.tokens?.list ?? []).filter((t) => t.startsWith('--color-semantic') || !t.startsWith('--component'));
  const row = (k, v) => (
    <tr key={k}>
      <th scope="row">{k}</th>
      <td>{v}</td>
    </tr>
  );
  const link = (n) => {
    const o = bella.components.find((x) => x.name === n);
    return o ? (
      <a
        key={n}
        href={`#/atlas/${o.id}`}
        onClick={(e) => {
          e.preventDefault();
          onOpen(o.id);
        }}
      >
        {n}
      </a>
    ) : (
      n
    );
  };
  const join = (xs) => xs.map((x, i) => <React.Fragment key={i}>{i ? ' · ' : ''}{x}</React.Fragment>);
  return (
    <Panel
      name="contract"
      label="Marked in this file"
      insp={
        <>
          <p className="insp-h">Marked in this file</p>
          <ol className="marks">
            {marks.map((m, i) => (
              <li key={m.line}>
                <button type="button" onClick={() => fv.jump(m.line)} aria-pressed={fv.on === m.line}>
                  <b>{i + 1}</b>
                  <b className="a-mt">{m.title}</b>
                  <small>
                    Line {m.line} · {m.text}
                  </small>
                </button>
              </li>
            ))}
          </ol>
        </>
      }
    >
      <div className="statebar">
        <p className="cap">What {c.name} promises, whether it keeps its promises, and who relies on them.</p>
        <RadioSeg
          label="Contract view"
          items={[
            { id: 'overview', label: 'Overview' },
            { id: 'compliance', label: 'Compliance' },
            { id: 'consumption', label: 'Consumption' },
            { id: 'versions', label: 'Versions' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      <div className="slav">
        {view === 'overview' ? (
          <table className="ttab a-sla">
            <tbody>
              {row('Variants', c.variants?.length ? c.variants.join(' · ') : 'none')}
              {c.shapes?.length ? row('Shape', c.shapes.join(' · ')) : null}
              {row('States', (c.states ?? []).join(' · ') || 'none')}
              {c.minTarget ? row('Target', `${c.minTarget.value} min · ${c.minTarget.token}`) : null}
              {c.rendersAs ? row('Renders as', c.rendersAs) : null}
              {row('Contract', c.hasContract ? `${doc?.contract?.path ?? 'tokens/component.json'} · ${c.health?.contract?.status === 'fail' ? 'disagrees with the code' : 'matches the code'}` : NO_CONTRACT)}
              {c.tokens ? row('Tokens', `${c.tokens.count}: ${c.tokens.component} component, ${c.tokens.semantic} semantic`) : null}
            </tbody>
          </table>
        ) : view === 'compliance' ? (
          tests?.tests ? (
            <ul className="k-list sla2">
              {tests.tests.map((t) => (
                <li key={t.name}>
                  <span>
                    <b>{t.name}</b>
                    <br />
                    <span className="sub2">{t.detail}</span>
                  </span>
                  <StatusPill tone={t.status === 'pass' ? 'pass' : t.status === 'fail' ? 'fail' : 'needs'}>{t.status === 'pass' ? 'Keeps it' : t.status === 'fail' ? 'Breaks it' : 'Not run'}</StatusPill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sub2">Reading the tests…</p>
          )
        ) : view === 'consumption' ? (
          <table className="ttab a-sla">
            <tbody>
              {row('Used inside', c.composesInto?.length ? join(c.composesInto.map(link)) : 'Nothing in BELLA composes it')}
              {row('Built from', c.composedFrom?.length ? join(c.composedFrom.map(link)) : 'No other BELLA component')}
              {row(
                'Shared tokens',
                semantic.length
                  ? join(semantic.map((t) => `${t.replace(/^--color-semantic-/, '')} (${(bella.tokenUsage?.[t] ?? []).length || '?'} components)`))
                  : 'None: every token it reads is its own'
              )}
            </tbody>
          </table>
        ) : hist?.entries ? (
          <ul className="k-list sla2">
            {hist.entries.slice(0, 6).map((e) => (
              <li key={e.sha}>
                <span>
                  <b>{e.explanation || e.subject}</b>
                  <br />
                  <span className="sub2">
                    <code>{e.sha}</code> · {fmtDate(e.date)} · {(e.types ?? []).join(', ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sub2">Reading the history…</p>
        )}
      </div>
      <div className="slafile">
        <div className="statebar">
          <p className="cap">The file itself. Marked lines matter most.</p>
          <RadioSeg label="File" items={[{ id: 'contract', label: 'Contract' }, { id: 'guide', label: 'Guidance' }]} value={file} onChange={setFile} />
        </div>
        {fv.view}
      </div>
    </Panel>
  );
}

function SourcePanel({ c, doc, notify }) {
  const files = useMemo(() => {
    const own = Object.keys(SOURCES)
      .filter((k) => k.includes(`/${c.name}/`))
      .map((k) => ({ key: k, dir: `src/components/${c.name}/`, name: k.split('/').pop(), load: SOURCES[k] }))
      .sort((a, b) => a.name.length - b.name.length);
    return [
      ...own,
      ...(doc?.contract ? [{ key: 'contract', dir: 'tokens/', name: 'component.json', text: doc.contract.block, note: `component.${c.id}` }] : []),
      ...(doc?.guidance ? [{ key: 'guide', dir: 'docs/components/', name: doc.guidance.path.split('/').pop(), text: doc.guidance.md }] : []),
    ];
  }, [c.id, doc]);
  const [cur, setCur] = useState(null);
  const [text, setText] = useState(null);
  const f = files.find((x) => x.key === cur) ?? files[0];
  useEffect(() => setCur(null), [c.id]);
  useEffect(() => {
    if (!f) return;
    let live = true;
    setText(null);
    if (f.text != null) setText(f.text);
    else f.load().then((t) => live && setText(t)).catch(() => live && setText('Could not read this file.'));
    return () => {
      live = false;
    };
  }, [f?.key, c.id]);
  const dirs = [...new Set(files.map((x) => x.dir))];
  const fv = useFileView({ path: f ? `${f.dir}${f.name}${f.note ? ` → ${f.note}` : ''}` : '', text, marks: [], notify, label: 'File' });
  return (
    <Panel name="source" one>
      <p className="cap">The files that make {c.name}, read only, straight from BELLA. Change them through a session.</p>
      {files.length ? (
        <div className="srcwrap">
          <ul className="ftree" aria-label="Files">
            {dirs.map((d) => (
              <React.Fragment key={d}>
                <li className="fdir">{d}</li>
                {files
                  .filter((x) => x.dir === d)
                  .map((x) => (
                    <li key={x.key}>
                      <button type="button" aria-current={x.key === f.key} onClick={() => setCur(x.key)}>
                        {x.name}
                      </button>
                    </li>
                  ))}
              </React.Fragment>
            ))}
          </ul>
          {fv.view}
        </div>
      ) : (
        <Empty title="No files found">CHIP couldn’t find {c.name}’s folder in BELLA.</Empty>
      )}
    </Panel>
  );
}

const TYPE_LABEL = { visual: 'Visual', api: 'API', tokens: 'Tokens', docs: 'Docs', a11y: 'A11y' };
function HistoryPanel({ c, hist }) {
  const [type, setType] = useState('all');
  const [order, setOrder] = useState('new');
  const [focus, setFocus] = useState(null);
  const list = useRef(null);
  useEffect(() => (setType('all'), setFocus(null)), [c.id]);
  if (!hist) return <Panel name="history" one><p className="sub2">Reading {c.name}’s history…</p></Panel>;
  const all = hist.entries ?? [];
  if (!all.length)
    return (
      <Panel name="history" one>
        <Empty title="No history yet">BELLA’s git log has no commit that touches {c.name}’s files.</Empty>
      </Panel>
    );
  const typesOf = (e) => (e.types ?? []).map((t) => t.toLowerCase());
  const counts = {};
  for (const e of all) for (const t of typesOf(e)) counts[t] = (counts[t] ?? 0) + 1;
  const chips = [{ id: 'all', label: 'All', count: all.length }, ...Object.keys(TYPE_LABEL).filter((t) => counts[t]).map((t) => ({ id: t, label: TYPE_LABEL[t], count: counts[t] }))];
  const shown = all.filter((e) => type === 'all' || typesOf(e).includes(type));
  const sorted = order === 'new' ? shown : [...shown].reverse();
  const chrono = [...all].reverse(); // oldest first
  const recent = chrono.slice(-5);
  function jump(sha) {
    setType('all');
    setFocus(sha);
    requestAnimationFrame(() => list.current?.querySelector(`[data-sha="${sha}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
  return (
    <Panel name="history" one>
      <p className="cap">Every change to {c.name}, from BELLA’s git log of its files. Select a point on the line to find it below.</p>
      <div className="hquick k-chrome">
        <Chips label="Change type" items={chips} value={type} onChange={setType} />
      </div>
      <div className="hline2" role="group" aria-label={`The ${recent.length} latest changes`}>
        <ol>
          {recent.map((e) => (
            <li key={e.sha}>
              <button type="button" className="hpt" aria-pressed={focus === e.sha} onClick={() => jump(e.sha)} aria-label={`${e.explanation || e.subject}, ${fmtDate(e.date)}`}>
                {chrono.indexOf(e) + 1}
              </button>
              <span className="hd">{fmtDate(e.date)}</span>
              <span className="ht">{e.explanation || e.subject}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="hsortrow k-chrome">
        <p className="sub2">
          {shown.length} of {all.length} · sort by
        </p>
        <Chips
          label="Sort"
          items={[
            { id: 'new', label: 'Newest first' },
            { id: 'old', label: 'Oldest first' },
          ]}
          value={order}
          onChange={setOrder}
        />
      </div>
      <ol className="hlist" ref={list}>
        {sorted.map((e) => (
          <li key={e.sha} data-sha={e.sha} className={`hcardr${focus === e.sha ? ' on' : ''}`}>
            <h3>{e.explanation || e.subject}</h3>
            <div className="hchips">
              {typesOf(e).map((t) => (
                <span key={t} className="tchip">
                  {TYPE_LABEL[t] ?? t}
                </span>
              ))}
              {e.api ? <span className="tchip">API: {String(e.api).slice(0, 60)}</span> : null}
            </div>
            {e.detail ? (
              <div className="hwhy">
                <p className="rk">From the commit</p>
                <p className="hsumm">{e.detail.split(/\n\s*\n/)[0]}</p>
                {e.detail.split(/\n\s*\n/).length > 1 ? (
                  <details className="hdet">
                    <summary>The rest of the message</summary>
                    <p className="hsumm">{e.detail.split(/\n\s*\n/).slice(1).join('\n\n')}</p>
                  </details>
                ) : null}
              </div>
            ) : null}
            <p className="hsrc2">
              <span>
                From commit <code>{e.sha}</code>
              </span>
              <span>{fmtDate(e.date)}</span>
              <span>{e.subject}</span>
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

const VERDICT = { pass: 'Passes', fail: 'Fails', 'not-run': 'Not run' };
function TestsPanel({ c, tests, onRun, running }) {
  if (!tests) return <Panel name="tests" one><p className="sub2">Reading the tests…</p></Panel>;
  if (tests.error) return <Panel name="tests" one><Empty title="The tests could not be read">The CHIP server didn’t answer /component-tests.</Empty></Panel>;
  const order = { fail: 0, 'not-run': 1, pass: 2 };
  const rows = [...tests.tests].sort((a, b) => order[a.status] - order[b.status]);
  const n = (s) => rows.filter((r) => r.status === s).length;
  return (
    <Panel name="tests" one>
      <div className="statebar">
        <p className="cap">The tests the gate runs on {c.name}, failing first. What it looks like is under Variants and States.</p>
      </div>
      <p className="stsum">
        {n('fail') ? <span className="bad">{`${n('fail')} of ${rows.length} fail${n('fail') === 1 ? 's' : ''}`}</span> : <b>{`${n('pass')} of ${rows.length} pass`}</b>}
        {n('fail') ? ` · ${n('pass')} pass` : ''}
        {n('not-run') ? ` · ${n('not-run')} not run` : ''}
        {running ? ' · the stories audit is running' : ''}
      </p>
      <ul className="tlist">
        {rows.map((r) => (
          <li key={r.name} className={`trow a-trow${r.status === 'fail' ? ' fails' : ''}`}>
            <div className="tmain">
              <h3>{r.name}</h3>
              <p className="twhy">
                {r.status === 'fail' ? <b>Fails: </b> : null}
                {r.detail}
              </p>
            </div>
            <div className="tside k-chrome">
              <span className={`tverd${r.status === 'fail' ? ' bad' : ''}`}>
                <StatusPill tone={r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : 'needs'}>{VERDICT[r.status]}</StatusPill>
              </span>
              {r.action ? (
                <Button variant="secondary" onClick={() => onRun(r.action)}>
                  {r.action.label}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {tests.ranAt ? <p className="foot">Stories last ran {new Date(tests.ranAt).toLocaleString('en-GB')}.</p> : null}
    </Panel>
  );
}

function FigmaPanel({ c, lint, reading, onRead }) {
  const ok = lint?.read;
  return (
    <Panel name="figma" one>
      <div className="statebar">
        <p className="cap">The Figma component beside the code, so you don’t switch apps. CHIP reads it through the Figma MCP; it can’t test it.</p>
      </div>
      <div className="embed">
        <div className="embedbar">
          <span className={`dot ${ok ? 'ok' : 'warn'}`} aria-hidden="true" />
          <code>Figma · {c.name}</code>
          <span className="sub2">{reading ? 'Reading Figma…' : !lint ? 'Not read yet' : ok ? `Read ${new Date(lint.at).toLocaleString('en-GB')}` : 'The Figma MCP is not answering'}</span>
        </div>
        {ok ? (
          <div className="figempty">
            <p className="big">{lint.found ? `${c.name} is in Figma` : `No ${c.name} in Figma`}</p>
            {lint.summary ? <p>{lint.summary}</p> : null}
            {(lint.issues ?? []).length ? (
              <ul className="glist">
                {lint.issues.map((i, k) => (
                  <li key={k}>{typeof i === 'string' ? i : i.text ?? i.message ?? JSON.stringify(i)}</li>
                ))}
              </ul>
            ) : null}
            <span className="k-chrome a-ch">
              <Button variant="secondary" onClick={onRead}>Read Figma again</Button>
            </span>
          </div>
        ) : (
          <div className="figempty">
            <p className="big">Figma isn’t connected</p>
            <p>There is nothing to show or compare yet. The rest of {c.name}’s page works without it.</p>
            <ol className="figsteps">
              <li>
                <span className="fx" aria-hidden="true">
                  ✕
                </span>
                <div>
                  <b>The Figma MCP isn’t answering</b>
                  <p className="sub2">{lint?.reason ?? 'CHIP reads Figma through it.'}</p>
                  <span className="k-chrome a-ch">
                    <Button variant="secondary" onClick={onRead} disabled={reading}>
                      {reading ? 'Reading Figma…' : 'Read Figma again'}
                    </Button>
                  </span>
                </div>
              </li>
            </ol>
            <p className="sub2">Until it answers, Compare with Figma is off.</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ================= the page ================= */
export default function Atlas({ c, bella, theme, onOpen, role = 'admin', vis = { components: {} } }) {
  const reduced = useReducedMotion();
  const [tab, setTabState] = useState(() => {
    try {
      return sessionStorage.getItem(TAB_KEY) || 'usage';
    } catch {
      return 'usage';
    }
  });
  const setTab = (t) => {
    setTabState(t);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {}
  };
  const [toast, setToast] = useState('');
  const [lint, setLint] = useState(null);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [testsAt, setTestsAt] = useState(0);
  const id = c?.id;
  const doc = useJson(id ? `/bella-doc/${id}` : null);
  const spec = useJson(id ? `/bella-spec/${id}` : null);
  const hist = useJson(id ? `/bella-history/${id}` : null);
  const tests = useJson(id ? `/component-tests/${id}?t=${testsAt}` : null);
  const readLint = useCallback(
    (refresh) => {
      if (!id) return;
      setReading(true);
      fetch(`/figma-lint/${id}${refresh ? '?refresh=1' : ''}`)
        .then((r) => r.json())
        .then(setLint)
        .catch(() => setLint({ read: false, at: new Date().toISOString(), reason: "The CHIP server didn't answer." }))
        .finally(() => setReading(false));
    },
    [id]
  );
  useEffect(() => {
    setLint(null);
    readLint(false);
  }, [id]);
  useEffect(() => installForcedStates(), []);
  useEffect(() => {
    const again = () => setTestsAt(Date.now());
    window.addEventListener('chip:changed', again);
    return () => window.removeEventListener('chip:changed', again);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!c || !bella) return <p className="loading">Loading BELLA…</p>;
  const settings = settingsOf(vis, c);
  const crumb = `Components · ${c.category ?? NO_CONTRACT} · ${c.name}`;
  if (!canSee(role, settings.visibleTo))
    return (
      <div className="atlas k-chrome">
        <p className="k-meta">{crumb}</p>
        <h1 className="k-h1">{c.name}</h1>
        <p className="k-note">This page is visible to {settings.visibleTo} only. View as an Editor or Admin to see it.</p>
      </div>
    );

  const importLine = `import { ${c.name} } from 'bella';`;
  async function copyImport() {
    try {
      await navigator.clipboard.writeText(importLine);
      setToast('Copied the import');
    } catch {
      setToast('Could not copy the import');
    }
  }
  function runTest(action) {
    if (action.type === 'review') return import('./ReviewSheet.jsx').then((m) => m.openReview(action.check));
    setRunning(true);
    fetch(`/checks/${action.check}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(() => setToast('The stories audit is running'))
      .catch(() => setToast('The CHIP server did not answer'));
  }

  const t = tests?.tests ?? [];
  const fails = t.filter((x) => x.status === 'fail').length;
  const notRun = t.filter((x) => x.status === 'not-run').length;
  const testBadge = t.length
    ? fails
      ? { tone: 'fail', text: `${fails} of ${t.length} tests fail${fails === 1 ? 's' : ''}` }
      : notRun
        ? { tone: 'needs', text: `${notRun} of ${t.length} tests not run` }
        : { tone: 'pass', text: `${t.length} of ${t.length} tests pass` }
    : null;
  const figmaBadge = !lint ? null : lint.read ? { tone: 'pass', text: 'Figma: read' } : { tone: 'needs', text: 'Figma: not answering' };

  const panel = {
    usage: () => <UsagePanel c={c} doc={doc} notify={setToast} onOpen={onOpen} />,
    play: () => <PlayPanel c={c} bella={bella} spec={spec} theme={theme} />,
    anatomy: () => <AnatomyPanel c={c} reduced={reduced} />,
    variants: () => <VariantsPanel c={c} doc={doc} />,
    states: () => <StatesPanel c={c} />,
    spec: () => <SpecPanel c={c} spec={spec} />,
    a11y: () => <A11yPanel c={c} />,
    contract: () => <ContractPanel c={c} bella={bella} doc={doc} tests={tests} hist={hist} notify={setToast} onOpen={onOpen} />,
    source: () => <SourcePanel c={c} doc={doc} notify={setToast} />,
    history: () => <HistoryPanel c={c} hist={hist} />,
    tests: () => <TestsPanel c={c} tests={tests} onRun={runTest} running={running} />,
    figma: () => <FigmaPanel c={c} lint={lint} reading={reading} onRead={() => readLint(true)} />,
  };
  const current = TABS.some((x) => x.id === tab) ? tab : 'usage';

  return (
    <div className="atlas">
      <div className="ahead k-chrome">
        <div>
          <p className="k-meta">{crumb}</p>
          <div className="k-tline">
            <h1 className="k-h1" tabIndex={-1}>
              {c.name}
            </h1>
            {testBadge ? (
              <button type="button" className="a-badgebtn" onClick={() => setTab('tests')} aria-label={`${testBadge.text}: open Tests`}>
                <StatusPill tone={testBadge.tone} badge>
                  {testBadge.text}
                </StatusPill>
              </button>
            ) : null}
            {figmaBadge ? (
              <StatusPill tone={figmaBadge.tone} badge>
                {figmaBadge.text}
              </StatusPill>
            ) : null}
          </div>
          {c.description ? <p className="def">{c.description.replace(/\s*\n\s*/g, ' ')}</p> : null}
        </div>
        <div className="hacts2">
          <Button variant="secondary" disabled={!lint?.read} onClick={() => setTab('figma')}>
            Compare with Figma
          </Button>
          <Button variant="secondary" onClick={copyImport} ariaLabel={`Copy import: ${importLine}`}>
            <CopyIcon />
            Copy import
          </Button>
        </div>
      </div>

      <div className="doc">
        <div className="doctabs k-chrome">
          <Segmented id="doc" label={`${c.name} documentation`} items={TABS} value={current} onChange={setTab} />
        </div>
        {TABS.map((x) => (
          <div key={x.id} {...segPanelProps('doc', x.id, current)} className="a-tabpanel">
            {x.id === current ? panel[x.id]() : null}
          </div>
        ))}
      </div>

      <p className="toast" role="status" aria-live="polite" data-show={toast ? '' : undefined}>
        {toast}
      </p>
    </div>
  );
}
