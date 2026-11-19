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
// out or Light / Dark overlay; pins and chips can't be clicked (the Anatomy tab
// picks); the selected leader's ink look isn't passed through Stage; Step has
// no kind colours; Button has no preview state yet (hover / pressed / focus
// are BELLA's own rules copied onto attributes). No Try it switch: Elleta
// removed it from the stage, 20 Nov 2026 ("Remove it").
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import Step from '@bella/components/Step/Step';
import VariantTile from '@bella/components/VariantTile/VariantTile';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';
import { SPECIMENS, PLAY } from '../specimens.jsx';
import { forceAttr, installForcedStates } from '../forcedStates.js';
import { usePartDetail } from './componentsModel.js';

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
const ICON = { visual: 'Eye', tokens: 'Sparks', API: 'Code', docs: 'Book', fix: 'RefreshDouble' };
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

/* Where each anatomy part's pin sits on the live part, by what the part is,
   in pixels from the stage's centre (Stage markers). */
function pinAt(kind, i, box) {
  const { cx, cy, w, h } = box;
  const at = {
    fill: [cx + w / 2, cy - h / 2],
    content: [cx, cy - h / 4],
    box: [cx, cy + h / 2],
    border: [cx - w / 2, cy],
    ring: [cx - w / 2, cy + h / 2],
    shadow: [cx + w / 2, cy + h / 2],
  }[kind] ?? [cx - w / 2, cy - h / 2];
  return { x: Math.round(at[0]), y: Math.round(at[1] + (kind in { fill: 1, content: 1, box: 1, border: 1, ring: 1, shadow: 1 } ? 0 : i * 8)) };
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
      const next = { cx: Math.round(p.left + p.width / 2 - (c.left + c.width / 2)), cy: Math.round(p.top + p.height / 2 - (c.top + c.height / 2)), w: Math.round(p.width), h: Math.round(p.height), room: Math.round(p.left - c.left) };
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
function PartCard({ a, touch, onFix }) {
  const c = a.contrast;
  return (
    <Card footerAction={a.status === 'finding' ? <Button variant="primary" size="sm" onClick={onFix}>Fix</Button> : undefined}>
      <Flow gap={12}>
        <Flow direction="row" gap={12} justify="between" grow="first" align="start">
          <TextStack title={a.title} body={a.detail} />
          <Tag tone={a.status === 'finding' ? 'attention' : 'success'} showDot>
            {a.status === 'finding' ? 'Finding' : 'Passes'}
          </Tag>
        </Flow>
        {c ? (
          <Flow gap={8}>
            <Stat label="Contrast" value={ratio(c.ratio)} />
            {/* the contrast meter as Figma builds it: Stat plus Progress with its target mark; 21:1 is the most contrast there is */}
            <Progress label={`Contrast ${ratio(c.ratio)}, target ${c.bar}:1`} showLabel={false} showTarget tone={c.ok ? 'success' : 'attention'} fill={Math.min(100, Math.round((c.ratio / 21) * 100))} target={Math.round((c.bar / 21) * 100)} />
          </Flow>
        ) : null}
        <Flow gap={4}>
          {c ? <ListRow as="div" layout="inline" title="Target" value={`${c.bar}:1`} /> : null}
          {/* the touch target against 44 (20 Nov: Accessibility shows it), measured on the live part */}
          {touch ? <ListRow as="div" layout="inline" title="Touch" value={`${touch.w} × ${touch.h} · ${touch.w >= 44 && touch.h >= 44 ? 'passes' : 'under 44'}`} /> : null}
          {a.token ? <ListRow as="div" layout="stacked" title="Token" value={a.token} /> : null}
        </Flow>
      </Flow>
    </Card>
  );
}

function OnTheStage({ part, detail, picked, onPick, onAsk }) {
  const narrow = useNarrow();
  const tiny = useNarrow(420);
  // the part's card stands beside the part inside the stage (as the frame) when the stage is wide enough for
  // the chips, the 2x part and the card; narrower, it goes under the stage so the chips keep their room
  const stageId = useId();
  const stageW = useWidth(stageId);
  const beside = stageW >= 900;
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
  const box = useBox(stageId, liveId, [part.id, variant, label, narrow, beside, anatomy.length, a?.key]);
  // the live part's touch target, unscaled: its own box or its hit area (a small part's 44 area is a pseudo-element), whichever is larger
  const [touch, setTouch] = useState(null);
  useLayoutEffect(() => {
    const el = document.getElementById(shownId)?.querySelector('button, a, input, [role]');
    if (!el) return setTouch(null);
    const px = (v) => (/px$/.test(v) ? parseFloat(v) : 0);
    const hit = ['::before', '::after'].map((p) => getComputedStyle(el, p)).filter((c) => c.position === 'absolute');
    const w = Math.round(Math.max(el.offsetWidth, ...hit.map((c) => px(c.width))));
    const h = Math.round(Math.max(el.offsetHeight, ...hit.map((c) => px(c.height))));
    setTouch((t) => (t && t.w === w && t.h === h ? t : { w, h }));
  }, [box, shownId]);
  const markers = useMemo(() => {
    if (!box || !anatomy.length) return [];
    // chips in a column left of the part, each level with its pin (as the frame), at least 36 apart; on a phone, the pins alone
    const chips = !narrow && box.room > 160;
    const pins = anatomy.map((x, i) => pinAt(x.kind, i, box));
    // where each chip wants to sit: above the part for the top pins, level for the side ones, below for the bottom ones (as the frame)
    const top = box.cy - box.h / 2;
    const bottom = box.cy + box.h / 2;
    const want = anatomy.map((x, i) => ({ fill: top - 40, content: top - 4, border: box.cy, ring: box.cy + box.h / 4 + 12, box: bottom + 24, shadow: bottom + 60 })[x.kind] ?? pins[i].y);
    const order = want.map((y, i) => i).sort((i, j) => want[i] - want[j]);
    const chipY = [];
    order.forEach((i, k) => {
      chipY[i] = Math.round(k === 0 ? want[i] : Math.max(want[i], chipY[order[k - 1]] + 36));
    });
    // centre the column on the part when spreading pushed it down
    const shift = Math.round((Math.max(...chipY) + Math.min(...chipY)) / 2 - box.cy) > 0 ? Math.round(((Math.max(...chipY) + Math.min(...chipY)) / 2 - box.cy)) : 0;
    return anatomy.map((x, i) => ({
      id: x.key,
      ...pins[i],
      // her light red numbered pin, and the chip as Figma: "part · value" (Plate · its hex)
      // numbered top to bottom down the chip column, as Figma (1 Plate, 2 Label, …)
      label: order.indexOf(i) + 1,
      part: valueOf(x) ? `${x.title} · ${valueOf(x)}` : x.title,
      status: x.status,
      ...(chips ? { chipX: box.cx - box.w / 2 - 48, chipY: chipY[i] - shift } : {}),
      // her frame (690:492657, parts-dev 60c3a4c): one dashed pink leader, to the part in focus; its chip has the ink edge
      leader: chips && x.key === a?.key,
      selected: x.key === a?.key,
    }));
  }, [box, anatomy, narrow, a?.key]);
  // small controls stand at 2x, as the frame and BELLA's own Stage Anatomy story show them (a scale wrapper)
  const twoX = !!PLAY[part.name];
  const live = (
    <Flow id={liveId} align="center">
      <Flow id={shownId} align="center" style={twoX ? { scale: '2' } : undefined}>
        <LivePart part={part} variant={variant} label={label} state={shown} />
      </Flow>
    </Flow>
  );
  // the part stands right of centre, so the chip column keeps room for its longest chip (Focus ring and its hex), as Figma 690:490822 places it; stopgap until Stage lays out the chips itself
  const shifted = markers.some((m) => m.chipX != null) ? <Flow style={{ paddingInlineStart: 'calc(var(--spacing-40) * 5)' }}>{live}</Flow> : live;
  const card = a ? <PartCard a={a} touch={twoX ? touch : null} onFix={() => onAsk(`Fix ${part.name}'s ${a.title}: ${a.detail}`)} /> : null;
  return (
    <Card>
      <Flow gap={16}>
        <TextStack title="On the stage" body={`${twoX ? 'Shown at 2×. ' : ''}${anatomy.length ? 'Pick a numbered pin: its card names the part and says if it passes or is a finding.' : `${part.name}'s contract doesn't list its parts yet, so there are no pins.`}`} />
        {PLAY[part.name] ? (
          <Flow direction="row" gap={16} wrap align="center">
            <Input label="Label" value={label} onChange={setLabel} placeholder={PLAY[part.name].children} />
            {variants.length > 1 ? (
              tiny ? (
                <Select label="Variant" value={variant} onChange={setVariant} options={variants.map((v) => ({ value: v, label: cap(v) }))} />
              ) : (
                <SegmentedControl label="Variant" value={variant} onChange={setVariant} options={variants.map((v) => ({ value: v, label: cap(v) }))} />
              )
            ) : null}
          </Flow>
        ) : null}
        <Flow id={stageId}>
          {/* Stopgap until Stage takes a height (asked of parts-dev): the Anatomy story's 400 for a 2x part, else tall enough for the chip column */}
          <Stage label={`${part.name} on the stage`} markers={markers} style={twoX ? { minBlockSize: 'calc(var(--spacing-80) * 5)' } : markers.some((m) => m.chipX != null) ? { minBlockSize: `calc(var(--spacing-40) * ${anatomy.length + 1})` } : undefined}>
            {!beside || !card ? shifted : (
              // the stage centres its content, so the row asks for the stage's full width (stopgap until Stage lays out a part beside a card)
              <Flow direction="row" gap={24} align="center" grow="first" style={{ alignSelf: 'stretch' }}>
                {shifted}
                {/* the frame's finding card is 280 wide (7 x 40); stopgap until Card takes a width */}
                <Flow style={{ inlineSize: 'calc(var(--spacing-40) * 7)' }}>{card}</Flow>
              </Flow>
            )}
          </Stage>
        </Flow>
        {beside ? null : card}
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
              return (
                <li key={r.id}>
                  {head ? <TextStack subtitle={head} /> : null}
                  {/* Figma: the record's title and its Why line; green Merged tags went in the 20 Nov polish (one thing stands out) */}
                  <Step title={r.title} detail={r.why ?? undefined} icon={ICON[r.type] ?? 'Clock'} state="done" />
                </li>
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
function AskRow({ part, detail, onAsk }) {
  return (
    <Flow direction="row" gap={8} wrap align="center">
      <TextStack title="Ask BELLA" />
      {questions(part, detail).map((t) => (
        <ActionChip key={t} onClick={() => onAsk(t)}>
          {t}
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
        <Input label={`Ask about ${part.name}`} placeholder={`Ask about ${part.name}`} value={q} onChange={setQ} onSend={send} sendLabel="Ask" />
        {answer ? <Notification tone={answer.error ? 'danger' : 'info'} showIcon={false} title={answer.pending ? 'Asking…' : 'BELLA'} message={answer.reply} /> : null}
      </Flow>
    </Card>
  );
}

function ChecksCard({ part, detail, checked }) {
  const linkFor = (k) => (k.id === 'story' && part.storyUrl ? part.storyUrl : k.id === 'contrast' ? '#/foundations' : null);
  // Figma's seven rows: the six checks, then Figma set, which counts (5 of 7 while CHIP can't reach Figma)
  const total = part.checks.length + 1;
  const pass = part.pass + (detail.figmaBlind ? 0 : 1);
  return (
    <Card>
      <Flow gap={8}>
        <SectionHead title="Checks" description={checked ? `Run ${checked} on main` : undefined} number={pass} words={`of ${total} pass`} />
        <Flow gap={4} as="ul" aria-label={`${part.name}'s checks`}>
          {part.checks.map((k) => {
            const href = k.ok ? linkFor(k) : null;
            return <ListRow key={k.id} layout="inline" title={k.title} value={k.words} trailing={href ? true : undefined} href={href ?? undefined} statusDot={k.ok ? undefined : <StatusDot tone="attention" showLabel={false} label="Fails" />} />;
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
  // The three-way filter needs about 240px; on the smallest phones it is a Select.
  const tiny = useNarrow(420);
  const [view, setView] = useState('overview');
  const [picked, setPicked] = useState(null);
  const [answer, setAnswer] = useState(null);
  const shown = model ? model.parts.filter((p) => (filter === 'ready' ? p.ready : filter === 'needs' ? !p.ready : true)) : [];
  const part = shown.find((p) => p.id === partId) ?? shown[0] ?? null;
  const detail = usePartDetail(part);
  useEffect(() => {
    // a new part opens on its first finding, else its first anatomy part
    setPicked(detail?.anatomy.find((x) => x.status === 'finding')?.key ?? detail?.anatomy[0]?.key ?? null);
    setAnswer(null);
  }, [part?.id, detail]);
  if (!model) return <EmptyState size="lane" mark="⏳" title="Reading BELLA" line="Fetching every part and its checks." />;
  const n = model.parts.length;
  const options = [
    { value: 'all', label: `All ${n}` },
    { value: 'needs', label: `Needs work ${n - model.ready}` },
    { value: 'ready', label: `Ready ${model.ready}` },
  ];
  const ask = (text) => {
    setAnswer({ pending: true, reply: text });
    fetch('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `About BELLA's ${part.name}: ${text}`, page: 'components', auto: true }) })
      .then((r) => r.json())
      .then((d) => setAnswer({ reply: d.reply ?? d.error ?? 'No answer.', error: !d.reply }))
      .catch((e) => setAnswer({ reply: e.message, error: true }));
  };
  // on the smallest phones the date goes on its own line (StatusDot's label doesn't wrap)
  const live = `Live in ${model.version ?? 'BELLA'}${detail?.updated && !tiny ? ` · updated ${detail.updated}` : ''}`;
  return (
    <>
      {/* Control bar: what you look at on the left, the filter on the right. */}
      <Flow direction="row" gap={16} wrap justify="between" align="center">
        {shown.length ? <Select label="Part" value={part.id} onChange={onPart} options={shown.map((p) => ({ value: p.id, label: `${p.category} › ${p.name}` }))} /> : null}
        {tiny ? <Select label="Show" value={filter} onChange={onFilter} options={options} /> : <SegmentedControl options={options} value={filter} onChange={onFilter} label="Filter parts" />}
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
              {detail?.findings ? <Tag tone="attention" showDot>{`${detail.findings} ${detail.findings === 1 ? 'finding' : 'findings'}`}</Tag> : null}
            </Flow>
            {tiny && detail?.updated ? <TextStack subtitle={`Updated ${detail.updated}`} /> : null}
            {part.lede ? <TextStack body={part.lede} /> : null}
          </Flow>
          <Tabs label={`${part.name} views`} idBase="part-view" value={view} onChange={setView} tabs={VIEWS} />
          {detail?.figmaBlind ? (
            <Notification tone="attention" title="Figma can’t see it" message="No file key in server/.env." action={{ label: 'Add file key', href: '#/connectors' }} />
          ) : null}
          {detail ? <AskRow part={part} detail={detail} onAsk={ask} /> : null}
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
              <OnTheStage part={part} detail={detail} picked={picked} onPick={setPicked} onAsk={(t) => { ask(t); }} />
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
                    <AskCard part={part} detail={detail} onAsk={ask} answer={answer} />
                    <ChecksCard part={part} detail={detail} checked={model.checked} />
                  </Flow>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
