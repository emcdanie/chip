// Components · Quality (Elleta, 23 Nov: "the contract says it passes but its not there in the inspection tool.. it would be
// cool to be able to read this stuff.. a chart of how the component passes for accessibility, machine readability and
// whatever else we test.. an accessibility view like we do for states that is interactive and shows you why it is
// important"; she said yes to A, B and C, mock 2026-11-23-component-quality).
//   A  the accessibility view: the part big on the stage with numbered pins, a fact card for the pin picked
//   B  the scorecard: a row per thing we test against its target, a weighted score and band
//   C  Read it: properties and tokens as branch rows in plain words, search, raw view behind a button
// Every number comes from qualityModel.js (computed on load from CHIP's data); nothing here is typed.
//
// BELLA gaps, named (nothing invented in this page):
// - a fact card beside a pin (what, why, how measured): the pin's card is a Card with TextStack rows below the stage.
// - a score-band readout (big number, the three bands with their edges): Stat plus Progress with its 90 target stand in.
// - the stage's tool column takes no custom tools (All, Focus, Contrast, Target, Reader): FilterChips stand in, as the other pages' filters.
// - structured accessibility rows: BELLA's contract keeps `a11y` as one sentence, so the facts are read out of it by qualityModel.js.
import { useMemo, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Tag from '@bella/components/Tag/Tag';
import Stat from '@bella/components/Stat/Stat';
import Progress from '@bella/components/Progress/Progress';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import BranchGroup from '@bella/components/BranchGroup/BranchGroup';
import Input from '@bella/components/Input/Input';
import Button from '@bella/components/Button/Button';
import CodeBlock from '@bella/components/CodeBlock/CodeBlock';
import Marker from '@bella/components/Marker/Marker';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import { A11Y_MODES, a11yFacts, a11yPins, barOf, rawText, readGroups, scorecard, searchGroups } from './qualityModel.js';

const TONE = { ok: 'success', gap: 'attention', fail: 'danger', none: 'neutral' };
const WORD = { ok: 'Passes', gap: 'Needs you', fail: 'Fails', none: 'Not measured' };
const ratio = (v) => `${Number(v).toFixed(2)}:1`;
const shown = (r) => (r.value == null || typeof r.value !== 'number' ? null : r.targetUnit === ':1' ? ratio(r.value) : String(r.value));

/** The tokens the page resolves, read from its own styles (never typed). */
const tokenValue = (t) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(t).trim() || null;
  } catch {
    return null;
  }
};

/** Everything the Quality tab shows for one part, computed from what CHIP reads (call at the top of the page). */
export function useQuality({ part, detail, studio, touch }) {
  const name = part?.name ?? null;
  const { data } = useCached(name ? [`/system-docs/contract/${name}`, '/data/checks/visual.json', '/data/checks/contract.json'] : []);
  const [contract, visual, contractCheck] = data ?? [];
  return useMemo(() => {
    if (!part || !detail || !contract) return null;
    const propNames = (contract.props ?? []).map((p) => p.name);
    const facts = a11yFacts({ a11y: contract.contract?.a11y ?? part.doc.a11y, anatomy: detail.anatomy, touch, propNames: [...new Set([...propNames, ...part.doc.props])], rendersAs: part.doc.rendersAs, minTarget: part.doc.minTarget });
    const card = scorecard({ facts, part, contract, visual, contractCheck, drift: studio?.drift, stories: studio?.stories });
    const groups = readGroups({ contract, tokens: part.doc.tokens, read: tokenValue });
    return { facts, pins: a11yPins(facts), card, groups, contract };
  }, [part, detail, contract, visual, contractCheck, touch, studio?.drift, studio?.stories]);
}

