// Components · content: Elleta's design ("this is meant to be the design but it
// never got finished", 19 Nov), now CHIP flows Screen 1 · Components 612:57719
// (content state "on the stage" 690:490822), on CHIP's own data. One part per
// view: picker and filter, the part's header, Overview / Anatomy / History tabs.
// Overview: the Figma notice, the Ask BELLA questions, the stage (variant and
// label, the live part at 2x with a pin per anatomy part, name chips, one dashed
// pink leader to the part in focus, its card with the measured contrast, the
// part in each state as VariantTiles that pick what the stage shows), then
// History | Ask BELLA and a compact Checks card. BELLA parts and Flow only.
//
// Part gaps (asked of parts-dev, never styled around): no zoom in / fit / zoom
// out or Light / Dark overlay; the selected leader's ink look isn't passed through Stage;
// pins and chips pick their part (Stage onSelect, parts-dev ebac13a), and hover lights them; Step has
// no kind colours; Button has no preview state yet (hover / pressed / focus
// are BELLA's own rules copied onto attributes). No Try it switch: Elleta
// removed it from the stage, 20 Nov 2026 ("Remove it").
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import Pin from '@bella/components/Pin/Pin';
import TextStack from '@bella/components/TextStack/TextStack';
import Select from '@bella/components/Select/Select';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Heading from '@bella/components/Heading/Heading';
import Tabs from '@bella/components/Tabs/Tabs';
import Tag from '@bella/components/Tag/Tag';
import Notification from '@bella/components/Notification/Notification';
import Button from '@bella/components/Button/Button';
import Input from '@bella/components/Input/Input';
import Stage from '@bella/components/Stage/Stage';
import Stat from '@bella/components/Stat/Stat';
import Progress from '@bella/components/Progress/Progress';
import ListRow from '@bella/components/ListRow/ListRow';
import Step, { StepDay } from '@bella/components/Step/Step';
import VariantTile from '@bella/components/VariantTile/VariantTile';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Flow from '../templates/Flow.jsx';
import { TabPanels } from '../templates/Screen.jsx';
import useNarrow from '../templates/useNarrow.js';
import useCached from '../templates/useCached.js';
import Toasts from '../templates/Toasts.jsx';
import Toast from '@bella/components/Toast/Toast';
import useAsk, { AskAnswer } from '../templates/useAsk.jsx';
import { handOff } from './healthModel.js';
import { SPECIMENS, PLAY } from '../specimens.jsx';
import { forceAttr, installForcedStates } from '../forcedStates.js';
import { clip, usePartDetail } from './componentsModel.js';

