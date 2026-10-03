// Atlas: one BELLA component on the Object page template (layout
// foundation): the specimen library beside the page; the page header, the
// specimen card (the anatomy stage, Explode, or Try a change) beside the
// Facts card, then Examples, Contract and What the gate caught, always in
// that order. Parts, facts, checks and findings come from data/bella.json; a
// missing piece is an empty state that says what to add, never faked.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PageHeader from '@bella/components/PageHeader/PageHeader';
import Section from '@bella/components/Section/Section';
import SidebarLayout from '@bella/components/SidebarLayout/SidebarLayout';
import Columns from '@bella/components/Columns/Columns';
import Card from '@bella/components/Card/Card';
import Link from '@bella/components/Link/Link';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import NavList from '@bella/components/NavList/NavList';
import Button from '@bella/components/Button/Button';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import { SPECIMENS, VARIANTS } from './specimens.jsx';
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

/** A token in full, allowed to wrap after each "-" (never cut in the middle). */
export function Token({ name }) {
  if (!name) return null;
  const parts = name.split('-');
  return parts.map((p, i) => (
    <React.Fragment key={i}>
      {p}
      {i < parts.length - 1 ? (
        <>
          -<wbr />
        </>
      ) : null}
    </React.Fragment>
  ));
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
            <span className="legend-token">
              <Token name={p.token} />
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

/* ---------- the specimen library ---------- */
const CATEGORIES = ['Actions', 'Inputs', 'Layout', 'Data', 'Brand'];
// not a category: the group of components with no contract, always last
const NO_CONTRACT = 'Missing a contract';
const complete = (c) => c.hasStory && c.hasDocs;
const statusText = (c) => (complete(c) ? 'Story and docs present' : !c.hasStory ? 'Missing story' : 'Missing docs');

export function Library({ bella, current, onOpen }) {
  const by = {};
  for (const c of bella.components) (by[c.category ?? NO_CONTRACT] ??= []).push(c);
  const groups = [...CATEGORIES, NO_CONTRACT].filter((g) => by[g]).map((g) => ({
    label: g,
    items: by[g].map((c) => ({
      href: `#/atlas/${c.id}`,
      label: c.name,
      current: c.id === current,
      // the dot: filled when story and docs are present, a hollow ring when
      // something is missing; the shape carries it, the hidden words say it
      badge: (
        <>
          <span className={`dot ${complete(c) ? 'dot--ok' : 'dot--gap'}`} title={statusText(c)} aria-hidden="true" />
          <span className="sr-only">{statusText(c)}</span>
        </>
      ),
    })),
  }));
  const gaps = bella.components.filter((c) => !complete(c)).length;
  return (
    <div className="library">
      <NavList
        label="Specimen library"
        groups={groups}
        onNavigate={(href, e) => {
          e.preventDefault();
          onOpen(href.slice('#/atlas/'.length));
        }}
        footer={
          <div className="dot-legend">
            <p className="label">
              <span className="dot dot--ok" aria-hidden="true" /> Has a story and docs
            </p>
            <p className="label">
              <span className="dot dot--gap" aria-hidden="true" /> Something missing ({gaps} of {bella.components.length})
            </p>
          </div>
        }
      />
    </div>
  );
}

/* ---------- example cards (only from real data) ---------- */
const sentences = (text, n) => (text ?? '').split(/(?<=\.)\s+/).slice(0, n).join(' ');

function InState({ name, state }) {
  const ref = useRef(null);
  const Render = SPECIMENS[name];
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('[data-bella-component]');
    const force = forceAttr(state);
    if (el && force) el.setAttribute(force[0], force[1]);
  }, [state, name]);
  return (
    <figure className="state-cell">
      <div ref={ref} inert aria-hidden="true">
        {Render ? <Render /> : null}
      </div>
      <figcaption className="label">{state === 'active' ? 'press' : state}</figcaption>
    </figure>
  );
}