/* ---------------- A: the accessibility view ---------------- */
function FactCard({ fact }) {
  const bar = barOf({ ...fact, state: fact.state });
  const numbered = typeof fact.value === 'number';
  return (
    <Card>
      <Flow gap={16} aria-live="polite">
        <Flow gap={8}>
          <TextStack title={`${fact.n}. ${fact.name}`} />
          <Flow direction="row" gap={8} wrap align="center">
            <Tag tone={TONE[fact.state]} showDot>{WORD[fact.state]}</Tag>
          </Flow>
        </Flow>
        {numbered ? (
          <Flow gap={8}>
            <Stat label={fact.unit === 'px' ? 'Measured, px' : 'Measured'} value={fact.targetUnit === ':1' ? ratio(fact.value) : `${fact.value}`} />
            <Progress drawIn label={`${fact.name}: ${shown(fact)}, target ${fact.target}${fact.targetUnit}`} showLabel={false} showTarget tone={fact.state === 'ok' ? 'success' : 'attention'} fill={Math.round(bar.fill)} target={Math.round(bar.target)} />
          </Flow>
        ) : null}
        <Flow gap={8}>
          <TextStack title="What it is" body={fact.what} />
          <TextStack title="Why it matters" body={fact.why} />
          <TextStack title="How it is measured" body={fact.state === 'none' ? fact.how : <>{fact.how}{fact.source ? ` Source: ${fact.source}.` : ''}</>} />
        </Flow>
      </Flow>
    </Card>
  );
}

/** The fact for the pin picked (the first one the view shows when none, or when the view hides it). */
export function currentFact(q, mode, pick) {
  if (!q) return null;
  const visible = q.pins.filter((p) => mode === 'all' || p.modes.includes(mode));
  const f = q.facts.find((x) => x.id === (visible.find((p) => p.key === pick) ?? visible[0])?.key);
  return f ? { ...f, n: q.pins.find((p) => p.key === f.id).n } : null;
}

/** Title, the tools (what to show) and the stage the page passes in; the fact card sits at the top of the right panel. */
export function QualityCentre({ q, part, mode, setMode, children }) {
  if (!q) return <EmptyState size="lane" mark="⏳" title={`Reading ${part.name}`} line="Fetching its contract and checks." />;
  return (
    <Flow gap={16} grow="last">
      <Flow gap={8}>
        <SectionHead title={`${part.name} · accessibility`} titleLevel={3} />
        <TextStack subtitle={`${q.pins.length} facts on the part. Pick one to see why it matters and how it is measured.`} />
        <Flow direction="row" gap={8} wrap role="group" aria-label="Show">
          {A11Y_MODES.map((m) => (
            <FilterChip key={m.id} size="compact" pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</FilterChip>
          ))}
        </Flow>
      </Flow>
      <Flow gap={16} grow="first">{children}</Flow>
    </Flow>
  );
}
export const visiblePins = (q, mode) => (q ? q.pins.filter((p) => mode === 'all' || p.modes.includes(mode)) : []);

/* ---------------- B: the scorecard ---------------- */
function ScoreCard({ card }) {
  const { pct, band, gaps, unmeasured } = card;
  if (pct == null) return <Card><TextStack title="Score" body="Not measured: no row has a source yet." /></Card>;
  return (
    <Card>
      <Flow gap={16}>
        <Flow gap={8}>
          <Stat label="Score, weighted by how much it matters" value={`${pct} of 100`} />
          <Flow direction="row" gap={8} wrap align="center">
            <Tag tone={band.tone} showDot>{band.label}</Tag>
          </Flow>
        </Flow>
        <Progress drawIn label={`Score ${pct} of 100, Meets starts at 90`} showLabel={false} showTarget tone={band.tone === 'success' ? 'success' : 'attention'} fill={pct} target={90} />
        <TextStack subtitle="Needs work under 70 · Mostly meets 70 to 89 · Meets 90 and up. Accessibility counts 3, machine readability 2, stories and parity 1." />
        <TextStack
          body={
            <>
              {gaps.length ? (
                <>
                  <Marker>{`${gaps.length} ${gaps.length === 1 ? 'row' : 'rows'}`}</Marker>
                  {` below target: ${gaps.slice(0, 3).map((g) => g.title.toLowerCase()).join(', ')}${gaps.length > 3 ? ' and more' : ''}. `}
                </>
              ) : (
                'Every measured row meets its target. '
              )}
              {unmeasured ? `${unmeasured} not measured, left out of the score.` : ''}
            </>
          }
        />
      </Flow>
    </Card>
  );
}

