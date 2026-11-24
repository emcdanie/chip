// The accessibility views on the Quality tab's stage (Elleta, 22 Nov: "i want to see the touch target visually", "i think
// that the accessibility is too hidden"). Each view draws what the fact is about on the live part, measured as drawn:
//   Target    the part's real box with its width and height, and the 44 px minimum as a dashed square
//   Focus     the real focus ring (the part wears BELLA's own focus rules), with its width, offset and ratio
//   Contrast  the two colours the label sits on, as swatches, with the ratio
//   Reader    the role, name and state as a screen reader says them
// The drawing is the part's own measured size, scaled by one factor (CSS zoom) so a 110 by 44 button is big enough to
// read; every label is BELLA's Tag at reading size and sits outside the zoom. Nothing is typed: sizes, colours and the
// ring come from the part as drawn, the numbers from qualityModel's facts.
//
// BELLA gaps, named: no dimension or measure part (lines with end ticks and a label), so the lines are 1 wide borders;
// no "target square" mark, so it is a dashed border in border/brand (the target colour of Progress).
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Stage from '@bella/components/Stage/Stage';
import Tag from '@bella/components/Tag/Tag';
import Swatch from '@bella/components/Swatch/Swatch';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import Flow from '../templates/Flow.jsx';
import { forceAttr, installForcedStates } from '../forcedStates.js';

const PAD = 88; // room each side of the part for the dimension lines and their labels (a label is about 56 wide)
const PADY = 64;
const MIN = 44;
const TICK = 12; // an end tick's length
const SPAD = 32; // a story part's frame: room for the end ticks only (its size is said under the stage, not beside it)