export const FILTERS = ['all', 'needs', 'ready'];
const VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'anatomy', label: 'Anatomy' },
  { id: 'history', label: 'History' },
];
const HISTORY_SHOWN = 4;
/* The stage's sample label: Figma 690:492657's own ("Send"), short enough for five state tiles in one row. */
const SAMPLE_LABEL = { Button: 'Send' };
/* BELLA's change types (bella-history) to History's icons */
/* A part's record as BELLA Step's kind marker (b2729ec), as History; an API change is code. */
const STEP_KIND = { visual: 'visual', tokens: 'tokens', API: 'code', docs: 'docs', fix: 'fix', tooling: 'tooling', decision: 'decision' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ratio = (r) => `${Number(r).toFixed(2)}:1`;
/* An anatomy part's value as Figma's chip says it: a hex, "none" for an empty shadow or edge, else a short size. */
function valueOf(x) {
  const v = String(x.value ?? '').trim().replace(/\s+/g, ' ');
  if (!v) return null;
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^(0px )*0px #[0-9a-f]{6}00$|^none$|^0(px)?$/i.test(v)) return 'none';
  return v.length <= 12 ? v : null;
}

/* The live part, as the code renders it: the Playground's props when the part
   has them (variant and label follow the controls), else its specimen. */
function LivePart({ part, variant, label, state, small }) {
  const play = PLAY[part.name];
  if (play) {
    const { C, children, props } = play;
    return (
      <C {...props} {...(variant ? { variant } : {})} {...(small && C === Button ? { size: 'sm' } : {})} disabled={state === 'disabled' || undefined}>
        {label || children}
      </C>
    );
  }
  const Specimen = SPECIMENS[part.name];
  return Specimen ? <Specimen /> : null;
}

/* One state, worn by the live part: BELLA's own :hover / :focus-visible /
   :active rules copied onto attributes (forcedStates.js), so no value is
   written here. */
/* BELLA's own :hover / :focus-visible / :active rules worn by the live part
   (forcedStates.js copies them onto attributes), so no value is written here. */
function useForcedState(id, state) {
  useLayoutEffect(() => {
    const el = document.getElementById(id)?.querySelector('[data-bella-component]');
    if (!el) return;
    for (const a of ['data-force-hover', 'data-force-focus', 'data-force-active']) el.removeAttribute(a);
    const f = forceAttr(state === 'active' || state === 'pressed' ? 'active' : state === 'hover' || state === 'focus' ? state : null);
    if (f) el.setAttribute(f[0], f[1]);
  });
}

/* One state in a VariantTile (BELLA fc64c23, Figma VariantTile): the live part
   wearing it; a click shows that state on the stage. */
function StateThumb({ part, variant, label, state, selected, onPick }) {
  const id = useId();
  useForcedState(id, state.id);
  return (
    <VariantTile label={state.label} selected={selected} onClick={onPick}>
      <Flow id={id} align="center" inert="" aria-hidden="true">
        <LivePart part={part} variant={variant} label={label} state={state.id} small />
      </Flow>
    </VariantTile>
  );
}

/* Where each anatomy part's leader lands on the live part, in stage pixels
   from the centre: always on the part's drawn edge, on its straight runs
   (the middle of an edge or the middle third of the top and bottom), never a
   corner a pill rounds off and never over its text (stage-pin-check). Two
   parts of one kind step along the edge. */
function pinAt(kind, i, box) {
  const { cx, cy, w, h } = box;
  const top = cy - h / 2;
  const bottom = cy + h / 2;
  const at = {
    fill: [cx + w / 4, top],
    content: [cx - w / 4, top],
    box: [cx, bottom],
    border: [cx - w / 2, cy],
    ring: [cx - w / 4, bottom],
    shadow: [cx + w / 4, bottom],
  }[kind] ?? [cx + w / 2, cy];
  const step = kind in { fill: 1, content: 1, box: 1, border: 1, ring: 1, shadow: 1 } ? 0 : i * 8;
  return { x: Math.round(at[0]), y: Math.round(at[1] + step) };
}

/* A chip's width before it renders: Geist Mono 16 (9.6 a character) plus the pin and padding. */
// a path may break after its slashes, never mid-word in a narrow card: a <wbr>, which a screen reader skips
const slashBreaks = (t) => (typeof t === 'string' && t.includes('/') ? t.split('/').flatMap((w, i) => (i ? ['/', <wbr key={i} />, w] : [w])) : t);
// the stage width (stage pixels) from which the chips and leaders fit without crossing
const CHIPS_FROM = 300;
const chipWidth = (text) => Math.round(String(text).length * 9.6 + 56);

/* Where the chips go (stage pixels from the centre), as her frame: a column left
   of the part, each chip level with its pin and 48 apart, numbered top to
   bottom. Where the stage is too narrow for that column, the chips stand in
   rows above the part (for pins on its top half) and below it (the rest), each
   wholly to one side of its pin so its leader runs one bend to the edge. */
function chipLayout(pins, texts, box) {
  const half = box.sw / 2 - 8;
  const widths = texts.map(chipWidth);
  const columnX = box.cx - box.w / 2 - 48;
  if (columnX - Math.max(...widths) >= -half) {
    const top = box.cy - box.h / 2;
    const want = pins.map((p) => (p.y < box.cy ? Math.min(p.y, top - 8) : p.y));
    const order = want.map((y, i) => i).sort((i, j) => want[i] - want[j]);
    const ys = [];
    order.forEach((i, k) => (ys[i] = k === 0 ? want[i] : Math.max(want[i], ys[order[k - 1]] + 48)));
    const shift = Math.max(0, Math.round((Math.max(...ys) + Math.min(...ys)) / 2 - box.cy));
    return { order, chips: pins.map((p, i) => ({ chipX: Math.round(columnX), chipY: Math.round(ys[i] - shift) })) };
  }
  // a group's chips all run one way, so no leader crosses a nearer chip: running left, the
  // leftmost pin's chip sits nearest the part; running right, the rightmost's
  const rows = (ids, dir) => {
    const leftOk = ids.every((i) => pins[i].x - 16 - widths[i] >= -half);
    const rightOk = ids.every((i) => pins[i].x + 16 + widths[i] <= half);
    const runLeft = leftOk || !rightOk;
    const edge = dir < 0 ? box.cy - box.h / 2 : box.cy + box.h / 2;
    return ids
      .sort((i, j) => (runLeft ? pins[i].x - pins[j].x : pins[j].x - pins[i].x))
      .map((i, k) => {
        // a chip with no room on the group's side turns to the other side of its pin, so it is never cut off;
        // with room on neither side it keeps its first word (the part card names it in full; audit 21 Nov:
        // "Focus ring" ran 90 past the stage at 320)
        let w = widths[i];
        const short = String(texts[i]).split(/\s/)[0];
        const fits = (width) => [pins[i].x - 16 - width >= -half, pins[i].x + 16 + width <= half];
        let [fitsLeft, fitsRight] = fits(w);
        const shorten = !fitsLeft && !fitsRight && short !== texts[i];
        if (shorten) [fitsLeft, fitsRight] = fits((w = chipWidth(short)));
        const left = runLeft ? fitsLeft || !fitsRight : !fitsRight && fitsLeft;
        return [i, { chipX: Math.round(left ? pins[i].x - 16 : pins[i].x + 16), chipY: Math.round(edge + dir * (40 + k * 48)), ...(shorten ? { part: short } : {}) }];
      });
  };
  const ids = pins.map((p, i) => i);
  const up = rows(ids.filter((i) => pins[i].y < box.cy), -1);
  const down = rows(ids.filter((i) => pins[i].y >= box.cy), 1);
  const placed = Object.fromEntries([...up, ...down]);
  const order = [...up.map(([i]) => i).reverse(), ...down.map(([i]) => i)];
  return { order, chips: pins.map((p, i) => placed[i]) };
}

/* An element's width, kept current. */
function useWidth(id) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = document.getElementById(id);
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [id]);
  return w;
}

/* The live part's box against the stage's centre, measured after layout and
   again when the stage resizes. */