function Row({ r, open, onOpen }) {
  const bar = barOf(r);
  const v = shown(r);
  return (
    <ListRow
      layout="stacked"
      statusBar={TONE[r.state]}
      title={r.title}
      description={open ? <>{r.line}{r.source ? ` Source: ${String(r.source).replace(/T.*$/, '')}.` : ''}</> : undefined}
      {...(v ? { value: v } : {})}
      valueLabel={v ? r.unit : r.state === 'none' ? 'Not measured' : undefined}
      rightTag={<Tag tone={TONE[r.state]} showDot>{WORD[r.state]}</Tag>}
      progress={r.state === 'none' ? undefined : <Progress label={r.title} showLabel={false} showTarget={bar.target != null} tone={r.state === 'ok' ? 'success' : 'attention'} fill={Math.round(bar.fill)} target={Math.round(bar.target ?? 0)} />}
      trailing
      onClick={onOpen}
      aria-expanded={open}
    />
  );
}

function Scorecard({ card }) {
  const [open, setOpen] = useState(null);
  return (
    <Flow gap={16}>
      <ScoreCard card={card} />
      {card.areas.map((area) => {
        const rows = card.rows.filter((r) => r.area === area);
        return (
          <Flow gap={8} key={area}>
            <SectionHead title={area} titleLevel={3} number={rows.filter((r) => r.state === 'ok').length} words={`of ${rows.filter((r) => r.state !== 'none').length} pass`} />
            <ListRowGroup ariaLabel={area}>
              {rows.map((r) => <Row key={r.id} r={r} open={open === r.id} onOpen={() => setOpen(open === r.id ? null : r.id)} />)}
            </ListRowGroup>
          </Flow>
        );
      })}
      <TextStack subtitle="Blue tick: the target. Numbers computed on load from CHIP's saved checks, BELLA's contract and the live part." />
    </Flow>
  );
}

/* ---------------- C: Read it ---------------- */
function ReadIt({ q }) {
  const [query, setQuery] = useState('');
  const [raw, setRaw] = useState(false);
  const [open, setOpen] = useState(0);
  const groups = useMemo(() => searchGroups(q.groups, query), [q.groups, query]);
  const searching = query.trim().length > 0;
  return (
    <Flow gap={16}>
      <SectionHead title="Properties and tokens" titleLevel={3} number={q.groups.reduce((n, g) => n + g.items.length, 0)} words="rows, each in a sentence and its exact value" />
      <Flow gap={8}>
        <Input label="Search properties and tokens" value={query} onChange={setQuery} />
        <Flow direction="row" gap={8} justify="end">
          <Button variant="secondary" size="sm" ariaExpanded={raw} onClick={() => setRaw(!raw)}>{raw ? 'Hide raw view' : 'Show raw view'}</Button>
        </Flow>
      </Flow>
      {raw ? <CodeBlock language="json" title="Raw: the contract's props, slots and tokens" code={rawText(q.contract, q.groups.find((g) => g.name === 'Tokens used')?.items.map((i) => i.name) ?? [])} copy /> : null}
      {!groups.length ? <EmptyState size="lane" mark="🤷" title="Nothing matches" line="No property or token has that word. Clear the search." /> : null}
      <Flow gap={8}>
        {groups.map((g, i) => {
          const on = searching || open === i;
          return (
            <BranchGroup key={g.name} name={g.name} count={g.items.length} hue={g.hue} open={on} onToggle={() => setOpen(open === i ? -1 : i)}>
              {g.items.map((it) => <ListRow key={it.name} layout="stacked" title={it.name} description={it.say} value={it.exact} />)}
            </BranchGroup>
          );
        })}
      </Flow>
    </Flow>
  );
}

/** The right panel: the scorecard (B), then Read it (C). */
export default function QualityPanel({ q, part, mode, pick }) {
  if (!q) return <EmptyState size="lane" mark="⏳" title={`Reading ${part.name}`} line="Fetching its contract and checks." />;
  const fact = currentFact(q, mode, pick);
  return (
    <Flow gap={24}>
      {fact ? <FactCard fact={fact} /> : <EmptyState size="lane" mark="🤷" title="Nothing here" line="No accessibility fact belongs to that view for this part. Pick All." />}
      <Scorecard card={q.card} />
      <ReadIt q={q} />
    </Flow>
  );
}
