// Components · the studio (layout B, picked 22 Nov 2026; mock 2026-11-22-components-workbench,
// "studio rebuilt from list rows" and the MediSync-style strip). The component sits big in the middle,
// the list on the left, its details on the right in Figma Dev Mode's order (is it ready, the knobs,
// tokens, code), and its states run in a strip below. Every row is a BELLA ListRow that opens what it
// names; every number is read from CHIP's data (/data/bella.json, /gaps, /drift, /checks, /figma-lint,
// /bella-spec, /bella-history, /contrast-pairs, /stories), and what nothing measures says so.
//
// Holes, left on purpose until BELLA has the part (never drawn here):
// - the stage's tool column (zoom in, fit, zoom out, light/dark, mark up): BELLA has no tool column;
//   the Stage's own Fit and 100% stand in.
// - the progress rings on the Checks tab and on Sending: BELLA has no circle loader / progress ring.
// - the floating Terminal window: BELLA has no floating window (shell work, not this page).
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import TextStack from '@bella/components/TextStack/TextStack';
import Pin from '@bella/components/Pin/Pin';
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
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import Step, { StepDay } from '@bella/components/Step/Step';
import VariantTile from '@bella/components/VariantTile/VariantTile';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import CodeBlock from '@bella/components/CodeBlock/CodeBlock';
import Drawer from '@bella/components/Drawer/Drawer';
import TreeItem from '@bella/components/TreeItem/TreeItem';
import Marker from '@bella/components/Marker/Marker';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Toast from '@bella/components/Toast/Toast';
import Flow from '../templates/Flow.jsx';
import { TabPanels } from '../templates/Screen.jsx';
import useNarrow from '../templates/useNarrow.js';
import Toasts from '../templates/Toasts.jsx';
import useAsk, { AskAnswer } from '../templates/useAsk.jsx';
import { keyPhrases } from '../templates/keyPhrase.js';
import { handOff } from './healthModel.js';
import { planRun } from '../templates/RunPlan.jsx';
import { SPECIMENS, PLAY } from '../specimens.jsx';
import { forceAttr, installForcedStates } from '../forcedStates.js';
import { ContractCard, StoryDrawer } from './DocReader.jsx';
import A11yStage from './A11yViews.jsx';
import QualityPanel, { AccessMini, QualityCentre, useQuality, visiblePins } from './QualityPanel.jsx';
import { day, usePartDetail, useStudio, studioChecks, studioFixes, studioDocs, studioProps } from './componentsModel.js';

const noop = () => {};
export const FILTERS = ['all', 'needs', 'ready'];
const TABS = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'quality', label: 'Quality' },
  { id: 'fix', label: 'Fix' },
  { id: 'checks', label: 'Checks' },
  { id: 'history', label: 'History' },
];
/* The stage's sample label: Figma 690:492657's own ("Send"). */
const SAMPLE_LABEL = { Button: 'Send' };
/* The sample's own props, as the approved mock draws it: Button with its send icon, leading (Button icon + leadingIcon). */
const SAMPLE_PROPS = { Button: { icon: 'SendDiagonal', leadingIcon: true } };
/* Words read in Lexend, numbers in Geist Mono (mono for numbers only): a row's value goes in the matching slot. */
const val = (v) => (v == null || v === '' ? {} : /^[\d.,:×\s·%+-]+(ms|px)?$/.test(String(v)) || typeof v === 'number' ? { value: v } : { valueLabel: v });
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const ratio = (r) => `${Number(r).toFixed(2)}:1`;
/* The keyword marker (CHIP rules, 22 Nov): the few words that say what changed, by the tested rule. */
function Keyed({ text, names }) {
  const t = String(text ?? '');
  const marks = keyPhrases(t, { names });
  if (!marks.length) return t;
  const out = [];
  let from = 0;
  marks.forEach((m, i) => {
    out.push(t.slice(from, m.at), <Marker key={i}>{m.text}</Marker>);
    from = m.at + m.text.length;
  });
  out.push(t.slice(from));
  return <>{out}</>;
}

/* The live part, as the code renders it: the Playground's props when the part
   has them (variant and label follow the controls), else its specimen. */