function Example({ eyebrow, caption, children }) {
  return (
    <Card innerClassName="example">
      <h3 className="card-title">{eyebrow}</h3>
      <div className="well">{children}</div>
      {caption ? <p className="example-caption">{caption}</p> : null}
    </Card>
  );
}

function exampleCards(c, bella) {
  const cards = [];
  const variants = VARIANTS[c.name];
  if (variants && c.variants.length >= 2) {
    const rule = c.dont.find((d) => c.variants.some((v) => d.toLowerCase().includes(v)));
    cards.push(
      <Example key="v" eyebrow={`${c.variants.length} variants`} caption={rule ?? `Variants from the contract: ${c.variants.join(', ')}.`}>
        <div className="well-row" inert aria-hidden="true">
          {c.variants.map((v) => (
            <React.Fragment key={v}>{variants(v)}</React.Fragment>
          ))}
        </div>
      </Example>
    );
  }
  const states = ['hover', 'focus', 'active'].filter((s) => c.states.includes(s));
  if (states.length && SPECIMENS[c.name]) {
    cards.push(
      <Example key="s" eyebrow="One job per state" caption={sentences(c.restNote, 2) || null}>
        <div className="well-row">
          {['rest', ...states].map((s) => (
            <InState key={`${c.name}-${s}`} name={c.name} state={s} />
          ))}
        </div>
      </Example>
    );
  }
  // the nearest sibling: the first component the contract's do-nots point to
  const rule = c.dont.find((d) => bella.components.some((o) => o.name !== c.name && SPECIMENS[o.name] && new RegExp(`\\b${o.name}\\b`).test(d)));
  const sibling = rule && bella.components.find((o) => o.name !== c.name && SPECIMENS[o.name] && new RegExp(`\\b${o.name}\\b`).test(rule));
  if (sibling && SPECIMENS[c.name]) {
    const A = SPECIMENS[c.name];
    const B = SPECIMENS[sibling.name];
    cards.push(
      <Example key="c" eyebrow={`Compare · ${c.name} vs ${sibling.name}`} caption={rule}>
        <div className="well-row" inert aria-hidden="true">
          <A />
          <B />
        </div>
      </Example>
    );
  }
  return cards;
}

// this component's findings only; the whole system's live on Health
function Findings({ c }) {
  const findings = [
    !c.hasStory && 'No story',
    !c.hasDocs && 'No docs description',
    c.health.contract.status === 'fail' && `Contract parity fails: ${c.health.contract.issues.join('; ')}`,
    c.health.contract.status === 'no-contract' && 'No contract',
    c.health.contrast.status === 'fail' && `A contrast pair fails: ${c.health.contrast.failing.join('; ')}`,
    !c.inDsds && 'No DSDS entry',
  ].filter(Boolean);
  return (
    <Card innerClassName="gate-card">
      {findings.length ? (
        <ul className="findings">
          {findings.map((f) => (
            <li key={f}>
              <span className="dot dot--gap" aria-hidden="true" /> {f}
            </li>
          ))}
        </ul>
      ) : (
        <p>Nothing caught for {c.name}.</p>
      )}
      <p className="label">Real findings from BELLA's checks for this component.</p>
      <Link href="#/health">See all on Health</Link>
    </Card>
  );
}

