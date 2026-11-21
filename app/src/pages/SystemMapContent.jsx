// Processes · content (approved layout, /screens/2026-11-22-processes/): the list of maps on the
// left, the picked map in the middle as a board you pan and zoom, the picked step's detail on
// the right. Three maps from real sources:
// - BELLA pipeline: CHIP's own /map (each check's state, detail, what it waits on and feeds).
// - Agent workflow: the Relay rules in CHIP's CLAUDE.md (who does what, where you answer).
// - Audits and skills: the "Course skills run without being asked" rules, the gate and the
//   pre-commit hook in CHIP's CLAUDE.md and BELLA's READ FIRST block.
// BELLA parts and the template's Flow only; no page CSS.
//
// The board is a board at every width (22 Nov: it never collapses into a list): its rows stay
// side by side at full size in Stage's frame with Fit / 100%; at 100% you pan by scrolling or by
// dragging the board.
//
// Marked holes (BELLA has no part for these yet; the board's spot carries data-hole):
// - connector: curved lines between steps that follow them, the picked step's lines in blue
//   (MapLine is straight pieces and a 24 turn; no part joins two nodes by their measured places).
//   Until it lands, a step's links are its Waits on and Feeds in the detail. Lines that skip a
//   step: A (every line, round the side) is the pick on the review page, still waiting on hers.
// - zoom-steps: zoom in and zoom out beside Fit and 100% (Stage has Fit and 100% only).
// - node-box: a flat bordered node; the steps are ListRows (selected = light blue), no box.
// - audit-reports: the last result of each audit and check; CHIP has no read route for
//   docs/reference/audit/<date>/ yet, so each says Not measured.
// - skeleton: the board's loading state (no skeleton part); the empty state stands in.
// - share link: the page reads ?map=&step=, but the shell's router opens #/system-map only without
//   a query (main.jsx), so the address is not written yet.
import { useLayoutEffect, useRef, useState } from 'react';
import Card from '@bella/components/Card/Card';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Button from '@bella/components/Button/Button';
import ListRow from '@bella/components/ListRow/ListRow';
import Select from '@bella/components/Select/Select';
import Stage from '@bella/components/Stage/Stage';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import useNarrow from '../templates/useNarrow.js';
import { planRun } from '../templates/RunPlan.jsx';