function LivePart({ part, variant, label, state }) {
  const play = PLAY[part.name];
  if (play) {
    const { C, children, props } = play;
    return (
      <C {...props} {...(SAMPLE_PROPS[part.name] ?? {})} {...(variant ? { variant } : {})} disabled={state === 'disabled' || undefined}>
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
        <LivePart part={part} variant={variant} label={label} state={state.id} />
      </Flow>
    </VariantTile>
  );
}

/* The anatomy pins and their labels, spread around the part on the whole stage (Elleta, 23 Nov: "the leaders are
   crossing and a mess.. we have the full bg to use"). Each pin sits on the part's top or bottom edge by what it
   is (fill, text and edge above; box, ring and shadow below). Its label sits above or below the part, on the
   left of its pin or the right of it, at a row of its own; BELLA's Leader runs level from the label to the pin's
   column, then straight to the pin. For each side of the part the layout tries the pins' orders, spreads,
   run lengths, which side of its pin each label takes and which row each gets, and keeps the arrangement where
   no label leaves the stage, no two labels overlap and no line meets another line or a label. The part then
   takes the size where that works. scripts/stage-leader-check.mjs measures the result on every part with an
   anatomy at 320, 768, 1024 and 1440. */
const BELOW = new Set(['box', 'ring', 'shadow', 'state', 'edge']);
const LEVEL = 48; // one label's row: its height and the space to the next
const LABEL_H = 40;
// Pins only, for a stage too narrow to hold every label uncut: numbered pins on the part's top and bottom edges,
// spread evenly, with the names in a legend under the stage (same numbers and names as at wide widths)
function pinsOnly(anatomy, box, scale, picked) {
  const top = [];
  const bottom = [];
  anatomy.forEach((x, i) => (BELOW.has(x.kind) ? bottom : top).push({ x, i }));
  while (top.length > bottom.length + 2) bottom.unshift(top.pop());
  while (bottom.length > top.length + 2) top.push(bottom.shift());
  const out = [];
  let tight = Infinity; // the least room between two pins on one edge
  for (const [zone, pins] of [['top', top], ['bottom', bottom]]) {
    const m = pins.length;
    const spread = 0.8 * box.w;
    const step = m > 1 ? spread / (m - 1) : Infinity;
    tight = Math.min(tight, step);
    const edge = zone === 'top' ? box.cy - box.h / 2 : box.cy + box.h / 2;
    pins.forEach(({ x, i }, j) => out.push({ id: x.key, x: Math.round((box.cx + (m > 1 ? -spread / 2 + j * step : 0)) / scale), y: Math.round(edge / scale), label: x.n ?? i + 1, selected: x.key === picked }));
  }
  return { markers: out.sort((p, q) => p.label - q.label), tight };
}
const perms = (n) => (n <= 1 ? [[0]] : perms(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)])));
const PERMS = [0, 1, 2, 3, 4].map((n) => (n ? perms(n) : [[]]));
// do two axis-aligned boxes (or a segment, as a thin box) touch, with a little air
const touch = (a, b, air = 2) => a.x0 - air < b.x1 && b.x0 - air < a.x1 && a.y0 - air < b.y1 && b.y0 - air < a.y1;
// topKeys: the pins that sit above the part; missing = by what each is, kept within two of even and four a side
function anatomyMarkers(anatomy, box, scale, picked, widths, topKeys) {
  const top = [];
  const bottom = [];
  anatomy.forEach((x, i) => ((topKeys ? topKeys.has(x.key) : !BELOW.has(x.kind)) ? top : bottom).push({ x, i }));
  if (!topKeys) {
    while (top.length > bottom.length + 2 || top.length > 4) bottom.unshift(top.pop());
    while (bottom.length > top.length + 2 || bottom.length > 4) top.push(bottom.shift());
  }
  const half = box.sw / 2 - 6; // a label keeps 6 clear of the stage's edge
  const out = [];
  let over = 0;
  for (const [zone, pins] of [['top', top], ['bottom', bottom]]) {
    const m = pins.length;
    if (!m) continue;
    const dir = zone === 'top' ? -1 : 1;
    const edge = zone === 'top' ? box.cy - box.h / 2 : box.cy + box.h / 2;
    const wOf = (pin) => widths[pin.x.key] ?? 150;
    const spreads = [Math.max(0.5 * box.w, Math.min(0.8 * box.w, 60)), 0.8 * box.w];
    const orders = [pins, [...pins].sort((p, q) => wOf(p) - wOf(q)), [...pins].sort((p, q) => wOf(q) - wOf(p))];
    let best = null;
    orders.forEach((order, oi) => spreads.forEach((spread, si) => {
      const gapX = m > 1 ? spread / (m - 1) : 0;
      const px = order.map((_, j) => Math.round(box.cx + (m > 1 ? -spread / 2 + j * gapX : 0)));
      for (const g of [14, 8, 4]) {
        for (let mask = 0; mask < 1 << m; mask += 1) {
          // chips: left of the pin when its bit is set
          const chipsX = order.map((pin, j) => (mask >> j) & 1 ? [px[j] - g - wOf(pin), px[j] - g] : [px[j] + g, px[j] + g + wOf(pin)]);
          const cut = chipsX.reduce((t, [x0, x1]) => t + Math.max(0, -half - x0) + Math.max(0, x1 - half), 0);
          for (const lv of PERMS[m]) {
            const y = lv.map((k) => edge + dir * (28 + LEVEL * k));
            const rects = chipsX.map(([x0, x1], j) => ({ x0, x1, y0: y[j] - LABEL_H / 2, y1: y[j] + LABEL_H / 2 }));
            // each leader: level run from its label to the pin's column, then straight to the pin
            const lines = order.map((_, j) => {
              const edgeX = (mask >> j) & 1 ? chipsX[j][1] : chipsX[j][0];
              return [{ x0: Math.min(edgeX, px[j]), x1: Math.max(edgeX, px[j]), y0: y[j], y1: y[j] }, { x0: px[j], x1: px[j], y0: Math.min(y[j], edge), y1: Math.max(y[j], edge) }];
            });
            let bad = 0;
            for (let i = 0; i < m && bad < 3; i += 1)
              for (let j = 0; j < m; j += 1) {
                if (i === j) continue;
                if (j > i && touch(rects[i], rects[j])) bad += 1; // two labels overlap
                if (lines[i].some((seg) => touch(seg, rects[j], 1))) bad += 1; // a line through another label
                if (j > i && lines[i].some((a) => lines[j].some((b) => touch(a, b, 2)))) bad += 1; // two lines meet
              }
            const score = [cut + bad * 1000, oi ? 1 : 0, si, -g, mask];
            if (!best || score.some((v, q) => v < best.score[q] && score.slice(0, q).every((w, r) => w === best.score[r]))) best = { g, order, px, mask, lv, score };
          }
        }
      }
    }));
    over += best.score[0];
    best.order.forEach(({ x, i }, j) => {
      const left = (best.mask >> j) & 1;
      out.push({ id: x.key, x: Math.round(best.px[j] / scale), y: Math.round(edge / scale), label: x.n ?? i + 1, part: x.title, chipX: left ? best.px[j] - best.g : best.px[j] + best.g, chipY: Math.round(edge + dir * (28 + LEVEL * best.lv[j])), selected: x.key === picked });
    });
  }
  return { markers: out.sort((p, q) => p.label - q.label), over };
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
function useBox(stageWrapId, partId, deps, tag) {
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    const wrap = document.getElementById(stageWrapId);
    const content = wrap?.querySelector('[data-bella-component="stage"] > div');
    const measure = () => {
      const live = document.getElementById(partId)?.firstElementChild;
      if (!content || !live) return;
      const c = content.getBoundingClientRect();
      const p = live.getBoundingClientRect();
      const next = { cx: Math.round(p.left + p.width / 2 - (c.left + c.width / 2)), cy: Math.round(p.top + p.height / 2 - (c.top + c.height / 2)), w: Math.round(p.width), h: Math.round(p.height), sw: Math.round(c.width), tag };
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
            <Progress drawIn label={`Contrast ${ratio(c.ratio)}, target ${c.bar}:1`} showLabel={false} showTarget tone={c.ok ? 'success' : 'attention'} fill={Math.min(100, Math.round((c.ratio / 21) * 100))} target={Math.round((c.bar / 21) * 100)} />
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

/* Questions from the part's own data: its first finding or failing check, then its use. */
function questions(part, detail) {
  const failing = part.checks.find((k) => !k.ok);
  const finding = detail.anatomy.find((x) => x.status === 'finding');
  return [
    finding ? `Why is the ${finding.title.toLowerCase()} a finding?` : failing ? `Why does ${failing.title} fail?` : `When do I use ${part.name}?`,
    detail.anatomy.length ? `Which tokens does ${part.name} use?` : `What are ${part.name}'s parts?`,
  ];
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


/* The stage: the live part, big, with its numbered pins and name chips (the approved Anatomy look). It
   measures each anatomy part on the live part in the theme on show and hands the values up, so the
   Tokens rows and the pins say the same thing and follow the variant. */
function StudioStage({ part, detail, variant, label, shown, picked, onPick, onMeasured, onTouch }) {
  const [lit, setLit] = useState(null);
  const stageId = useId();
  const liveId = useId();
  const shownId = useId();
  useForcedState(shownId, shown);
  useEffect(() => installForcedStates(), []);
  const anatomy = detail?.anatomy ?? [];
  const a = anatomy.find((x) => x.key === picked) ?? anatomy[0] ?? null;
  // the part is drawn at the size where every label fits the stage: its own size first, then smaller, then larger
  // (a wide label reaches across the middle to a pin on the far side, so a bigger part can hold it where a
  // small one cannot). The unscaled box is read from the part as drawn, so no size is tried on screen.
  const SCALES = PLAY[part.name] ? [2, 1, 0.5, 0.35, 0.25, 1.5] : [1, 0.5, 0.35, 0.25, 1.5, 2];
  const [scale, setScale] = useState(SCALES[0]);
  const [widths, setWidths] = useState({});
  // the leaders draw in on a stage's first show (all of them), then only the picked part's, each time another part
  // is picked (BELLA Stage leaderDraw: map, then pick); the first pick a part opens with is not a pick
  const [pickedByYou, setPickedByYou] = useState(false);
  const lastPicked = useRef(null);
  useEffect(() => {
    lastPicked.current = null;
    setPickedByYou(false);
  }, [part.id]);
  useEffect(() => {
    if (picked == null) return;
    if (lastPicked.current != null && picked !== lastPicked.current) setPickedByYou(true);
    lastPicked.current = picked;
  }, [picked]);
  const legendChanges = useRef(0);
  const [legend, setLegend] = useState(false); // numbered pins and a legend, when no arrangement of labels fits uncut
  const box = useBox(stageId, liveId, [part.id, variant, label, scale, anatomy.length, a?.key], scale);
  // the best arrangement at one size: the usual split of pins above and below, then other splits only if it does not fit
  const named = anatomy;
  const solveAt = (s, b) => {
    const k = s / b.tag;
    const scaled = { cx: b.cx * k, cy: b.cy * k, w: b.w * k, h: b.h * k, sw: b.sw };
    const keys = anatomy.map((x) => x.key);
    let best = anatomyMarkers(named, scaled, s, a?.key, widths);
    if (!best.over) return best;
    const sized = (set) => keys.length - set.size <= 4 && set.size <= 4 && Math.abs(set.size - (keys.length - set.size)) <= 2;
    for (let m = 0; m < 1 << keys.length; m += 1) {
      const set = new Set(keys.filter((_, i) => (m >> i) & 1));
      if (!sized(set)) continue;
      const r = anatomyMarkers(named, scaled, s, a?.key, widths, set);
      if (r.over < best.over) best = r;
      if (!best.over) break;
    }
    return best;
  };
  const layout = useMemo(() => {
    if (!box?.tag || !anatomy.length) return null;
    let best = null;
    for (const s of SCALES) {
      const r = solveAt(s, box);
      if (!best || r.over < best.over) best = { ...r, s };
      if (!r.over) return best;
    }
    return best;
  }, [box, anatomy, a?.key, widths]); // eslint-disable-line react-hooks/exhaustive-deps
  // a part that does not scale evenly (CodeBlock fills the stage) could swing between two sizes: after a few
  // changes the size stays where it is
  const changes = useRef(0);
  const seen = useRef(new Map()); // size -> how far its labels overflow, measured as drawn
  useEffect(() => {
    changes.current = 0;
    legendChanges.current = 0;
    seen.current = new Map();
    setLegend(false);
    setScale(SCALES[0]);
  }, [part.id, box?.sw]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (legend || !layout || box?.tag !== scale) return; // in legend mode the pins choose the size
    seen.current.set(scale, solveAt(scale, box).over);
    if (layout.s === scale) return;
    if (changes.current < 6) {
      changes.current += 1;
      setScale(layout.s);
    } else {
      // it will not settle: stay at the size that fitted best when drawn
      const [fit] = [...seen.current.entries()].sort((p, q) => p[1] - q[1])[0];
      if (fit !== scale) setScale(fit);
    }
  }, [layout, scale, box, legend]); // eslint-disable-line react-hooks/exhaustive-deps
  // a label still cut by the stage's edge once the part has taken its size: numbered pins and a legend instead
  useEffect(() => {
    if (!layout || box?.tag !== scale || legend) return;
    const st = document.getElementById(stageId)?.querySelector('[data-bella-component="stage"]');
    const r = st?.getBoundingClientRect();
    const cut = r && [...st.querySelectorAll('[data-stage-chip]')].some((c) => {
      const q = c.getBoundingClientRect();
      return q.left < r.left - 0.5 || q.right > r.right + 0.5;
    });
    if ((layout.over && layout.s === scale) || (cut && changes.current >= 6)) setLegend(true);
  });
  // the live part's touch target, unscaled: its own box or its hit area, whichever is larger
  useLayoutEffect(() => {
    const el = document.getElementById(shownId)?.querySelector('button, a, input, [role]');
    const px = (v) => (/px$/.test(v) ? parseFloat(v) : 0);
    const hit = el ? ['::before', '::after'].map((p) => getComputedStyle(el, p)).filter((c) => c.position === 'absolute') : [];
    onTouch(el ? { w: Math.round(Math.max(el.offsetWidth, ...hit.map((c) => px(c.width)))), h: Math.round(Math.max(el.offsetHeight, ...hit.map((c) => px(c.height)))) } : null);
  }, [box, shownId, onTouch]);
  const [measured, setMeasured] = useState({});
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => mo.disconnect();
  }, []);
  /* Each anatomy part's facts, measured on the live part (never the contract's text), after the part's own
     transition so the new variant's paint is read, and once more for a paint that starts late. */
  useLayoutEffect(() => {
    const t = [setTimeout(measure, 250), setTimeout(measure, 700)];
    return () => t.forEach(clearTimeout);
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
        if (x.kind === 'fill') {
          const layers = (cs.backgroundImage.match(/rgba?\([^)]*\)/g) ?? []).map(hex).filter((h) => h && h !== 'none');
          const paint = layers[0] ?? hex(cs.backgroundColor) ?? 'none';
          out[x.key] = { text: x.token && tokenColour(el, x.token) === paint ? `${x.token} · ${paint}` : paint, colour: paint !== 'none' ? paint : null };
        } else if (x.kind === 'box') out[x.key] = { text: `${n(cs.minHeight) !== '0' ? `${n(cs.minHeight)} min` : `${n(el.offsetHeight)} tall`} · padding ${n(cs.paddingTop)} / ${n(cs.paddingRight)} · corner ${n(cs.borderTopLeftRadius)}` };
        else if (x.kind === 'content') out[x.key] = { text: `${cs.fontFamily.split(',')[0].replace(/["']/g, '')} ${n(cs.fontSize)} · weight ${cs.fontWeight}`, colour: hex(cs.color) };
        else if (x.kind === 'ring') {
          const w = cs.getPropertyValue('--focus-ring-width').trim();
          const o = cs.getPropertyValue('--focus-ring-offset').trim();
          const c = tokenColour(el, x.token ?? '--color-border-focus');
          out[x.key] = { text: `${w ? `${n(w)} ring, ${n(o)} offset` : 'ring'} · ${c ?? ''} · keyboard focus only`, colour: c };
        } else if (x.kind === 'shadow') {
          const sh = cs.boxShadow;
          const empty = sh === 'none' || /rgba\([^)]*,\s*0\)/.test(sh) || /^(\S+\s+)?(0px\s*)+$/.test(sh.replace(/rgba?\([^)]*\)/g, '').trim());
          out[x.key] = { text: empty ? 'none' : `${x.token ?? 'shadow'}` };
        } else if (x.token) {
          const c = tokenColour(el, x.token);
          out[x.key] = { text: `${x.token}${c ? ` · ${c}` : ''}`, colour: c };
        }
      }
      setMeasured((m) => (JSON.stringify(m) === JSON.stringify(out) ? m : out));
    }
  }, [box, shownId, anatomy, variant, label, themeTick]);
  useEffect(() => onMeasured(measured), [measured, onMeasured]);
  /* Leaders back (Elleta, 23 Nov: "yes i want the leaders otherwise i dont know what it is"; replaces
     "pins only, decided B"). Each pin has a name chip in a column right of the part and a leader to its
     dot; the picked one has the 2px ink edge and leader, and clicking one picks it. The values are in
     the card beside, so the chip is the name only and fits a narrow stage. */
  // each label's own width, read once drawn, so the layout can tell which side of a pin it fits on
  useLayoutEffect(() => {
    const st = document.getElementById(stageId)?.querySelector('[data-bella-component="stage"]');
    if (!st) return;
    const next = {};
    st.querySelectorAll('[data-stage-chip]').forEach((c) => (next[c.getAttribute('data-stage-chip')] = Math.ceil(c.getBoundingClientRect().width)));
    if (Object.keys(next).length && JSON.stringify(next) !== JSON.stringify(widths)) setWidths(next);
  });
  // legend mode: the biggest size where the part fits the stage, its pins keep 36 apart and the top and bottom pins clear each other
  const pinsAt = useMemo(() => {
    if (!legend || !box?.tag) return null;
    let pick = null;
    for (const s of SCALES) {
      const k = s / box.tag;
      const r = pinsOnly(anatomy, { cx: box.cx * k, cy: box.cy * k, w: box.w * k, h: box.h * k }, s, a?.key);
      if (box.w * k <= box.sw - 48 && r.tight >= 36 && box.h * k >= LABEL_H) {
        pick = { ...r, s };
        break;
      }
    }
    return pick ?? { ...pinsOnly(anatomy, { cx: 0, cy: 0, w: box.w, h: box.h }, box.tag, a?.key), s: box.tag };
  }, [legend, box, anatomy, a?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pinsAt && pinsAt.s !== scale && box?.tag === scale && legendChanges.current < 3) {
      legendChanges.current += 1; // its own budget: the label search may have used all of the other one
      setScale(pinsAt.s);
    }
  }, [pinsAt, scale, box]);
  const markers = useMemo(() => {
    if (legend) return pinsAt && pinsAt.s === scale ? pinsAt.markers : box?.tag ? pinsOnly(anatomy, box, scale, a?.key).markers : [];
    if (!layout) return [];
    if (layout.s === scale || !box?.tag) return layout.markers;
    return solveAt(scale, box).markers; // the size could not move to the layout's: label the part as drawn
  }, [legend, pinsAt, layout, scale, box, anatomy, a?.key, widths]); // eslint-disable-line react-hooks/exhaustive-deps
  const has = PLAY[part.name] || SPECIMENS[part.name];
  return (
    <Flow gap={8} id={stageId} grow="first">
      {/* HOLE (BELLA gap): the tool column beside the stage (zoom in, fit, zoom out, light/dark, mark up)
          waits on a BELLA tool-column part; Stage's own Fit and 100% stand in until then. */}
      <Stage label={`${part.name} on the stage`} leaderVariant="red" leaderDraw={pickedByYou ? 'pick' : 'map'} markers={markers} scale={scale} onSelect={onPick} activeId={lit} onActiveChange={setLit}>
        <Flow id={liveId} align="center" data-stage-part="">
          <Flow id={shownId} align="center">
            {has ? <LivePart part={part} variant={variant} label={label} state={shown} /> : <EmptyState size="lane" mark="🧩" title="No live sample yet" line={`CHIP has no live sample of ${part.name} to draw yet.`} />}
          </Flow>
        </Flow>
      </Stage>
      {/* the legend: one row a part, the same number and name as the pin, a click picks it */}
      {legend ? (
        <ListRowGroup ariaLabel={`${part.name}'s parts on the stage`} data-stage-legend="">
          {anatomy.map((x, i) => (
            <ListRow key={x.key} layout="inline" pin={<Pin number={String(x.n ?? i + 1)} variant="red" pinStyle="solid" />} title={x.title} selected={x.key === a?.key} onClick={() => onPick(x.key)} showDivider={i < anatomy.length - 1} />
          ))}
        </ListRowGroup>
      ) : null}
    </Flow>
  );
}

