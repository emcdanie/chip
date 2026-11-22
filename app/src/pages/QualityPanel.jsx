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
import Progress, { TargetMark } from '@bella/components/Progress/Progress';
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
/** A sentence's first number with its unit, marked: the one thing a skimmer needs from it. */
const NUMBER = /(?<![\w.])(\d+(?:\.\d+)?(?::1| px| by \d+(?:\.\d+)? px|\s?×\s?\d+(?:\.\d+)?)?)/;
function marked(text) {
  const t = String(text ?? '');
  const m = t.match(NUMBER);
  if (!m) return t;
  const i = m.index;
  return <>{t.slice(0, i)}<Marker>{m[0]}</Marker>{t.slice(i + m[0].length)}</>;
}
/** One fact a bullet: the label, then one fact in plain words; a long paragraph is split at its sentences. */
const sentencesOf = (t) => String(t ?? '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean);

/** One bar with its target as a thin tick: no "Target n%" tag row, no pill. BELLA gap: Progress draws its target only with
 *  the tag row (showTarget), so BELLA's own target mark is laid over a plain Progress. */
function TickBar({ label, tone, fill, target }) {
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <Progress drawIn label={label} showLabel={false} tone={tone} fill={fill} />
      {target != null ? (
        <span aria-hidden="true" style={{ position: 'absolute', insetInlineStart: `${target}%`, insetBlock: 'calc(var(--spacing-4) * -1)', transform: 'translateX(-50%)', display: 'flex' }}>
          <TargetMark style={{ blockSize: '100%' }} />
        </span>
      ) : null}
    </span>
  );
}

/** A fact open: Measured, What it is, Why it matters, How it is measured, each a short bullet. */
function FactBullets({ fact }) {
  const bar = barOf(fact);
  const numbered = typeof fact.value === 'number';
  return (
    <Flow gap={8}>
      <Flow as="ul" gap={4} bullets aria-label={`${fact.name}: what, why and how`}>
        {numbered ? (
          <li>
            <strong>Measured </strong>
            <Tag tone="count">{fact.targetUnit === ':1' ? ratio(fact.value) : `${fact.value}${fact.unit === 'px' ? ' px' : ''}`}</Tag>
            {fact.target != null ? <>{' against '}<Tag tone="count">{fact.targetUnit === ':1' ? `${fact.target}:1` : `${fact.target}${fact.targetUnit === 'px' ? ' px' : ''}`}</Tag></> : null}
          </li>
        ) : null}
        <li><strong>What it is </strong>{fact.what}</li>
        <li><strong>Why it matters </strong>{fact.why}</li>
        {sentencesOf(fact.state === 'none' ? fact.how : `${fact.how}${fact.source ? ` Source: ${fact.source}.` : ''}`).map((x, i) => (
          <li key={i}>{i === 0 ? <strong>How it is measured </strong> : null}{marked(x)}</li>
        ))}
      </Flow>
      {numbered ? <TickBar label={`${fact.name}: ${shown(fact)}, target ${fact.target}${fact.targetUnit}`} tone={fact.state === 'ok' ? 'success' : 'attention'} fill={Math.round(bar.fill)} target={bar.target != null ? Math.round(bar.target) : null} /> : null}
    </Flow>
  );
}

/** The facts as an accordion in a Card: each row names the fact, says what it is in one line and its state; the picked one
 *  (or the first) is open with its bullets. Nothing hides behind a pin click (Elleta, 22 Nov: "why does the text only show
 *  when i click"). */
function FactsCard({ facts, pins, open, setOpen }) {
  return (
    <Card>
      <Flow gap={8}>
        <SectionHead title="Accessibility" titleLevel={3} number={facts.length} words={facts.length === 1 ? 'fact on the part' : 'facts on the part'} />
        <Flow gap={0} role="group" aria-label="Accessibility facts">
          {facts.map((f) => {
            const on = open === f.id;
            return (
              <Flow gap={0} key={f.id}>
                <ListRow
                  layout="inline"
                  statusBar={TONE[f.state]}
                  title={`${pins.find((p) => p.key === f.id)?.n}. ${f.name}`}
                  description={f.what}
                  valueLabel={WORD[f.state]}
                  onClick={() => setOpen(on ? null : f.id)}
                  aria-expanded={on}
                />
                {on ? <Flow inset gap={8}><FactBullets fact={f} /></Flow> : null}
              </Flow>
            );
          })}
        </Flow>
      </Flow>
    </Card>
  );
}

/** The first fact, small, for the Inspect tab: accessibility is not behind a tab (Elleta, 22 Nov: "the accessibility is too
 *  hidden"). It names the fact that needs her first (a fail, then a gap), else the first one. */
