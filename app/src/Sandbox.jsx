// Contract sandbox: try a change to a component's contract slots and see the
// checks re-run in the browser. Local state only: nothing is written to BELLA.
// Slots, resolved values and token usage come from data/bella.json.
import React from 'react';
import Input from '@bella/components/Input/Input';
import Select from '@bella/components/Select/Select';
import Button from '@bella/components/Button/Button';
import StatusPill from '@bella/components/StatusPill/StatusPill';

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

export default function Sandbox({ bella, c, draft, setDraft, heights, theme, notify }) {
  const s = c.sandbox ?? {};
  const base = baseOf(c);
  const slots = Object.keys(base);
  if (!slots.length) {
    return (
      <section aria-labelledby="try-h" className="sandbox">
        <h2 id="try-h" className="panel-title">Try a change</h2>
        <p className="meta">{c.name}'s contract has no sandbox slots (min height, padding, label, background or focus ring).</p>
      </section>
    );
  }
  const before = checksOf(bella, c, base, heights.base, theme);
  const after = checksOf(bella, c, draft, heights.now, theme);
  const changed = Object.keys(overridesOf(c, draft)).length > 0;
  const blast = blastOf(bella, c, draft);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const colours = (slot) => [
    { value: slot.token, label: `${slot.token} (contract)` },
    ...Object.keys(bella.palette)
      .filter((t) => t !== slot.token)
      .map((t) => ({ value: t, label: t })),
  ];
  const num = (k, label) =>
    s[k] ? (
      <Input
        key={k}
        label={`${label} (px)`}
        value={draft[k] ?? ''}
        onChange={set(k)}
        hint={s[k].token}
        error={Number.isFinite(parseFloat(draft[k])) ? undefined : 'Enter a number of pixels'}
        autoComplete="off"
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
    <section aria-labelledby="try-h" className="sandbox">
      <h2 id="try-h" className="panel-title">Try a change</h2>
      <p className="meta">Local only. Nothing is written to BELLA.</p>
      <div className="sandbox-fields">
        {num('minHeight', 'Min target height')}
        {num('paddingY', 'Padding, block')}
        {num('paddingX', 'Padding, inline')}
        {s.label ? <Select label="Label colour" value={draft.label} onChange={set('label')} options={colours(s.label)} /> : null}
        {s.background ? (
          <Select label="Background" value={draft.background} onChange={set('background')} options={colours(s.background)} />
        ) : null}
        {num('ringWidth', 'Focus ring width')}
        {num('ringOffset', 'Focus ring offset')}
      </div>

      <div className="sandbox-score" aria-live="polite">
        <p className="score-line">
          Accessibility <b className="num">{before.accessibility ?? 'n/a'}</b> → <b className="num">{after.accessibility ?? 'n/a'}</b>
        </p>
        <ul className="checks">
          {after.checks.map((k) => {
            const b = before.checks.find((x) => x.key === k.key);
            return (
              <li key={k.key}>
                <span className="check-name">{k.name}</span>
                <span className="num">
                  {b?.score ?? 'n/a'} → {k.score ?? 'n/a'}
                </span>
                <StatusPill variant={k.pass ? 'success' : 'info'}>{k.pass ? 'pass' : 'fail'}</StatusPill>
                <span className="check-rule">{k.rule}</span>
              </li>
            );
          })}
        </ul>
        <p className="meta">Score per check: contrast ÷ 7:1, target ÷ 44px, ring width ÷ 2px and contrast ÷ 3:1, each capped at 100.</p>
      </div>

      {changed ? (
        <div className="blast">
          <h3 className="check-name">Blast radius</h3>
          <p>
            {blast.tokens.join(', ')} reaches {blast.names.length} component{blast.names.length === 1 ? '' : 's'}:{' '}
            {blast.names.join(', ')}
          </p>
        </div>
      ) : null}

      <div className="sandbox-actions">
        <Button variant="secondary" onClick={() => setDraft(base)} disabled={!changed}>
          Reset
        </Button>
        <Button variant="tertiary" onClick={copy} disabled={!changed}>
          Copy as proposal
        </Button>
      </div>
    </section>
  );
}