function useBox(stageWrapId, partId, deps) {
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    const wrap = document.getElementById(stageWrapId);
    const content = wrap?.querySelector('[data-bella-component="stage"] > div');
    const measure = () => {
      const live = document.getElementById(partId)?.firstElementChild;
      if (!content || !live) return;
      const c = content.getBoundingClientRect();
      const p = live.getBoundingClientRect();
      const next = { cx: Math.round(p.left + p.width / 2 - (c.left + c.width / 2)), cy: Math.round(p.top + p.height / 2 - (c.top + c.height / 2)), w: Math.round(p.width), h: Math.round(p.height), sw: Math.round(c.width) };
      setBox((was) => (was && Object.keys(next).every((k) => was[k] === next[k]) ? was : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (content) ro.observe(content);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return box;
}

/* The picked anatomy part: name, pass or finding, its sentence, BELLA's measured
   contrast for its token against the bar, the token, and Fix for a finding. */
function PartCard({ a, touch, value, onFix }) {
  const c = a.contrast;
  // one fact a line: its name and its value on one left edge, 8 apart (Figma's card rows, not list rows)
  const fact = (name, v) => (
    <Flow direction="row" gap={12} justify="between" wrap>
      <TextStack title={name} />
      <TextStack subtitle={v} />
    </Flow>
  );
  return (
    <Card footerAction={a.status === 'finding' ? <Button variant="primary" size="sm" onClick={onFix}>Fix</Button> : undefined}>
      <Flow gap={12}>
        {/* the verdict under the name, so the sentence keeps the card's full width */}
        <Flow gap={8}>
          <TextStack title={a.title} />
          <Flow direction="row">
            <Tag tone={a.status === 'finding' ? 'attention' : 'success'} showDot>
              {a.status === 'finding' ? 'Finding' : 'Passes'}
            </Tag>
          </Flow>
          <TextStack body={a.detail} />
        </Flow>
        {c ? (
          <Flow gap={8}>
            <Stat label="Contrast" value={ratio(c.ratio)} />
            {/* the contrast meter as Figma builds it: Stat plus Progress with its target mark; 21:1 is the most contrast there is */}
            <Progress label={`Contrast ${ratio(c.ratio)}, target ${c.bar}:1`} showLabel={false} showTarget tone={c.ok ? 'success' : 'attention'} fill={Math.min(100, Math.round((c.ratio / 21) * 100))} target={Math.round((c.bar / 21) * 100)} />
          </Flow>
        ) : null}
        <Flow gap={8}>
          {c ? fact('Target', `${c.bar}:1`) : null}
          {/* the touch target against 44 (20 Nov: Accessibility shows it), measured on the live part, for every part */}
          {touch ? fact('Touch', `${touch.w} × ${touch.h} · ${touch.w >= 44 && touch.h >= 44 ? 'passes' : 'under 44'}`) : null}
          {value ? fact('Value', value) : null}
          {a.token ? (
            <Flow gap={4}>
              <TextStack title="Token" />
              <TextStack subtitle={a.token} />
            </Flow>
          ) : null}
        </Flow>
      </Flow>
    </Card>
  );
}

function OnTheStage({ part, detail, picked, onPick, onAsk, onTouch, list = false }) {
  const tiny = useNarrow(420);
  // a pin or chip under the pointer or keyboard lights its match (Stage, parts-dev ebac13a)
  const [lit, setLit] = useState(null);
  // the part's card stands beside the stage from the stage card's 560 up (her working width 1100 included);
  // narrower, it goes under the stage and the chips stay, above and below the part
  const wrapId = useId();
  const wrapW = useWidth(wrapId);
  const beside = wrapW >= 560;
  const stageId = useId();
  const liveId = useId();
  const shownId = useId();
  // the state the stage shows, picked from the tiles under it
  const [shown, setShown] = useState('default');
  useForcedState(shownId, shown);
  const variants = PLAY[part.name] ? part.variants : [];
  const [variant, setVariant] = useState(variants[0] ?? null);
  const [label, setLabel] = useState(SAMPLE_LABEL[part.name] ?? '');
  useEffect(() => {
    setVariant(variants[0] ?? null);
    setLabel(SAMPLE_LABEL[part.name] ?? '');
    setShown('default');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part.id]);
  useEffect(() => installForcedStates(), []);
  const anatomy = detail?.anatomy ?? [];
  const a = anatomy.find((x) => x.key === picked) ?? anatomy[0] ?? null;
  // small controls stand at 2x (Stage's own scale), as her frame; a part too wide for that stays at 1x
  const [wide, setWide] = useState(false);
  const scale = PLAY[part.name] && !wide ? 2 : 1;
  const box = useBox(stageId, liveId, [part.id, variant, label, beside, scale, anatomy.length, a?.key, wrapW]);
  useLayoutEffect(() => {
    if (box && scale === 2 && box.w > box.sw - 64) setWide(true);
  }, [box, scale]);
  useEffect(() => setWide(false), [part.id]);
  // the live part's touch target, unscaled: its own box or its hit area (a small part's 44 area is a pseudo-element), whichever is larger
  const [touch, setTouch] = useState(null);
  useLayoutEffect(() => {
    const el = document.getElementById(shownId)?.querySelector('button, a, input, [role]');
    const px = (v) => (/px$/.test(v) ? parseFloat(v) : 0);
    const next = el
      ? (() => {
          const hit = ['::before', '::after'].map((p) => getComputedStyle(el, p)).filter((c) => c.position === 'absolute');
          return { w: Math.round(Math.max(el.offsetWidth, ...hit.map((c) => px(c.width)))), h: Math.round(Math.max(el.offsetHeight, ...hit.map((c) => px(c.height)))) };
        })()
      : null;
    setTouch((t) => (t?.w === next?.w && t?.h === next?.h ? t : next));
  }, [box, shownId]);
  useEffect(() => onTouch?.(touch), [touch, onTouch]);
  /* Each anatomy part's facts, measured on the live part on the stage in the theme that's showing
     (final audit, 21 Nov: the contract's written lines said "DM Sans 16, radius 12" while Chip draws
     Lexend and corner 8). Read from the element and BELLA's tokens; never the contract's text. */
  const [measured, setMeasured] = useState({});
  // the theme can change on the page (Chip light / dark): measure again when it does
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => mo.disconnect();
  }, []);
  useLayoutEffect(() => {
    // after the part's own transition (Button eases its background over motion/duration/150), so the
    // new variant's paint is read, not the frame between
    const t = setTimeout(measure, 250);
    return () => clearTimeout(t);
    function measure() {
    const root = document.getElementById(shownId)?.firstElementChild;
    if (!root || !anatomy.length) return;
    const n = (v) => String(Math.round(parseFloat(v) || 0));
    const hex = (c) => {
      const m = String(c).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, al = '1'] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return al === 0 ? 'none' : `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    };
    const tokenColour = (el, name) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      el.appendChild(probe);
      const v = hex(getComputedStyle(probe).color);
      probe.remove();
      return v;
    };
    const out = {};
    for (const x of anatomy) {
      const el = !x.target || x.target === ':scope' ? root : root.querySelector(x.target) ?? root;
      const cs = getComputedStyle(el);
      // a plate can be painted as a gradient image (Button), so the fill is its token, resolved on the part
      if (x.kind === 'fill') {
        // the paint itself: a gradient's colour (Button paints its plate that way) or the background colour;
        // the contract's token is named only when it is what's painted (Secondary paints another)
        const layers = (cs.backgroundImage.match(/rgba?\([^)]*\)/g) ?? []).map(hex).filter((h) => h && h !== 'none');
        const paint = layers[0] ?? hex(cs.backgroundColor) ?? 'none';
        out[x.key] = x.token && tokenColour(el, x.token) === paint ? `${x.token} · ${paint}` : paint;
      }
      else if (x.kind === 'box') out[x.key] = `${n(cs.minHeight) !== '0' ? `${n(cs.minHeight)} min` : `${n(el.offsetHeight)} tall`} · padding ${n(cs.paddingTop)} / ${n(cs.paddingRight)} · corner ${n(cs.borderTopLeftRadius)}`;
      else if (x.kind === 'content') out[x.key] = `${cs.fontFamily.split(',')[0].replace(/["']/g, '')} ${n(cs.fontSize)} · weight ${cs.fontWeight}`;
      else if (x.kind === 'ring') {
        const w = cs.getPropertyValue('--focus-ring-width').trim();
        const o = cs.getPropertyValue('--focus-ring-offset').trim();
        out[x.key] = `${w ? `${n(w)} ring, ${n(o)} offset` : 'ring'} · ${tokenColour(el, x.token ?? '--color-border-focus') ?? ''} · keyboard focus only`;
      } else if (x.kind === 'shadow') {
        // a shadow of transparent colour, or no length, draws nothing: say none
        const sh = cs.boxShadow;
        const empty = sh === 'none' || /rgba\([^)]*,\s*0\)/.test(sh) || /^(\S+\s+)?(0px\s*)+$/.test(sh.replace(/rgba?\([^)]*\)/g, '').trim());
        out[x.key] = empty ? 'none' : `${x.token ?? 'shadow'}`;
      }
      else if (x.token) out[x.key] = `${x.token}${tokenColour(el, x.token) ? ` · ${tokenColour(el, x.token)}` : ''}`;
    }
    setMeasured((m) => (JSON.stringify(m) === JSON.stringify(out) ? m : out));
    }
  }, [box, shownId, anatomy, variant, label, themeTick]);
  const said = (x) => measured[x.key] ?? x.token ?? '';
  const markers = useMemo(() => {
    if (!box || !anatomy.length) return [];
    const pins = anatomy.map((x, i) => pinAt(x.kind, i, box));
    // "part · value" where the stage has room for it; a narrow stage keeps the name and the card shows the value
    const full = anatomy.map((x) => (valueOf(x) ? `${x.title} · ${valueOf(x)}` : x.title));
    const roomy = box.sw >= 560;
    const texts = roomy ? full : anatomy.map((x) => x.title);
    // a phone's stage has no room for every chip without a leader crossing one (audit 21 Nov r2):
    // the pins stay on the part, numbered in reading order, and the line under the stage names them
    if (box.sw < CHIPS_FROM) {
      const order = pins.map((p, i) => i).sort((i, j) => pins[i].y - pins[j].y || pins[i].x - pins[j].x);
      // in number order, so Tab goes 1, 2, 3…; the part's name (no chip position, so no chip is drawn)
      // names the pin for a screen reader: "Open Label" (audit 21 Nov r3)
      return anatomy
        .map((x, i) => ({ id: x.key, x: Math.round(pins[i].x / scale), y: Math.round(pins[i].y / scale), label: order.indexOf(i) + 1, part: x.title, selected: x.key === a?.key }))
        .sort((p, q) => p.label - q.label);
    }
    const { order, chips } = chipLayout(pins, texts, box);
    return anatomy.map((x, i) => ({
      id: x.key,
      // Stage multiplies the point by its scale; the chips are in stage pixels
      x: Math.round(pins[i].x / scale),
      y: Math.round(pins[i].y / scale),
      // her light red numbered pin, numbered in reading order down the chips
      label: order.indexOf(i) + 1,
      part: texts[i],
      ...chips[i],
      selected: x.key === a?.key,
    }));
  }, [box, anatomy, a?.key, scale]);
  const showsValue = (box?.sw ?? 0) >= 560;
  const legend = markers.length && markers[0].chipX == null ? [...markers].sort((p, q) => p.label - q.label).map((m) => `${m.label} ${m.part}`.replace(/ /g, '\u00a0')).join(' · ') : null; // an entry never breaks inside
  const card = a ? <PartCard a={{ ...a, detail: said(a) }} touch={touch} value={showsValue ? null : valueOf(a)} onFix={() => onAsk(`Fix ${part.name}'s ${a.title}: ${a.detail}`)} /> : null;
  /* Anatomy: the parts as a numbered list beside the specimen, in the same card (18 Nov: "the anotations
     descriptions can be inteh same card"); each row's number is its pin's, and hovering or focusing a row
     lights its pin, as the pin lights its chip. */
  const numberOf = (key) => markers.find((m) => m.id === key)?.label;
  const parts = list && anatomy.length ? (
    <Flow as="ul" gap={4} aria-label={`Parts of ${part.name}`}>
      {[...anatomy].sort((x, y) => (numberOf(x.key) ?? 99) - (numberOf(y.key) ?? 99)).map((x) => (
        <li key={x.key} onPointerEnter={() => setLit(x.key)} onPointerLeave={() => setLit(null)} onFocus={() => setLit(x.key)} onBlur={() => setLit(null)}>
          <ListRow
            as="div"
            layout="stacked"
            pin={numberOf(x.key) != null ? <Pin number={String(numberOf(x.key))} variant="red" pinStyle="solid" /> : undefined}
            title={x.title}
            description={x.status === 'finding' ? `Finding · ${said(x)}` : said(x)}
            selected={x.key === a?.key}
            onClick={() => onPick(x.key)}
          />
        </li>
      ))}
    </Flow>
  ) : null;
  const aside = parts ? (
    <Flow gap={16}>
      {parts}
      {card}
    </Flow>
  ) : card;
  const stage = (
    <Flow id={stageId}>
      <Stage label={`${part.name} on the stage`} markers={markers} scale={scale} onSelect={onPick} activeId={lit} onActiveChange={setLit}>
        <Flow id={liveId} align="center">
          <Flow id={shownId} align="center">
            <LivePart part={part} variant={variant} label={label} state={shown} />
          </Flow>
        </Flow>
      </Stage>
      {/* the numbered list names the pins in Anatomy, so the line under the stage would say it twice */}
      {legend && !list ? <TextStack subtitle={legend} /> : null}
    </Flow>
  );
  return (
    <Card>
      <Flow gap={16}>
        <TextStack title="On the stage" body={`${scale === 2 ? 'Shown at 2×. ' : ''}${anatomy.length ? 'Pick a numbered pin: its card names the part and says if it passes or is a finding.' : `${part.name}'s contract doesn't list its parts yet, so there are no pins.`}`} />
        {PLAY[part.name] ? (
          // Input's inline label, as Figma draws it (Elleta, 21 Nov at 768: "this is not aligned properly,
          // please check docs"); the switch sits on the field's line. SegmentedControl and Select have no
          // inline label yet (BELLA gap), so theirs stays on top and the row lines up at the fields' foot.
          <Flow direction="row" gap={16} wrap align="end">
            <Input label="Label" labelPosition="inline" value={label} onChange={setLabel} placeholder={PLAY[part.name].children} />
            {variants.length > 1 ? (
              // a segmented switch for up to three variants; more (StatusPill's six) never fit a row, so a Select
              tiny || variants.length > 3 ? (
                <Select label="Variant" value={variant} onChange={setVariant} options={variants.map((v) => ({ value: v, label: cap(v) }))} />
              ) : (
                <SegmentedControl label="Variant" value={variant} onChange={setVariant} options={variants.map((v) => ({ value: v, label: cap(v) }))} />
              )
            ) : null}
          </Flow>
        ) : null}
        {/* the stage, and the part's card beside it (her pick C) wherever the row has room */}
        <Flow id={wrapId} direction={beside && aside ? 'row' : 'column'} gap={24} grow={beside && aside ? 'first' : undefined} align={beside && aside ? 'start' : undefined}>
          {stage}
          {aside ? beside ? <Flow aside>{aside}</Flow> : aside : null}
        </Flow>
        {part.states.length && PLAY[part.name] ? (
          // the tiles are the flex items (no list wrapper) so they share the row, as the frame's five tiles do
          <Flow direction="row" gap={8} wrap={tiny} fill={tiny} equal={!tiny} role="group" aria-label={`Show ${part.name} on the stage in a state`}>
            {part.states.map((s) => (
              <StateThumb key={s.id} part={part} variant={variant} label={label} state={s} selected={s.id === shown} onPick={() => setShown(s.id)} />
            ))}
          </Flow>
        ) : null}
      </Flow>
    </Card>
  );
}

/* The overview's History card sits beside Ask and Checks, 336 wide at her
   ~1100 window: its Why lines are cut shorter so each stays about two lines
   (audit 10: up to 5); the History tab, full width, keeps the whole line. */
const WHY_SHORT = 44;

function HistoryCard({ part, detail, all }) {
  const list = all ? detail.history : detail.history.slice(0, HISTORY_SHOWN);
  let last = null;
  return (
    // See all sits at the head's top right, where a card's actions are (Elleta, 21 Nov, Health's Needs you:
    // "move the see allto the top rigght as that is where are the actions are bullk"); it replaces the count meta
    <Card>
      <Flow gap={8}>
        <SectionHead
          title="History"
          {...(!all && detail.history.length > HISTORY_SHOWN
            ? { action: <Button variant="tertiary" size="sm" icon="NavArrowRight" href="#/history">{`See all ${detail.history.length}`}</Button> }
            : { number: list.length, words: 'merged' })}
        />
        {list.length ? (
          <Flow gap={4} as="ol" aria-label={`${part.name}'s records, newest first`}>
            {list.map((r) => {
              const d = new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
              const head = d !== last ? d : null;
              last = d;
              // Step is its own <li>; a day break is BELLA's StepDay (audit 21 Nov: li inside li)
              return (
                <Fragment key={r.id}>
                  {head ? <StepDay>{head}</StepDay> : null}
                  {/* Figma: the record's title and its Why line; green Merged tags went in the 20 Nov polish (one thing stands out) */}
                  <Step title={r.title} detail={slashBreaks((all ? r.why : clip(r.why, WHY_SHORT)) ?? undefined)} kind={STEP_KIND[r.type]} icon={STEP_KIND[r.type] ? undefined : 'Clock'} state="done" />
                </Fragment>
              );
            })}
          </Flow>
        ) : (
          <EmptyState size="lane" mark="📜" title="No records yet" line={`BELLA has no commits that touch ${part.name}.`} />
        )}
      </Flow>
    </Card>
  );
}

/* Questions from the part's own data: its first finding or failing check, then its use. */
function questions(part, detail) {
  const failing = part.checks.find((k) => !k.ok);
  const finding = detail.anatomy.find((x) => x.status === 'finding');
  return [
    finding ? `Why is the ${finding.title.toLowerCase()} a finding?` : failing ? `Why does ${failing.title} fail?` : `When do I use ${part.name}?`,
    detail.anatomy.length ? `Which tokens does ${part.name} use?` : `What are ${part.name}'s parts?`,
  ];
}

/* The frame's "Ask BELLA · questions" row (786:879378): under the notice, full width, wraps. */
/* The question chips. The one asked is busy while BELLA works (ActionChip busy, parts-dev 82f702b);
   the others wait. The answer shows under the row, where it was asked. */
function AskRow({ part, detail, onAsk, asking }) {
  return (
    <Flow direction="row" gap={8} wrap align="center">
      <TextStack title="Ask BELLA" />
      {questions(part, detail).map((t) => (
        <ActionChip key={t} busy={asking === t} disabled={!!asking && asking !== t} onClick={() => onAsk(t)}>
          {t}
        </ActionChip>
      ))}
    </Flow>
  );
}

/* Card · Ask BELLA: its title, what it knows, and the field; the questions sit in the row at the top. */
function AskCard({ part, detail, onAsk, thread }) {
  const [q, setQ] = useState('');
  const send = () => {
    if (!q.trim()) return;
    onAsk(q.trim());
    setQ('');
  };
  const knows = detail.findings ? `the contract and the ${detail.findings} ${detail.findings === 1 ? 'finding' : 'findings'}` : 'the contract and its checks';
  return (
    <Card>
      <Flow gap={12}>
        <TextStack title="Ask BELLA" body={`Ask about ${part.name}: ${knows}.`} />
        {/* asked here: the thread, its composer at the foot (her mock); else the field */}
        {thread ?? <Input label={`Ask about ${part.name}`} placeholder="Type a question" value={q} onChange={setQ} onSend={send} sendLabel="Ask" />}
      </Flow>
    </Card>
  );
}

/* The composer under a thread: one field for the next question. */
function FollowUp({ part, onAsk }) {
  const [q, setQ] = useState('');
  const send = () => q.trim() && (onAsk(q.trim()), setQ(''));
  return <Input label="Ask a follow-up" placeholder={`Ask about ${part.name}`} value={q} onChange={setQ} onSend={send} sendLabel="Ask" />;
}

/* What a check's fix does, in her verbs, and what the check counts. */
const VERB = { story: 'Add a story', docs: 'Add a doc page', contract: 'Match the contract to the code', dsds: 'Add a spec entry', contrast: 'Declare a contrast pair', a11y: 'Add an a11y note' };
const NOUN = { story: 'a story', docs: 'a doc page', contract: 'a matching contract', dsds: 'a spec entry', contrast: 'a contrast pair', a11y: 'a11y notes' };
const sentence = (t) => String(t ?? '').split(/(?<=[.!?])\s/)[0];
const shortDay = (t) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null);

