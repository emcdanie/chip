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

function OnTheStage({ part, detail, picked, onPick, onAsk, onTouch }) {
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
  const markers = useMemo(() => {
    if (!box || !anatomy.length) return [];
    const pins = anatomy.map((x, i) => pinAt(x.kind, i, box));
    // "part · value" where the stage has room for it; a narrow stage keeps the name and the card shows the value
    const full = anatomy.map((x) => (valueOf(x) ? `${x.title} · ${valueOf(x)}` : x.title));
    const roomy = box.sw >= 560;
    const texts = roomy ? full : anatomy.map((x) => x.title);
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
  const card = a ? <PartCard a={a} touch={touch} value={showsValue ? null : valueOf(a)} onFix={() => onAsk(`Fix ${part.name}'s ${a.title}: ${a.detail}`)} /> : null;
  const stage = (
    <Flow id={stageId}>
      <Stage label={`${part.name} on the stage`} markers={markers} scale={scale} onSelect={onPick} activeId={lit} onActiveChange={setLit}>
        <Flow id={liveId} align="center">
          <Flow id={shownId} align="center">
            <LivePart part={part} variant={variant} label={label} state={shown} />
          </Flow>
        </Flow>
      </Stage>
    </Flow>
  );
  return (
    <Card>
      <Flow gap={16}>
        <TextStack title="On the stage" body={`${scale === 2 ? 'Shown at 2×. ' : ''}${anatomy.length ? 'Pick a numbered pin: its card names the part and says if it passes or is a finding.' : `${part.name}'s contract doesn't list its parts yet, so there are no pins.`}`} />
        {PLAY[part.name] ? (
          <Flow direction="row" gap={16} wrap align="center">
            <Input label="Label" value={label} onChange={setLabel} placeholder={PLAY[part.name].children} />
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
        <Flow id={wrapId} direction={beside && card ? 'row' : 'column'} gap={24} grow={beside && card ? 'first' : undefined} align={beside && card ? 'start' : undefined}>
          {stage}
          {card ? beside ? <Flow aside>{card}</Flow> : card : null}
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
    // See all sits in the card footer at the bottom right, as Figma
    <Card footerAction={!all && detail.history.length > HISTORY_SHOWN ? <Button variant="tertiary" size="sm" href="#/history">See all in History</Button> : undefined}>
      <Flow gap={8}>
        <SectionHead title="History" number={list.length} words="merged" />
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
                  <Step title={r.title} detail={(all ? r.why : clip(r.why, WHY_SHORT)) ?? undefined} kind={STEP_KIND[r.type]} icon={STEP_KIND[r.type] ? undefined : 'Clock'} state="done" />
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
/* The question chips. The one asked says Asking… while BELLA works (ActionChip has no busy
   state yet: a gap named for the library); the answer shows under the row, where it was asked. */
function AskRow({ part, detail, onAsk, asking }) {
  return (
    <Flow direction="row" gap={8} wrap align="center">
      <TextStack title="Ask BELLA" />
      {questions(part, detail).map((t) => (
        <ActionChip key={t} disabled={!!asking} onClick={() => onAsk(t)}>
          {asking === t ? 'Asking…' : t}
        </ActionChip>
      ))}
    </Flow>
  );
}

/* Card · Ask BELLA: its title, what it knows, and the field; the questions sit in the row at the top. */
function AskCard({ part, detail, onAsk, answer }) {
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
        <Input label={`Ask about ${part.name}`} placeholder="Type a question" value={q} onChange={setQ} onSend={send} sendLabel="Ask" />
        <AskAnswer answer={answer} />
      </Flow>
    </Card>
  );
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
  return (
    <Card>
      <Flow gap={8}>
        <SectionHead title="Checks" description={checked ? `Run ${checked} on main` : undefined} number={pass} words={`of ${total} pass`} />
        <Flow gap={4} as="ul" aria-label={`${part.name}'s checks`}>
          {checks.map((k) => {
            const href = linkFor(k);
            const words = k.id === 'contrast' && k.ok && weakest ? `${weakest.title} ${ratio(weakest.contrast.ratio)}` : k.words;
            return <ListRow key={k.id} layout="inline" title={k.title} value={words} trailing={href ? true : undefined} onClick={href ? () => window.open(href, '_blank', 'noopener') : undefined} statusDot={k.ok ? undefined : <StatusDot tone="attention" showLabel={false} label="Fails" />} />;
          })}
          <ListRow
            layout="inline"
            title="Figma set"
            value={detail.figmaBlind ? undefined : 'Reachable'}
            actionButton={detail.figmaBlind ? <Button variant="secondary" size="sm" href="#/connectors">Add file key</Button> : undefined}
          />
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
    if (answer?.done && asked) setSaid(answer.error ? { tone: 'danger', text: 'BELLA couldn’t answer that just now.' } : { tone: 'success', text: `BELLA answered: ${asked.q}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer?.done]);
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
  const ask = (text, from = 'card') => (setAsked({ q: text, from }), asker.ask(`About BELLA's ${part.name}: ${text}`, 'components'));
  const pending = !!answer && !answer.done;
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
                return n ? <Tag tone="attention" showDot>{`${n} ${n === 1 ? 'finding' : 'findings'}`}</Tag> : null;
              })()}
            </Flow>
            {tiny && detail?.updated ? <TextStack subtitle={`Updated ${detail.updated}`} /> : null}
            {part.lede ? <TextStack body={part.lede} /> : null}
          </Flow>
          <Tabs label={`${part.name} views`} idBase="part-view" value={view} onChange={setView} tabs={VIEWS} />
          {/* the view's content is its tab's panel (aria-controls lands; audit 21 Nov) */}
          <TabPanels tabs={{ idBase: 'part-view', value: view, items: VIEWS }}>
          {detail?.figmaBlind ? (
            <Notification tone="attention" title="Figma can’t see it" message="No file key in server/.env." action={{ label: 'Add file key', href: '#/connectors' }} />
          ) : null}
          {detail ? <AskRow part={part} detail={detail} onAsk={(t) => ask(t, 'row')} asking={pending && asked?.from === 'row' ? asked.q : null} /> : null}
          {asked?.from === 'row' ? <AskAnswer answer={answer} /> : null}
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
              <OnTheStage part={part} detail={detail} picked={picked} onPick={setPicked} onAsk={(t) => { ask(t); }} onTouch={setTouch} />
              {view === 'anatomy' ? (
                detail.anatomy.length ? (
                  <Card>
                    <Flow gap={8}>
                      <SectionHead title="Anatomy" number={detail.anatomy.length} words="parts" />
                      <Flow gap={4} as="ul" aria-label={`Parts of ${part.name}`}>
                        {detail.anatomy.map((x) => (
                          <ListRow key={x.key} layout="stacked" title={x.title} description={x.detail} value={x.contrast ? ratio(x.contrast.ratio) : undefined} selected={x.key === picked} onClick={() => setPicked(x.key)} statusDot={<StatusDot tone={x.status === 'finding' ? 'attention' : 'success'} showLabel={false} label={x.status === 'finding' ? 'Finding' : 'Passes'} />} />
                        ))}
                      </Flow>
                    </Flow>
                  </Card>
                ) : null
              ) : (
                <>
                  <Flow span={8} fill>
                    <HistoryCard part={part} detail={detail} />
                  </Flow>
                  <Flow span={4} gap={24} grow="last">
                    <AskCard part={part} detail={detail} onAsk={(t) => ask(t, 'card')} answer={asked?.from === 'card' ? answer : null} />
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