// what the contract promises; with no contract, the empty state says where to add one
function Contract({ c }) {
  if (!c.hasContract) {
    return (
      <Card innerClassName="contract-card">
        <div className="empty">
          <p className="card-title">No contract yet</p>
          <p className="label">Add one for {c.name} to tokens/component.json in BELLA.</p>
          <Link href={REPO_FILE} external>Open the contract file</Link>
        </div>
      </Card>
    );
  }
  return (
    <Card innerClassName="contract-card">
      <dl className="facts">
        <div><dt>Props</dt><dd className="props">{c.props.map((p) => <span key={p} className="mono">{p}</span>)}</dd></div>
        <div><dt>Variants</dt><dd>{c.variants.length ? c.variants.join(', ') : 'None'}</dd></div>
        <div><dt>States</dt><dd>{c.states.length ? c.states.join(', ') : 'Not recorded'}</dd></div>
        {c.rendersAs ? <div><dt>Renders as</dt><dd>{c.rendersAs}</dd></div> : null}
      </dl>
      <Columns count={2}>
        <div className="contract-list">
          <p className="label">Use it for</p>
          <ul>{c.usage.map((u) => <li key={u}>{u}</li>)}</ul>
        </div>
        <div className="contract-list">
          <p className="label">Don't</p>
          <ul>{c.dont.map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
      </Columns>
    </Card>
  );
}

/* ---------- the Facts card ---------- */
// open or closed per section, remembered in this browser
const FACTS_KEY = 'chip-facts-open';
function useSections() {
  const [open, setOpen] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(FACTS_KEY) ?? '{}');
    } catch {
      return {};
    }
  });
  const set = (k, v) =>
    setOpen((o) => {
      const n = { ...o, [k]: v };
      try {
        localStorage.setItem(FACTS_KEY, JSON.stringify(n));
      } catch {}
      return n;
    });
  return [open, set];
}