/* A question CHIP can answer from its own check data (the model isn't asked): why a check fails
   for this part, or which parts lack what a check counts (Elleta, 21 Nov: "its supposed to help me"). */
function dataAnswer(q, part, gapsData, n) {
  const gaps = gapsData?.gaps;
  if (!gaps) return null;
  const why = q.match(/^Why does (.+) fail\?$/);
  const which = q.match(/^Which parts lack (.+)\?$/);
  if (why) {
    const check = part.checks.find((k) => k.title === why[1]);
    const g = check && gaps[check.id]?.[part.name];
    if (!g) return null;
    const lacking = Object.keys(gaps[check.id]).length;
    const ran = gapsData.at;
    const stale = ran && Date.now() - new Date(ran).getTime() > 7 * 864e5;
    return {
      verdict: `**${VERB[check.id]}** to ${part.name}. [1]`,
      bullets: [
        `**What's missing:** ${sentence(g.missing)} [1]`,
        `**How many:** ${lacking} of ${n} components lack ${NOUN[check.id]} [2]`,
        g.suggest?.text ? `**Start from:** ${sentence(g.suggest.text)} [3]` : `**The rule:** ${sentence(g.why?.rule)} [3]`,
      ],
      // each source opens in place (her mock's Citation open): what it says first, with its mark,
      // the exact line folded, and where to open it; all from /gaps, nothing written for it
      sources: [
        {
          n: 1,
          title: g.where?.[0] ? `${g.where[0].file} · ${g.where[0].field}` : `${part.name}'s files`,
          when: ran,
          findings: [{ ok: false, text: `**${part.name}** lacks ${NOUN[check.id]}` }],
          exact: g.missing,
        },
        {
          n: 2,
          title: `The ${check.title} check`,
          when: ran,
          stale,
          findings: [
            ...[part.name, ...Object.keys(gaps[check.id]).filter((x) => x !== part.name).slice(0, 1)].map((x) => ({ ok: false, text: `**${x}** lacks ${NOUN[check.id]}` })),
            ...(lacking > 2 ? [{ ok: false, text: `**${lacking - 2} others** lack it too` }] : []),
            { ok: true, text: `**${n - lacking} others** have ${NOUN[check.id]}` },
          ],
          exact: g.why?.rule,
          open: { label: 'Open in Health', href: '#/health' },
        },
        {
          n: 3,
          title: g.suggest?.model ? `${g.suggest.model.name}'s note, the model to follow` : g.why?.source ?? 'BELLA’s rules',
          findings: g.suggest?.model ? [{ ok: true, text: `**${g.suggest.model.name}** has ${NOUN[check.id]}` }] : undefined,
          exact: g.suggest?.text ?? g.why?.rule,
          open: g.suggest?.model ? { label: `Open ${g.suggest.model.name} in Components`, href: `#/components/${encodeURIComponent(g.suggest.model.name)}` } : undefined,
        },
      ],
      path: [
        { title: `Read the ${check.title} check`, detail: ran ? `run ${shortDay(ran)}` : undefined },
        { title: `Found ${part.name} in its list`, detail: `${lacking} ${lacking === 1 ? 'part' : 'parts'} in all` },
        { title: 'Read the rule', detail: g.why?.source },
        { title: 'Asked the model', detail: 'not needed: every line is CHIP’s own data', skipped: true },
      ],
      fix: { id: check.id, title: check.title },
      followUps: [`Which parts lack ${NOUN[check.id]}?`, `What goes in ${NOUN[check.id]}?`],
    };
  }
  if (which) {
    const id = Object.keys(NOUN).find((k) => NOUN[k] === which[1]);
    const names = id ? Object.keys(gaps[id] ?? {}) : null;
    if (!names) return null;
    return {
      verdict: names.length ? `**${names.length} of ${n} parts** lack ${which[1]}. [1]` : `Every part has ${which[1]}. [1]`,
      bullets: names.length ? [`**The parts:** ${names.slice(0, 8).join(', ')}${names.length > 8 ? ` and ${names.length - 8} more` : ''} [1]`] : [],
      sources: [
        {
          n: 1,
          title: `The ${part.checks.find((k) => k.id === id)?.title ?? id} check`,
          when: gapsData.at,
          findings: [...names.slice(0, 2).map((x) => ({ ok: false, text: `**${x}** lacks ${which[1]}` })), { ok: true, text: `**${n - names.length} others** have ${which[1]}` }],
          open: { label: 'Open in Health', href: '#/health' },
        },
      ],
      path: [{ title: 'Read the check’s list', detail: gapsData.at ? `run ${shortDay(gapsData.at)}` : undefined }, { title: 'Asked the model', detail: 'not needed: CHIP’s own data', skipped: true }],
    };
  }
  return null;
}

