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
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useState } from 'react';
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
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import CodeBlock from '@bella/components/CodeBlock/CodeBlock';
import Drawer from '@bella/components/Drawer/Drawer';
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
import { day, usePartDetail, useStudio, studioChecks, studioFixes, studioDocs, studioProps } from './componentsModel.js';

export const FILTERS = ['all', 'needs', 'ready'];
const TABS = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'fix', label: 'Fix' },
  { id: 'checks', label: 'Checks' },
  { id: 'history', label: 'History' },
];
/* The stage's sample label: Figma 690:492657's own ("Send"). */
const SAMPLE_LABEL = { Button: 'Send' };
const STEP_KIND = { visual: 'visual', tokens: 'tokens', API: 'code', docs: 'docs', fix: 'fix', tooling: 'tooling', decision: 'decision' };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const ratio = (r) => `${Number(r).toFixed(2)}:1`;
/* An anatomy part's value as Figma's chip says it: a hex, "none" for an empty shadow or edge, else a short size. */
function valueOf(x) {
  const v = String(x.value ?? '').trim().replace(/\s+/g, ' ');
  if (!v) return null;
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^(0px )*0px #[0-9a-f]{6}00$|^none$|^0(px)?$/i.test(v)) return 'none';
  return v.length <= 12 ? v : null;
}

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
  const [wide, setWide] = useState(false);
  const scale = PLAY[part.name] && !wide ? 2 : 1;
  const box = useBox(stageId, liveId, [part.id, variant, label, scale, anatomy.length, a?.key]);
  useLayoutEffect(() => {
    if (box && scale === 2 && box.w > box.sw - 64) setWide(true);
  }, [box, scale]);
  useEffect(() => setWide(false), [part.id]);
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
  const live = (x) => String(measured[x.key]?.text ?? '').match(/#[0-9a-f]{6}(?!.*#[0-9a-f]{6})/i)?.[0]?.toLowerCase() ?? (measured[x.key]?.text === 'none' ? 'none' : valueOf(x));
  const markers = useMemo(() => {
    if (!box || !anatomy.length) return [];
    const pins = anatomy.map((x, i) => pinAt(x.kind, i, box));
    const roomy = box.sw >= 560;
    const texts = anatomy.map((x) => (roomy && live(x) ? `${x.title} · ${live(x)}` : x.title));
    if (box.sw < CHIPS_FROM) {
      const order = pins.map((p, i) => i).sort((i, j) => pins[i].y - pins[j].y || pins[i].x - pins[j].x);
      return anatomy
        .map((x, i) => ({ id: x.key, x: Math.round(pins[i].x / scale), y: Math.round(pins[i].y / scale), label: order.indexOf(i) + 1, part: x.title, selected: x.key === a?.key }))
        .sort((p, q) => p.label - q.label);
    }
    const { order, chips } = chipLayout(pins, texts, box);
    return anatomy.map((x, i) => ({ id: x.key, x: Math.round(pins[i].x / scale), y: Math.round(pins[i].y / scale), label: order.indexOf(i) + 1, part: texts[i], ...chips[i], selected: x.key === a?.key }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, anatomy, a?.key, scale, measured]);
  const legend = markers.length && markers[0].chipX == null ? [...markers].sort((p, q) => p.label - q.label).map((m) => `${m.label} ${m.part}`.replace(/ /g, ' ')).join(' · ') : null;
  const has = PLAY[part.name] || SPECIMENS[part.name];
  return (
    <Flow gap={8} id={stageId}>
      {/* HOLE (BELLA gap): the tool column beside the stage (zoom in, fit, zoom out, light/dark, mark up)
          waits on a BELLA tool-column part; Stage's own Fit and 100% stand in until then. */}
      <Stage label={`${part.name} on the stage`} markers={markers} scale={scale} onSelect={onPick} activeId={lit} onActiveChange={setLit}>
        <Flow id={liveId} align="center">
          <Flow id={shownId} align="center">
            {has ? <LivePart part={part} variant={variant} label={label} state={shown} /> : <EmptyState size="lane" mark="🧩" title="No live sample yet" line={`CHIP has no live sample of ${part.name} to draw yet.`} />}
          </Flow>
        </Flow>
      </Stage>
      {legend ? <TextStack subtitle={legend} /> : null}
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
            <Button variant="secondary" iconOnly icon="NavArrowRight" ariaLabel={`Next ${label}`} disabled={idx === items.length - 1} onClick={() => go(1)} />
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

/* The component list (left): one search above it (the studio's header), Needs work first, then All. */
function PartList({ model, query, filter, current, onPick, onHide, onAll }) {
  const q = query.trim().toLowerCase();
  const match = (p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  const needs = model.parts.filter((p) => !p.ready && match(p));
  const all = model.parts.filter((p) => match(p) && (filter !== 'ready' || p.ready));
  const group = (title, list, words) => (
    <Flow gap={4}>
      <SectionHead title={title} titleLevel={3} size="card" number={list.length} words={words} />
      <Flow as="ul" gap={4} aria-label={title}>
        {list.map((p) => (
          <ListRow layout="inline" key={p.id} title={p.name} statusBar={p.ready ? undefined : 'danger'} selected={p.id === current} onClick={() => onPick(p.id)} />
        ))}
      </Flow>
    </Flow>
  );
  return (
    <Card>
      <Flow gap={16}>
        <SectionHead title="Components" titleLevel={2} action={onHide ? <Button variant="tertiary" iconOnly icon="SidebarCollapse" ariaLabel="Hide the component list" ariaExpanded onClick={onHide} /> : undefined} />
        {!needs.length && !all.length ? <EmptyState size="lane" mark="🤷" title="Nothing matches" line="No component has that name. Ask BELLA instead: press Return." /> : null}
        {filter !== 'ready' && needs.length ? group('Needs work', needs) : null}
        {filter === 'needs' ? (
          <Flow direction="row">
            <Button variant="tertiary" size="sm" onClick={onAll}>{`Show all ${model.parts.length}`}</Button>
          </Flow>
        ) : all.length ? (
          group(filter === 'ready' ? 'Ready' : 'All', all)
        ) : null}
      </Flow>
    </Card>
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

/* Inspect, Figma Dev Mode's order (decided B, 22 Nov): is it ready, the knobs, tokens, code; then the
   part's own documentation as rows, never a text block. */
function InspectPanel({ part, detail, docs, props, measured, picked, onPick, variant, label, touch, open, setOpen, onFix }) {
  const anatomy = detail?.anatomy ?? [];
  const a = anatomy.find((x) => x.key === picked);
  if (open === 'props')
    return (
      <Card>
        <Flow gap={16}>
          <Back label="Inspect" onBack={() => setOpen(null)} />
          <SectionHead title="Properties" titleLevel={3} number={props.length} words={`from ${part.name}'s types`} />
          <Flow as="ul" gap={4} aria-label={`${part.name}'s properties`}>
            {props.map((p) => (
              <ListRow key={p.name} layout="stacked" title={p.name} description={`${p.values}${p.value != null ? ` · now ${p.value}` : ''}`} />
            ))}
          </Flow>
        </Flow>
      </Card>
    );
  if (open === 'tokens')
    return (
      <Card>
        <Flow gap={16}>
          <Back label="Inspect" onBack={() => setOpen(null)} />
          <SectionHead title="Tokens" titleLevel={3} number={part.doc.tokens.length} words="it reads" />
          <Flow as="ul" gap={4} aria-label={`${part.name}'s tokens`}>
            {part.doc.tokens.map((t) => (
              <ListRow layout="inline" key={t} title={t} />
            ))}
          </Flow>
        </Flow>
      </Card>
    );
  const knobs = props.filter((p) => /\|/.test(p.values) || p.name === 'label');
  const code = `import ${part.name} from '@bella/components/${part.name}/${part.name}';${PLAY[part.name] ? `\n\n<${part.name}${variant ? ` variant="${variant}"` : ''}>${label || PLAY[part.name].children}</${part.name}>` : ''}`;
  return (
    <>
      {/* is it ready: the picked part's finding, with its measured contrast and Fix (Figma Flow 3, screen 4) */}
      {a?.status === 'finding' ? <PartCard a={{ ...a, detail: measured[a.key]?.text ?? a.token }} touch={touch} value={null} onFix={onFix} /> : null}
      <Card>
        <Flow gap={8}>
          <SectionHead title="Properties" titleLevel={3} action={props.length ? <Button variant="tertiary" size="sm" icon="ArrowUpRight" onClick={() => setOpen('props')}>{`All ${props.length}`}</Button> : undefined} />
          {knobs.length ? (
            <Flow as="ul" gap={4} aria-label="Properties on the stage">
              {knobs.map((p) => (
                <ListRow layout="inline" key={p.name} title={p.name} value={p.name === 'label' ? label || p.value || '—' : p.value ?? 'not set'} />
              ))}
            </Flow>
          ) : (
            <TextStack body={`Not measured: BELLA's Storybook manifest has no props for ${part.name}.`} />
          )}
        </Flow>
      </Card>
      <Card>
        <Flow gap={8}>
          <SectionHead title="Tokens" titleLevel={3} action={part.doc.tokens.length ? <Button variant="tertiary" size="sm" icon="ArrowUpRight" onClick={() => setOpen('tokens')}>{`All ${part.doc.tokens.length}`}</Button> : undefined} />
          {anatomy.length ? (
            <Flow as="ul" gap={4} aria-label={`${part.name}'s parts and their tokens`}>
              {anatomy.map((x) => (
                <ListRow key={x.key} layout="stacked" title={x.title} description={measured[x.key]?.text ?? x.token ?? 'Not measured'} swatch={measured[x.key]?.colour ?? undefined} selected={x.key === picked} onClick={() => onPick(x.key)} />
              ))}
            </Flow>
          ) : (
            <TextStack body={`${part.name}'s contract doesn't list its parts yet.`} />
          )}
          {docs.motion.length ? <ListRow layout="inline" as="div" title="Motion" value={`${docs.motion.join(' · ')} ms`} /> : null}
        </Flow>
      </Card>
      <Card>
        <Flow gap={8}>
          <SectionHead title="Code" titleLevel={3} />
          <CodeBlock code={code} language="jsx" copy />
        </Flow>
      </Card>
      <Card>
        <Flow gap={8}>
          <SectionHead title="Use it for" titleLevel={3} description={docs.purpose || undefined} />
          {docs.use.length ? (
            <Flow as="ul" gap={4} aria-label="Use it for">
              {docs.use.map((u) => (
                <ListRow layout="inline" key={u} title={u} />
              ))}
            </Flow>
          ) : (
            <TextStack body="Not written in its contract yet." />
          )}
          {docs.dont.length ? (
            <>
              <SectionHead title="Not for" titleLevel={4} size="card" />
              <Flow as="ul" gap={4} aria-label="Not for">
                {docs.dont.map((d) => (
                  <ListRow key={d.title} layout="stacked" title={d.title} description={d.value ?? undefined} />
                ))}
              </Flow>
            </>
          ) : null}
        </Flow>
      </Card>
      <Card>
        <Flow gap={8}>
          <SectionHead title="Accessibility" titleLevel={3} />
          <Flow as="ul" gap={4} aria-label="Accessibility">
            {touch ? <ListRow layout="inline" title="Touch target" value={`${touch.w} × ${touch.h}`} statusBar={touch.w >= 44 && touch.h >= 44 ? 'success' : 'danger'} /> : null}
            {part.states.length ? <ListRow layout="stacked" title="States" description={part.states.map((s) => s.label).join(' · ')} /> : null}
            {docs.a11y.map((x) => (
              <ListRow key={x.title} layout="stacked" title={x.title} description={x.value ?? undefined} />
            ))}
          </Flow>
          {!docs.a11y.length ? <TextStack body="No accessibility notes in its contract." /> : null}
        </Flow>
      </Card>
      <Card>
        <Flow gap={8}>
          <SectionHead title="Decisions" titleLevel={3} number={docs.decisions.length} words="in BELLA's history" />
          {docs.decisions.length ? (
            <Flow gap={0} as="ol" aria-label={`${part.name}'s decisions, newest first`}>
              {docs.decisions.map((r) => (
                <Fragment key={r.id}>
                  <StepDay>{day(r.date)}</StepDay>
                  <Step title={r.title} detail={r.why ?? undefined} kind="decision" state="done" />
                </Fragment>
              ))}
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
function ChecksPanel({ part, rows, open, setOpen }) {
  const row = rows.find((r) => `check:${r.id}` === open);
  if (row)
    return (
      <Card>
        <Flow gap={16}>
          <Back label="All checks" onBack={() => setOpen(null)} />
          <SectionHead title={row.title} titleLevel={3} number={row.count ?? undefined} words={row.count ? undefined : row.value} description={row.source ?? undefined} />
          <Flow as="ul" gap={4} aria-label={`${row.title}: what it found`}>
            {row.items.map((x) => (
              <ListRow key={x.title} layout={String(x.value ?? '').length > 24 ? 'stacked' : 'inline'} {...(String(x.value ?? '').length > 24 ? { description: x.value } : { value: x.value || undefined })} title={x.key ? <Marker>{x.title}</Marker> : x.title} statusBar={x.key ? 'danger' : undefined} />
            ))}
          </Flow>
          {row.href ? (
            <Flow direction="row" justify="end">
              <Button variant="secondary" icon="ArrowUpRight" href={row.href}>{`Open ${row.title.toLowerCase()}`}</Button>
            </Flow>
          ) : null}
          {row.why ? (
            <Disclosure title="Why it matters">
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
            <ListRow layout="inline" key={r.id} title={r.title} value={r.value} statusBar={r.tone} trailing onClick={() => setOpen(`check:${r.id}`)} />
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
  if (!fixes.length) return <EmptyState size="lane" mark="✨" title="Nothing to fix" line={`Every check ${part.name} answers to passes or isn't measured yet.`} />;
  const n = fixes.filter((f) => chosen.includes(f.id)).length;
  return (
    <>
      <Card>
        <Flow gap={8}>
          <SectionHead title="Suggested fixes" titleLevel={3} number={n} words={`of ${fixes.length} picked`} />
          <Flow as="ul" gap={4} aria-label="Suggested fixes">
            {fixes.map((f) => {
              const on = chosen.includes(f.id);
              return (
                <ListRow
                  key={f.id}
                  layout="stacked"
                  title={<>{`${f.verb} `}<Marker>{f.key}</Marker></>}
                  description={f.line}
                  switch={<FilterChip pressed={on} ariaLabel={`Include: ${f.verb} ${f.key}`} onClick={() => setChosen(on ? chosen.filter((x) => x !== f.id) : [...chosen, f.id])}>Include</FilterChip>}
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
          <ListRow layout="inline" title="Reaches" value={usedIn.length ? `${usedIn.length} ${usedIn.length === 1 ? 'part' : 'parts'}` : 'only itself'} {...(usedIn.length ? { trailing: true, onClick: () => setOpen('reach') } : {})} />
        </Flow>
      </Card>
    </>
  );
}

/* History: an overview of what changed, each record one click away. */
function HistoryPanel({ part, detail, names, open, setOpen }) {
  const rec = detail?.history.find((r) => `rec:${r.id}` === open);
  if (rec)
    return (
      <Card>
        <Flow gap={16}>
          <Back label="All records" onBack={() => setOpen(null)} />
          <TextStack subtitle={`${day(rec.date)} · ${cap(rec.type ?? 'change')}`} />
          <Heading tier="subsection" as="h3">
            <Keyed text={rec.title} names={names} />
          </Heading>
          <Flow as="ul" gap={4} aria-label="The record">
            <ListRow layout="stacked" title="Why" description={rec.why ?? 'The commit gives no reason.'} />
            {rec.types.length ? <ListRow layout="inline" title="Kind" value={rec.types.join(' · ')} /> : null}
            <ListRow layout="inline" title="Commit" value={rec.id} trailing onClick={() => window.open(`https://github.com/emcdanie/bella/commit/${rec.id}`, '_blank', 'noopener')} />
          </Flow>
        </Flow>
      </Card>
    );
  const list = detail?.history ?? [];
  return (
    <Card>
      <Flow gap={8}>
        <SectionHead title="History" titleLevel={3} number={list.length} words={list.length === 1 ? 'record' : 'records'} />
        {list.length ? (
          <Flow as="ul" gap={4} aria-label={`${part.name}'s records, newest first`}>
            {list.map((r) => (
              <ListRow layout="inline" key={r.id} title={<Keyed text={r.title} names={names} />} value={day(r.date)} trailing onClick={() => setOpen(`rec:${r.id}`)} />
            ))}
          </Flow>
        ) : (
          <EmptyState size="lane" mark="📜" title="No records yet" line={`BELLA has no commits that touch ${part.name}.`} />
        )}
      </Flow>
    </Card>
  );
}

export default function ComponentsContent({ model, filter = 'all', onFilter, partId, onPart, onCheckAgain }) {
  const phone = useNarrow();
  // the list stands beside the stage where the studio has room (1440); narrower, it is a drawer
  const listOut = useNarrow(1400);
  const [listHidden, setListHidden] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [tab, setTab] = useState('inspect');
  const [open, setOpen] = useState(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
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
  const variants = part && PLAY[part.name] ? part.variants : [];
  const label = part ? SAMPLE_LABEL[part.name] ?? '' : '';
  useEffect(() => {
    setVariant(variants[0] ?? null);
    setShown('default');
    setOpen(null);
    setMeasured({});
    asker.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part?.id]);
  useEffect(() => {
    setPicked(detail?.anatomy.find((x) => x.status === 'finding')?.key ?? detail?.anatomy[0]?.key ?? null);
  }, [part?.id, detail]);
  const checks = part ? checksWithTouch(part, touch) : [];
  const sbParts = studio.stories?.parts?.[part?.name];
  const sbBase = studio.stories?.base;
  const links = sbBase && sbParts ? { story: sbParts.first ? `${sbBase}?path=/story/${sbParts.first}` : null, docs: sbParts.docs ? `${sbBase}?path=/docs/${sbParts.docs}` : null } : {};
  const weakestPair = detail?.anatomy.filter((x) => x.contrast).sort((x, y) => x.contrast.ratio - y.contrast.ratio)[0];
  const rows = part ? studioChecks({ part, checks, drift: studio.drift, lint: studio.lint, gate: studio.gate, gaps: studio.gaps?.gaps, links, weakest: weakestPair ? `${weakestPair.title} ${ratio(weakestPair.contrast.ratio)}` : null }) : [];
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
  const findings = (detail?.findings ?? 0) + (part.checks.find((k) => k.id === 'a11y')?.ok && touch && (touch.w < 44 || touch.h < 44) ? 1 : 0);
  const states = PLAY[part.name] ? part.states : [];
  const sameKind = parts.filter((p) => p.category === part.category);

  const header = (
    <Flow direction="row" gap={16} wrap justify="between" align="center">
      <Flow gap={4}>
        <Flow direction="row" gap={12} wrap align="center">
          <Heading tier="section" as="h2">{part.name}</Heading>
          {parity ? <StatusDot tone={parity.tone === 'danger' ? 'attention' : parity.tone === 'success' ? 'success' : 'neutral'} label={parity.tone === 'danger' ? `${parity.count} ${parity.count === 1 ? 'difference' : 'differences'} from Figma` : parity.tone === 'success' ? 'Matches Figma' : 'Not compared with Figma'} /> : null}
          {detail ? findings ? <Tag tone="attention" showDot count={findings}>{findings === 1 ? 'finding' : 'findings'}</Tag> : <Tag tone="success" showDot>No findings</Tag> : null}
        </Flow>
        <TextStack subtitle={[model.version, detail?.updated ? `updated ${detail.updated}` : null, model.checked ? `checked ${model.checked}` : null].filter(Boolean).join(' · ')} />
      </Flow>
      <Flow direction="row" gap={8} wrap align="end" grow={phone ? 'last' : undefined}>
        {part.storyUrl ? <Button variant="secondary" icon="ArrowUpRight" href={part.storyUrl}>Story</Button> : null}
        <Button variant="tertiary" iconOnly icon="RefreshDouble" ariaLabel="Check again" onClick={onCheckAgain} />
        <Input label="Find a component or ask BELLA" value={query} onChange={setQuery} onSend={onSearch} sendLabel="Find or ask" suggestion={detail ? questions(part, detail)[0] : undefined} />
      </Flow>
    </Flow>
  );

  const list = <PartList model={model} query={query} filter={filter} current={part.id} onPick={pick} onAll={() => onFilter('all')} onHide={listOut ? undefined : () => setListHidden(true)} />;
  const listInline = !listOut && !listHidden;
  const centre = (
    <Flow gap={16}>
      <Flow direction="row" gap={16} wrap align="center">
        {listInline ? null : <Button variant="secondary" icon="SidebarExpand" leadingIcon ariaExpanded={listOut ? listOpen : false} onClick={() => (listOut ? setListOpen(true) : setListHidden(false))}>Components</Button>}
        {variants.length > 1 ? variants.length > 3 || phone ? <Select label="Variant" value={variant} onChange={setVariant} options={variants.map((v) => ({ value: v, label: cap(v) }))} /> : <SegmentedControl label="Variant" value={variant} onChange={setVariant} options={variants.map((v) => ({ value: v, label: v }))} /> : null}
      </Flow>
      <StudioStage part={part} detail={detail} variant={variant} label={label} shown={shown} picked={picked} onPick={setPicked} onMeasured={setMeasured} onTouch={setTouch} />
      {states.length ? (
        <Strip
          title={`${part.name} · states`}
          label="state"
          items={states}
          current={shown}
          onPick={setShown}
          render={(s, on, go) => <StateThumb part={part} variant={variant} label={label} state={s} selected={on} onPick={go} />}
        />
      ) : sameKind.length > 1 ? (
        <Strip
          title={`${part.category} · components`}
          label="component"
          items={sameKind.map((p) => ({ id: p.id, label: p.name }))}
          current={part.id}
          onPick={pick}
          render={(p, on, go) => (
            <VariantTile label={p.label} selected={on} onClick={go}>
              <StatusDot tone={parts.find((x) => x.id === p.id)?.ready ? 'success' : 'attention'} label={parts.find((x) => x.id === p.id)?.ready ? 'Ready' : 'Needs work'} />
            </VariantTile>
          )}
        />
      ) : null}
    </Flow>
  );
  const panel =
    tab === 'inspect' ? (
      <InspectPanel part={part} detail={detail} docs={docs} props={props} measured={measured} picked={picked} onPick={setPicked} variant={variant} label={label} touch={touch} open={open} setOpen={setOpen} onFix={() => send([`finding-${picked}`])} />
    ) : tab === 'fix' ? (
      <FixPanel part={part} fixes={fixes} chosen={chosen} setChosen={setChosen} target={target} setTarget={setTarget} onSend={() => send()} model={model} onPart={pick} open={open} setOpen={setOpen} />
    ) : tab === 'checks' ? (
      <ChecksPanel part={part} rows={rows} open={open} setOpen={setOpen} />
    ) : (
      <HistoryPanel part={part} detail={detail} names={names} open={open} setOpen={setOpen} />
    );
  const right = (
    <Flow gap={16}>
      <Tabs label={`${part.name}: inspect, fix, checks, history`} idBase="studio-view" value={tab} onChange={(t) => (setTab(t), setOpen(null))} tabs={TABS} />
      <TabPanels tabs={{ idBase: 'studio-view', value: tab, items: TABS }}>
        <Flow gap={16} scroll={!phone}>
          {!detail || !studio.ready ? <EmptyState size="lane" mark="⏳" title={`Reading ${part.name}`} line="Fetching its checks, history and contrast pairs." /> : panel}
        </Flow>
      </TabPanels>
    </Flow>
  );
  return (
    <>
      {header}
      {detail?.figmaBlind ? <Notification tone="attention" message="Figma can’t see it: no file key in CHIP’s settings." action={{ label: 'Add file key', href: '#/connectors' }} /> : null}
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
        <Flow fit span={12} id="studio">
          <Flow span={12} direction="row" gap={24}>
            {listInline ? (
              <Flow aside>
                <Flow scroll>{list}</Flow>
              </Flow>
            ) : null}
            <Flow>
              <Flow scroll>{centre}</Flow>
            </Flow>
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