const SLOTS = 4;
const FIGMA_PATHS = ['figma', 'figma-console', 'figma-rest'];
// a step's state in words and tone; a step with no entry is a role in the workflow, nothing to measure
const SAYS = {
  ok: ['Healthy', 'success'],
  warn: ['Not all run', 'attention'],
  bad: ['Needs you', 'attention'],
  blocked: ['Blocked', 'neutral'],
  unknown: ['Not known', 'neutral'],
  you: ['Your click', 'attention'],
  unmeasured: ['Not measured', 'neutral'],
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

// the approved rows: sources, what builds on tokens, the checks, the gate, ship
const PIPELINE_ROWS = [
  { label: 'Sources', ids: [null, 'tokens', 'figma', null] },
  { label: '', ids: [null, 'contracts', 'components', null] },
  { label: 'Checks', ids: ['contrast', 'stories', 'agents', 'compare'] },
  { label: 'Gate', ids: [null, 'gate', 'bench', null] },
  { label: 'Ship', ids: [null, 'review', 'ci', null] },
  { label: '', ids: [null, 'ship', null, null] },
];
// runs a step can start: each opens its plan first, nothing runs from here
const PIPELINE_RUNS = {
  gate: { label: 'Run the gate', brief: 'Run the gate in BELLA (npm run gate) and report each of its checks: pass or fail, and why.' },
  stories: { label: 'Run the stories', brief: 'Run the stories and visual tests in BELLA and report what passed, what failed and on which commit.' },
  bench: { label: 'Run the bench', brief: 'Run the static bench on BELLA and report the composite score beside the last one.' },
};

function usePipeline() {
  const { data, error, at, reload, loading } = useCached(['/map']);
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
  for (const row of PIPELINE_ROWS)
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
  // a missing id means /map no longer sends it: its slot stays empty
  const rows = PIPELINE_ROWS.map((r) => ({ ...r, ids: r.ids.map((id) => (id && steps[id] ? id : null)) }));
  return { steps, rows, at, reload, loading };
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
const AGENT_ROWS = [
  { label: 'You ask', ids: [null, 'ask', null, null] },
  { label: 'Coordinator', ids: [null, 'coord', null, null] },
  { label: 'Sessions', ids: ['figma', 'code', 'pics', null] },
  { label: 'Check', ids: [null, 'fresh', 'click', null] },
  { label: 'You answer', ids: [null, 'review', 'answers', null] },
  { label: 'Lands', ids: [null, 'publish', 'push', null] },
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
const MOMENTS = ['Every Figma write', 'Before every report', 'Before a commit', 'Before merge or push', 'Before a publish', 'Weekly'];

function staticMaps() {
  const agents = Object.fromEntries(
    AGENT_STEPS.map(([id, name, state, detail, deps]) => [
      id,
      { id, name, state, line: null, detail, more: state === 'unmeasured' ? 'Its state is not measured: CHIP keeps no record of this step yet.' : null, deps, run: AGENT_RUNS[id] },
    ]),
  );
  const audits = Object.fromEntries(
    AUDIT_STEPS.map(([id, name, detail, at, skill]) => [
      id,
      {
        id,
        name,
        // HOLE audit-reports: CHIP reads no audit result yet (no read route for the audit folder), so every check says so
        state: 'unmeasured',
        line: null,
        detail,
        more: skill ? 'Its last report is not measured: reports save in the audit folder, which CHIP does not read yet.' : 'Its last result is not measured: CHIP keeps no record of this check yet.',
        at,
        run: skill ? { label: 'Run it', brief: `Run the ${name} skill, read-only, and save its report to docs/reference/audit/<today>/${name}.md. Compare its scores with the last report.` } : AUDIT_RUNS[id],
      },
    ]),
  );
  return {
    agents: { steps: agents, rows: AGENT_ROWS },
    audits: {
      steps: audits,
      // a row per moment: the checks it runs sit in its row, so the link reads without a line
      rows: MOMENTS.map((m) => {
        const ids = AUDIT_STEPS.filter((s) => s[3].includes(m)).map((s) => s[0]);
        return { label: m, ids: [...ids, ...Array(SLOTS - ids.length).fill(null)] };
      }),
    },
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
const needing = (map) => Object.values(map.steps).filter((s) => s.state === 'bad' || s.state === 'you');
function metaOfMap(map) {
  if (!map) return 'Reading the map';
  const n = needing(map).length;
  if (n) return `${n} ${n === 1 ? 'needs' : 'need'} you`;
  return Object.values(map.steps).every((s) => s.state === 'unmeasured') ? 'Not measured' : 'Nothing needs you';
}
function summaryOf(map) {
  const n = needing(map);
  if (n.length) return `${n.map((s) => s.name).join(', ').replace(/, ([^,]*)$/, ' and $1')} ${n.length === 1 ? 'needs' : 'need'} you.`;
  if (Object.values(map.steps).every((s) => s.state === 'unmeasured')) return 'Not measured: CHIP reads no result for these steps yet.';
  return 'Nothing needs you.';
}

// the nearest box that scrolls around an element (Stage's frame at 100%)
function scroller(el) {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (/(auto|scroll)/.test(s.overflowX + s.overflowY) && (e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight)) return e;
  }
  return null;
}

// the box the stage scrolls in, overflowing or not
function scrollBox(el) {
  for (let e = el; e && !e.matches('[data-bella-component="stage"]'); e = e.parentElement) if (/(auto|scroll)/.test(getComputedStyle(e).overflowX)) return e;
  return null;
}

/* Drag the board to pan: moves whatever box scrolls around it. */
function usePan() {
  const drag = useRef(null);
  return {
    onPointerDown: (e) => {
      if (e.button !== 0 || e.target.closest('button, a, input, select')) return;
      const box = scroller(e.currentTarget);
      if (!box) return;
      drag.current = { box, x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d) return;
      d.box.scrollLeft = d.left - (e.clientX - d.x);
      d.box.scrollTop = d.top - (e.clientY - d.y);
    },
    onPointerUp: () => (drag.current = null),
    onPointerCancel: () => (drag.current = null),
  };
}

function Node({ step, picked, onPick }) {
  const said = SAYS[step.state];
  return (
    <ListRow
      as="div"
      layout="stacked"
      title={step.name}
      description={step.line ?? undefined}
      helperText={said ? <StatusDot tone={said[1]} label={said[0]} /> : undefined}
      selected={picked}
      onClick={() => onPick(step.id)}
    />
  );
}

// a step column is at least this wide on screen, so its name sits whole at 100%
const COLUMN = 250;

function Board({ map, filterOnly, picked, onPick, zoom, onZoom, label }) {
  const pan = usePan();
  // the visible width of the board: the board is four columns, and k of them fill the view exactly, so the
  // first view never cuts a name at its edge; the rest are a pan away
  const [view, setView] = useState(null);
  useLayoutEffect(() => {
    const box = scrollBox(document.getElementById('process-board'));
    if (!box) return undefined;
    const measure = () => setView((v) => (v === box.clientWidth ? v : box.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  const k = view ? Math.max(1, Math.min(SLOTS, Math.floor(view / COLUMN))) : SLOTS;
  const pitch = view ? view / k : COLUMN;
  // equal slots 16 apart in the frame (its 1px edge each side): a column and its gap are one pitch
  const frame = Math.round(SLOTS * pitch - 14);
  // open on whole columns that hold the picked step, lined up on the view's left edge
  useLayoutEffect(() => {
    if (!view || zoom !== 'actual') return;
    const box = scrollBox(document.getElementById('process-board'));
    const row = document.querySelector('#process-board [data-slots]');
    if (!box || !row) return;
    const x0 = row.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    const col = Math.max(0, map.rows.reduce((c, r) => (r.ids.includes(picked) ? r.ids.indexOf(picked) : c), 0));
    // of the views that hold the picked step, the one that shows the most steps
    const count = (c) => map.rows.reduce((n, r) => n + r.ids.slice(c, c + k).filter(Boolean).length, 0);
    let best = Math.min(col, SLOTS - k);
    for (let c = Math.max(0, col - k + 1); c <= Math.min(col, SLOTS - k); c += 1) if (count(c) > count(best)) best = c;
    box.scrollLeft = x0 + best * pitch;
  }, [map, zoom, view, k]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (id) => id && map.steps[id] && (!filterOnly || map.steps[id].state === 'bad');
  // HOLE zoom-steps: zoom in and out wait on BELLA Stage (it has Fit and 100% only)
  return (
    <Stage grid="dots" label={`${label} board`} frameWidth={frame} zoom={zoom} onZoomChange={onZoom}>
      {/* HOLE connector: the curved lines between steps (the picked step's in blue) wait on a BELLA part that
          joins two nodes by their measured places; the gutters between rows are where they draw */}
      <Flow gap={24} id="process-board" data-hole="connector zoom-steps node-box" {...pan}>
        {map.rows.map((row, i) => (
          // the row's name over its four slots, so every row's steps line up in columns
          <Flow key={`${row.label}-${i}`} gap={8} role="group" aria-label={row.label || `${label}, row ${i + 1}`}>
            {row.label ? <TextStack overline={row.label} /> : null}
            <Flow direction="row" gap={16} equal data-slots>
              {/* each slot is its own box, so a step's padding never widens its column */}
              {row.ids.map((id, j) => (
                <Flow key={id ?? `gap-${j}`} gap={0}>
                  {shown(id) ? <Node step={map.steps[id]} picked={picked === id} onPick={onPick} /> : null}
                </Flow>
              ))}
            </Flow>
          </Flow>
        ))}
      </Flow>
    </Stage>
  );
}

function Detail({ map, mapId, step, onPick }) {
  const said = SAYS[step.state];
  const feeds = Object.values(map.steps).filter((s) => (s.deps ?? []).includes(step.id));
  const waits = (step.deps ?? []).map((id) => map.steps[id]).filter(Boolean);
  const dotOf = (s) => {
    const x = SAYS[s.state];
    // the step's name, then its dot with a word, never colour alone; the two wrap apart in a narrow card
    return (
      <Flow direction="row" gap={8} align="center" wrap>
        <TextStack body={s.name} />
        {x ? <StatusDot tone={s.state === 'bad' ? 'danger' : x[1]} label={x[0]} /> : null}
      </Flow>
    );
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
    <Button variant="secondary" size="sm" href="http://localhost:3123/screens/progress/">
      Open review pages
    </Button>
  ) : null;
  const list = (title, items, render) =>
    items.length ? (
      <Flow gap={4}>
        <TextStack overline={title} />
        <Flow as="ul" gap={4} aria-label={`${step.name}: ${title.toLowerCase()}`}>
          {items.map(render)}
        </Flow>
      </Flow>
    ) : null;
  return (
    <Card footerAction={action}>
      <Flow gap={16} aria-live="polite">
        <Flow gap={8}>
          <SectionHead title={step.name} titleLevel={3} showInfo={false} />
          {said ? <StatusDot tone={said[1]} label={said[0]} /> : null}
          {step.line ? <TextStack meta={step.line} /> : null}
          <TextStack body={step.detail} />
        </Flow>
        {/* anything that needs you says why, from its source */}
        {step.state === 'bad' || step.state === 'you' ? (
          <Disclosure title="Why this?">
            <TextStack body={step.why ?? `Its own check reports it: ${step.more ?? step.detail} Read from CHIP's map of BELLA's checks.`} />
          </Disclosure>
        ) : step.more ? (
          <Disclosure title="More">
            <TextStack body={step.more} />
          </Disclosure>
        ) : null}
        {list('Waits on', waits, (d) => <li key={d.id}>{dotOf(d)}</li>)}
        {list('Runs at', step.at ?? [], (m) => (
          <li key={m}>
            <TextStack body={m} />
          </li>
        ))}
        {list('Feeds', feeds, (d) => <li key={d.id}>{dotOf(d)}</li>)}
      </Flow>
    </Card>
  );
}

// opens on the step that needs you: one that needs you, then one waiting on your click, then the first
const firstPick = (map) => {
  const all = map.rows.flatMap((r) => r.ids).filter(Boolean).map((id) => map.steps[id]);
  return (all.find((s) => s.state === 'bad') ?? all.find((s) => s.state === 'you') ?? all[0])?.id;
};

// the address names the map and the step, so a view can be shared: #/system-map?map=agents&step=push
const fromHash = () => Object.fromEntries(new URLSearchParams(window.location.hash.split('?')[1] ?? ''));
const timeOf = (t) => (t ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null);

export default function SystemMapContent() {
  const pipeline = usePipeline();
  const [statics] = useState(staticMaps);
  const pushes = useCached(['/push/bella', '/push/chip']);
  const agents = withPush(statics.agents, pushes.data);
  const audits = statics.audits;
  const start = fromHash();
  const [mapId, setMapId] = useState(MAPS.some((m) => m.id === start.map) ? start.map : 'pipeline');
  const [picks, setPicks] = useState(start.step ? { [start.map ?? 'pipeline']: start.step } : {});
  const [only, setOnly] = useState(false);
  const [zoom, setZoom] = useState(null);
  // below 1200 the map list becomes a Select over the board; below 720 the detail sits under it
  const listOut = useNarrow(1200);
  const stack = useNarrow(720);

  const maps = { pipeline: pipeline && !pipeline.error ? pipeline : null, agents, audits };
  const meta = MAPS.find((m) => m.id === mapId);
  const map = maps[mapId];
  const pickId = map ? (map.steps[picks[mapId]] ? picks[mapId] : firstPick(map)) : null;
  const step = map && pickId ? map.steps[pickId] : null;
  const pick = (id) => {
    setPicks((p) => ({ ...p, [mapId]: id }));
    if (stack) requestAnimationFrame(() => document.getElementById('process-step')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  // HOLE share link: the page reads ?map=&step=, but the shell's router (main.jsx) opens #/system-map only
  // without a query, so writing the address would break a reload; it is written once the router accepts it

  const list = listOut ? (
    <Select label="Map" value={mapId} onChange={setMapId} options={MAPS.map((m) => ({ value: m.id, label: m.name }))} />
  ) : (
    <Flow as="ul" gap={4} aria-label="Maps">
      {MAPS.map((m) => (
        <ListRow key={m.id} layout="stacked" title={m.name} meta={metaOfMap(maps[m.id])} selected={m.id === mapId} onClick={() => setMapId(m.id)} />
      ))}
    </Flow>
  );

  // HOLE skeleton: BELLA has no skeleton part yet, so the board's loading state is the empty state
  const board = !map ? (
    pipeline?.error ? (
      <EmptyState size="page" title="The map isn't answering" line="CHIP couldn't read its checks just now. Refresh and I'll ask again." />
    ) : (
      <EmptyState size="page" title="Drawing the map" line="Asking every check how it's doing. Two ticks." />
    )
  ) : (
    <Board key={mapId} map={map} filterOnly={mapId === 'pipeline' && only} picked={pickId} onPick={pick} zoom={zoom ?? 'actual'} onZoom={setZoom} label={meta.name} />
  );

  // how fresh it is: the read's time and Refresh, or the rules it is drawn from
  const live = mapId === 'pipeline' ? pipeline : mapId === 'agents' ? pushes : null;
  const fresh = live ? (
    <Flow direction="row" gap={8} align="center" wrap>
      <TextStack meta={live.at ? `Updated ${timeOf(live.at)} · ${meta.source}` : `Not read yet · ${meta.source}`} />
      <Button variant="tertiary" size="sm" onClick={live.reload} busy={Boolean(live.loading)}>
        Refresh
      </Button>
    </Flow>
  ) : (
    <TextStack meta={`Drawn from ${meta.source}`} />
  );

  const center = (
    <Flow gap={16}>
      <Flow gap={8}>
        {/* the map's name, then its one-line summary: what needs you */}
        <SectionHead title={meta.name} description={map ? summaryOf(map) : meta.sub} showDescription showInfo={false} />
        {fresh}
      </Flow>
      {mapId === 'pipeline' ? (
        <Flow direction="row" gap={8} wrap>
          <FilterChip pressed={only} onClick={() => setOnly(!only)}>
            Show only what needs you
          </FilterChip>
        </Flow>
      ) : null}
      {board}
    </Flow>
  );

  const detail = step ? (
    <Flow id="process-step" gap={16} aside={!stack}>
      <Detail map={map} mapId={mapId} step={step} onPick={pick} />
    </Flow>
  ) : null;

  const work = (
    <Flow direction={stack ? 'column' : 'row'} gap={24} grow={stack ? undefined : 'first'} align={stack ? undefined : 'start'}>
      {center}
      {detail}
    </Flow>
  );

  return (
    <Flow gap={24} span={12}>
      {listOut ? (
        <>
          {list}
          {work}
        </>
      ) : (
        <Flow direction="row" gap={24} grow="last" align="start">
          <Flow aside>{list}</Flow>
          {work}
        </Flow>
      )}
    </Flow>
  );
}