/* The strip under the stage (her MediSync reference, 22 Nov): a titled row with ← → at its right, large
   white cards all one size, the current one outlined in the selection blue. As many cards as fit; the
   arrows and the arrow keys move the selection, and the stage follows. */
function Strip({ title, label, items, current, onPick, render }) {
  const id = useId();
  const w = useWidth(id);
  // Figma's card is 176 wide, 16 apart
  const k = Math.max(1, Math.min(items.length, Math.floor((w + 16) / 192) || 1));
  const idx = Math.max(0, items.findIndex((x) => x.id === current));
  const [start, setStart] = useState(0);
  const first = Math.min(Math.max(0, items.length - k), idx < start ? idx : idx >= start + k ? idx - k + 1 : start);
  useEffect(() => setStart(first), [first]);
  const go = (d) => {
    const next = items[Math.min(items.length - 1, Math.max(0, idx + d))];
    if (next && next.id !== current) onPick(next.id);
    requestAnimationFrame(() => document.getElementById(id)?.querySelector('[aria-pressed="true"]')?.focus());
  };
  const onKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      go(e.key === 'ArrowRight' ? 1 : -1);
    }
  };
  return (
    <Flow gap={16}>
      <SectionHead
        title={title}
        titleLevel={3}
        action={
          <Flow direction="row" gap={8} align="center">
            <Button variant="tertiary" iconOnly icon="NavArrowLeft" ariaLabel={`Previous ${label}`} disabled={idx === 0} onClick={() => go(-1)} />
            <Button variant="secondary" shape="pill" iconOnly icon="NavArrowRight" ariaLabel={`Next ${label}`} disabled={idx === items.length - 1} onClick={() => go(1)} />
          </Flow>
        }
      />
      <Flow id={id} direction="row" gap={16} equal role="group" aria-label={`${title}: arrow keys move between them`} onKeyDown={onKey}>
        {items.slice(first, first + k).map((x) => (
          <Fragment key={x.id}>{render(x, x.id === current, () => onPick(x.id))}</Fragment>
        ))}
      </Flow>
    </Flow>
  );
}