/* The checks with the touch target in: A11y fails when the live part's target is under 44 (her rule). Figma reads "Keys, labels, 44 targets"; "44 targets" fits the Checks column at 1100 (a list row's value never wraps). */
function checksWithTouch(part, touch) {
  const small = touch && (touch.w < 44 || touch.h < 44);
  return part.checks.map((k) => {
    if (k.id !== 'a11y') return k;
    if (small) return { ...k, ok: false, words: `${touch.w} × ${touch.h} target` };
    return k.ok ? { ...k, words: touch ? '44 targets' : k.words } : k;
  });
}

function ChecksCard({ part, detail, checked, touch }) {
  // Story and Docs open the part's Storybook docs page in a new tab, never in place. Contract,
  // spec and A11y opened the old app; Figma draws no new-app view for them yet, so they read
  // their result in place until one is drawn (user test 21 Nov, item 1)
  // Story opens the part's first story (BELLA's Storybook index, /stories); Docs its docs page
  const { data: sb } = useCached(['/stories']);
  const firstStory = part.storyUrl ? sb?.[0]?.first?.[part.storyUrl.match(/\/docs\/(.+)--docs/)?.[1]] : null;
  const linkFor = (k) => (k.id === 'story' && firstStory ? part.storyUrl.replace(/\/docs\/.+$/, `/story/${firstStory}`) : k.id === 'docs' && part.storyUrl ? part.storyUrl : null);
  const weakest = detail.anatomy.filter((x) => x.contrast).sort((x, y) => x.contrast.ratio - y.contrast.ratio)[0];
  const checks = checksWithTouch(part, touch);
  // Figma's seven rows: the six checks, then Figma set, which counts (5 of 7 while CHIP can't reach Figma)
  const total = checks.length + 1;
  const pass = checks.filter((k) => k.ok).length + (detail.figmaBlind ? 0 : 1);
  // an inline row's value never wraps, so on the smallest phones the value goes under the title
  // (final audit 21 Nov: "Matches the code" ran 3 past the card at 320)
  const stacked = useNarrow(400);
  const row = (value) => (stacked ? { layout: 'stacked', description: value } : { layout: 'inline', value });
  return (
    <Card>
      <Flow gap={8}>
        <SectionHead title="Checks" description={checked ? `Run ${checked} on main` : undefined} number={pass} words={`of ${total} pass`} />
        <Flow gap={4} as="ul" aria-label={`${part.name}'s checks`}>
          {checks.map((k) => {
            const href = linkFor(k);
            const words = k.id === 'contrast' && k.ok && weakest ? `${weakest.title} ${ratio(weakest.contrast.ratio)}` : k.words;
            return <ListRow key={k.id} {...row(words)} title={k.title} trailing={href ? true : undefined} onClick={href ? () => window.open(href, '_blank', 'noopener') : undefined} statusDot={k.ok ? undefined : <StatusDot tone="attention" showLabel={false} label="Fails" />} />;
          })}
          {/* blind, the notice above the tabs is the one way to add the key (audit 4, item 3) */}
          <ListRow {...row(detail.figmaBlind ? 'No file key' : 'Reachable')} title="Figma set" />
        </Flow>
      </Flow>
    </Card>
  );
}

