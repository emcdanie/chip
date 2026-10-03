// Try a change (Atlas v4): a slider per tunable contract slot, with marks
// where a rule lives, and the checks re-run in the browser as you drag.
// Force state and Slow motion show the states you can't hold with a mouse.
// Local state only: nothing is written to BELLA. Slots, resolved values and
// token usage come from data/bella.json.
import React, { useLayoutEffect, useRef, useState } from 'react';
import Select from '@bella/components/Select/Select';
import Slider from '@bella/components/Slider/Slider';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import StatusPill from '@bella/components/StatusPill/StatusPill';
import { forceAttr } from './forcedStates.js';

const BELLA_FLOOR = 44; // BELLA's touch target (WCAG 2.5.5 Enhanced)
const WCAG_MIN = 24; // WCAG 2.5.8 Target Size (Minimum), AA

/* ---------- colour maths ---------- */
function parseColor(v) {
  if (!v) return null;
  const s = v.trim();
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
    return { r: +r, g: +g, b: +b, a: a.endsWith('%') ? parseFloat(a) / 100 : +a };
  }
  return null; // color-mix, gradients: not computable here
}

const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});

function luminance({ r, g, b }) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(fgValue, bgValue, groundValue) {
  const ground = parseColor(groundValue);
  let bg = parseColor(bgValue);
  let fg = parseColor(fgValue);
  if (!fg || !bg || !ground) return null;
  bg = over(bg, ground);
  fg = over(fg, bg);
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/* ---------- state ---------- */
const px = (v) => (v == null ? null : parseFloat(v));
const NUMERIC = ['minHeight', 'paddingY', 'paddingX', 'ringWidth', 'ringOffset'];

/** The draft's base values for this component, from its contract slots. */
export function baseOf(c) {
  const s = c.sandbox ?? {};
  const out = {};
  for (const k of NUMERIC) if (s[k]) out[k] = String(px(s[k].light));
  if (s.label) out.label = s.label.token;
  if (s.background) out.background = s.background.token;
  return out;
}

/** CSS custom property overrides for the rendered specimen. */
export function overridesOf(c, draft) {
  const s = c.sandbox ?? {};
  const base = baseOf(c);
  const out = {};
  for (const k of NUMERIC) {
    const n = parseFloat(draft[k]);
    if (s[k] && draft[k] !== base[k] && Number.isFinite(n)) out[s[k].token] = `${n}px`;
  }
  if (s.label && draft.label && draft.label !== base.label) out[s.label.token] = `var(${draft.label})`;
  if (s.background && draft.background && draft.background !== base.background) {
    out[s.background.token] = `var(${draft.background})`;
    if (s.backgroundPair) out[s.backgroundPair.token] = `var(${draft.background})`;
  }
  return out;
}

function colorValue(bella, c, token, theme) {
  const s = c.sandbox;
  if (!token) return null;
  for (const slot of [s.label, s.background]) if (slot && slot.token === token) return slot[theme];
  return bella.palette[token]?.[theme] ?? null;
}

/** Runs the checks for one draft. height is the measured specimen height. */
export function checksOf(bella, c, draft, height, theme) {
  const s = c.sandbox ?? {};
  const ground = bella.ring.ground[theme];
  const checks = [];

  if (s.label) {
    const fg = colorValue(bella, c, draft.label, theme);
    const bgToken = s.background ? draft.background : bella.ring.ground.token;
    const bg = s.background ? colorValue(bella, c, draft.background, theme) : ground;
    const r = contrast(fg, bg, ground);
    const level = r == null ? null : r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : null;
    checks.push({
      key: 'contrast',
      name: 'Label contrast',
      score: r == null ? null : Math.round(Math.min(r / 7, 1) * 100),
      pass: r != null && r >= 4.5,
      rule:
        r == null
          ? `Cannot compute: ${draft.label} or ${bgToken} is not a flat colour`
          : `Label contrast ${r.toFixed(1)}:1 on ${bgToken} ${level ? `passes ${level}` : 'fails AA (4.5:1)'}${level === 'AA' ? ', short of AAA (7:1)' : ''}`,
    });
  }

  if (s.minHeight && height) {
    const h = Math.round(height);
    const set = parseFloat(draft.minHeight);
    // the rule speaks about the rendered box; say so when padding holds it above the min height
    const held = Number.isFinite(set) && Math.abs(set - h) >= 1 ? `Min height ${set}px renders ${h}px (padding and line height hold it). ` : '';
    checks.push({
      key: 'target',
      name: 'Target size',
      score: Math.round(Math.min(h / BELLA_FLOOR, 1) * 100),
      pass: h >= BELLA_FLOOR,
      rule:
        held +
        (h >= BELLA_FLOOR
          ? `Target ${h}px meets BELLA's ${BELLA_FLOOR}px floor`
          : h >= WCAG_MIN
            ? `Target ${h}px fails BELLA's ${BELLA_FLOOR}px floor (passes WCAG 2.5.8, ${WCAG_MIN}px)`
            : `Target ${h}px fails WCAG 2.5.8 (${WCAG_MIN}px) and BELLA's ${BELLA_FLOOR}px floor`),
    });
  }

  if (s.ringWidth) {
    const w = parseFloat(draft.ringWidth);
    const offset = parseFloat(draft.ringOffset ?? '0');
    const ring = bella.ring.color[theme];
    // the ring sits on the page ground; with no offset it also touches the component
    const grounds = [[bella.ring.ground.token, ground]];
    if (!(offset > 0) && s.background) grounds.push([draft.background, colorValue(bella, c, draft.background, theme)]);
    const ratios = grounds.map(([t, v]) => [t, contrast(ring, v, ground)]).filter(([, r]) => r != null);
    const [worstOn, worst] = ratios.sort((a, b) => a[1] - b[1])[0] ?? [null, null];
    const wOk = Number.isFinite(w) && w >= 2;
    const cOk = worst != null && worst >= 3;
    const fails = [];
    if (!wOk) fails.push(`ring width ${Number.isFinite(w) ? w : '?'}px is under 2px`);
    if (!cOk) fails.push(worst == null ? 'ring contrast cannot be computed' : `ring contrast ${worst.toFixed(1)}:1 on ${worstOn} is under 3:1`);
    checks.push({
      key: 'ring',
      name: 'Focus ring',
      score: Math.round((Math.min((Number.isFinite(w) ? w : 0) / 2, 1) * 50) + Math.min((worst ?? 0) / 3, 1) * 50),
      pass: wOk && cOk,
      rule: fails.length
        ? `Focus ring fails: ${fails.join('; ')}`
        : `Focus ring ${w}px, ${worst.toFixed(1)}:1 on ${worstOn}, visible`,
    });
  }
  const scored = checks.filter((k) => k.score != null);
  const accessibility = scored.length ? Math.round(scored.reduce((n, k) => n + k.score, 0) / scored.length) : null;
  return { checks, accessibility };
}

/* ---------- the panel section ---------- */
function blastOf(bella, c, draft) {
  const tokens = Object.keys(overridesOf(c, draft));
  const names = new Set(tokens.flatMap((t) => bella.tokenUsage[t] ?? []));
  return { tokens, names: [...names].sort() };
}

function proposal(bella, c, draft, before, after, theme) {
  const s = c.sandbox;
  const base = baseOf(c);
  const lines = [];
  for (const k of NUMERIC) if (s[k] && draft[k] !== base[k]) lines.push([s[k].token, `${base[k]}px`, `${draft[k]}px`]);
  if (s.label && draft.label !== base.label) lines.push([s.label.token, s.label[theme], `var(${draft.label})`]);
  if (s.background && draft.background !== base.background) {
    lines.push([s.background.token, s.background[theme], `var(${draft.background})`]);
    if (s.backgroundPair) lines.push([s.backgroundPair.token, s.backgroundPair[theme], `var(${draft.background})`]);
  }
  const blast = blastOf(bella, c, draft);
  const row = (k) => {
    const b = before.checks.find((x) => x.key === k.key);
    return `| ${k.name} | ${b?.score ?? 'n/a'} | ${k.score ?? 'n/a'} | ${k.pass ? 'pass' : 'fail'}: ${k.rule} |`;
  };
  return [
    `## Proposal: ${c.name} contract change`,
    '',
    `Tried in CHIP's Specimen sandbox against BELLA @ ${bella.source.commit} (${theme} theme). Not applied to BELLA.`,
    '',
    '```diff',
    ...lines.flatMap(([t, a, b]) => [`- ${t}: ${a};`, `+ ${t}: ${b};`]),
    '```',
    '',
    `**Accessibility ${before.accessibility ?? 'n/a'} → ${after.accessibility ?? 'n/a'}**`,
    '',
    '| Check | Before | After | Result |',
    '|---|--:|--:|---|',
    ...after.checks.map(row),
    '',
    `**Blast radius:** ${blast.names.length ? blast.names.join(', ') : 'none'}`,
    '',
  ].join('\n');
}

// one slider per numeric slot: its range, and the marks where a rule lives
const SLIDERS = {
  minHeight: { label: 'Min height', min: 16, max: 64, marks: [{ value: WCAG_MIN, label: 'WCAG 2.5.8' }, { value: BELLA_FLOOR, label: 'BELLA floor' }] },
  paddingY: { label: 'Padding, top and bottom', min: 0, max: 24 },
  paddingX: { label: 'Padding, sides', min: 0, max: 40 },
  ringWidth: { label: 'Ring width', min: 0, max: 6, marks: [{ value: 2, label: 'visible minimum' }] },
  ringOffset: { label: 'Ring offset', min: 0, max: 6 },
};
const STATES = [
  { value: 'rest', label: 'Rest' },
  { value: 'hover', label: 'Hover' },
  { value: 'focus', label: 'Focus' },
  { value: 'active', label: 'Press' },
  { value: 'disabled', label: 'Disabled' },
];

export default function Sandbox({ bella, c, draft, setDraft, heights, theme, notify, children, onReset }) {
  const s = c.sandbox ?? {};
  const base = baseOf(c);
  const slots = Object.keys(base);
  const [state, setState] = useState('rest');
  const [slow, setSlow] = useState(false);
  const stage = useRef(null);
  // hold the specimen in a state the mouse can't (the same attributes the anatomy uses)
  useLayoutEffect(() => {
    const el = stage.current?.querySelector('[data-bella-component]');
    if (!el) return;
    for (const a of ['data-force-hover', 'data-force-focus', 'data-force-active']) el.removeAttribute(a);
    if (el.hasAttribute('data-was-disabled')) {
      el.disabled = false;
      el.removeAttribute('data-was-disabled');
    }
    if (state === 'disabled') {
      el.setAttribute('data-was-disabled', '');
      el.disabled = true;
      return;
    }
    const f = forceAttr(state === 'rest' ? null : state);
    if (f) el.setAttribute(f[0], f[1]);
  });
  if (!slots.length) {
    return (
      <section className="sandbox">
        <p className="label">{c.name}'s contract has no slots to try (min height, padding, label, background or focus ring).</p>
      </section>
    );
  }
  const before = checksOf(bella, c, base, heights.base, theme);
  const after = checksOf(bella, c, draft, heights.now, theme);
  const changed = Object.keys(overridesOf(c, draft)).length > 0;
  const blast = blastOf(bella, c, draft);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const passing = (r) => r.checks.filter((k) => k.pass).length;
  const colours = (slot) => [
    { value: slot.token, label: `${slot.token} (contract)` },
    ...Object.keys(bella.palette)
      .filter((t) => t !== slot.token)
      .map((t) => ({ value: t, label: t })),
  ];
  const slider = (k) =>
    s[k] ? (
      <Slider
        key={k}
        label={SLIDERS[k].label}
        unit="px"
        min={SLIDERS[k].min}
        max={SLIDERS[k].max}
        value={Number(draft[k]) || 0}
        onChange={(v) => set(k)(String(v))}
        marks={SLIDERS[k].marks}
        hint={draft[k] !== base[k] ? `${s[k].token} · was ${base[k]}px in the contract` : s[k].token}
      />
    ) : null;

  async function copy() {
    const md = proposal(bella, c, draft, before, after, theme);
    try {
      await navigator.clipboard.writeText(md);
      notify('Copied the proposal as markdown');
    } catch {
      notify('Could not copy the proposal');
    }
  }

  return (
    <section className="sandbox" aria-label={`Try a change to ${c.name}`}>
      <div className={`sandbox-stage${slow ? ' slow-motion' : ''}`} ref={stage}>
        {children}
      </div>
      <div className="sandbox-row">
        <SegmentedControl label="Force state" value={state} onChange={setState} options={STATES} />
        <FilterChip pressed={slow} onClick={() => setSlow((x) => !x)}>
          Slow motion
        </FilterChip>
      </div>
      <div className="sandbox-fields">
        {Object.keys(SLIDERS).map(slider)}
        {s.label ? <Select label="Label colour" value={draft.label} onChange={set('label')} options={colours(s.label)} /> : null}
        {s.background ? <Select label="Background" value={draft.background} onChange={set('background')} options={colours(s.background)} /> : null}
      </div>

      <div className="sandbox-score" aria-live="polite">
        <p className="score-line">
          <b>
            Checks {passing(before)} of {before.checks.length} → {passing(after)} of {after.checks.length}
          </b>{' '}
          · accessibility {before.accessibility ?? 'n/a'} → {after.accessibility ?? 'n/a'}
        </p>
        <ul className="checks">
          {after.checks.map((k) => (
            <li key={k.key}>
              <StatusPill variant={k.pass ? 'success' : 'neutral'}>{k.pass ? 'pass' : 'fail'}</StatusPill>
              <span className="check-rule">{k.rule}</span>
            </li>
          ))}
        </ul>
        {changed ? (
          <p className="label">
            Blast radius: {blast.tokens.join(', ')} reaches {blast.names.length} component{blast.names.length === 1 ? '' : 's'}: {blast.names.join(', ')}
          </p>
        ) : null}
      </div>

      <div className="sandbox-actions">
        <ActionChip
          onClick={() => {
            setDraft(base);
            setState('rest');
            onReset?.();
          }}
        >
          Reset
        </ActionChip>
        {changed ? <ActionChip onClick={copy}>Copy as proposal</ActionChip> : null}
        <p className="label">Local only. Nothing is written to BELLA.</p>
      </div>
    </section>
  );
}
