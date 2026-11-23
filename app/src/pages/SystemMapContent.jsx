// Processes · content: the mind maps she picked (23 Nov, A · Mind map, /screens/2026-11-23-mindmap/). The list of
// maps on the left, the picked map in the middle as a mind map, the picked step's detail on the right. Three maps
// from real sources:
// - BELLA pipeline: CHIP's own /map (each check's state, detail, what it waits on and feeds).
// - Agent workflow: the Relay rules in CHIP's CLAUDE.md (who does what, where you answer).
// - Audits and skills: the "Course skills run without being asked" rules, the gate and the
//   pre-commit hook in CHIP's CLAUDE.md and BELLA's READ FIRST block.
// BELLA parts and the template's Flow only: MapLabel, Branch, MapLeaf, BranchGroup. The inline styles only place
// the parts at the points the page measures (the parts draw the look).
//
// Marked holes (BELLA has no part for these yet; the spot carries a HOLE comment):
// - branch-loop: a link between two steps leaves one step's right edge and reaches the other's. Branch is an S-curve
//   between two points and cannot loop out and back on one side, and has no arrowhead or end dot, so each link is two
//   Branch curves (out, down a lane in the gutter, back); direction is the highlight's pass, and the detail names it.
// - audit-reports: the last result of each audit and check; CHIP has no read route for
//   docs/reference/audit/<date>/ yet, so each says Not measured.
// - skeleton: the board's loading state (no skeleton part); the empty state stands in.
// - share link: the page reads ?map=&step=, but the shell's router opens #/system-map only without
//   a query (main.jsx), so the address is not written yet.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Button from '@bella/components/Button/Button';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import Branch from '@bella/components/Branch/Branch';
import BranchGroup from '@bella/components/BranchGroup/BranchGroup';
import MapLabel from '@bella/components/MapLabel/MapLabel';
import MapLeaf from '@bella/components/MapLeaf/MapLeaf';
import Stage from '@bella/components/Stage/Stage';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import useNarrow from '../templates/useNarrow.js';
import { planRun } from '../templates/RunPlan.jsx';
import StepPanel from './StepPanel.jsx';

const FIGMA_PATHS = ['figma', 'figma-console', 'figma-rest'];
// a step's state in words and tone; a step with no entry is a role in the workflow, nothing to measure
const SAYS = {
  ok: ['Healthy', 'success'],
  warn: ['Needs work', 'attention'],
  bad: ['Failing', 'danger'],
  blocked: ['Blocked', 'neutral'],
  unknown: ['Not measured', 'neutral'],
  you: ['Your click', 'attention'],
  unmeasured: ['Not measured', 'neutral'],
  // a saved audit report: its lights decide (docs/reference/audit/<date>/)
  red: ['Failing', 'danger'],
  yellow: ['Needs work', 'attention'],
  green: ['Healthy', 'success'],
};

/* ---------------------------------------------------------------- BELLA pipeline (/map) */