function Facts({ c, notes, canTry, trying, onTry, notify }) {
  const tip = sentences(c.restNote, 2);
  const [open, setOpen] = useSections();
  const [checksOpen, setChecksOpen] = useState(null); // this visit only
  useEffect(() => setChecksOpen(null), [c.id]);
  async function copy(t) {
    try {
      await navigator.clipboard.writeText(`var(${t})`);
      notify(`Copied var(${t})`);
    } catch {
      notify(`Could not copy ${t}`);
    }
  }
  const pass = (ok, word = ok ? 'pass' : 'fail') => <StatusPill variant={ok ? 'success' : 'neutral'}>{word}</StatusPill>;
  const mine = notes.filter((n) => n.component === c.name);
  const checks = [
    { ok: c.health.contrast.status !== 'fail', word: c.health.contrast.status === 'not-covered' ? 'n/a' : undefined, label: `Contrast${c.health.contrast.pairs ? ` · ${c.health.contrast.pairs} pairs` : ''}` },
    // unchecked is not a failure: the gate did not run that check
    { ok: ['pass', 'unchecked'].includes(c.health.contract.status), word: c.health.contract.status === 'no-contract' ? 'none' : c.health.contract.status === 'unchecked' ? 'n/a' : undefined, label: 'Contract parity' },
    { ok: complete(c), label: 'Story and docs present' },
    { ok: c.inDsds, label: 'DSDS entry' },
    ...(c.minTarget ? [{ ok: parseFloat(c.minTarget.value) >= 44, word: c.minTarget.value, label: 'Touch target minimum' }] : []),
  ];
  const failing = checks.filter((x) => !x.ok).length;
  // a section's default when this browser has no memory of it
  const isOpen = (k, dflt) => open[k] ?? dflt;
  const factsSummary = [`${c.variants.length || 'no'} variant${c.variants.length === 1 ? '' : 's'}`, c.minTarget ? `${c.minTarget.value} min` : null].filter(Boolean).join(' · ');
  return (
    <Card innerClassName="facts-card">
      <div className="facts-stack" role="group" aria-label={`${c.name} facts`}>
        <Disclosure title="Facts" summary={factsSummary} open={isOpen('facts', true)} onToggle={(v) => setOpen('facts', v)}>
          <dl className="facts">
            <div><dt>Variants</dt><dd>{c.variants.length ? c.variants.join(', ') : 'None'}</dd></div>
            {c.shapes?.length ? <div><dt>Shape</dt><dd>{c.shapes.join(' · ')}</dd></div> : null}
            {c.rendersAs ? <div><dt>Renders as</dt><dd>{c.rendersAs}</dd></div> : null}
            <div><dt>States</dt><dd>{c.states.length ? c.states.join(', ') : 'Not recorded'}</dd></div>
            <div><dt>Min height</dt><dd>{c.minTarget ? c.minTarget.value : 'Not a control'}</dd></div>
          </dl>
        </Disclosure>
        <Disclosure
          title="Checks"
          summary={failing ? <StatusPill variant="neutral">{failing} failing</StatusPill> : `${checks.length} of ${checks.length} pass`}
          // never remembered: Checks opens exactly when something fails
          open={checksOpen ?? failing > 0}
          onToggle={setChecksOpen}
        >
          <ul className="gate-list">
            {checks.map((x) => (
              <li key={x.label}>
                {pass(x.ok, x.word)} {x.label}
              </li>
            ))}
          </ul>
        </Disclosure>
        {tip ? (
          <Disclosure title="Did you know" open={isOpen('tip', false)} onToggle={(v) => setOpen('tip', v)}>
            <p className="tip-text">{tip}</p>
          </Disclosure>
        ) : null}
        {canTry ? (
          // opening it swaps the stage into the sandbox; closing puts the anatomy back
          <Disclosure title="Try a change" summary={trying ? 'On the stage' : null} open={trying} onToggle={(v) => v !== trying && onTry(v)}>
            <p className="label">The stage is the sandbox now: change a token and watch the checks.</p>
          </Disclosure>
        ) : null}
        <Disclosure title="Notes" summary={mine.length ? `${mine.length} note${mine.length === 1 ? '' : 's'}` : 'None'} open={isOpen('notes', false)} onToggle={(v) => setOpen('notes', v)}>
          {mine.length ? (
            <ul className="note-list">
              {[...mine].reverse().map((n) => (
                <li key={n.at}>
                  <p className="label">
                    <time dateTime={n.at}>{new Date(n.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</time>
                    {n.question ? ` · ${n.question}` : ''}
                  </p>
                  <p className="note-text">{n.text.length > 240 ? `${n.text.slice(0, 240)}…` : n.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="label">No notes yet. Save one from an OBI answer.</p>
          )}
        </Disclosure>
        <Disclosure title="Tokens" summary={String(c.tokens.count)} open={isOpen('tokens', false)} onToggle={(v) => setOpen('tokens', v)}>
          <ul className="token-rows">
            {c.tokens.list.map((t) => (
              <li key={t}>
                <span className="legend-token"><Token name={t} /></span>
                <ActionChip onClick={() => copy(t)} ariaLabel={`Copy ${t}`}>Copy</ActionChip>
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </Card>
  );
}

// the rendered specimen's height in layout pixels (the stage's zoom does not count)
function specimenHeight() {
  const el = document.querySelector('.atlas .spec-render [data-bella-component], .atlas .card-layer [data-bella-component]');
  return el ? el.offsetHeight : null;
}

export default function Atlas({ c, bella, theme, notes = [], onOpen, showLibrary = true, trySignal, onTryUsed }) {
  const reduced = useReducedMotion();
  const [exploded, setExploded] = useState(false);
  const [mode, setMode] = useState('anatomy'); // or 'try'
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
    setMode('anatomy');
    setHeights({ base: null, now: null });
  }, [c?.id]);
  // "Try in sandbox" from OBI
  // one shot: used, then cleared, so later visits open on the anatomy
  useEffect(() => {
    if (!trySignal) return;
    setMode('try');
    onTryUsed?.();
  }, [trySignal?.at]);
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

  if (!c || !bella) return <p className="loading">Loading BELLA…</p>;
  const Render = SPECIMENS[c.name];
  const showExplode = parts.length > 0 && !reduced;
  const canTry = Object.keys(baseOf(c)).length > 0;
  const order = [...CATEGORIES, NO_CONTRACT].flatMap((g) => bella.components.filter((o) => (o.category ?? NO_CONTRACT) === g));
  const number = String(order.findIndex((o) => o.id === c.id) + 1).padStart(3, '0');
  const examples = exampleCards(c, bella);
  const plainStage = (
    <div className="stage">
      <div className="spec-frame spec-frame--plain">
        <div className="spec-render" inert aria-hidden="true" style={overrides}>
          {Render ? <Render /> : null}
        </div>
      </div>
    </div>
  );

  const importLine = `import ${c.name} from '@bella/components/${c.name}/${c.name}';`;
  async function copyImport() {
    try {
      await navigator.clipboard.writeText(importLine);
      setToast('Copied the import');
    } catch {
      setToast('Could not copy the import');
    }
  }

  const content = (
    <>
      <PageHeader
        meta={`Specimen No. ${number} · ${c.category ?? NO_CONTRACT}`}
        title={c.name}
        lede={c.description || null}
        actions={
          <>
            <Button variant="secondary" onClick={copyImport} ariaLabel={`Copy the import line for ${c.name}`}>
              Copy import
            </Button>
            {c.storyUrl ? (
              <Button variant="secondary" href={c.storyUrl}>
                Open the story
              </Button>
            ) : null}
          </>
        }
      />

      <div className="stage-row">
        <Columns split="wide-start">
          <Card innerClassName="specimen-card">
            {mode === 'try' ? (
              <Sandbox bella={bella} c={c} draft={draft} setDraft={setDraft} heights={heights} theme={theme} notify={setToast} onReset={() => setMode('anatomy')}>
                {plainStage}
              </Sandbox>
            ) : (
              <>
                {parts.length ? (
                  exploded && showExplode ? (
                    <Exploded name={c.name} parts={parts} hl={hl} setHl={setHl} zoom={zoom} overrides={overrides} />
                  ) : (
                    <Anatomy name={c.name} parts={parts} hl={hl} setHl={setHl} zoom={zoom} setZoom={setZoom} overrides={overrides}>
                      <Legend name={c.name} parts={parts} hl={hl} setHl={setHl} />
                    </Anatomy>
                  )
                ) : (
                  <>
                    {plainStage}
                    <div className="empty">
                      <p className="card-title">No anatomy yet</p>
                      <p className="label">Add anatomy to {c.name}'s contract in BELLA ({c.anatomySource}) and its parts appear here, numbered on the stage.</p>
                    </div>
                  </>
                )}
                {parts.length ? (
                  <div className="stage-bar">
                    {showExplode ? (
                      <Button variant="secondary" onClick={() => setExploded((x) => !x)}>
                        {exploded ? 'Put back' : 'Explode'}
                      </Button>
                    ) : null}
                    <p className="label">
                      {showExplode ? `${parts.length} parts, bottom layer first. Hover a part to see it; select it to show its state.` : 'Explode is off while reduced motion is on.'}
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </Card>
          <Facts c={c} notes={notes} canTry={canTry} trying={mode === 'try'} onTry={(on) => setMode(on ? 'try' : 'anatomy')} notify={setToast} />
        </Columns>
      </div>

      <Section id="examples" heading="Examples">
        {examples.length ? <Columns count={2} className="examples-cols">{examples}</Columns> : (
          <Card>
            <div className="empty">
              <p className="card-title">No examples yet</p>
              <p className="label">Examples come from the contract's variants and states and a specimen in CHIP's specimens.jsx.</p>
            </div>
          </Card>
        )}
      </Section>

      <Section id="contract" heading="Contract" lede="What BELLA promises about this component, read from its contract.">
        <Contract c={c} />
      </Section>

      <Section id="gate" heading="What the gate caught">
        <Findings c={c} />
      </Section>
    </>
  );

  return (
    <div className="atlas">
      {showLibrary ? (
        <SidebarLayout aside={<Library bella={bella} current={c.id} onOpen={onOpen} />} asideLabel="Components">
          {content}
        </SidebarLayout>
      ) : (
        content
      )}

      <p className="toast" role="status" aria-live="polite" data-show={toast ? '' : undefined}>
        {toast}
      </p>
    </div>
  );
}