/* The component list (left): BELLA's TreeItem, the component-list row (16 on a 44 row, a chevron group
   with its count, a "needs work" dot that is spoken, the current row in light blue), one list of every
   component A to Z under a find field and the All, Needs work and Ready chips. TreeItem marks needs work with its end dot, not the mock's bar: that is the part's own design
   (Figma TreeItem "Needs work"). No Pinned group: CHIP keeps no pinned parts (the side menu pins pages,
   not parts). The list sits on the page, not in a Card: inside a Card's 24 padding, TreeItem's icon and
   dot leave about 90 for the name and long names broke mid-word; on the page 14 characters fit. */
function PartList({ model, query, setQuery, filter, current, onPick, onHide, onFilter }) {
  const q = query.trim().toLowerCase();
  const match = (p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  const total = model.parts.length;
  const needsN = model.parts.filter((p) => !p.ready).length;
  // one list of every component, A to Z; the chips narrow it (Elleta, 23 Nov: "how come i cant see all the components")
  const shown = model.parts
    .filter((p) => match(p) && (filter === 'needs' ? !p.ready : filter === 'ready' ? p.ready : true))
    .sort((a, b) => a.name.localeCompare(b.name));
  // the selected component is in view when the list opens or the selection changes
  useEffect(() => {
    document.getElementById('part-list')?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' });
  }, [current, filter]);
  // 14 characters fit the row beside TreeItem's icon and dot; a longer name is cut, its full name on hover
  // (TreeItem takes no accessible name or tooltip of its own: a BELLA gap, so a screen reader hears the cut name)
  const row = (p) => <TreeItem key={p.id} kind="item" label={p.name.length > 14 ? <span title={p.name}>{`${p.name.slice(0, 13)}…`}</span> : p.name} needsWork={!p.ready} current={p.id === current} onClick={() => onPick(p.id)} />;
  return (
    <Flow gap={16}>
      {/* search and the chips stay at the top while the rows scroll under them */}
      <Flow gap={16} sticky style={{ background: 'var(--color-background-default)', paddingBlockEnd: 'var(--spacing-8)' }}>
        <SectionHead title={`${total} components`} titleLevel={2} action={onHide ? <Button variant="tertiary" iconOnly icon="SidebarCollapse" ariaLabel="Hide the component list" ariaExpanded onClick={onHide} /> : undefined} />
        <Input label="Find a component" value={query} onChange={setQuery} />
        <Flow direction="row" gap={8} wrap aria-label="Show">
          <FilterChip size="compact" pressed={filter === 'all'} onClick={() => onFilter('all')}>{`All ${total}`}</FilterChip>
          <FilterChip size="compact" pressed={filter === 'needs'} onClick={() => onFilter(filter === 'needs' ? 'all' : 'needs')}>{`Needs work ${needsN}`}</FilterChip>
        </Flow>
      </Flow>
      {!shown.length ? <EmptyState size="lane" mark="🤷" title="Nothing matches" line="No component has that name. Clear the search or pick All." /> : null}
      <Flow as="nav" aria-label={`${shown.length} components`} gap={4} id="part-list">
        {shown.map(row)}
      </Flow>
    </Flow>
  );
}

/* A detail view in the right panel: Back to the list it came from, then the thing it opened. */
function Back({ label, onBack }) {
  return (
    <Flow direction="row">
      <Button variant="tertiary" size="sm" icon="NavArrowLeft" leadingIcon onClick={onBack}>
        {label}
      </Button>
    </Flow>
  );
}

/* Words before a colon as a short row title, the rest as regular text (no whole sentence is bold). */
const splitHead = (t) => {
  const m = String(t ?? '').match(/^([^:]{2,32}):\s+([\s\S]+)$/);
  return m ? { area: m[1].trim(), rest: cap(m[2].trim()) } : { area: null, rest: String(t ?? '') };
};

/* Inspect, as the approved studio (22 Nov): "Use it for" (each job and the part for it) and "Hand off"
   (Properties, Tokens, Code, Motion, each opening its detail), then the part's own documentation as rows. */
function InspectPanel({ part, detail, docs, props, measured, picked, onPick, variant, label, touch, open, setOpen, onFix, onPart, model, q, onQuality }) {
  const anatomy = detail?.anatomy ?? [];
  const a = anatomy.find((x) => x.key === picked);
  const [allUse, setAllUse] = useState(false);
  // on the smallest phones a row's value goes under its words, so the row keeps inside its card
  const tiny = useNarrow(420);
  const valued = (v) => (tiny ? { layout: 'stacked', description: v } : { layout: 'inline', ...val(v) });
  const back = <Back label="Inspect" onBack={() => setOpen(null)} />;
  const knobs = props.filter((p) => /\|/.test(p.values) || p.name === 'label');
  const code = `import ${part.name} from '@bella/components/${part.name}/${part.name}';${PLAY[part.name] ? `\n\n<${part.name}${variant ? ` variant="${variant}"` : ''}${Object.entries(SAMPLE_PROPS[part.name] ?? {}).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${v}"`)).join('')}>${label || PLAY[part.name].children}</${part.name}>` : ''}`;
  if (open === 'props')
    return (
      <Card>
        <Flow gap={16}>
          {back}
          <SectionHead title="Properties" titleLevel={3} number={props.length} words={`from ${part.name}'s types`} />
          {knobs.length ? (
            <Flow as="ul" gap={0} aria-label="On the stage now">
              {knobs.map((p) => (
                <ListRow key={p.name} layout="inline" title={p.name} {...val(p.name === 'label' ? label || p.value || 'none' : p.value ?? 'not set')} />
              ))}
            </Flow>
          ) : null}
          <SectionHead title="Every property" titleLevel={4} size="card" />
          <Flow as="ul" gap={0} aria-label={`${part.name}'s properties`}>
            {props.filter((p) => !knobs.includes(p)).map((p) => (
              <ListRow key={p.name} layout="stacked" title={p.name} description={p.values} />
            ))}
          </Flow>
        </Flow>
      </Card>
    );
  if (open === 'tokens')
    return (
      <Card>
        <Flow gap={16}>
          {back}
          <SectionHead title="Tokens" titleLevel={3} number={part.doc.tokens.length} words="it reads" />
          {anatomy.length ? (
            <Flow as="ul" gap={0} aria-label={`${part.name}'s parts, measured on the stage`}>
              {anatomy.map((x) => (
                <ListRow key={x.key} layout="stacked" pin={<Pin number={String(x.n)} variant="red" pinStyle="solid" />} title={x.title} description={measured[x.key]?.text ?? x.token ?? 'Not measured'} swatch={measured[x.key]?.colour ?? undefined} selected={x.key === picked} onClick={() => onPick(x.key)} />
              ))}
            </Flow>
          ) : null}
          <SectionHead title="Every token" titleLevel={4} size="card" />
          <Flow as="ul" gap={0} aria-label={`${part.name}'s tokens`}>
            {part.doc.tokens.map((t) => (
              <ListRow key={t} layout="inline" title={t} />
            ))}
          </Flow>
        </Flow>
      </Card>
    );
  if (open === 'code')
    return (
      <Card>
        <Flow gap={16}>
          {back}
          <SectionHead title="Code" titleLevel={3} />
          <CodeBlock code={code} language="jsx" copy />
        </Flow>
      </Card>
    );
  if (open === 'motion')
    return (
      <Card>
        <Flow gap={16}>
          {back}
          <SectionHead title="Motion" titleLevel={3} words="durations its tokens name" />
          <Flow as="ul" gap={0} aria-label="Motion tokens">
            {part.doc.tokens.filter((t) => /^--motion-/.test(t)).map((t) => (
              <ListRow key={t} layout="inline" title={t} />
            ))}
          </Flow>
        </Flow>
      </Card>
    );
  // a don't line that names another part says what to use instead (FilterChip for filters)
  const others = model.parts.filter((p) => p.name !== part.name);
  const instead = docs.dont
    .map((d) => ({ ...d, other: others.find((p) => new RegExp(`\\b${p.name}\\b`).test(`${d.title} ${d.value ?? ''}`)) }))
    .filter((d) => d.other && /^use\b/i.test(d.title));
  const forJob = (t) => cap(String(t).replace(/^(use (it )?)?for\s+/i, '').replace(/^use\s+/i, ''));
  const notes = docs.a11y;
  return (
    <>
      {a?.status === 'finding' ? <PartCard a={{ ...a, detail: measured[a.key]?.text ?? a.token }} touch={touch} value={null} onFix={onFix} /> : null}
      <AccessMini q={q} onOpen={onQuality} />
      <Card>
        <Flow gap={8}>
          <SectionHead title="Use it for" titleLevel={3} action={docs.use.length > 3 ? <Button variant="tertiary" size="sm" ariaExpanded={allUse} onClick={() => setAllUse(!allUse)}>{allUse ? 'Fewer' : `All ${docs.use.length}`}</Button> : undefined} />
          {docs.use.length || instead.length ? (
            <Flow as="ul" gap={0} aria-label="Use it for">
              {(allUse ? docs.use : docs.use.slice(0, 3)).map((u) => (
                <ListRow key={u} title={u} {...(u.length > 32 ? { layout: tiny ? 'stacked' : 'inline' } : valued(part.name, true))} />
              ))}
              {instead.map((d) => (
                <ListRow key={d.title} title={forJob(d.title)} {...valued(d.other.name, true)} trailing onClick={() => onPart(d.other.id)} />
              ))}
            </Flow>
          ) : (
            <TextStack body="Not written in its contract yet." />
          )}
        </Flow>
      </Card>
      <Card>
        <Flow gap={8}>
          <SectionHead title="Hand off" titleLevel={3} />
          <Flow as="ul" gap={0} aria-label="Hand off">
            <ListRow title="Properties" {...valued(props.length || 'Not measured', !props.length)} {...(props.length ? { trailing: true, onClick: () => setOpen('props') } : {})} />
            <ListRow title="Tokens" {...valued(part.doc.tokens.length)} trailing onClick={() => setOpen('tokens')} />
            <ListRow title="Code" {...valued('import', true)} trailing onClick={() => setOpen('code')} />
            <ListRow title="Motion" {...valued(docs.motion.length ? `${docs.motion.join(' · ')} ms` : 'none')} {...(docs.motion.length ? { trailing: true, onClick: () => setOpen('motion') } : {})} />
          </Flow>
        </Flow>
      </Card>
      <ContractCard key={part.name} name={part.name} />
      {docs.dont.length ? (
        <Card>
          <Flow gap={8}>
            <SectionHead title="Don’t" titleLevel={3} />
            <Flow as="ul" gap={8} bullets aria-label="Don’t">
              {docs.dont.map((d) => (
                <li key={d.title}>
                  <TextStack body={d.value ? `${d.title}: ${d.value}` : d.title} />
                </li>
              ))}
            </Flow>
          </Flow>
        </Card>
      ) : null}
      <Card>
        <Flow gap={8}>
          <SectionHead title="Accessibility" titleLevel={3} />
          <Flow as="ul" gap={0} aria-label="Accessibility, measured">
            {touch ? <ListRow layout="inline" title="Touch target" value={`${touch.w} × ${touch.h}`} statusBar={touch.w >= 44 && touch.h >= 44 ? 'success' : 'danger'} /> : null}
            {part.states.length ? <ListRow layout="stacked" title="States" description={part.states.map((s) => s.label).join(' · ')} /> : null}
          </Flow>
          {notes.length ? (
            <Flow as="ul" gap={8} bullets aria-label="Accessibility notes">
              {notes.map((x) => (
                <li key={x.title}>
                  <TextStack body={x.value ? `${x.title}: ${x.value}` : x.title} />
                </li>
              ))}
            </Flow>
          ) : (
            <TextStack body="No accessibility notes in its contract." />
          )}
        </Flow>
      </Card>
      <Card>
        <Flow gap={8}>
          <SectionHead title="Decisions" titleLevel={3} number={docs.decisions.length} words="in BELLA's history" />
          {docs.decisions.length ? (
            <Flow gap={0} as="ol" aria-label={`${part.name}'s decisions, newest first`}>
              {docs.decisions.map((r) => {
                const { area, rest } = splitHead(r.title);
                return (
                  <Fragment key={r.id}>
                    <StepDay>{day(r.date)}</StepDay>
                    <Step title={area ?? 'Decision'} detail={rest} kind="decision" state="done" />
                  </Fragment>
                );
              })}
            </Flow>
          ) : (
            <TextStack body={`No commit in BELLA's history records a decision about ${part.name}.`} />
          )}
        </Flow>
      </Card>
    </>
  );
}

/* Checks: one ListRow per check we run, each opening what it found and why it matters. */
function ChecksPanel({ part, rows, open, setOpen, onStory }) {
  const row = rows.find((r) => `check:${r.id}` === open);
  if (row)
    return (
      <Card>
        <Flow gap={16}>
          <Back label="All checks" onBack={() => setOpen(null)} />
          <SectionHead title={row.title} titleLevel={3} number={row.count ?? undefined} words={row.count ? undefined : row.value} description={row.source ?? undefined} />
          <Flow as="ul" gap={4} aria-label={`${row.title}: what it found`}>
            {row.items.map((x) => (
              <ListRow key={x.title} layout={String(x.value ?? '').length > 24 ? 'stacked' : 'inline'} {...(String(x.value ?? '').length > 24 ? { description: x.value } : val(x.value))} title={x.title} statusBar={x.fails ? 'danger' : undefined} />
            ))}
          </Flow>
          {row.id === 'story' || row.id === 'docs' ? (
            <Flow direction="row" justify="end">
              <Button variant="secondary" onClick={() => onStory(row.id)}>{`Open ${row.title.toLowerCase()}`}</Button>
            </Flow>
          ) : null}
          {row.why ? (
            <Disclosure title="Why this?">
              <TextStack title={row.why.rule} subtitle={row.why.source} />
            </Disclosure>
          ) : null}
        </Flow>
      </Card>
    );
  const measured = rows.filter((r) => r.tone !== 'neutral');
  return (
    <Card>
      <Flow gap={8}>
        {/* HOLE (BELLA gap): the rings per group (Figma, Code, A11y) wait on a BELLA progress ring part. */}
        <SectionHead title="Checks" titleLevel={3} number={measured.filter((r) => r.tone === 'success').length} words={`of ${measured.length} pass · ${rows.length - measured.length} not measured`} />
        <Flow as="ul" gap={4} aria-label={`${part.name}'s checks`}>
          {rows.map((r) => (
            // when it last ran, from the check's own source (/checks, the spec's build, /figma-lint, /gaps); none stored: Not measured
              <ListRow layout="inline" key={r.id} title={r.title} subValue={r.ran ? `${day(r.ran)}, ${new Date(r.ran).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Not measured'} {...val(r.value)} statusBar={r.tone} trailing onClick={() => setOpen(`check:${r.id}`)} />
          ))}
        </Flow>
      </Flow>
    </Card>
  );
}

/* Fix: the suggested fixes, where they go, and ONE primary that opens the plan first (never runs). */
function FixPanel({ part, fixes, chosen, setChosen, target, setTarget, onSend, model, onPart, open, setOpen }) {
  const usedIn = part.doc.usedIn.filter((n) => model.parts.some((p) => p.name === n));
  if (open === 'reach')
    return (
      <Card>
        <Flow gap={16}>
          <Back label="Fix" onBack={() => setOpen(null)} />
          <SectionHead title="Reaches" titleLevel={3} number={usedIn.length} words={`parts made with ${part.name}`} />
          <Flow as="ul" gap={4} aria-label={`Parts made with ${part.name}`}>
            {usedIn.map((n) => (
              <ListRow layout="inline" key={n} title={n} trailing onClick={() => onPart(model.parts.find((p) => p.name === n).id)} />
            ))}
          </Flow>
        </Flow>
      </Card>
    );
  if (!fixes.length) return <EmptyState size="lane" mark="✅" title="Nothing to fix" line={`Every check ${part.name} answers to passes or isn't measured yet.`} />;
  const n = fixes.filter((f) => chosen.includes(f.id)).length;
  return (
    <>
      <Card>
        <Flow gap={8}>
          <SectionHead title="Fixes" titleLevel={3} number={n} words={`of ${fixes.length} picked`} />
          <Flow as="ul" gap={4} aria-label="Fixes">
            {fixes.map((f) => {
              const on = chosen.includes(f.id);
              return (
                <ListRow
                  key={f.id}
                  layout="stacked" selected={on}
                  title={f.area}
                  description={<>{`${f.verb} `}<Marker>{f.key}</Marker>{`: ${f.line}`}</>}
                  switch={<FilterChip pressed={on} ariaLabel={`Include: ${f.verb} ${f.key}`} onClick={() => setChosen(on ? chosen.filter((x) => x !== f.id) : [...chosen, f.id])}>{on ? 'Included' : 'Include'}</FilterChip>}
                />
              );
            })}
          </Flow>
        </Flow>
      </Card>
      <Card footerAction={<Button variant="primary" disabled={!n} onClick={onSend}>{`Send ${n} ${n === 1 ? 'fix' : 'fixes'}`}</Button>}>
        <Flow gap={8}>
          <SectionHead title="Send to" titleLevel={3} />
          <SegmentedControl label="Send to" value={target} onChange={setTarget} options={[{ value: 'code', label: 'Code' }, { value: 'figma', label: 'Figma' }, { value: 'both', label: 'Both' }]} />
          <ListRow layout="inline" title="Reaches" {...val(usedIn.length ? `${usedIn.length} ${usedIn.length === 1 ? 'part' : 'parts'}` : 'only itself')} {...(usedIn.length ? { trailing: true, onClick: () => setOpen('reach') } : {})} />
        </Flow>
      </Card>
    </>
  );
}

/* History: an overview of what changed, each record one click away. A record's area is its short title and
   its sentence reads as regular text with the keyword marker on the key words, never the part's name. */
function HistoryPanel({ part, detail, names, open, setOpen }) {
  const rec = detail?.history.find((r) => `rec:${r.id}` === open);
  if (rec) {
    const { area, rest } = splitHead(rec.title);
    return (
      <Card>
        <Flow gap={16}>
          <Back label="All records" onBack={() => setOpen(null)} />
          <TextStack subtitle={`${day(rec.date)} · ${cap(rec.type ?? 'change')}`} title={area ?? cap(rec.type ?? 'Change')} body={<Keyed text={rest} names={names} />} />
          <Flow as="ul" gap={0} aria-label="The record">
            <ListRow layout="stacked" title="Why" description={rec.whyAll ?? rec.why ?? 'The commit gives no reason.'} />
            {rec.types.length ? <ListRow layout="inline" title="Kind" {...val(rec.types.join(' · '))} /> : null}
            <ListRow layout="inline" title="Commit" value={rec.id} trailing onClick={() => window.open(`https://github.com/emcdanie/bella/commit/${rec.id}`, '_blank', 'noopener')} />
          </Flow>
        </Flow>
      </Card>
    );
  }
  const list = detail?.history ?? [];
  return (
    <Card>
      <Flow gap={8}>
        <SectionHead title="History" titleLevel={3} number={list.length} words={list.length === 1 ? 'record' : 'records'} />
        {list.length ? (
          <Flow as="ul" gap={0} aria-label={`${part.name}'s records, newest first`}>
            {/* the mock's rows: the record's words in regular weight, the key words marked (never the area
                before a colon or a part name), its day, ↗ */}
            {list.map((r) => (
              <ListRow key={r.id} layout="inline" title={<Keyed text={r.title} names={names} />} value={day(r.date)} trailing onClick={() => setOpen(`rec:${r.id}`)} />
            ))}
          </Flow>
        ) : (
          <EmptyState size="lane" mark="📜" title="No records yet" line={`BELLA has no commits that touch ${part.name}.`} />
        )}
      </Flow>
    </Card>
  );
}

/* Add file key (23 Nov: "why do i want to add file keys for figma?? what is a file key"): one drawer, one line
   on what it is for, a field for the Figma link; CHIP takes the file ID out of it and saves it. No detour. */
function FigmaKeyDrawer({ open, onClose, onSaved }) {
  const [link, setLink] = useState('');
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState(null);
  const save = async () => {
    setProblem('');
    try {
      const r = await fetch('/figma-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Could not save it');
      setDone(j);
      onSaved?.();
    } catch (e) {
      setProblem(e.message);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} side="right" size="sm" label="Connect Figma" subtitle="CHIP reads your BELLA library in Figma to compare it with the code. Paste the library's link and CHIP takes the file ID from it." footer={<Button variant="primary" disabled={!link.trim() || Boolean(done)} onClick={save}>Save</Button>}>
      <Flow gap={16}>
        <Input label="Figma link" type="url" value={link} onChange={setLink} placeholder="https://www.figma.com/design/…" error={problem || undefined} hint="Open the BELLA library in Figma, copy the address from the browser bar." />
        {done ? (
          <Notification tone={done.token ? 'success' : 'attention'} message={done.token ? 'Saved. CHIP reads Figma from the next check.' : 'Saved. Figma also needs a read-only token before CHIP can read it: Figma › Settings › Security › Personal access tokens, then add it to server/.env as FIGMA_ACCESS_TOKEN.'} />
        ) : null}
      </Flow>
    </Drawer>
  );
}

export default function ComponentsContent({ model, filter = 'all', onFilter, partId, onPart, onCheckAgain }) {
  const phone = useNarrow();
  const narrowHead = useNarrow(420);
  // the list stands beside the stage where the studio has room (1440); narrower, it is a drawer
  const listOut = useNarrow(1400);
  const [listHidden, setListHidden] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // a view can be shared by its address: #/components/<id>?variant=…&tab=… (her reading, 22 Nov)
  const [shared] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? ''));
  const [tab, setTab] = useState(() => (TABS.some((t) => t.id === shared.get('tab')) ? shared.get('tab') : 'inspect'));
  const [sharedVariant, setSharedVariant] = useState(() => shared.get('variant'));
  const [open, setOpen] = useState(null);
  const [query, setQuery] = useState('');
  const [askText, setAskText] = useState('');
  const [picked, setPicked] = useState(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(null); // 'story' | 'docs': the part's story shown inside CHIP
  const [touch, setTouch] = useState(null);
  const [measured, setMeasured] = useState({});
  const [variant, setVariant] = useState(null);
  const [shown, setShown] = useState('default');
  const [chosen, setChosen] = useState([]);
  const [target, setTarget] = useState('both');
  const asker = useAsk();
  const answer = asker.answer;
  const [asked, setAsked] = useState(null);
  const [said, setSaid] = useState(null);
  useEffect(() => {
    const st = answer?.status;
    if (st && st !== 'thinking' && asked) setSaid(st === 'error' || st === 'stopped' ? { tone: 'danger', text: 'BELLA couldn’t answer that just now.' } : { tone: 'success', text: `BELLA answered: ${asked.q}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer?.status]);
  const parts = model?.parts ?? [];
  const want = String(partId ?? '').toLowerCase();
  const part = parts.find((p) => p.id.toLowerCase() === want || p.name.toLowerCase() === want) ?? parts.find((p) => p.name === 'Button') ?? parts[0] ?? null;
  const detail = usePartDetail(part);
  const studio = useStudio(part);
  const q = useQuality({ part, detail, studio, touch });
  const [qMode, setQMode] = useState('all');
  const [qPick, setQPick] = useState(null);
  useEffect(() => { setQMode('all'); setQPick(null); }, [part?.id]);
  const variants = part && PLAY[part.name] ? part.variants : [];
  const label = part ? SAMPLE_LABEL[part.name] ?? '' : '';
  useEffect(() => {
    // a shared address's variant is used once, when its part has loaded
    if (part) setSharedVariant(null);
    setVariant(sharedVariant && variants.includes(sharedVariant) ? sharedVariant : variants[0] ?? null);
    setShown('default');
    setOpen(null);
    setMeasured({});
    asker.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part?.id]);
  useEffect(() => {
    setPicked(detail?.anatomy.find((x) => x.status === 'finding')?.key ?? detail?.anatomy[0]?.key ?? null);
  }, [part?.id, detail]);
  useEffect(() => {
    if (!part || !/^#\/components\b/.test(window.location.hash)) return;
    const qs = new URLSearchParams();
    if (filter !== 'all') qs.set('filter', filter);
    if (variant) qs.set('variant', variant);
    if (tab !== 'inspect') qs.set('tab', tab);
    const next = `#/components/${encodeURIComponent(part.id)}${qs.toString() ? `?${qs}` : ''}`;
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }, [part?.id, variant, tab, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const checks = part ? checksWithTouch(part, touch) : [];
  // the Story and Docs rows open the part's real story inside CHIP (StoryDrawer), never Storybook in another tab
  const links = {};
  const weakestPair = detail?.anatomy.filter((x) => x.contrast).sort((x, y) => x.contrast.ratio - y.contrast.ratio)[0];
  const rows = part ? studioChecks({ part, checks, drift: studio.drift, lint: studio.lint, gate: studio.gate, gaps: studio.gaps?.gaps, gapsAt: studio.gaps?.at, links, weakest: weakestPair ? `${weakestPair.title} ${ratio(weakestPair.contrast.ratio)}` : null }) : [];
  const fixes = part ? studioFixes({ part, rows, findings: (detail?.anatomy ?? []).filter((x) => x.status === 'finding') }) : [];
  const fixKey = fixes.map((f) => f.id).join('|');
  useEffect(() => setChosen(fixes.map((f) => f.id)), [fixKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const docs = part ? studioDocs(part, detail) : null;
  const props = studioProps(studio.spec, { variant, label });
  const names = useMemo(() => parts.map((p) => p.name), [parts]);
  if (!model) return <EmptyState size="lane" mark="⏳" title="Reading BELLA" line="Fetching every part and its checks." />;
  if (!part) return <EmptyState size="lane" mark="🤷" title="Nothing matches" line="No part fits that filter. Try All." />;

  const ask = (text) => {
    setAsked({ q: text });
    const local = dataAnswer(text, part, studio.gaps, parts.length);
    if (local) return asker.setLocal({ q: text, ...local });
    return asker.ask(`About BELLA's ${part.name}: ${text}`, 'components', undefined, text);
  };
  // one search: a component's name opens it; anything else is a question for BELLA
  const onSearch = (text) => {
    const t = text.trim();
    if (!t) return;
    const q = t.toLowerCase();
    const hits = parts.filter((p) => p.name.toLowerCase().includes(q));
    const exact = parts.find((p) => p.name.toLowerCase() === q);
    const one = exact ?? (hits.length === 1 ? hits[0] : null);
    if (one) {
      pick(one.id);
      setQuery('');
    } else ask(t);
  };
  const pick = (id) => {
    onPart(id);
    setListOpen(false);
  };
  const fixCheck = answer?.fix;
  const fix = fixCheck ? () => handOff({ id: fixCheck.id, title: fixCheck.title, missing: [part.name], action: VERB[fixCheck.id] }).catch((e) => !e.shown && setSaid({ tone: 'danger', text: `Not sent: ${e.message}.` })) : undefined;
  const thread = answer ? (
    <Card>
      <AskAnswer answer={answer} onRetry={answer?.fix ? undefined : (provider) => asker.retry(provider)} onStop={asker.stop} onFollow={(f) => ask(f)} onFix={fix} followUps={answer?.followUps ?? []} composer={<FollowUp part={part} onAsk={(t) => ask(t)} />} />
    </Card>
  ) : null;
  // Send n fixes opens the plan first (templates/RunPlan.jsx): nothing runs until the plan is approved there
  const send = (ids = chosen) => {
    const picked2 = fixes.filter((f) => ids.includes(f.id));
    const where = { code: 'the code', figma: 'Figma', both: 'Figma and the code' }[target];
    const steps = picked2.map((f) => ({ id: f.id, title: `${f.verb} ${f.key}`, line: f.line }));
    const brief = [`Fix BELLA's ${part.name} in ${where}. Steps:`, ...picked2.map((f, i) => `${i + 1}. ${f.verb} ${f.key}: ${f.line}`), 'Change only what each step names. Ask before changing a token.'].join('\n');
    planRun({ title: `Fix ${part.name}`, from: 'Components', brief, steps, subtitle: `Plan ready · to ${where}, from CHIP’s checks`, summary: `${part.name} · ${picked2.length} ${picked2.length === 1 ? 'fix' : 'fixes'}` }).catch((e) => !e.shown && setSaid({ tone: 'danger', text: `Not sent: ${e.message}.` }));
  };
  const parity = rows.find((r) => r.id === 'parity');
  // one status, the same count the Checks tab shows: Figma parity first (the mock's line), else what fails
  // a StatusDot's words keep one line: on the smallest phones "in its spec" moves to the line under it
  const tinyHead = narrowHead;
  const failing = rows.filter((r) => r.tone === 'danger');
  const checkedAt = studio.gaps?.at ? `${day(studio.gaps.at)}, ${new Date(studio.gaps.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : model.checked;
  const toFix = failing.reduce((n, r) => n + (r.count ?? 1), 0) + (detail?.anatomy ?? []).filter((x) => x.status === 'finding').length;
  const status = !detail || !studio.ready
    ? { tone: 'neutral', text: 'Reading its checks' }
    : parity?.tone === 'danger' && toFix === parity.count
      ? { tone: 'attention', text: `${parity.count} ${parity.count === 1 ? 'difference' : 'differences'} from Figma${tinyHead ? '' : ' in its spec'}`, spec: true }
      : toFix
        ? { tone: 'attention', text: `${toFix} to fix` }
        : { tone: 'success', text: rows.some((r) => r.tone === 'neutral') ? 'No findings · some not measured' : 'No findings' };
  const states = PLAY[part.name] ? part.states : [];

  const header = (
    <Flow direction="row" gap={16} wrap justify="between" align="center">
      <Flow gap={4}>
        <Flow direction="row" gap={12} wrap align="center">
          <Heading tier="section" as="h2">{part.name}</Heading>
          <StatusDot tone={status.tone} label={status.text} />
        </Flow>
        {/* how fresh it is: when CHIP last checked, with refresh (her reading, 22 Nov) */}
        <Flow direction="row" gap={8} align="center" wrap>
          <TextStack subtitle={[tinyHead && status.spec ? 'in its spec' : null, model.version, detail?.updated ? `updated ${detail.updated}` : null, checkedAt ? `checked ${checkedAt}` : null].filter(Boolean).join(' · ')} />
          <Button variant="tertiary" size="sm" iconOnly icon="RefreshDouble" ariaLabel="Check again" onClick={onCheckAgain} />
        </Flow>
      </Flow>
      <Flow direction="row" gap={8} wrap align="end" grow={phone ? 'last' : undefined}>
        <Button variant="secondary" onClick={() => setStoryOpen('story')}>Story</Button>
        <Input label="Ask BELLA" value={askText} onChange={setAskText} onSend={(t) => (onSearch(t), setAskText(''))} sendLabel="Ask" suggestion={detail ? questions(part, detail)[0] : undefined} />
      </Flow>
    </Flow>
  );

  const list = <PartList model={model} query={query} setQuery={setQuery} filter={filter} current={part.id} onPick={pick} onFilter={onFilter} onHide={listOut ? undefined : () => setListHidden(true)} />;
  const listInline = !listOut && !listHidden;
  // the stage takes the column's spare height, so the part sits big in the middle (the strip keeps its own)
  const centre = (
    <Flow gap={16} grow="last">
      <Flow direction="row" gap={16} wrap align="center">
        {listInline ? null : <Button variant="secondary" icon="SidebarExpand" leadingIcon ariaExpanded={listOut ? listOpen : false} onClick={() => (listOut ? setListOpen(true) : setListHidden(false))}>Components</Button>}
        {variants.length > 1 ? variants.length > 3 || phone ? <Select label="Variant" value={variant} onChange={setVariant} options={variants.map((v) => ({ value: v, label: cap(v) }))} /> : <SegmentedControl label="Variant" value={variant} onChange={setVariant} options={variants.map((v) => ({ value: v, label: v }))} /> : null}
      </Flow>
      {tab === 'quality' ? (
        <QualityCentre q={q} part={part} mode={qMode} setMode={setQMode}>
          {qMode === 'all' || !q ? (
            <StudioStage part={part} detail={{ anatomy: visiblePins(q, qMode) }} variant={variant} label={label} shown="default" picked={qPick ?? visiblePins(q, qMode)[0]?.key} onPick={setQPick} onMeasured={noop} onTouch={setTouch} />
          ) : (
            <A11yStage part={part} mode={qMode} facts={q.facts} variant={variant} label={label} renderPart={() => <LivePart part={part} variant={variant} label={label} state="default" />} />
          )}
        </QualityCentre>
      ) : (
      <Flow gap={16} grow="first">
      <StudioStage part={part} detail={detail} variant={variant} label={label} shown={shown} picked={picked} onPick={(k) => { setPicked(k); setTab('inspect'); setOpen('tokens'); }} onMeasured={setMeasured} onTouch={setTouch} />
      {states.length ? (
        <Strip
          title={`${part.name} · states`}
          label="state"
          items={states}
          current={shown}
          onPick={setShown}
          render={(s, on, go) => <StateThumb part={part} variant={variant} label={label} state={s} selected={on} onPick={go} />}
        />
      ) : (
        // never other components (her bug, 22 Nov: "its meant to be states not take you to other components"): a part
        // whose states cannot be drawn says so and lists the states its contract names, as text cards
        <Strip
          title={`${part.name} · states`}
          label="state"
          items={(part.stateNames.length ? part.stateNames : ['Default']).map((n) => ({ id: n, label: n }))}
          current={null}
          onPick={noop}
          render={(s) => (
            <VariantTile label={s.label}>
              <TextStack subtitle={part.stateNames.length ? 'States not drawn yet' : 'No states in its contract'} />
            </VariantTile>
          )}
        />
      )}
      </Flow>
      )}
    </Flow>
  );
  const panel =
    tab === 'quality' ? (
      <QualityPanel q={q} part={part} mode={qMode} pick={qPick} />
    ) : tab === 'inspect' ? (
      <InspectPanel part={part} detail={detail} docs={docs} props={props} measured={measured} picked={picked} onPick={setPicked} variant={variant} label={label} touch={touch} open={open} setOpen={setOpen} onFix={() => send([`finding-${picked}`])} onPart={pick} model={model} q={q} onQuality={() => (setTab('quality'), setOpen(null))} />
    ) : tab === 'fix' ? (
      <FixPanel part={part} fixes={fixes} chosen={chosen} setChosen={setChosen} target={target} setTarget={setTarget} onSend={() => send()} model={model} onPart={pick} open={open} setOpen={setOpen} />
    ) : tab === 'checks' ? (
      <ChecksPanel part={part} rows={rows} open={open} setOpen={setOpen} onStory={setStoryOpen} />
    ) : (
      <HistoryPanel part={part} detail={detail} names={names} open={open} setOpen={setOpen} />
    );
  // one notice under the tabs (her 23 Nov): what changed for THIS part, from its own History record, with See History
  // at the right edge. A record that never names the part is about something else, so it is not shown.
  const mine = detail?.history.find((h) => new RegExp(`\\b${part.name}\\b`, 'i').test(`${h.title ?? ''}`));
  const highlights = detail && studio.ready && mine ? (
    <Notification tone="info" message={<>{`Changed ${day(mine.date)}: `}<Keyed text={mine.title} names={names} />{'.'}</>} action={{ label: 'See History', onClick: () => (setTab('history'), setOpen(null)) }} />
  ) : null;
  const right = (
    <Flow gap={16}>
      <Tabs label={`${part.name}: inspect, quality, fix, checks, history`} idBase="studio-view" value={tab} onChange={(t) => (setTab(t), setOpen(null))} tabs={TABS} />
      <TabPanels tabs={{ idBase: 'studio-view', value: tab, items: TABS }}>
        <Flow gap={16} scroll={!phone}>
          {highlights}
          {!detail || !studio.ready ? <EmptyState size="lane" mark="⏳" title={`Reading ${part.name}`} line="Fetching its checks, history and contrast pairs." /> : panel}
        </Flow>
      </TabPanels>
    </Flow>
  );
  return (
    <>
      {header}
      {storyOpen ? <StoryDrawer name={part.name} view={storyOpen} onClose={() => setStoryOpen(null)} /> : null}
      {detail?.figmaBlind ? <Notification tone="attention" message="Figma can’t see it: no file key in CHIP’s settings." action={{ label: 'Add file key', onClick: () => setKeyOpen(true) }} /> : null}
      <FigmaKeyDrawer open={keyOpen} onClose={() => setKeyOpen(false)} onSaved={onCheckAgain} />
      {thread}
      {said ? (
        <Toasts>
          <Toast tone={said.tone} onClose={() => setSaid(null)}>
            {said.text}
          </Toast>
        </Toasts>
      ) : null}
      {phone ? (
        <Flow gap={24}>
          {centre}
          {right}
        </Flow>
      ) : (
        // the studio fills the window under the header; the list, the stage column and the panel scroll on their own
        // fit="rest" measures where the studio starts once: when the header grows (the Figma notice, an
        // answer), the studio is drawn again so it still ends at the window's foot and nothing sits below the fold
        <Flow fit="rest" span={12} id="studio" key={`${Boolean(detail)}-${Boolean(detail?.figmaBlind)}-${studio.ready}-${Boolean(thread)}`}>
          <Flow span={12} direction="row" gap={24}>
            {listInline ? (
              <Flow aside>
                <Flow scroll>{list}</Flow>
              </Flow>
            ) : null}
            {centre}
            {right}
          </Flow>
        </Flow>
      )}
      {listOut ? (
        <Drawer open={listOpen} onClose={() => setListOpen(false)} label="Components" side={phone ? 'bottom' : 'left'}>
          <Flow inset>{list}</Flow>
        </Drawer>
      ) : null}
    </>
  );
}