export default function ComponentsContent({ model, filter = 'all', onFilter, partId, onPart, onCheckAgain }) {
  const narrow = useNarrow();
  // On the smallest phones the date drops to its own line.
  const tiny = useNarrow(420);
  // The three-way filter beside Part needs about 715 of bar; below a 1140
  // window (her ~1100 working width) it is a Select, so it stays on the right.
  const tight = useNarrow(1140);
  const [view, setView] = useState('overview');
  const [picked, setPicked] = useState(null);
  // the live part's touch target, measured on the stage; it feeds the A11y check and the findings count
  const [touch, setTouch] = useState(null);
  const asker = useAsk();
  const answer = asker.answer;
  // where the question was asked (a chip in the row, or the card's field): the answer shows there, in view
  const [asked, setAsked] = useState(null);
  const [said, setSaid] = useState(null);
  useEffect(() => {
    const st = answer?.status;
    if (st && st !== 'thinking' && asked) setSaid(st === 'error' || st === 'stopped' ? { tone: 'danger', text: 'BELLA couldn’t answer that just now.' } : { tone: 'success', text: `BELLA answered: ${asked.q}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer?.status]);
  // the gaps CHIP measured, by check and part: a check question is answered from them, not guessed
  const { data: gapsData } = useCached(['/gaps']);
  const shown = model ? model.parts.filter((p) => (filter === 'ready' ? p.ready : filter === 'needs' ? !p.ready : true)) : [];
  // a pasted link matches in any case (#/components/Button); with none, open on Button, as Figma does
  const want = String(partId ?? '').toLowerCase();
  const part = shown.find((p) => p.id.toLowerCase() === want || p.name.toLowerCase() === want) ?? shown.find((p) => p.name === 'Button') ?? shown[0] ?? null;
  const detail = usePartDetail(part);
  useEffect(() => {
    // a new part opens on its first finding, else its first anatomy part
    setPicked(detail?.anatomy.find((x) => x.status === 'finding')?.key ?? detail?.anatomy[0]?.key ?? null);
    asker.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part?.id, detail]);
  if (!model) return <EmptyState size="lane" mark="⏳" title="Reading BELLA" line="Fetching every part and its checks." />;
  const n = model.parts.length;
  const options = [
    { value: 'all', label: `All ${n}` },
    { value: 'needs', label: `Needs work ${n - model.ready}` },
    { value: 'ready', label: `Ready ${model.ready}` },
  ];
  const ask = (text, from = asked?.from ?? 'card') => {
    setAsked({ q: text, from });
    const local = dataAnswer(text, part, gapsData?.[0], n);
    if (local) return asker.setLocal({ q: text, ...local });
    return asker.ask(`About BELLA's ${part.name}: ${text}`, 'components', undefined, text);
  };
  const pending = answer?.status === 'thinking';
  const fixCheck = answer?.fix;
  const fix = fixCheck
    ? () =>
        handOff({ id: fixCheck.id, title: fixCheck.title, missing: [part.name], action: VERB[fixCheck.id] })
          .then(() => setSaid({ tone: 'success', text: `Sent to the agent: ${VERB[fixCheck.id]} to ${part.name}. Its card is on Work.` }))
          .catch((e) => setSaid({ tone: 'danger', text: `Not sent: ${e.message}.` }))
    : undefined;
  const thread = (
    <AskAnswer
      answer={answer}
      onRetry={answer?.fix ? undefined : (provider) => asker.retry(provider)}
      onStop={asker.stop}
      onFollow={(f) => ask(f)}
      onFix={fix}
      followUps={answer?.followUps ?? []}
      composer={<FollowUp part={part} onAsk={(t) => ask(t)} />}
    />
  );
  // on the smallest phones the date goes on its own line (StatusDot's label doesn't wrap)
  const live = `Live in ${model.version ?? 'BELLA'}${detail?.updated && !tiny ? ` · updated ${detail.updated}` : ''}`;
  return (
    <>
      {/* Control bar: what you look at on the left, the filter on the right. */}
      <Flow direction="row" gap={16} wrap justify="between" align="center">
        {shown.length ? <Select label="Part" value={part.id} onChange={onPart} options={shown.map((p) => ({ value: p.id, label: `${p.category} › ${p.name}` }))} /> : null}
        {tight ? <Select label="Show" value={filter} onChange={onFilter} options={options} /> : <SegmentedControl options={options} value={filter} onChange={onFilter} label="Filter parts" />}
      </Flow>
      {!part ? (
        <EmptyState size="lane" mark="🤷" title="Nothing matches" line="No part fits that filter. Try All." />
      ) : (
        <>
          {/* Part header: name, live status, its findings (the checks count lives in the Checks card, Figma 20 Nov polish), the contract's first sentence */}
          <Flow gap={8}>
            <Flow direction="row" gap={12} wrap align="center">
              <Heading tier="section" as="h2">{part.name}</Heading>
              <StatusDot tone="success" label={live} />
              {(() => {
                const n = (detail?.findings ?? 0) + (part.checks.find((k) => k.id === 'a11y')?.ok && touch && (touch.w < 44 || touch.h < 44) ? 1 : 0);
                return n ? <Tag tone="attention" showDot count={n}>{n === 1 ? 'finding' : 'findings'}</Tag> : null;
              })()}
            </Flow>
            {tiny && detail?.updated ? <TextStack subtitle={`Updated ${detail.updated}`} /> : null}
            {part.lede ? <TextStack body={part.lede} /> : null}
          </Flow>
          <Tabs label={`${part.name} views`} idBase="part-view" value={view} onChange={setView} tabs={VIEWS} />
          {/* the view's content is its tab's panel (aria-controls lands; audit 21 Nov) */}
          <TabPanels tabs={{ idBase: 'part-view', value: view, items: VIEWS }}>
          {detail?.figmaBlind ? (
            <Notification tone="attention" message="Figma can’t see it: no file key in CHIP’s settings." action={{ label: 'Add file key', href: '#/connectors' }} />
          ) : null}
          {detail ? <AskRow part={part} detail={detail} onAsk={(t) => ask(t, 'row')} asking={pending && asked?.from === 'row' ? asked.q : null} /> : null}
          {asked?.from === 'row' && answer ? thread : null}
          {said ? (
            <Toasts>
              <Toast tone={said.tone} onClose={() => setSaid(null)}>
                {said.text}
              </Toast>
            </Toasts>
          ) : null}
          {!detail ? (
            <EmptyState size="lane" mark="⏳" title={`Reading ${part.name}`} line="Fetching its history and contrast pairs." />
          ) : view === 'history' ? (
            <HistoryCard part={part} detail={detail} all />
          ) : (
            <>
              <Flow direction="row" gap={16} wrap justify="between" align="center">
                <TextStack body={`${part.name} as BELLA ships it · Chip theme`} />
                <Flow direction="row" gap={8} align="center">
                  {model.checked ? <TextStack subtitle={`Checked ${model.checked}`} /> : null}
                  <Button variant="tertiary" size="sm" icon="RefreshDouble" iconOnly ariaLabel="Check again" onClick={onCheckAgain} />
                </Flow>
              </Flow>
              <OnTheStage part={part} detail={detail} picked={picked} onPick={setPicked} onAsk={(t) => { ask(t); }} onTouch={setTouch} list={view === 'anatomy'} />
              {view === 'anatomy' ? null : (
                <>
                  {/* a list card hugs its rows (rule 15): it sits at the top, never stretched and centred (Card 0bc08b6) */}
                  <Flow span={8}>
                    <HistoryCard part={part} detail={detail} />
                  </Flow>
                  <Flow span={4} gap={24} grow="last">
                    <AskCard part={part} detail={detail} onAsk={(t) => ask(t, 'card')} thread={asked?.from === 'card' && answer ? thread : null} />
                    <ChecksCard part={part} detail={detail} checked={model.checked} touch={touch} />
                  </Flow>
                </>
              )}
            </>
          )}
          </TabPanels>
        </>
      )}
    </>
  );
}