/** The wcag ratio of two #rrggbb colours. */
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratioOf = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hexOf = (c) => {
  const m = String(c).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, al = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return al === 0 ? null : `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
};
/** The colour a part's label sits on: its own fill (first gradient layer, else the colour), else the nearest parent's. */
const styleOf = (e, pseudo) => (e.ownerDocument?.defaultView ?? window).getComputedStyle(e, pseudo);
const fillOf = (el) => {
  for (let e = el; e; e = e.parentElement) {
    const cs = styleOf(e);
    const layer = (cs.backgroundImage.match(/rgba?\([^)]*\)/g) ?? []).map(hexOf).find(Boolean);
    const h = layer ?? hexOf(cs.backgroundColor);
    if (h) return h;
  }
  return null;
};
/** The name a screen reader says: aria-label, else its words once (a part that repeats them for a reader is read once). */
const nameOf = (el) => {
  const t = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
  const twice = t.match(/^(.+?)\s?\1$/);
  return twice ? twice[1] : t;
};
const num = (v) => Math.round((parseFloat(v) || 0) * 10) / 10;

/** A part drawn from its story sits in BELLA's Storybook frame (same origin, /storybook/): the part there, or null until
 *  the story has drawn. Lets the Target, Focus, Contrast and Reader views and the touch target measure the real part
 *  instead of the frame's controls (b326835 measured the width switch, so BarChart "passed" at 53 by 44). */
export function storyPart(container) {
  const f = container?.querySelector('[data-story-sample] iframe');
  if (!f) return null;
  try {
    const root = f.contentDocument?.querySelector('#storybook-root');
    return root?.querySelector('[data-bella-component]') ?? root?.firstElementChild ?? null;
  } catch {
    return null;
  }
}
/** Calls back when a story frame inside the container loads and again while its story draws. */
export function onStoryDrawn(container, cb) {
  const f = container?.querySelector('[data-story-sample] iframe');
  if (!f) return () => {};
  f.addEventListener('load', cb);
  const t = [600, 1500, 3000].map((ms) => setTimeout(cb, ms));
  return () => (f.removeEventListener('load', cb), t.forEach(clearTimeout));
}
/** The element a touch target is read from: the part itself when it is the control, else its first control. */
export const controlOf = (el) => (!el ? null : el.matches('button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="checkbox"]') ? el : el.querySelector('button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="checkbox"]'));
/** A control's touch target, unscaled: its own box or its hit area (::before, ::after), whichever is larger. */
export function touchOf(el) {
  if (!el) return null;
  const px = (v) => (/px$/.test(v) ? parseFloat(v) : 0);
  const hit = ['::before', '::after'].map((p) => styleOf(el, p)).filter((c) => c.position === 'absolute');
  return { w: Math.round(Math.max(el.offsetWidth, ...hit.map((c) => px(c.width)))), h: Math.round(Math.max(el.offsetHeight, ...hit.map((c) => px(c.height)))) };
}

/** The part drawn at one factor, measured as drawn: its real size, its colours, its ring. */
function usePartMeasure(id, k, deps, sampled, onTouch) {
  const [m, setM] = useState(null);
  useLayoutEffect(() => {
    const holder = document.getElementById(id);
    const read = () => {
      // a story part: its own control when it has one (what the Touch target fact measures), so drawing and words agree
      const found = sampled ? storyPart(holder) : null;
      const el = sampled ? controlOf(found) ?? found : holder?.querySelector('[data-bella-component]');
      if (!el) return;
      if (sampled) onTouch?.(touchOf(controlOf(el))); // the story part's own control, so its Touch target fact is measured
      const r = el.getBoundingClientRect();
      const cs = styleOf(el);
      // a story part: where it sits in the holder (the frame's place plus the part's place inside the frame), unscaled
      const frame = sampled ? holder.querySelector('[data-story-sample] iframe').getBoundingClientRect() : null;
      const h0 = holder.getBoundingClientRect();
      // text colour: the first element with its own words, else the part
      const t = [el, ...el.querySelectorAll('*')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) ?? el;
      const fg = hexOf(styleOf(t).color);
      const bg = fillOf(t);
      const next = {
        w: num(r.width / k),
        h: num(r.height / k),
        fg,
        bg,
        ring: { w: num(cs.getPropertyValue('--focus-ring-width')), o: num(cs.getPropertyValue('--focus-ring-offset')) },
        tag: el.tagName.toLowerCase(),
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
        busy: el.getAttribute('aria-busy') === 'true',
        name: nameOf(el),
        role: el.getAttribute('role'),
        x: frame ? num(frame.left - h0.left + r.left) : null,
        y: frame ? num(frame.top - h0.top + r.top) : null,
      };
      setM((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next));
    };
    const t = [setTimeout(read, 0), setTimeout(read, 300), setTimeout(read, 800)];
    const off = sampled ? onStoryDrawn(holder, read) : () => {};
    return () => (t.forEach(clearTimeout), off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, k, ...deps]);
  return m;
}

const at = (x, y, extra = {}) => ({ position: 'absolute', insetInlineStart: x, insetBlockStart: y, ...extra });

/** The width and height of the part's own box, the 44 minimum beside it. */
// labels: off for a part inside its story, where the story's own words sit beside the part and a floating label would
// cover them; its size is then said in the row under the stage
function TargetDrawing({ w, h, k, x: PAD0 = PAD, y: PADY0 = PADY, labels = true }) {
  const PAD = PAD0;
  const PADY = PADY0;
  const W = w * k;
  const H = h * k;
  const M = MIN * k;
  const small = w < MIN || h < MIN;
  const line = 'var(--border-width-1) solid var(--color-content-default)';
  const tone = small ? 'danger' : 'default';
  return (
    <>
      {/* the part's own box, as measured */}
      <span aria-hidden="true" style={at(PAD, PADY, { inlineSize: W, blockSize: H, border: line, borderColor: small ? 'var(--color-content-danger)' : 'var(--color-content-default)', pointerEvents: 'none' })} />
      {/* the 44 by 44 minimum, dashed, centred on the part */}
      <span aria-hidden="true" style={at(PAD + (W - M) / 2, PADY + (H - M) / 2, { inlineSize: M, blockSize: M, border: 'var(--border-width-2) dashed var(--color-border-brand)', pointerEvents: 'none' })} />
      {/* width: a line over the box with an end tick at each side, and its label */}
      <span aria-hidden="true" style={at(PAD, PADY - 20, { inlineSize: W, borderBlockStart: line })} />
      <span aria-hidden="true" style={at(PAD, PADY - 26, { blockSize: TICK, borderInlineStart: line })} />
      <span aria-hidden="true" style={at(PAD + W, PADY - 26, { blockSize: TICK, borderInlineStart: line })} />
      {labels ? (
        <span style={at(PAD + W / 2, PADY - 44, { transform: 'translateX(-50%)', whiteSpace: 'nowrap' })}>
          <Tag variant="outline" tone={tone}>{`${Math.round(w)} px`}</Tag>
        </span>
      ) : null}
      {/* height: a line left of the box, end ticks, its label */}
      <span aria-hidden="true" style={at(PAD - 20, PADY, { blockSize: H, borderInlineStart: line })} />
      <span aria-hidden="true" style={at(PAD - 26, PADY, { inlineSize: TICK, borderBlockStart: line })} />
      <span aria-hidden="true" style={at(PAD - 26, PADY + H, { inlineSize: TICK, borderBlockStart: line })} />
      {labels ? (
        <span style={at(PAD - 32, PADY + H / 2, { transform: 'translate(-100%, -50%)', whiteSpace: 'nowrap' })}>
          <Tag variant="outline" tone={tone}>{`${Math.round(h)} px`}</Tag>
        </span>
      ) : null}
    </>
  );
}

/** One view of the part on its stage: the live part at one factor with the view's own drawing and words. */
export default function A11yStage({ part, mode, facts, variant, label, renderPart, sampled = false, onTouch }) {
  const id = useId();
  const [k, setK] = useState(1);
  const [room, setRoom] = useState(null); // the stage's inner width, so the drawing never runs past it
  const holder = useRef(null);
  useEffect(() => installForcedStates(), []);
  useLayoutEffect(() => {
    const el = holder.current?.closest('[data-bella-component="stage"]') ?? holder.current?.parentElement;
    if (!el) return undefined;
    const read = () => setRoom(Math.floor(el.clientWidth));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const m = usePartMeasure(id, sampled ? 1 : k, [part.id, variant, label, mode, room], sampled, onTouch);
  // a story part's frame is its own document: it gets BELLA's forced states too, so Focus shows the real ring
  useEffect(() => {
    if (!sampled) return undefined;
    const holder = document.getElementById(id);
    return onStoryDrawn(holder, () => {
      const doc = holder?.querySelector('[data-story-sample] iframe')?.contentDocument;
      if (doc?.head) installForcedStates(doc);
    });
  }, [sampled, id, part.id]);
  // one factor so the part reads: its box about 240 wide, never under half or over three times its size
  useEffect(() => {
    if (!m || sampled) return;
    // about 240 wide, never past the room the stage has (its sides keep PAD each for the dimension labels)
    const fit = room ? (room - 2 * PAD - 16) / Math.max(m.w, MIN) : 3;
    const next = Math.min(3, Math.max(0.4, Math.round(Math.min(240 / Math.max(m.w, MIN), fit) * 10) / 10));
    setK((was) => (was === next ? was : next));
  }, [m?.w, m?.h, room]); // eslint-disable-line react-hooks/exhaustive-deps
  // the focus view wears BELLA's own focus rules on the part
  useLayoutEffect(() => {
    const found = sampled ? storyPart(document.getElementById(id)) : null;
    const el = sampled ? controlOf(found) ?? found : document.getElementById(id)?.querySelector('[data-bella-component]');
    if (!el) return;
    for (const a of ['data-force-hover', 'data-force-focus', 'data-force-active']) el.removeAttribute(a);
    const f = mode === 'focus' ? forceAttr('focus') : null;
    if (f) el.setAttribute(f[0], f[1]);
  });
  const fact = (key) => facts?.find((f) => f.id === key);
  const kk = sampled ? 1 : k;
  const W = (m?.w ?? MIN) * kk;
  const H = (m?.h ?? MIN) * kk;
  // a story part is drawn by its frame at the stage's width (no zoom), so the holder takes the room and the frame's height
  const wide = sampled ? Math.max(0, (room ?? 0) - 16) : Math.max(W, MIN * k) + PAD * 2;
  const tall = sampled ? undefined : Math.max(H, MIN * k) + PADY * 2;
  const ratio = m?.fg && m?.bg ? ratioOf(m.fg, m.bg) : null;
  const need = fact('contrast')?.target ?? 7;
  const f = fact('focus');
  return (
    <Flow gap={8} grow="first">
      <Stage label={`${part.name}: ${mode} view`} markers={[]} scale={1}>
        {sampled ? (
          <div ref={holder} style={{ position: 'relative', boxSizing: 'border-box', inlineSize: wide, padding: SPAD }}>
            <div id={id} style={{ position: 'relative' }}>{renderPart()}</div>
            {mode === 'target' && m?.x != null ? <TargetDrawing w={m.w} h={m.h} k={1} x={SPAD + m.x} y={SPAD + m.y} labels={false} /> : null}
          </div>
        ) : (
          <div ref={holder} style={{ position: 'relative', inlineSize: wide, blockSize: tall }}>
            <div id={id} style={at(PAD, PADY, { inlineSize: W, blockSize: H, display: 'grid', placeItems: 'center' })}>
              <div style={{ zoom: k }}>{renderPart()}</div>
            </div>
            {mode === 'target' && m ? <TargetDrawing w={m.w} h={m.h} k={k} /> : null}
          </div>
        )}
      </Stage>
      {sampled && !m ? <Tag variant="outline">Measuring the part in its story</Tag> : null}
      {mode === 'target' && m ? (
        <Flow direction="row" gap={8} wrap align="center">
          <Tag variant="outline">{`${Math.round(m.w)} × ${Math.round(m.h)} px`}</Tag>
          <Tag variant="line" tone={m.w < MIN || m.h < MIN ? 'danger' : 'success'} showDot>{`${m.w < MIN || m.h < MIN ? 'Under' : 'Clears'} ${MIN} × ${MIN}`}</Tag>
          <Tag variant="outline">Dashed: the minimum</Tag>
        </Flow>
      ) : null}
      {mode === 'focus' && m ? (
        <Flow direction="row" gap={8} wrap align="center">
          <Tag variant="outline">{m.ring.w ? `Ring ${m.ring.w} px wide` : 'Ring from BELLA'}</Tag>
          {m.ring.w ? <Tag variant="outline">{`${m.ring.o} px off the edge`}</Tag> : null}
          {f?.value ? <Tag variant="line" tone={f.state === 'ok' ? 'success' : 'danger'} showDot>{`${Number(f.value).toFixed(2)}:1, needs ${f.target}:1`}</Tag> : null}
        </Flow>
      ) : null}
      {mode === 'contrast' && m ? (
        <Flow direction="row" gap={16} wrap align="center">
          {m.fg ? <Swatch color={m.fg} name="Label" hex={m.fg} ratio={ratio ? `${ratio.toFixed(2)}:1` : undefined} /> : null}
          {m.bg ? <Swatch color={m.bg} name="Behind it" hex={m.bg} ratio={ratio ? `${ratio.toFixed(2)}:1` : undefined} /> : null}
          {ratio ? <Tag variant="line" tone={ratio >= need ? 'success' : 'danger'} showDot>{`${ratio.toFixed(2)}:1, needs ${need}:1`}</Tag> : <Tag variant="outline">Not measured: the part has no fill to read</Tag>}
        </Flow>
      ) : null}
      {mode === 'reader' && m ? (
        <ListRowGroup ariaLabel="What a screen reader says">
          <ListRow layout="inline" title="Role" value={m.role ?? fact('role')?.value ?? m.tag} showDivider />
          <ListRow layout="inline" title="Name" value={m.name || 'None'} showDivider />
          <ListRow layout="inline" title="State" value={[m.disabled ? 'dimmed' : 'available', m.busy ? 'busy' : null].filter(Boolean).join(', ')} />
        </ListRowGroup>
      ) : null}
    </Flow>
  );
}