export function AccessMini({ q, onOpen }) {
  if (!q) return null;
  const first = q.facts.find((f) => f.state === 'fail') ?? q.facts.find((f) => f.state === 'gap') ?? q.facts[0];
  if (!first) return null;
  const pass = q.facts.filter((f) => f.state === 'ok').length;
  return (
    <Card>
      <Flow gap={8}>
        <SectionHead title="Accessibility" titleLevel={3} number={pass} words={`of ${q.facts.length} pass`} action={<Button variant="tertiary" size="sm" onClick={onOpen}>See all</Button>} />
        <ListRowGroup ariaLabel="First accessibility fact">
          <ListRow layout="inline" statusBar={TONE[first.state]} title={first.name} description={first.what} valueLabel={WORD[first.state]} onClick={onOpen} />
        </ListRowGroup>
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
        <Flow as="ul" gap={4} bullets aria-label="How the score is read">
          <li>Needs work under <Marker>70</Marker>, mostly meets 70 to 89, meets 90 and up.</li>
          <li>Accessibility counts 3, machine readability 2, stories and parity 1.</li>
        </Flow>
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

/** A row's result in words, the state word first: "Passes: 44 px, needs 44". The state word replaces the pill. */
function result(r) {
  const v = shown(r);
  if (r.state === 'none') return WORD.none;
  const goal = r.target != null && r.targetUnit !== undefined && v != null ? `, needs ${r.targetUnit === ':1' ? `${r.target}:1` : r.target}` : '';
  return `${WORD[r.state]}${v != null ? `: ${v}${r.unit && r.targetUnit !== ':1' ? ` ${r.unit}` : ''}${goal}` : ''}`;
}

/** name, one result in words, one bar with the target as a thin tick (no pill, no Target tag, no count beside the name). */
function Row({ r, open, onOpen }) {
  const bar = barOf(r);
  const lines = sentencesOf(`${r.line}${r.source ? ` Source: ${String(r.source).replace(/T.*$/, '')}.` : ''}`);
  return (
    <Flow gap={0}>
      <ListRow
        layout="stacked"
        statusBar={TONE[r.state]}
        title={r.title}
        description={result(r)}
        progress={r.state === 'none' ? undefined : <TickBar label={r.title} tone={r.state === 'ok' ? 'success' : 'attention'} fill={Math.round(bar.fill)} target={bar.target != null ? Math.round(bar.target) : null} />}
        onClick={onOpen}
        aria-expanded={open}
      />
      {open ? (
        <Flow inset>
          <Flow as="ul" gap={4} bullets aria-label={`${r.title}: how it was measured`}>
            {lines.map((x, i) => <li key={i}>{marked(x)}</li>)}
          </Flow>
        </Flow>
      ) : null}
    </Flow>
  );
}

function Scorecard({ card }) {
  const [open, setOpen] = useState(null);
  return (
    <Flow gap={24}>
      <ScoreCard card={card} />
      {card.areas.map((area) => {
        const rows = card.rows.filter((r) => r.area === area);
        return (
          <Card key={area}>
            <Flow gap={8}>
              <SectionHead title={area} titleLevel={3} number={rows.filter((r) => r.state === 'ok').length} words={`of ${rows.filter((r) => r.state !== 'none').length} pass`} />
              <ListRowGroup ariaLabel={area}>
                {rows.map((r) => <Row key={r.id} r={r} open={open === r.id} onOpen={() => setOpen(open === r.id ? null : r.id)} />)}
              </ListRowGroup>
            </Flow>
          </Card>
        );
      })}
      <TextStack subtitle="The thin tick on a bar is its target. Numbers computed on load from CHIP's saved checks, BELLA's contract and the live part." />
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
    <Card>
    <Flow gap={16}>
      <SectionHead title="Properties and tokens" titleLevel={3} number={q.groups.reduce((n, g) => n + g.items.length, 0)} words="rows, each in a sentence and its exact value" />
      <Flow gap={8}>
        <Input label="Search properties and tokens" value={query} onChange={setQuery} />
        <Flow direction="row" gap={8} justify="end">
          <Button variant="secondary" size="sm" ariaExpanded={raw} onClick={() => setRaw(!raw)}>{raw ? 'Hide raw view' : 'Show raw view'}</Button>
        </Flow>
      </Flow>
      {raw ? <CodeBlock language="json" title="Raw: the contract's props, slots and tokens" code={rawText(q.contract, q.groups.find((g) => g.name === 'Tokens used')?.items.map((i) => i.name) ?? [])} copy /> : null}
      {!groups.length ? <EmptyState size="lane" mark="🤷‍♀️" title="Nothing matches" line="No property or token has that word. Clear the search." /> : null}
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
    </Card>
  );
}

/** The facts, the picked one (a pin on the stage, or the first) open; picking another pin opens that one. */
function FactsOpen({ facts, pins, first }) {
  const [open, setOpen] = useState(first);
  if (!facts.length) return <EmptyState size="lane" mark="🤷‍♀️" title="Nothing here" line="No accessibility fact belongs to that view for this part. Pick All." />;
  return <FactsCard facts={facts} pins={pins} open={open} setOpen={setOpen} />;
}

/** The right panel: the scorecard (B), then Read it (C). */
export default function QualityPanel({ q, part, mode, pick }) {
  if (!q) return <EmptyState size="lane" mark="⏳" title={`Reading ${part.name}`} line="Fetching its contract and checks." />;
  const shownPins = visiblePins(q, mode);
  const facts = q.facts.filter((f) => shownPins.some((p) => p.key === f.id));
  const first = currentFact(q, mode, pick)?.id ?? null;
  return (
    <Flow gap={24}>
      <FactsOpen key={`${mode}-${first}`} facts={facts} pins={q.pins} first={first} />
      <Scorecard card={q.card} />
      <ReadIt q={q} />
    </Flow>
  );
}