const first = (s) => String(s ?? '').split(/(?<=\.)\s/)[0].replace(/\.$/, '');
// the paths by the names Connectors and Figma give them
const plain = (t) => String(t ?? '').replace(/\bFigma REST( API)?\b/g, 'figma-rest').replace(/\bserver\/\.env\b/g, "CHIP's settings").replace(/\b[A-Z][A-Z_]{3,}=<?token>?/g, 'a token');
// a step's short line, read from its own detail ("86 of 88 have a contract", "Score 74.9 · 12 Nov, stale")
const SHORT = {
  contrast: (d) => {
    const m = d.match(/(\d+) checks across (\d+) pairs/);
    const f = d.match(/fails: (\d+) failing/);
    return m ? `${m[1]} checks across ${m[2]} pairs` : f ? `${f[1]} failing` : null;
  },
  contracts: (d) => {
    const m = d.match(/(\d+) of (\d+)/);
    return m ? `${m[1]} of ${m[2]} have a contract` : null;
  },
  stories: (d) => {
    const m = d.match(/(\d+) of (\d+)/);
    if (!m) return null;
    const left = Number(m[2]) - Number(m[1]);
    return left ? `${left} have no story` : 'All have a story';
  },
  gate: (d) => (d.match(/(\d+) of (\d+)/) ? `${d.match(/(\d+) of (\d+)/)[0]} gate checks pass` : 'Not run yet'),
  // the composite leans on the last paid agent run: its day goes with the score, over a week old it says stale
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
  ci: (d) => {
    const m = d.match(/^CI (passed|failed|ended \w+) on (\d{1,2} \w{3})/);
    return m ? `${m[1].replace(/^./, (c) => c.toUpperCase())} ${m[2]}` : /^CI is running/.test(d) ? 'Running now' : 'No run read';
  },
  // the role, never a person (Many users, not one: 20 Nov)
  ship: () => 'A maintainer merges',
  compare: (d, n) => (n.state === 'ok' ? 'Figma matches the code' : 'Not compared yet'),
};
const lineOf = (n) => n.meta ?? (n.blockedBy ? `Waits on ${plain(n.blockedBy.name)}` : null) ?? SHORT[n.id]?.(String(n.detail ?? ''), n) ?? plain(first(n.detail)).split(/[;(,:]/)[0].trim();

// the stages, in the picked order; a stage's hue is the same on every map where the stage repeats (Checks is navy)
const PIPELINE_GROUPS = [
  { label: 'Sources', hue: 'pink', ids: ['tokens', 'figma', 'contracts', 'components'] },
  { label: 'Checks', hue: 'navy', ids: ['contrast', 'stories', 'agents', 'compare'] },
  { label: 'Gate', hue: 'ochre', ids: ['gate', 'bench'] },
  { label: 'Ship', hue: 'stone', ids: ['review', 'ci', 'ship'] },
];
// runs a step can start: each opens its plan first, nothing runs from here
const PIPELINE_RUNS = {
  gate: { label: 'Run the gate', brief: 'Run the gate in BELLA (npm run gate) and report each of its checks: pass or fail, and why.' },
  stories: { label: 'Run the stories', brief: 'Run the stories and visual tests in BELLA and report what passed, what failed and on which commit.' },
  bench: { label: 'Run the bench', brief: 'Run the static bench on BELLA and report the composite score beside the last one.' },
};

function usePipeline() {
  const { data, error, at, reload, loading } = useCached(['/map'], { live: true });
  if (error && !data) return { error: true, reload };
  if (!data) return null;
  const all = data[0].nodes ?? [];
  const byId = Object.fromEntries(all.map((n) => [n.id, n]));
  // the three Figma paths are one step, "Figma"; with none live and the library key missing, it needs you
  const paths = FIGMA_PATHS.map((id) => byId[id]).filter(Boolean);
  const live = paths.filter((p) => p.state === 'ok').length;
  const keyMissing = byId['figma-key']?.state === 'bad';
  const figma = {
    id: 'figma',
    name: 'Figma',
    state: live ? 'ok' : keyMissing || paths.some((p) => p.state === 'bad') ? 'bad' : 'unknown',
    meta: `${live} of ${paths.length} paths live`,
    detail: live ? `${live} of ${paths.length} ways to read Figma answer.` : `No way to read Figma answers yet. Any one path is enough.${keyMissing ? ' The library file key is missing too.' : ''}`,
    deps: [],
    href: '#/connectors',
  };
  const steps = {};
  for (const row of PIPELINE_GROUPS)
    for (const id of row.ids) {
      if (!id) continue;
      const n = id === 'figma' ? figma : byId[id];
      if (!n) continue;
      steps[id] = {
        id,
        name: plain(n.name),
        state: n.state ?? 'unknown',
        line: lineOf(n),
        detail: first(plain(n.detail)) + '.',
        more: plain(n.detail).split(/(?<=\.)\s/).slice(1).join(' ') || null,
        deps: [...new Set((n.deps ?? []).map((d) => (FIGMA_PATHS.includes(d) ? 'figma' : d)))],
        blockedBy: FIGMA_PATHS.includes(n.blockedBy?.id) ? 'figma' : n.blockedBy?.id,
        href: n.href ?? (n.action?.type === 'test' ? '#/connectors' : undefined),
        run: PIPELINE_RUNS[id] ?? (n.action?.type === 'run' ? { label: n.action.label, brief: `${n.action.label} in BELLA and report the result.` } : undefined),
      };
    }
  // a missing id means /map no longer sends it: it is not drawn
  const groups = PIPELINE_GROUPS.map((g) => ({ ...g, ids: g.ids.filter((id) => steps[id]) })).filter((g) => g.ids.length);
  return { steps, groups, at, reload, loading };
}

/* ------------------------------------------------- Agent workflow (CHIP CLAUDE.md, Relay) */

// [id, name, state, detail, waits on]; a role CHIP keeps no record of says Not measured
const AGENT_STEPS = [
  ['ask', 'Your ask or mark-up', 'unmeasured', 'A message, a thumbs-down or a mark-up note on a review page. Each one lands in answers.json.', []],
  ['coord', 'Coordinator', 'unmeasured', 'Reads every answer newer than its last read, routes each one, and writes the brief with the rules pasted in.', ['ask', 'answers']],
  ['figma', 'Figma writer', 'unmeasured', 'One writer per Figma file, on the 01 · CHIP flows page; checks the file key before every write.', ['coord']],
  ['code', 'Code builder', 'unmeasured', 'Builds one page from BELLA parts on its own test server, then clicks every feature.', ['coord']],
  ['pics', 'Option pictures', 'unmeasured', 'A and B side by side at the same scale, the pick marked.', ['coord']],
  ['fresh', 'Fresh reviewer', 'unmeasured', 'A session that did not build it checks the work against the rules at 320 to 1440.', ['figma', 'pics', 'code']],
  ['click', 'Click test', 'unmeasured', 'An agent clicks each designed feature on the running app. It never presses anything that starts a paid run.', ['code']],
  ['review', 'Review page', 'unmeasured', 'Pictures side by side with a pick marked; thumbs, notes and Send all go to answers.json.', ['fresh', 'click']],
  ['answers', 'Your answers', 'unmeasured', 'The latest answer replaces an earlier one. A thumbs-down with no note means: find what is off and fix it.', ['review']],
  ['publish', 'Library publish', 'unmeasured', 'A library publish is your click, after the batch report. Agents never publish.', ['answers']],
  // measured from git: the commits a push would send (GET /push/<repo>)
  ['push', 'Push', 'unmeasured', 'Nothing is pushed or merged without your OK.', ['answers']],
];
// the steps CHIP can start for you: each opens its plan first
const AGENT_RUNS = {
  fresh: { label: 'Run a fresh review', brief: 'As a session that did not build it, review the latest CHIP change against the rules at 320, 768, 1024 and 1440, read-only, and report what fails.' },
  click: { label: 'Run the click test', brief: 'Click every designed feature in docs/reference/designed-features.md on a test CHIP server, read-only, never pressing anything that starts a paid run, and report what works and what does not.' },
};
const AGENT_GROUPS = [
  { label: 'You ask', hue: 'pink', ids: ['ask', 'coord'] },
  { label: 'Sessions', hue: 'blue', ids: ['figma', 'code', 'pics'] },
  { label: 'Check', hue: 'navy', ids: ['fresh', 'click'] },
  { label: 'You answer and land', hue: 'stone', ids: ['review', 'answers', 'publish', 'push'] },
];

/* ------------------------------------- Audits and skills (CHIP CLAUDE.md, BELLA READ FIRST) */

// [id, name, detail, moments it runs at, skill (a run opens its plan)]
const AUDIT_STEPS = [
  ['craft', 'craft-check', 'Ends every Figma write: how the parts are built. A pass is 0 findings or named exceptions, pasted in the report.', ['Every Figma write']],
  ['pixel', 'pixel-check', 'Ends every Figma write: sizes, edges and spacing measured at 1x. A pass is 0 findings or named exceptions.', ['Every Figma write']],
  ['sweep', 'data-sweep and click test', 'Every number on screen checked against its source, and every designed feature clicked on the running app.', ['Before every report']],
  ['hook', 'Pre-commit hook', 'Blocks a commit with a hex value or a px font size in the app, a failed build, or a private term.', ['Before a commit']],
  ['audit', 'npm audit', 'Runs in the check before each commit; fixes go in without major upgrades, the rest are listed.', ['Before a commit']],
  ['sec', 'security-review', 'Runs before any merge or push: every route that changes something refuses other websites.', ['Before merge or push']],
  ['copilot', 'Second review', 'Copilot challenges every plan and every diff; each finding is measured before it is passed on. Not reviewed never counts as a pass.', ['Before merge or push']],
  ['decided', 'decided-check', 'Its output goes in the batch-ready report before a library publish.', ['Before a publish']],
  ['tokarch', 'ds-token-architecture', 'Checks BELLA tokens against the three tiers. Runs before any token change, and weekly.', ['Before a publish', 'Weekly'], true],
  ['prodinsp', 'product-inspection', 'Inspects CHIP across ten stations; scores are compared with the last run. Weekly, and before a page is called done.', ['Weekly'], true],
  ['dsinsp', 'ds-inspection', 'Inspects BELLA across ten stations; scores are compared with the last run. Weekly.', ['Weekly'], true],
];
// checks CHIP can start on their own, read-only: each opens its plan first
const AUDIT_RUNS = {
  sweep: { label: 'Run it', brief: 'Run node scripts/data-sweep.mjs against a test CHIP server and report every number that does not match its source.' },
  audit: { label: 'Run it', brief: 'Run npm audit --omit=dev in CHIP and list what it finds; change nothing.' },
  sec: { label: 'Run it', brief: 'Run the security-review skill on CHIP, read-only, and report each finding with its route.' },
  copilot: { label: 'Run it', brief: 'Run npm run review on the latest CHIP commits, measure each finding, and report only the real ones.' },
};
// a stage a check; the moments it runs at stay in its detail ("Runs at") and link the checks that run together
const AUDIT_GROUPS = [
  { label: 'Every write or report', hue: 'pink', ids: ['craft', 'pixel', 'sweep'] },
  { label: 'Before a commit', hue: 'navy', ids: ['hook', 'audit'] },
  { label: 'Before merge, push or publish', hue: 'ochre', ids: ['sec', 'copilot', 'decided'] },
  { label: 'Weekly', hue: 'stone', ids: ['tokarch', 'prodinsp', 'dsinsp'] },
];

// the audits that leave a saved report (server/lib/audits.mjs reads docs/reference/audit/<date>/)
const REPORT_OF = { tokarch: 'tokens', prodinsp: 'product', dsinsp: 'ds' };
const dayOf = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function staticMaps(reports) {
  const agents = Object.fromEntries(
    AGENT_STEPS.map(([id, name, state, detail, deps]) => [
      id,
      { id, name, state, line: null, detail, more: null, deps, run: AGENT_RUNS[id] },
    ]),
  );
  const audits = Object.fromEntries(
    AUDIT_STEPS.map(([id, name, detail, at, skill]) => {
      // a step with a saved report says its score, its date and its lights; one without says Not measured
      const r = (reports ?? []).find((x) => x.id === REPORT_OF[id] && x.ran);
      const light = r ? (r.red ? 'red' : r.yellow ? 'yellow' : 'green') : 'unmeasured';
      return [
        id,
        {
          id,
          name,
          state: light,
          line: r ? `${r.value} ${r.unit} · ran ${dayOf(r.ran)}` : null,
          detail,
          more: r ? `${r.red} red, ${r.yellow} yellow${r.prev ? `; was ${r.prev.value} on ${dayOf(r.prev.day)}` : ''}.${r.orders?.length ? ` First work orders: ${r.orders.join('; ')}.` : ''}` : null,
          at,
          run: skill ? { label: 'Run it', brief: `Run the ${name} skill, read-only, and save its report to docs/reference/audit/<today>/${name}.md. Compare its scores with the last report.` } : AUDIT_RUNS[id],
        },
      ];
    }),
  );
  return {
    agents: { steps: agents, groups: AGENT_GROUPS },
    audits: { steps: audits, groups: AUDIT_GROUPS, shared: true },
  };
}

/* Push, measured: the commits a push would send in BELLA and in CHIP. With none read it says Not measured. */
function withPush(agents, pushes) {
  if (!pushes) return agents;
  const read = pushes.filter((x) => x && x.upstream);
  if (!read.length) return agents;
  const n = read.reduce((a, x) => a + x.commits.length, 0);
  const where = read.filter((x) => x.commits.length).map((x) => `${x.commits.length} in ${x.name} (${x.branch})`).join(', ');
  const push = {
    ...agents.steps.push,
    state: n ? 'you' : 'ok',
    line: n ? `${n} ${n === 1 ? 'commit' : 'commits'} to push` : 'Nothing to push',
    more: n ? `Waiting: ${where}.` : 'Every branch matches its upstream.',
    why: n ? 'A push needs your OK (CHIP CLAUDE.md, Relay: never push or merge without it). Read from git.' : null,
  };
  return { ...agents, steps: { ...agents.steps, push } };
}

/* ---------------------------------------------------------------- the page */

const MAPS = [
  { id: 'pipeline', name: 'BELLA pipeline', sub: 'Sources to ship: what each check waits on and feeds.', source: "CHIP's map of BELLA's checks" },
  { id: 'agents', name: 'Agent workflow', sub: 'From your ask to a change you approve: who does what, and where you answer.', source: "the Relay rules in CHIP's CLAUDE.md, pushes from git" },
  { id: 'audits', name: 'Audits and skills', sub: 'Each moment runs the checks in its row.', source: "the checks rules in CHIP's CLAUDE.md" },
];

// each map's one line: what needs you on it, counted from its steps' measured states
const needsYou = (s) => s.state === 'bad' || s.state === 'you' || s.state === 'red';
const needing = (map) => Object.values(map.steps).filter(needsYou);
function summaryOf(map) {
  const n = needing(map);
  if (n.length) return `${n.map((s) => s.name).join(', ').replace(/, ([^,]*)$/, ' and $1')} ${n.length === 1 ? 'needs' : 'need'} you.`;
  if (Object.values(map.steps).every((s) => s.state === 'unmeasured')) return 'Not measured: CHIP reads no result for these steps yet.';
  return 'Nothing needs you.';
}

/* A step as BELLA's MapLeaf: its name, a shape and its state word, then its measured line. State is the shape and the
   word, never the stage's colour. */
const LEAF_STATE = { ok: 'ok', green: 'ok', bad: 'attention', you: 'attention', warn: 'attention', yellow: 'attention', red: 'failed', blocked: 'blocked', unknown: 'unmeasured', unmeasured: 'unmeasured' };
function Leaf({ step, picked, related, onPick }) {
  const said = SAYS[step.state];
  return <MapLeaf name={step.name} state={LEAF_STATE[step.state] ?? 'unmeasured'} status={said ? said[0] : 'Not known'} detail={step.line ?? undefined} selected={picked} related={related} onSelect={() => onPick(step.id)} />;
}

// what a step is linked to: what it waits on and feeds; on the audits map, the checks that run at the same moment
function linksOf(map, id) {
  const s = map.steps[id];
  if (!s) return { waits: [], feeds: [], peers: [] };
  const all = Object.values(map.steps);
  if (map.shared) return { waits: [], feeds: [], peers: all.filter((o) => o.id !== id && (o.at ?? []).some((a) => (s.at ?? []).includes(a))).map((o) => o.id) };
  const waits = [...new Set([...(s.deps ?? []), ...(s.blockedBy ? [s.blockedBy] : [])])].filter((d) => map.steps[d] && d !== id);
  const feeds = all.filter((o) => (o.deps ?? []).includes(id) || o.blockedBy === id).map((o) => o.id);
  return { waits, feeds, peers: [] };
}

/* The mind map (Elleta picked A · Mind map, 23 Nov: /screens/2026-11-23-mindmap/): the map's name at the left, a
   Branch to each stage's name, a thin Branch from the name to each of its steps, one hue a stage. Steps stand
   in one column in the map's order, so no branch crosses another. A picked step draws its links in the gutter to
   the right of the steps: each a pair of Branch curves that leave one step's right edge and reach the other's, over
   the tree (draw-in 250ms, one soft pass of light, then rest). scripts/process-line-check.mjs measures all of it. */
const PHONE_BELOW = 520; // a map narrower than this is a BranchGroup a stage, one open at a time
const params = (w) => {
  const rootW = Math.round(Math.min(170, Math.max(100, w * 0.15)));
  const catW = Math.round(Math.min(150, Math.max(100, w * 0.22)));
  // room for the root's four branches to fan out of one point before they pass each other
  const catX = rootW + Math.round(Math.min(120, Math.max(72, w * 0.12)));
  const leafX = catX + catW + 28;
  const R = Math.round(Math.min(110, Math.max(48, w * 0.1)));
  return { rootW, catW, catX, leafX, R, leafW: w - R - leafX };
};
// the root's branches leave its right edge this far apart, top to bottom in stage order, so they fan out and never run as one strand
const ROOT_STEP = 20;
const GAP = 12; // between steps
const GROUP_GAP = 40; // between stages: room for a stage name to sit level with its steps' middle

function MindMap({ map, name, filterOnly, picked, onPick, w }) {
  const ref = useRef(null);
  const [geo, setGeo] = useState(null);
  const p = params(w);
  const groups = useMemo(() => map.groups.map((g) => ({ ...g, ids: g.ids.filter((id) => map.steps[id] && (!filterOnly || needsYou(map.steps[id]))) })).filter((g) => g.ids.length), [map, filterOnly]);
  const links = picked ? linksOf(map, picked) : { waits: [], feeds: [], peers: [] };
  const related = new Set([...links.waits, ...links.feeds, ...links.peers]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const leaves = {};
      el.querySelectorAll('[data-leaf]').forEach((n) => {
        const r = n.getBoundingClientRect();
        leaves[n.dataset.leaf] = { r: r.right - b.left, y: (r.top + r.bottom) / 2 - b.top, t: r.top - b.top, b: r.bottom - b.top };
      });
      const cats = [];
      el.querySelectorAll('[data-stage-label]').forEach((n, i) => (cats[i] = n.getBoundingClientRect().width));
      const rootW = el.querySelector('[data-root-label]')?.getBoundingClientRect().width ?? null;
      const key = JSON.stringify({ leaves, cats, rootW, h: el.offsetHeight });
      setGeo((was) => (was?.key === key ? was : { key, leaves, cats, rootW }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    document.fonts?.ready?.then(measure);
    return () => ro.disconnect();
  }, [map, groups, w]);
  const first = useRef(true);
  useEffect(() => {
    if (!geo) return undefined;
    const t = setTimeout(() => (first.current = false), 1000);
    return () => clearTimeout(t);
  }, [Boolean(geo)]); // eslint-disable-line react-hooks/exhaustive-deps
  const cy = (g) => (geo.leaves[g.ids[0]].y + geo.leaves[g.ids[g.ids.length - 1]].y) / 2;
  const rootY = geo && groups.length ? (cy(groups[0]) + cy(groups[groups.length - 1])) / 2 : 0;
  const drawn = [];
  const over = [];
  if (geo) {
    groups.forEach((g, i) => {
      const y = cy(g);
      drawn.push(<Branch key={`root-${g.label}`} hue={g.hue} weight="regular" draw={first.current ? 'map' : 'none'} from={{ x: (geo.rootW ?? p.rootW) + 8, y: rootY + (i - (groups.length - 1) / 2) * ROOT_STEP }} to={{ x: p.catX - 8, y }} />);
      g.ids.forEach((id) => drawn.push(<Branch key={`leaf-${id}`} hue={g.hue} weight="thin" draw={first.current ? 'map' : 'none'} from={{ x: p.catX + (geo.cats[i] ?? p.catW) + 8, y }} to={{ x: p.leafX - 2, y: geo.leaves[id].y }} />));
    });
    // HOLE branch-loop: BELLA's Branch has no loop that leaves and returns on one side, so a link is three curves
    // the links leave the picked step at their own height along its right edge, so none starts on another's point.
    // Arcs nest and never cross: from the top down, the steps above it nearest first, then the steps below it
    // farthest first (the farthest arc is the outer one, so it starts furthest from the middle of the edge)
    const all = [...links.waits.map((o) => ['w', o]), ...links.feeds.map((o) => ['f', o]), ...links.peers.map((o) => ['p', o])].filter(([, o]) => geo.leaves[o] && geo.leaves[picked]);
    const dist = ([, o]) => Math.abs(geo.leaves[o].y - geo.leaves[picked].y);
    const aboveMe = ([, o]) => geo.leaves[o].y < geo.leaves[picked].y;
    const specs = [...all.filter(aboveMe).sort((x, y) => dist(x) - dist(y)), ...all.filter((x) => !aboveMe(x)).sort((x, y) => dist(y) - dist(x))];
    const me = geo.leaves[picked];
    const nBelow = specs.filter((x) => !aboveMe(x)).length;
    const LANE = 8; // lanes in the gutter are this far apart
    specs.forEach(([k, o], i) => {
      const above = aboveMe([k, o]);
      // 12 apart at least, centred on the step's edge (a step's edge is 60 tall, so five links reach a little past it)
      const span = Math.max(me.b - me.t - 24, (specs.length - 1) * 12);
      const ay = specs.length === 1 ? me.y : me.y - span / 2 + (i * span) / (specs.length - 1);
      const O = geo.leaves[o];
      // the arc nests: the farther the other step, the farther out its lane
      const rank = above ? i : nBelow - 1 - (i - (specs.length - nBelow));
      const lane = Math.max(me.r, O.r) + 6 + 10 + rank * LANE;
      const P = { x: me.r + 6, y: ay };
      const Q = { x: O.r + 6, y: O.y };
      const sg = Q.y > P.y ? 1 : -1;
      const out = { from: P, to: { x: lane, y: P.y + sg * 14 } };
      const run = { from: { x: lane - 0.5, y: P.y + sg * 14 }, to: { x: lane + 0.5, y: Q.y - sg * 14 } };
      const back = { from: { x: lane, y: Q.y - sg * 14 }, to: Q };
      const flip = ({ from, to }) => ({ from: to, to: from });
      // a link runs the way the work does: a step it waits on, then the picked step; the picked step, then what it feeds
      const pieces = k === 'w' ? [flip(back), flip(run), flip(out)] : [out, run, back];
      pieces.forEach((pc, n) => over.push(<Branch key={`${picked}:${k}:${o}:${n}`} hue="blue" weight="regular" draw="pick" travel {...pc} />));
    });
  }
  return (
    <div ref={ref} data-mindmap="" style={{ position: 'relative', inlineSize: '100%' }}>
      <div style={{ position: 'relative', zIndex: 1, marginInlineStart: p.leafX, inlineSize: p.leafW, display: 'flex', flexDirection: 'column', gap: GROUP_GAP }}>
        {groups.map((g) => (
          <div key={g.label} role="group" aria-label={g.label} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
            {g.ids.map((id) => (
              <div key={id} data-leaf={id}>
                <Leaf step={map.steps[id]} picked={picked === id} related={related.has(id)} onPick={onPick} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* the root is a plain label on the map ground (her 22 Nov: "what even is that a card"): MapLabel's stage kind, bare text.
          BELLA GAP: MapLabel kind=root draws a card with a border and shadow and has no flat variant; named for the parts session. */}
      <MapLabel kind="stage" as="h3" style={{ position: 'absolute', insetInlineStart: 0, insetBlockStart: rootY, transform: 'translateY(-50%)', inlineSize: 'max-content', maxInlineSize: p.rootW, visibility: geo ? undefined : 'hidden' }}>
        <span data-root-label="">{name}</span>
      </MapLabel>
      {groups.map((g, i) => (
        <MapLabel key={g.label} kind="stage" style={{ position: 'absolute', insetInlineStart: p.catX, insetBlockStart: geo ? cy(g) : 0, transform: 'translateY(-50%)', inlineSize: 'max-content', maxInlineSize: p.catW, visibility: geo ? undefined : 'hidden' }}>
          <span data-stage-label={i}>{g.label}</span>
        </MapLabel>
      ))}
      <span aria-hidden="true" data-process-lines="" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        {drawn}
      </span>
      <span aria-hidden="true" data-process-links="" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
        {over}
      </span>
    </div>
  );
}

/* Phone: each stage is a BranchGroup, one open at a time, its steps inside; the detail sits under them. */
function PhoneMap({ map, name, filterOnly, picked, onPick }) {
  const groups = map.groups.map((g) => ({ ...g, ids: g.ids.filter((id) => map.steps[id] && (!filterOnly || needsYou(map.steps[id]))) })).filter((g) => g.ids.length);
  const [open, setOpen] = useState(null);
  const links = picked ? linksOf(map, picked) : { waits: [], feeds: [], peers: [] };
  const related = new Set([...links.waits, ...links.feeds, ...links.peers]);
  const shown = open ?? Math.max(0, groups.findIndex((g) => g.ids.includes(picked)));
  return (
    <Flow gap={8}>
      <MapLabel kind="stage" as="h3">
        {name}
      </MapLabel>
      {groups.map((g, i) => (
        <BranchGroup key={g.label} name={g.label} count={g.ids.length} hue={g.hue} open={shown === i} onToggle={() => setOpen(shown === i ? -1 : i)}>
          {g.ids.map((id) => (
            <Leaf key={id} step={map.steps[id]} picked={picked === id} related={related.has(id)} onPick={onPick} />
          ))}
        </BranchGroup>
      ))}
    </Flow>
  );
}

function Board({ map, name, filterOnly, picked, onPick, label }) {
  const wrap = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const box = wrap.current;
    if (!box) return undefined;
    const measure = () => setW((v) => (v === box.clientWidth ? v : box.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  return (
    <Stage grid="dots" label={`${label} map`}>
      {/* Esc clears the pick */}
      <div ref={wrap} style={{ inlineSize: '100%', minInlineSize: 0 }} onKeyDown={(e) => e.key === 'Escape' && picked && (e.stopPropagation(), onPick(null))}>
        {w ? (w >= PHONE_BELOW ? <MindMap map={map} name={name} filterOnly={filterOnly} picked={picked} onPick={onPick} w={w} /> : <PhoneMap map={map} name={name} filterOnly={filterOnly} picked={picked} onPick={onPick} />) : null}
      </div>
    </Stage>
  );
}

function Detail({ map, mapId, step, onPick }) {
  // a closed Disclosure still lays its text out under the rows below it, so its words are only drawn while it is open
  const [more, setMore] = useState(false);
  if (!map || !step)
    return (
      <Card>
        <Flow gap={8} aria-live="polite">
          <SectionHead title="Pick a step" titleLevel={3} showInfo={false} />
          <TextStack body="Its links to what it feeds and what it waits on draw in over the map." />
        </Flow>
      </Card>
    );
  const said = SAYS[step.state];
  // the same links the map draws over the tree for this step
  const lk = linksOf(map, step.id);
  const feeds = lk.feeds.map((id) => map.steps[id]);
  const waits = lk.waits.map((id) => map.steps[id]);
  const peers = lk.peers.map((id) => map.steps[id]);
  // one row a step: its name and its state in the same colour and words the map shows
  const rowOf = (s) => {
    const x = SAYS[s.state];
    return <ListRow key={s.id} layout="stacked" title={s.name} helperText={x ? <StatusDot tone={x[1]} label={x[0]} /> : undefined} onClick={() => onPick(s.id)} />;
  };
  const blocker = step.blockedBy ? map.steps[step.blockedBy] : null;
  const action = step.run ? (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        const title = step.run.label === 'Run it' ? `Run ${step.name}` : step.run.label;
        // the plan's step: a short title, the brief as its line
        planRun({ title, from: 'Processes', brief: step.run.brief, steps: [{ id: 'run', title, line: step.run.brief }] }).catch(() => null);
      }}
    >
      {step.run.label}
    </Button>
  ) : blocker ? (
    <Button variant="secondary" size="sm" onClick={() => onPick(blocker.id)}>
      {`Show ${blocker.name}`}
    </Button>
  ) : step.href ? (
    <Button variant="secondary" size="sm" href={step.href}>
      Open Connectors
    </Button>
  ) : mapId === 'agents' && step.id === 'review' ? (
    <Button variant="secondary" size="sm" href="#/work?filter=needs">
      Open review pages
    </Button>
  ) : null;
  const list = (title, items, render) =>
    items.length ? (
      <Flow gap={4}>
        <TextStack overline={title} />
        <ListRowGroup ariaLabel={`${step.name}: ${title.toLowerCase()}`}>{items.map(render)}</ListRowGroup>
      </Flow>
    ) : null;
  return (
    <Card footerAction={action}>
      <Flow gap={16} aria-live="polite">
        <Flow gap={8}>
          <SectionHead title={step.name} titleLevel={3} showInfo={false} />
          {said ? <StatusDot tone={said[1]} label={said[0]} /> : null}
          {step.line ? <TextStack meta={step.line} /> : null}
        </Flow>
        <StepPanel
          mapId={mapId}
          step={step}
          state={said?.[0] ?? 'Not measured'}
          what={plain(first(step.detail))}
          feeds={feeds.map((x) => ({ name: x.name, label: SAYS[x.state]?.[0] ?? 'Not measured' }))}
          waits={waits.map((x) => ({ name: x.name, state: x.state, label: SAYS[x.state]?.[0] ?? 'Not measured' }))}
        />
        {/* anything that needs you says why, from its source */}
        {step.state === 'bad' || step.state === 'you' ? (
          <Disclosure title="Why this?" open={more} onToggle={setMore}>
            {more ? <TextStack body={step.why ?? `Its own check reports it: ${step.more ?? step.detail} Read from CHIP's map of BELLA's checks.`} /> : null}
          </Disclosure>
        ) : step.more ? (
          <Disclosure title="More" open={more} onToggle={setMore}>
            {more ? <TextStack body={step.more} /> : null}
          </Disclosure>
        ) : null}
        {list('Waits on', waits, rowOf)}
        {list('Runs at', step.at ?? [], (m) => <ListRow key={m} layout="stacked" title={m} />)}
        {list('Runs with', peers, rowOf)}
        {list('Feeds', feeds, rowOf)}
      </Flow>
    </Card>
  );
}

// opens on the step that needs you: one that needs you, then one waiting on your click, then the first
const firstPick = (map) => {
  const all = map.groups.flatMap((g) => g.ids).map((id) => map.steps[id]);
  return (all.find((s) => s.state === 'bad') ?? all.find((s) => s.state === 'you') ?? all[0])?.id;
};

// the address names the map and the step, so a view can be shared: #/system-map?map=agents&step=push
const fromHash = () => Object.fromEntries(new URLSearchParams(window.location.hash.split('?')[1] ?? ''));
const timeOf = (t) => (t ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null);

export default function SystemMapContent() {
  const pipeline = usePipeline();
  const reports = useCached(['/audits'], { live: true });
  const statics = useMemo(() => staticMaps(reports.data?.[0]), [reports.data]);
  const pushes = useCached(['/push/bella', '/push/chip'], { live: true });
  const agents = withPush(statics.agents, pushes.data);
  const audits = statics.audits;
  const start = fromHash();
  const [mapId, setMapId] = useState(MAPS.some((m) => m.id === start.map) ? start.map : 'pipeline');
  const [picks, setPicks] = useState(start.step ? { [start.map ?? 'pipeline']: start.step } : {});
  const [only, setOnly] = useState(false);
  // the detail sits beside the map while the map keeps room to draw as a tree (900 for the map and the detail);
  // narrower, it goes under the map. Measured on the page, not the screen, because the menu takes room too.
  const page = useRef(null);
  const [pageW, setPageW] = useState(0);
  useLayoutEffect(() => {
    const el = page.current;
    if (!el) return undefined;
    const measure = () => setPageW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const phone = useNarrow(640);
  const stack = phone || (pageW > 0 && pageW < 900);

  const maps = { pipeline: pipeline && !pipeline.error ? pipeline : null, agents, audits };
  const meta = MAPS.find((m) => m.id === mapId);
  const map = maps[mapId];
  // a pick of null (Esc, or the same step again) clears it; a map never picked opens on the step that needs you
  const pickId = map ? (picks[mapId] === null ? null : map.steps[picks[mapId]] ? picks[mapId] : firstPick(map)) : null;
  const step = map && pickId ? map.steps[pickId] : null;
  const pick = (id) => {
    setPicks((p) => ({ ...p, [mapId]: id === pickId ? null : id }));
    if (id && id !== pickId && stack) requestAnimationFrame(() => document.getElementById('process-step')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  // HOLE share link: the page reads ?map=&step=, but the shell's router (main.jsx) opens #/system-map only
  // without a query, so writing the address would break a reload; it is written once the router accepts it

  // HOLE skeleton: BELLA has no skeleton part yet, so the board's loading state is the empty state
  const board = !map ? (
    pipeline?.error ? (
      <EmptyState size="page" title="The map isn't answering" line="CHIP couldn't read its checks just now. Refresh and I'll ask again." />
    ) : (
      <EmptyState size="page" title="Drawing the map" line="Asking every check how it's doing. Two ticks." />
    )
  ) : (
    <Board key={mapId} map={map} name={meta.name} filterOnly={only} picked={pickId} onPick={pick} label={meta.name} />
  );

  // the tools row the other pages use (23 Nov: "not following the pattern we already have for how to filter, sort
  // and select"): the maps as FilterChips with their counts, one on at a time, a Needs you chip that filters the
  // picked map, and on the right 'Updated 17:46 · Refresh' as Work's 'Checked 16:03 · Check again'
  const live = mapId === 'pipeline' ? pipeline : mapId === 'agents' ? pushes : null;
  const owed = map ? needing(map).length : 0;
  const total = map ? Object.keys(map.steps).length : 0;
  const tools = (
    <Flow direction={phone ? 'column' : 'row'} gap={8} align={phone ? undefined : 'center'} grow={phone ? undefined : 'first'}>
      <Flow direction="row" gap={8} align="center" role="group" aria-label="Maps" data-tools-chips="" style={{ overflowX: 'auto', minInlineSize: 0, maxInlineSize: '100%', whiteSpace: 'nowrap' }}>
        {MAPS.map((m) => (
          <FilterChip key={m.id} size="compact" pressed={m.id === mapId} onClick={() => setMapId(m.id)}>
            {maps[m.id] ? `${m.name} ${needing(maps[m.id]).length}` : m.name}
          </FilterChip>
        ))}
        <FilterChip size="compact" pressed={only} onClick={() => setOnly(!only)}>
          {`Needs you ${owed}`}
        </FilterChip>
      </Flow>
      <Flow direction="row" gap={8} align="center" data-tools-fresh="" style={{ whiteSpace: 'nowrap', flexShrink: 0, justifySelf: 'end' }}>
        {live ? (
          <>
            <TextStack subtitle={live.stale ?? (live.at ? `Updated ${timeOf(live.at)}` : 'Not read yet')} />
            <Button variant="tertiary" size="sm" icon="RefreshDouble" leadingIcon busy={Boolean(live.loading)} onClick={live.reload}>
              {live.loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </>
        ) : (
          <TextStack subtitle="Drawn from the rules" />
        )}
      </Flow>
    </Flow>
  );

  const center = (
    <Flow gap={16}>
      {tools}
      <Flow gap={8}>
        {/* the map's name, then its one-line summary: what needs you, then what is on screen in words */}
        <SectionHead title={meta.name} description={map ? summaryOf(map) : meta.sub} showDescription showInfo={false} />
        <TextStack subtitle={`Showing: ${only ? 'Needs you' : 'Everything'} · ${only ? owed : total} of ${total} steps`} />
      </Flow>
      {board}
    </Flow>
  );

  // the detail card stands from the first paint (a Pick a step card while the map is still being read)
  const detail = (
    <Flow id="process-step" gap={16} aside={!stack}>
      <Detail key={`${mapId}:${pickId}`} map={map} mapId={mapId} step={step} onPick={pick} />
    </Flow>
  );

  const work = (
    <Flow direction={stack ? 'column' : 'row'} gap={24} grow={stack ? undefined : 'first'} align={stack ? undefined : 'start'}>
      {center}
      {detail}
    </Flow>
  );

  return (
    <div ref={page} style={{ minInlineSize: 0 }}>
      <Flow gap={24} span={12}>
        {work}
      </Flow>
    </div>
  );
}
