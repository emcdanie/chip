// System map · content: the code twin of Figma's Screen 6 (CHIP Dashboard
// 601:123153). BELLA's pipeline in four steps (Sources, Checks, Gate, Ship),
// each node with its status and count, the Needs you filter, and a detail
// card with the node's fix. Real data only: CHIP's own /map (each check's
// state, detail, what it waits on and what it feeds). BELLA parts and the
// template's Flow only; no page CSS.
//
// The map is a board at every width (Elleta, 22 Nov: "the system map doesn't
// work when the screen goes down.. it should stay and you can move the board
// left and right and zoom"): the four steps always side by side at full size
// in BELLA Stage's frame with its Fit / 100% control; at 100% the board
// scrolls sideways inside the stage. Never a stacked list.
//
// Gaps (library board): the curved connector that follows the nodes (Figma's
// wires; until it is published, the detail card says what a node waits on and
// what it feeds, and a failing one shows red there); Card has no selected
// state (Figma's pale blue node), so the open node shows in the detail card;
// Stage's frame prints its design width ("1040 wide · shown at 100%") above
// the board, a line written for page previews.
import { useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Tag from '@bella/components/Tag/Tag';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Button from '@bella/components/Button/Button';
import Stage from '@bella/components/Stage/Stage';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import useNarrow from '../templates/useNarrow.js';

// Figma's four steps and the nodes in each (the Figma paths are one node, "Figma")
const STEPS = [
  { name: 'Sources', ids: ['tokens', 'figma'] },
  { name: 'Checks', ids: ['contracts', 'contrast', 'stories', 'agents', 'compare'] },
  { name: 'Gate', ids: ['gate', 'bench'] },
  { name: 'Ship', ids: ['review', 'ci', 'ship'] },
];
// the board's design width: four steps of about 230 each (a long node line takes two lines); 91% at 1440, 100% and sideways below
const BOARD = 1040;
const FIGMA_PATHS = ['figma', 'figma-console', 'figma-rest'];
// a node's state in Figma's words and tone
const SAYS = { ok: ['Healthy', 'success'], warn: ['Not all run', 'attention'], bad: ['Needs you', 'attention'], blocked: ['Not known', 'default'], unknown: ['Not known', 'default'] };
// Status dot has no 'default' tone: the not-known word is neutral
const dotTone = (t) => (t === 'default' ? 'neutral' : t);
const DOT = { ok: 'success', bad: 'attention', blocked: 'neutral', unknown: 'neutral' };

const first = (s) => String(s ?? '').split(/(?<=\.)\s/)[0].replace(/\.$/, '');
// Figma's node line is short meta ("9 have no pair", "Static score 85.3"), read from the node's own detail
const SHORT = {
  // 429 checks of 105 pairs (each pair in 4 themes): say both, as the data means (final audit, 21 Nov)
  contrast: (d) => (d.match(/(\d+) checks across (\d+) pairs/) ? `${d.match(/(\d+) checks across (\d+) pairs/)[1]} checks across ${d.match(/(\d+) checks across (\d+) pairs/)[2]} pairs` : d.match(/fails: (\d+) failing/) ? `${d.match(/fails: (\d+) failing/)[1]} failing` : null),
  // the node counts parts that have a contract, not contracts that match (data check, 22 Nov)
  contracts: (d) => (d.match(/(\d+) of (\d+)/) ? `${d.match(/(\d+) of (\d+)/)[1]} of ${d.match(/(\d+) of (\d+)/)[2]} have a contract` : null),
  stories: (d) => {
    const m = d.match(/(\d+) of (\d+)/);
    if (!m) return null;
    const left = Number(m[2]) - Number(m[1]);
    return left ? `${left} have no story` : 'All have a story';
  },
  gate: (d) => (d.match(/(\d+) of (\d+)/) ? `${d.match(/(\d+) of (\d+)/)[0]} gate checks pass` : 'Not run yet'),
  // the composite leans on the last paid agent run: its day goes with the score, and over a week old it says stale
  // (coordinator, 22 Nov: "74.9 · 12 Nov", marked stale; a re-run needs her yes)
  bench: (d) => {
    const score = d.match(/Composite ([\d.]+)/)?.[1];
    if (!score) return null;
    const run = d.match(/the (\d{4})(\d{2})(\d{2})-\d{6}-[\w-]+ agent run/);
    if (!run) return `Score ${score} · static only`;
    const at = new Date(`${run[1]}-${run[2]}-${run[3]}T12:00:00`);
    const stale = Date.now() - at > 7 * 86400000;
    return `Score ${score} · ${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${stale ? ', stale' : ''}`;
  },
  review: () => 'Accept or Undo',
  // GitHub's newest CI run: its result and day ("Passed 19 Nov")
  ci: (d) => (d.match(/^CI (passed|failed|ended \w+) on (\d{1,2} \w{3})/) ? `${d.match(/^CI (passed|failed|ended \w+) on (\d{1,2} \w{3})/)[1].replace(/^./, (c) => c.toUpperCase())} ${d.match(/^CI (passed|failed|ended \w+) on (\d{1,2} \w{3})/)[2]}` : /^CI is running/.test(d) ? 'Running now' : 'No run read'),
  // the role, never a person (Many users, not one: 20 Nov)
  ship: () => 'A maintainer merges',
  compare: (d, n) => (n.state === 'ok' ? 'Figma matches the code' : 'Not compared yet'),
};
// a blocked node says what it waits on; anything left is cut to its first clause
const metaOf = (n) => n.meta ?? (n.blockedBy ? `Waits on ${plain(n.blockedBy.name)}` : null) ?? SHORT[n.id]?.(String(n.detail ?? ''), n) ?? plain(first(n.detail)).split(/[;(,:]/)[0].trim();
// the paths by the names Connectors and Figma give them
const plain = (t) => String(t ?? '').replace(/\bFigma REST( API)?\b/g, 'figma-rest').replace(/\bserver\/\.env\b/g, "CHIP's settings").replace(/\b[A-Z][A-Z_]{3,}=<?token>?/g, 'a token');
// a count only where the node's own detail has one ("71 of 73" → 2 still to do)
function countOf(node) {
  const m = String(node.detail ?? '').match(/(\d+) of (\d+)/);
  const left = m ? Number(m[2]) - Number(m[1]) : 0;
  return left > 0 ? left : null;
}

/** The pipeline's nodes from /map, with the three Figma paths folded into one "Figma" node. */
function useNodes() {
  const { data, error } = useCached(['/map']);
  if (error) return { error: true };
  if (!data) return null;
  const all = data[0].nodes ?? [];
  const byId = Object.fromEntries(all.map((n) => [n.id, n]));
  const paths = FIGMA_PATHS.map((id) => byId[id]).filter(Boolean);
  const live = paths.filter((p) => p.state === 'ok').length;
  byId.figma = {
    id: 'figma',
    name: 'Figma',
    state: live ? 'ok' : paths.some((p) => p.state === 'bad') ? 'bad' : 'unknown',
    meta: `${live} of ${paths.length} paths live`,
    detail: live ? `${live} of ${paths.length} ways to read Figma answer.` : 'No way to read Figma answers yet. Any one path is enough.',
    deps: [],
    dependents: ['Compare with Figma'],
    href: '#/connectors',
  };
  return { byId, all };
}

function NodeCard({ node, open, onOpen }) {
  const [word, tone] = SAYS[node.state] ?? SAYS.unknown;
  const count = countOf(node);
  return (
    <Card onClick={() => onOpen(node.id)} ariaLabel={`${node.name}: ${word}${open ? ', open below' : ''}`}>
      <Flow gap={8}>
        {/* the count at the title row's right end as the count Tag the board lanes use: filled in the attention
            tone where the node needs you, the neutral count otherwise (READ FIRST, board lanes) */}
        <Flow direction="row" gap={8} justify="between" align="center">
          <TextStack title={node.name} />
          {count ? node.state === 'bad' || node.state === 'warn' ? <Tag variant="solid" tone="attention">{count}</Tag> : <Tag tone="count">{count}</Tag> : null}
        </Flow>
        {/* Figma's node line is in the reading face */}
        <TextStack body={metaOf(node)} />
        {/* a part's own status is a Status dot plus one word, no Tag (READ FIRST; audit 4, item 4) */}
        <StatusDot tone={dotTone(tone)} label={word} />
      </Flow>
    </Card>
  );
}

function Detail({ node, byId }) {
  const [word, tone] = SAYS[node.state] ?? SAYS.unknown;
  const [busy, setBusy] = useState(false);
  const test = () => {
    setBusy(true);
    fetch('/host/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ server: node.action.server }) })
      .catch(() => null)
      .finally(() => (setBusy(false), window.dispatchEvent(new Event('chip:changed'))));
  };
  // the fix: what blocks it first, then its own test; Figma links go to Connectors
  const blocker = node.blockedBy ? byId[node.blockedBy.id] : null;
  const action = blocker ? (
    <Button variant="secondary" size="sm" href="#/connectors">
      {`Set up ${plain(blocker.name)}`}
    </Button>
  ) : node.href ? (
    <Button variant="secondary" size="sm" href={node.href}>
      Open Connectors
    </Button>
  ) : node.action?.type === 'test' ? (
    <Button variant="secondary" size="sm" onClick={test} disabled={busy}>
      {busy ? 'Testing…' : 'Test it'}
    </Button>
  ) : null;
  const waits = (node.deps ?? []).map((id) => byId[id]).filter(Boolean);
  return (
    <Card footerAction={action}>
      <Flow gap={16}>
        <Flow gap={8}>
          <TextStack title={node.name} body={plain(node.detail)} />
          <StatusDot tone={dotTone(tone)} label={word} />
        </Flow>
        {/* Figma's wires, as words until the connector part lands: a failing one shows red */}
        {waits.length ? (
          <Flow gap={4}>
            <TextStack overline="Waits on" />
            <Flow as="ul" direction="row" gap={16} wrap aria-label={`${node.name} waits on`}>
              {waits.map((d) => (
                <li key={d.id}>
                  <StatusDot tone={d.state === 'bad' ? 'danger' : DOT[d.state] ?? 'neutral'} label={plain(d.name)} />
                </li>
              ))}
            </Flow>
          </Flow>
        ) : null}
        {node.dependents?.length ? (
          <Flow gap={4}>
            <TextStack overline="Feeds" body={node.dependents.join(', ')} />
          </Flow>
        ) : null}
      </Flow>
    </Card>
  );
}

export default function SystemMapContent() {
  const narrow = useNarrow();
  const got = useNodes();
  const [only, setOnly] = useState(false);
  const [openId, setOpenId] = useState(null);
  // the board fits the stage where four steps stay readable; below that it opens at 100% and scrolls sideways
  const roomy = !useNarrow(1440);
  const [zoom, setZoom] = useState(null);
  // on a phone the detail card is below the stage: bring it into view
  const openNode = (id) => {
    setOpenId(id);
    if (narrow) requestAnimationFrame(() => document.getElementById('map-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  if (!got) return <EmptyState size="page" title="Drawing the map" line="Asking every check how it's doing. Two ticks." />;
  if (got.error) return <EmptyState size="page" title="The map isn't answering" line="CHIP couldn't read its checks just now. Refresh and I'll ask again." />;

  const { byId } = got;
  const steps = STEPS.map((s) => ({ ...s, nodes: s.ids.map((id) => byId[id]).filter(Boolean) }));
  const nodes = steps.flatMap((s) => s.nodes);
  // the summary counts the tags on screen, word for word (audit 21 Nov: "5 not known" over 4 tags)
  const needs = nodes.filter((n) => n.state === 'bad');
  const healthy = nodes.filter((n) => n.state === 'ok').length;
  const unknown = nodes.filter((n) => (SAYS[n.state] ?? SAYS.unknown)[0] === 'Not known').length;
  const partly = nodes.filter((n) => n.state === 'warn').length;
  // opens on the first node that needs you, as Figma opens on Compare with Figma
  const open = byId[openId] ?? needs[0] ?? nodes.find((n) => n.state !== 'ok') ?? nodes[0];
  const shown = (s) => (only ? s.nodes.filter((n) => n.state === 'bad') : s.nodes);
  const sentence = needs.length ? `${needs.map((n) => plain(n.name)).join(' and ')} ${needs.length === 1 ? 'needs' : 'need'} you.` : 'Nothing needs you.';

  // a step is its name and its nodes, no number plate (Elleta, 21 Nov late: "take the lane numbers off")
  const stepCol = (s) => (
    <Flow key={s.name} gap={12} aria-label={s.name}>
      <TextStack title={s.name} />
      {shown(s).length ? shown(s).map((n) => <NodeCard key={n.id} node={n} open={n === open} onOpen={openNode} />) : <TextStack subtitle="Nothing here needs you" />}
    </Flow>
  );

  return (
    <>
      <Card>
        <Flow gap={16}>
          <SectionHead icon="Map" iconTone="success" title="BELLA pipeline" description={sentence} showDescription number={needs.length} words={`need you · ${healthy} healthy${partly ? ` · ${partly} not all run` : ''} · ${unknown} not known`} showNumber />
          {/* a filter that says what it does; the count is already in the head ("3 need you") */}
          <Flow direction="row" gap={8} wrap>
            <FilterChip pressed={only} onClick={() => setOnly(!only)}>
              Show only what needs you
            </FilterChip>
          </Flow>
          {/* the board: four steps side by side at full size in Stage's frame, Fit or 100%; at 100% it scrolls sideways
              (Elleta, 22 Nov). Inside the frame the steps stand on a plain stage, the map's tinted ground, 16 further in at
              the sides so the cards' resting shadow fades before the frame's edge (rule 16). */}
          <Stage grid="none" label="BELLA pipeline board" frameWidth={BOARD} zoom={zoom ?? (roomy ? 'fit' : 'actual')} onZoomChange={setZoom}>
            <Stage grid="none">
              <Flow direction="row" gap={24} equal stretch inset>
                {steps.map(stepCol)}
              </Flow>
            </Stage>
          </Stage>
        </Flow>
      </Card>
      {open ? (
        <Flow id="map-detail" aria-live="polite">
          <Detail node={open} byId={byId} />
        </Flow>
      ) : null}
    </>
  );
}
