// Two models of the work. workModel (below, first) is the count the shell, the Work panel and Team
// read: Needs you, Agent, Gate, Ready. boardModel (further down) is the Work board itself in her
// Notion lanes (22 Nov): Ideas, Next, Now, Shipped, Not doing.
import { useEffect, useMemo, useState } from 'react';
import useCached from '../templates/useCached.js';

const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/* The Table's "Who acts" (Figma 800:81240), by the kind of item: the role, never a person. */
// the role alone, no "a" (Elleta, 21 Nov: "can you removethe (a) from these seems like its not important")
const WHO_ACTS = { Git: 'maintainer', Fix: 'reviewer', Gate: 'developer', Check: 'developer' };
/* The branch an item names ("Merge chip/fix-llms-txt?", "BELLA's feat/chip-components is behind"); null when it names none. */
const branchIn = (t) => String(t).match(/\b(?:feat|fix|chip|chore|main|release)\/[\w.-]*\w/)?.[0] ?? null;

/* What a card opens in the new shell's drawer (WorkDrawer): a check's fix to
   review, or a shell with its command typed; null when there is nothing to open. */
const openOf = (n) =>
  n.action?.type === 'review' && n.action.check ? { kind: 'review', check: n.action.check } : n.action?.type === 'push' ? { kind: 'push', repo: n.action.repo, title: n.title } : n.action?.type === 'terminal' ? { kind: 'terminal', repo: n.action.repo, command: n.action.command, title: n.title } : null;

/* A Needs-you item as a card: the check's own name, not the raw error. */
function needCard(n) {
  const name = n.kind === 'Gate' || n.kind === 'Check' ? String(n.what ?? n.title).split(':')[0] : n.title;
  const failed = /fail/i.test(n.status);
  // The line is short meta in the subtext face: what kind and how risky.
  // The long detail is the same paragraph on every gate item, so it stays in
  // the review, never repeated on the board (19 Nov audit).
  // an agent can take a failed check (b21, rule A); pull, merge and push stay hers ("Push and merge: never moves up, always asks")
  const fixable = failed && (n.kind === 'Gate' || n.kind === 'Check') && n.action?.type === 'review';
  return { id: n.id, title: name, branch: branchIn(`${n.title} ${n.what ?? ''}`), who: WHO_ACTS[n.kind] ?? 'maintainer', line: [n.kind, n.risk ? `${n.risk} risk` : null].filter(Boolean).join(' · ') || undefined, status: n.status, tone: failed ? 'danger' : 'attention', failed, at: n.at, action: n.action?.label, fixable, check: n.action?.check, open: openOf(n) };
}

/* An agent run as a card, by where it is. */
// a time alone means today; any other day is named (data check, 22 Nov: yesterday's run read as today's)
const when = (t) => {
  const d = new Date(t);
  return d.toDateString() === new Date().toDateString() ? hhmm(t) : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${hhmm(t)}`;
};
function runCard(r, base) {
  // the card says what it is in plain words, "Agent run · 12:38" (Elleta's fix list, 21 Nov); the branch
  // stays on the item (sidebar filter, table, drawer meta line), never as the card's line. A run made from
  // another BELLA branch than today's says which.
  return { id: r.id, open: { kind: 'run', id: r.id }, title: r.title ?? 'Fix', branch: r.branch ?? null,
    line: ['Agent run', r.startedAt ? when(r.startedAt) : null, base && r.base && r.base !== base ? `from ${r.base}` : null].filter(Boolean).join(' · ') };
}

/* Who is working, one rule for the board, the sidebar, Team and Sessions (audit 3, 21 Nov:
   Team said "1 session working" and Sessions "Working · Figma" while the board said Agent 0).
   A relay lane counts as working only while it reports: one that has said nothing for
   QUIET_DAYS is quiet, not working (the Bar's own freshness window, server/lib/needs.mjs FRESH_DAYS). */
const DAY = 86400000;
export const QUIET_DAYS = 7;
export function laneState(l, now = Date.now()) {
  if (l.status !== 'working') return l.status;
  return l.updated && now - l.updated > QUIET_DAYS * DAY ? 'quiet' : 'working';
}
export const daysQuiet = (l, now = Date.now()) => Math.floor((now - l.updated) / DAY);
/* A relay lane at work, as an Agent card: the agent's name and its role. */
const laneCard = (l) => ({ id: `lane-${l.id}`, title: l.name, branch: null, line: ['Agent session', l.role].filter(Boolean).join(' · '), status: 'Working', tone: 'info', who: 'agent' });

/* Open pull requests by their CI and Claude Code sessions at work (/work/lanes, server/lib/lanes.mjs):
   CI running is At the gate, every check passed is Ready, sessions writing now are Agent. */
const prCard = (p) => ({
  id: p.id,
  title: p.title,
  branch: p.branch,
  line: ['Pull request', p.project, p.draft ? 'draft' : null].filter(Boolean).join(' · '), // her words: the number stays behind the link (open.href)
  status: p.lane === 'gate' ? 'CI running' : 'CI passed',
  tone: p.lane === 'gate' ? 'info' : 'success',
  who: p.lane === 'gate' ? 'gate' : 'reviewer',
  open: { kind: 'link', href: p.url },
});
const sessionCard = (x) => ({ id: x.id, title: `${x.count} Claude Code ${x.count === 1 ? 'session' : 'sessions'} in ${x.project}`, branch: null, line: `Agent session · active ${hhmm(x.last)}`, status: 'Working', tone: 'info', who: 'agent' });

export function workModel({ needs = [], runs = [], agents = [], runBase = null, lanes: extra = null }) {
  // a check an agent is already working on leaves Needs you (its run shows in Agent)
  const working = new Set(runs.filter((r) => ['starting', 'running', 'gate'].includes(r.status)).map((r) => r.title));
  const needsYou = needs.map(needCard).filter((c) => !(c.fixable && working.has(c.title))).sort((a, b) => Number(b.failed) - Number(a.failed) || (a.at ?? 0) - (b.at ?? 0));
  const by = (...s) => runs.filter((r) => s.includes(r.status));
  const lanes = [
    { id: 'needs', name: 'Needs you', cards: [...by('failed', 'login').map((r) => ({ ...runCard(r, runBase), status: 'Failed', tone: 'danger', who: 'developer', runBrief: r.brief ?? null })), ...needsYou] },
    { id: 'agent', name: 'Agent', cards: [...by('starting', 'running').map((r) => ({ ...runCard(r, runBase), status: 'Working', tone: 'info', who: 'agent' })), ...agents.filter((l) => laneState(l) === 'working').map(laneCard), ...(extra?.sessions ?? []).map(sessionCard)] },
    { id: 'gate', name: 'At the gate', cards: [...by('gate').map((r) => ({ ...runCard(r, runBase), status: 'Checking', tone: 'info', who: 'gate' })), ...(extra?.prs ?? []).filter((p) => p.lane === 'gate').map(prCard)] },
    { id: 'ready', name: 'Ready', cards: [...by('passed').map((r) => ({ ...runCard(r, runBase), status: 'Gate passed', tone: 'success', who: 'reviewer' })), ...(extra?.prs ?? []).filter((p) => p.lane === 'ready').map(prCard)] },
  ];
  // her moves (saved on the server, /work/moves): a card sits where she put it, keeping its own status
  const moves = extra?.moves ?? {};
  for (const l of lanes) for (const c of l.cards) c.home = l.id;
  const placed = lanes.map((l) => ({ ...l, cards: l.cards.filter((c) => !moves[c.id] || moves[c.id].lane === l.id) }));
  for (const l of lanes)
    for (const c of l.cards) {
      const to = moves[c.id]?.lane;
      if (to && to !== l.id) placed.find((x) => x.id === to)?.cards.unshift({ ...c, moved: true, line: [c.line, 'moved here by you'].filter(Boolean).join(' · ') });
    }
  const total = placed.reduce((s, l) => s + l.cards.length, 0);
  return { lanes: placed, total, brief: briefOf(placed), why: extra?.windowDays ? whyEmpty(extra) : null };
}

/* The Brief carries its own next step (Figma Flow 1, screen 1, "Fix the Figma key"): the top card's
   action, or for a card with none (an agent run) the drawer it opens, named for what it shows.
   The Brief counts the Needs you lane as the board shows it (failed runs included), so its
   number is the lane's number, filtered or not (audit 21 Nov: "2 things need you" over a lane of 3). */
function briefOf(lanes) {
  const needs = lanes.find((l) => l.id === 'needs')?.cards ?? [];
  const agent = lanes.find((l) => l.id === 'agent')?.cards.length ?? 0;
  const top = needs[0];
  if (!top) return null;
  return { message: `${needs.length} ${needs.length === 1 ? 'thing needs' : 'things need'} you; the top one is ${top.title}${top.failed || top.tone === 'danger' ? ', which failed' : ''}.${agent ? ` ${agent} ${agent === 1 ? 'agent is' : 'agents are'} working.` : ''}`, action: top.action ?? (top.open ? (top.tone === 'danger' ? 'See why it failed' : 'Open it') : undefined), open: top.open };
}

/* Why an empty lane is empty, from what was measured (her rule: an empty lane says why). */
function whyEmpty(x) {
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const days = `the last ${x.windowDays} days`;
  if (!x.reached) return { gate: 'GitHub didn’t answer, so open pull requests aren’t counted.', ready: 'GitHub didn’t answer, so open pull requests aren’t counted.' };
  const failed = x.left?.failed ? ` ${n(x.left.failed, 'pull request’s CI failed', 'pull requests’ CI failed')}.` : '';
  const none = x.left?.none ? ` ${n(x.left.none, 'has', 'have')} no CI.` : '';
  return {
    agent: `No agent run and no Claude Code session wrote in the last ${x.activeMin} minutes.`,
    gate: `No CI is running on a pull request opened or moved in ${days}.${failed}`,
    ready: `No pull request from ${days} has passed CI yet.${none}`,
  };
}

/* The sidebar's filters (the Status rows filter by lane): #/work?lane=<id> keeps that lane.
   Read from the address, so a sidebar row is a link. She never sees branch names (23 Nov): no branch filter. */
export function filterFromHash(hash = window.location.hash) {
  const q = new URLSearchParams(hash.split('?')[1] ?? '');
  // filter: the board's Filter from the address (#/work?filter=needs), so a link can open the board filtered
  const f = q.get('filter') ?? (q.get('project') ? `project:${q.get('project')}` : null);
  const ok = f && (['needs', 'components'].includes(f) || /^(area|lane|project):[\w &-]{1,40}$/.test(f));
  return { lane: q.get('lane'), filter: ok ? f : null };
}
/* ---------- The Work board in her Notion lanes (22 Nov) ----------
   Every card is read from where the work is (server/lib/lanes.mjs: GET /work/board and
   /work/lanes, plus CHIP's own /needs and /runs), never typed:
   - Ideas: the progress board's to-dos, tasks she sent, BELLA components missing a piece;
   - Now: what needs her first (review pages, CHIP's checks, runs to accept, PRs to merge,
     sessions waiting on her), then the work going on, in the order it started;
   - Shipped: sessions whose steps are all done, runs she kept, the progress board's Done;
   - Next and Not doing: only what she put there. Her placements and order are saved. */
const ago = (t, now = Date.now()) => {
  const m = Math.round((now - t) / 60e3);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/* her Notion lanes on BoardLane's light washes (23 Nov): Ideas ochre, Next navy, Now the agent blue, Shipped the ready green, Not doing pink; no grey lane */
export const LANES = [
  { id: 'ideas', name: 'Ideas', kind: 'ideas' },
  { id: 'next', name: 'Next', kind: 'next' },
  { id: 'now', name: 'Now', kind: 'agent' },
  { id: 'shipped', name: 'Shipped', kind: 'ready' },
  { id: 'not-doing', name: 'Not doing', kind: 'not-doing' },
];
export const LANE_NAMES = Object.fromEntries(LANES.map((l) => [l.id, l.name]));

/* the progress board's tracks as the board's area tags */
const AREA = { you: 'Your call', design: 'Figma', figma: 'Figma', library: 'Docs', parts: 'Components', pages: 'Components', bugs: 'Tooling & gate', code: 'Tooling & gate' };
export const AREAS = ['Your call', 'Components', 'Figma', 'Docs', 'Accessibility', 'Tooling & gate'];

/* A plan's progress: steps done, the step running now, and how many in all. */
function progressOf(steps, { working = true } = {}) {
  if (!steps?.length) return { state: 'blank', done: 0, total: 0, now: null };
  const done = steps.filter((x) => x.status === 'completed').length;
  const cur = steps.find((x) => x.status === 'in_progress');
  if (done === steps.length) return { state: 'done', done, total: steps.length, now: steps[steps.length - 1].text };
  return { state: cur && working ? 'working' : 'waiting', done, total: steps.length, now: cur?.text ?? steps.find((x) => x.status === 'pending')?.text ?? null };
}

/* After her Accept a run keeps going (runs.mjs afterKeep, ad9a891): each touched part's spec, the docs, the
   commit through BELLA's gate, Storybook, Figma listed, CHIP's data. Its finished steps carry after:true and
   run.step names the one running; run.after.endedAt (or afterError) says it is over. */
export const AFTER_PLAN = (parts = []) => [...(parts.length ? parts.map((p) => `Spec rebuilt: ${p}`) : ['Specs']), 'Docs regenerated', 'Specs and docs committed', 'Storybook built from the branch', 'Figma listed for the parts session', "CHIP's BELLA data"];
export function afterSteps(r) {
  if (r?.status !== 'kept' || !r.after) return null;
  const done = (r.steps ?? []).filter((x) => x.after).map((x) => x.step);
  const plan = AFTER_PLAN(r.after.parts);
  const total = Math.max(plan.length, done.length + (r.step ? 1 : 0));
  const state = r.afterError ? 'error' : r.after.endedAt ? 'done' : 'working';
  const left = plan.slice(done.length + (r.step && state === 'working' ? 1 : 0));
  return { state, done: done.length, total: state === 'done' ? done.length : total, now: r.afterError ?? r.step ?? null, finished: done, left };
}

/* A CHIP run in four plain steps, from its status (runs.mjs): sign-in check, the agent, the gate, her Accept. */
const RUN_STEPS = ['Check Claude Code is signed in', 'Agent makes the change', 'Run the gate', 'Your Accept'];
function runProgress(r) {
  const after = afterSteps(r);
  if (after) return { ...after, now: after.state === 'done' ? 'Specs, docs and Storybook done' : after.now ?? 'Next after-Accept step' };
  const at = { starting: 0, login: 0, running: 1, gate: 2, passed: 3, kept: 4, failed: r.steps?.length ? 1 : 0 }[r.status] ?? 0;
  const p = { done: Math.min(at, 4), total: 4 };
  if (r.status === 'kept') return { ...p, state: 'done', now: 'Kept' };
  if (r.status === 'failed' || r.status === 'login') return { ...p, state: 'error', now: r.error ?? RUN_STEPS[at] };
  if (r.status === 'passed') return { ...p, state: 'waiting', now: RUN_STEPS[3] };
  return { ...p, state: 'working', now: r.status === 'running' && r.step ? r.step : RUN_STEPS[at] };
}

/* The card's line: what it is, then how far along ("2 of 5", the step now). */
const lineOf = (what, p) => {
  if (!p || p.state === 'blank') return [what, p ? 'No steps yet' : null].filter(Boolean).join(' · ');
  if (p.state === 'done') return `${what} · ${p.total} of ${p.total} done`;
  // one count on a stopped card: the bar's (the stopped row says why, never a second "Stopped at 2 of 4")
  if (p.state === 'error') return what;
  return [what, `${p.done} of ${p.total}`, p.state === 'waiting' ? `Next: ${p.now}` : p.now].filter(Boolean).join(' · ');
};
const TONE = { working: 'info', waiting: 'neutral', blank: 'neutral', done: 'success', error: 'danger' };

function bSession(s, now) {
  const done = s.steps.length > 0 && s.steps.every((x) => x.status === 'completed');
  const p = progressOf(s.steps, { working: s.working });
  const what = s.asks ? 'Agent · waiting on you' : done ? 'Agent' : `Agent · ${s.working ? 'working' : ago(s.updatedAt, now)}`;
  return {
    id: s.id,
    kind: 'session',
    title: s.title,
    line: lineOf(what, p),
    what,
    progress: p,
    steps: s.steps,
    tone: s.asks ? 'attention' : TONE[p.state],
    status: s.asks ? 'Needs you' : done ? 'Shipped' : p.state === 'working' ? 'Working' : 'Waiting',
    needs: s.asks,
    home: done && !s.asks ? 'shipped' : s.working || s.asks || now - s.updatedAt < 60 * 60e3 ? 'now' : null,
    startedAt: s.startedAt,
    lastStepAt: s.updatedAt ?? null,
    who: 'agent',
    area: s.project,
    project: s.project,
  };
}

function bRun(r, base) {
  const p = runProgress(r);
  const what = [afterSteps(r)?.state === 'working' ? 'Accepted, finishing' : afterSteps(r)?.state === 'error' ? 'Accepted, then stopped' : 'CHIP run', r.startedAt ? when(r.startedAt) : null, base && r.base && r.base !== base ? `from ${r.base}` : null].filter(Boolean).join(' · ');
  // a run whose after-Accept steps stopped needs her again
  const needs = ['passed', 'failed', 'login'].includes(r.status) || afterSteps(r)?.state === 'error';
  return {
    id: r.id,
    kind: 'run',
    title: r.title ?? 'Fix',
    line: lineOf(what, p),
    what,
    progress: p,
    tone: r.status === 'passed' ? 'attention' : TONE[p.state],
    status: r.status === 'kept' && afterSteps(r)?.state === 'error' ? 'Stopped after Accept' : r.status === 'kept' && afterSteps(r)?.state === 'working' ? 'Finishing' : ({ passed: 'Your Accept', failed: 'Failed', login: 'Sign in', kept: 'Kept', gate: 'Checking' }[r.status] ?? 'Working'),
    needs,
    home: r.status === 'kept' ? (['working', 'error'].includes(afterSteps(r)?.state) ? 'now' : 'shipped') : ['starting', 'running', 'gate', 'passed', 'failed', 'login'].includes(r.status) ? 'now' : null,
    branch: r.branch ?? null,
    startedAt: r.startedAt ? Date.parse(r.startedAt) : null,
    lastStepAt: r.lastStepAt ?? r.steps?.at(-1)?.endedAt ?? null,
    open: { kind: 'run', id: r.id },
    runBrief: r.status === 'failed' ? (r.brief ?? null) : null,
    who: needs ? 'reviewer' : 'agent',
    area: 'Tooling & gate',
    project: 'BELLA', // CHIP's runs change BELLA, in its own checkout
  };
}

const bNeed = (n) => ({ ...needCard(n), kind: 'need', line: ['CHIP check', needCard(n).line].filter(Boolean).join(' · '), needs: true, home: 'now', area: 'Tooling & gate', project: 'CHIP' });

const bPr = (p) => ({
  id: p.id,
  kind: 'pr',
  title: p.title,
  line: ['Pull request', p.project, p.lane === 'gate' ? 'CI running' : 'CI passed, yours to merge', p.draft ? 'draft' : null].filter(Boolean).join(' · '),
  status: p.lane === 'gate' ? 'CI running' : 'Yours to merge',
  tone: p.lane === 'gate' ? 'info' : 'attention',
  needs: p.lane !== 'gate',
  home: 'now',
  branch: p.branch,
  startedAt: Date.parse(p.updatedAt),
  who: p.lane === 'gate' ? 'gate' : 'maintainer',
  open: { kind: 'link', href: p.url },
  area: 'Tooling & gate',
  project: p.project,
});

/* The progress board's items: a review page waiting on her opens in full (her pick B, 22 Nov). */
function bItem(i) {
  const area = AREA[i.track] ?? 'Components';
  const page = i.link ? { kind: 'page', href: i.link } : null;
  if (i.stage === 'Waiting on you') return { id: i.id, kind: 'review', title: i.title, line: `Review page · ${area}`, status: 'Needs you', tone: 'attention', needs: true, home: 'now', open: page, area, who: 'you', n: i.n };
  // computed on the server from the item's own source (server/lib/progress-live.mjs): a landed item says when and in which commit
  if (i.stage === 'Done') return { id: i.id, kind: 'item', title: i.title, line: ['Shipped', i.shipped?.date, area].filter(Boolean).join(' · '), commit: i.shipped?.commit ?? null, status: 'Shipped', tone: 'success', home: 'shipped', open: page, area, n: i.n };
  // answered, its work not landed yet: Next, never "Your call"
  if (i.stage === 'Next') return { id: i.id, kind: 'item', title: i.title, line: `Answered, not landed yet · ${area}`, status: 'Next', tone: 'info', home: 'next', open: page, area, n: i.n, brief: [i.title, i.detail].filter(Boolean).join('. ') };
  if (i.stage === 'Not measured') return { id: i.id, kind: 'item', title: i.title, line: `Not measured · ${i.source ?? 'no source to check'}`, status: 'Not measured', tone: 'neutral', home: 'ideas', open: page, area, n: i.n };
  if (i.stage === 'To do') return { id: i.id, kind: 'idea', title: i.title, line: `Idea · ${area}`, status: 'Idea', tone: 'neutral', home: 'ideas', open: page, brief: [i.title, i.detail].filter(Boolean).join('. '), area, n: i.n };
  return null; // Building and Checking are the sessions' own words for work Now already reads from the session
}
const bTask = (t) => ({ id: t.id, kind: 'idea', title: t.title, line: 'Idea · from you', status: 'Idea', tone: 'neutral', home: 'ideas', brief: t.title, area: 'Your call', project: 'CHIP' });
/* Components that need work, from CHIP's gap checks (/gaps), the count Health and Components show */
const GAP_WORDS = { story: 'story', docs: 'doc page description', contract: 'contract', dsds: 'spec', contrast: 'contrast pair', a11y: 'accessibility notes' };
function componentsOf(gaps = {}) {
  const by = new Map();
  for (const [check, names] of Object.entries(gaps)) for (const name of Object.keys(names ?? {})) if (GAP_WORDS[check]) by.set(name, [...(by.get(name) ?? []), GAP_WORDS[check]]);
  return [...by].map(([name, missing]) => ({ id: `comp-${name}`, name, missing })).sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name));
}
const bComponent = (c) => ({
  id: c.id,
  kind: 'component',
  title: c.name,
  line: `Component · no ${c.missing.join(', ')}`,
  status: 'Needs work',
  tone: 'neutral',
  home: 'ideas',
  component: true,
  open: { kind: 'hash', href: `#/system/components?part=${encodeURIComponent(c.name)}` },
  brief: `BELLA's ${c.name} has no ${c.missing.join(', ')}. Add ${c.missing.length === 1 ? 'it' : 'them'} from the component's Figma part and spec, following BELLA's rules, then run the gate.`,
  area: c.missing.length === 1 && c.missing[0] === 'accessibility notes' ? 'Accessibility' : 'Components',
  who: 'agent',
  project: 'BELLA',
});

export function boardModel({ needs = [], runs = [], runBase = null, lanes: extra = null, board = null, gaps = null, now = Date.now() }) {
  const parts = componentsOf(gaps ?? {});
  const all = [
    ...needs.map(bNeed),
    ...runs.map((r) => bRun(r, runBase)).map((c, i, a) => (a.filter((o) => o.title === c.title).length > 1 && c.startedAt ? { ...c, title: `${c.title} · ${when(c.startedAt)}` } : c)),
    ...(extra?.prs ?? []).map(bPr),
    ...(board?.sessions ?? []).map((s) => bSession(s, now)),
    ...(board?.progress?.items ?? []).map(bItem).filter(Boolean),
    ...(board?.progress?.tasks ?? []).map(bTask),
    ...(board?.board?.ideas ?? []).map((i) => ({ id: i.id, kind: 'idea', title: i.title, line: 'Idea · from Talk', status: 'Idea', tone: 'neutral', home: 'ideas', brief: i.brief, area: 'Your call' })),
    ...parts.map(bComponent),
  ].filter((c) => c.home);
  // a check or idea an agent is already working on leaves its lane: its run shows in Now
  const busy = new Set(runs.filter((r) => ['starting', 'running', 'gate', 'passed'].includes(r.status)).map((r) => r.title));
  const place = board?.board?.place ?? {};
  const order = board?.board?.order ?? {};
  const lanes = LANES.map((l) => ({ ...l, cards: [] }));
  for (const c of all) {
    if (c.kind !== 'run' && busy.has(c.title)) continue;
    const p = place[c.id];
    // a landed card leaves Ideas, Next and Now whatever she once did with it; her other placements stand
    const lane = c.home === 'shipped' && ['ideas', 'next', 'now'].includes(p?.lane) ? 'shipped' : p?.lane ?? c.home;
    const card = p && p.lane !== c.home ? { ...c, moved: true, paused: !!p.paused } : c;
    if (card.paused && card.progress?.total) card.line = `Paused by you · ${card.progress.done} of ${card.progress.total}`;
    lanes.find((x) => x.id === lane)?.cards.push(card);
  }
  for (const l of lanes) {
    const mine = order[l.id] ?? [];
    const rank = (c) => (mine.includes(c.id) ? mine.indexOf(c.id) : Infinity);
    l.cards.sort((a, b) => {
      // in Now, what needs her comes first, then her order, then the order the work started in
      // (so one finishing first never makes another look lost)
      if (l.id === 'now' && !!a.needs !== !!b.needs) return a.needs ? -1 : 1;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (l.id === 'shipped') return (b.n ?? -1) - (a.n ?? -1);
      if (l.id === 'now') return (a.startedAt ?? 0) - (b.startedAt ?? 0);
      return 0;
    });
  }
  const checks = needs.map(bNeed);
  return { lanes, total: lanes.reduce((s, l) => s + l.cards.length, 0), brief: boardBrief(checks), why: boardWhy(board, extra), components: parts.length };
}

/* The Brief: CHIP's own checks, with the top one's next step. */
function boardBrief(checks) {
  const top = [...checks].sort((a, b) => Number(b.tone === 'danger') - Number(a.tone === 'danger'))[0];
  if (!top) return null;
  // one line (notices are one-line bars, 16 Nov; visual study 23 Nov: the titled Brief led the board)
  return { message: `${checks.length === 1 ? 'A check needs you' : `${checks.length} checks need you`}: ${top.title}${top.tone === 'danger' ? ', which failed' : ''}`, action: top.action ?? (top.open ? (top.tone === 'danger' ? 'See why it failed' : 'Open it') : undefined), open: top.open };
}

/* Why an empty lane is empty, from what was measured (her rule: an empty lane says why). */
function boardWhy(board, extra) {
  if (!board) return {};
  return {
    ideas: board.progress?.reached ? 'No to-dos on the progress board and every component has its pieces.' : 'The progress board didn’t answer, so its ideas aren’t shown.',
    now: `No session wrote in the last ${board.activeMin} minutes and nothing needs you.${extra && !extra.reached ? ' GitHub didn’t answer, so pull requests aren’t counted.' : ''}`,
    shipped: `Nothing finished in the last ${board.sessionHours} hours.`,
  };
}

/** Reads the board's data (kept between pages); it is read again every 15 seconds, so progress moves on its own. */
export function useWork() {
  const { data, error, at, loading, reload, last } = useCached(['/needs', '/runs', '/gaps']);
  const { data: extra, reload: reloadExtra } = useCached(['/work/lanes']);
  const { data: boardData, reload: reloadBoard } = useCached(['/work/board']);
  const [live, setLive] = useState(null);
  const [runsLive, setRunsLive] = useState(null);
  useEffect(() => setLive(null), [boardData]);
  useEffect(() => setRunsLive(null), [data]);
  useEffect(() => {
    const again = () => (reload(), reloadExtra(), reloadBoard());
    window.addEventListener('chip:changed', again);
    // a move shows at once: the server's answer to the save stands in until the board is read again
    const moved = (e) => setLive((b) => ({ ...(b ?? boardData?.[0] ?? {}), board: e.detail }));
    window.addEventListener('chip:board', moved);
    const read = (u, set) =>
      fetch(u)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && set(d))
        .catch(() => {});
    const tick = setInterval(() => document.hidden || (read('/work/board', setLive), read('/runs', setRunsLive)), 15e3);
    return () => (window.removeEventListener('chip:changed', again), window.removeEventListener('chip:board', moved), clearInterval(tick));
  }, [reload, reloadExtra, reloadBoard, boardData]);
  const board = live ?? boardData?.[0] ?? null;
  const runs = runsLive ?? data?.[1] ?? null;
  // while a run is going, or finishing after her Accept, its card is read every 3 seconds
  const busy = (runs?.runs ?? []).some((r) => ['starting', 'running', 'gate'].includes(r.status) || afterSteps(r)?.state === 'working');
  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(() => document.hidden || fetch('/runs').then((r) => (r.ok ? r.json() : null)).then((r) => r && setRunsLive(r)).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [busy]);
  const model = useMemo(() => (data ? boardModel({ needs: data[0].items ?? [], runs: runs?.runs ?? [], runBase: runs?.base ?? null, lanes: extra?.[0] ?? null, board, gaps: data[2]?.gaps ?? null }) : null), [data, runs, extra, board]);
  return { model, error, loading, reload: () => (reload(), reloadExtra(), reloadBoard()), checked: board?.at ? hhmm(Date.parse(board.at)) : at ? hhmm(at) : null, unread: board?.unread ?? [], last };
}

/** Saves where she put a card and before which one (lane null: back where CHIP measured it). */
export async function saveMove(id, lane, { before = null, paused = false } = {}) {
  const r = await fetch('/work/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, lane, before, paused }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? 'CHIP did not save it');
  window.dispatchEvent(new CustomEvent('chip:board', { detail: d.board }));
  return d.board;
}

/* A card an agent can take: an idea or component with a brief, a failed check with a review, a failed run. */
export const runnable = (c) => !!(c.brief || c.fixable || c.runBrief);
/* Work going on: dragging it out of Now pauses it (saved on the board, where its agent reads it). */
export const going = (c) => (c.kind === 'session' || c.kind === 'run') && ['working', 'waiting'].includes(c.progress?.state);

/* What one project has on the board, counted from its cards (23 Nov: the progress line follows the project chip):
   shipped is the Shipped lane, now is Now without what waits on her, waiting is Now cards that need her.
   Null project counts every card; cards is how many the project has in all five lanes. */
export function projectStats(model, project = null) {
  const mine = (c) => !project || String(c.project ?? 'CHIP').toLowerCase() === project.toLowerCase();
  const inLane = (id) => (model?.lanes.find((l) => l.id === id)?.cards ?? []).filter(mine);
  const now = inLane('now');
  const waiting = now.filter((c) => c.needs).length;
  const shipped = inLane('shipped').length;
  const atWork = now.length - waiting;
  const cards = (model?.lanes ?? []).reduce((n, l) => n + l.cards.filter(mine).length, 0);
  return { shipped, now: atWork, waiting, total: shipped + atWork + waiting, cards };
}

/* The tools row: Filter, Sort, Search. */
export function shown(model, { filter = null, project = null, sort = 'mine', q = '' } = {}) {
  if (!model) return model;
  const words = q.trim().toLowerCase();
  const keep = (c) =>
    (!words || `${c.title} ${c.line}`.toLowerCase().includes(words)) &&
    (!project || String(c.project ?? 'CHIP').toLowerCase() === project.toLowerCase()) &&
    (!filter || filter.startsWith('lane:') || (filter === 'needs' ? c.needs : filter === 'components' ? c.component : filter.startsWith('area:') ? c.area === filter.slice(5) : filter.startsWith('project:') ? String(c.project ?? 'CHIP').toLowerCase() === filter.slice(8).toLowerCase() : true));
  const by = { updated: (a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0), started: (a, b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity) }[sort];
  const lanes = model.lanes
    .filter((l) => !filter?.startsWith('lane:') || l.id === filter.slice(5))
    .map((l) => {
      const cards = l.cards.filter(keep);
      return { ...l, cards: by ? [...cards].sort(by) : cards };
    });
  return { ...model, lanes, total: lanes.reduce((n, l) => n + l.cards.length, 0) };
}

/* "What is being worked on?" in Talk and on Team: answered from the board itself, never a model, so the
   numbers are the board's. Asked in her words: what's being worked on, what's running, where are we, status. */
export const STATUS_Q = /\b(what(?:'s|’s| is| are)?\b[^?]*\b(?:being )?work(?:ed|ing)? on|what(?:'s|’s| is) (?:running|going on|happening)|where are we|who(?:'s|’s| is) working|what are (?:the |my )?agents|status)\b/i;
export async function workStatus() {
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${u} answered ${r.status}`))));
  const [needs, runs, gaps, board, lanes] = await Promise.all([get('/needs'), get('/runs'), get('/gaps').catch(() => null), get('/work/board'), get('/work/lanes').catch(() => null)]);
  const m = boardModel({ needs: needs.items ?? [], runs: runs.runs ?? [], runBase: runs.base ?? null, board, gaps: gaps?.gaps ?? null, lanes });
  const now = m.lanes.find((l) => l.id === 'now').cards;
  const atWork = now.filter((c) => !c.needs && (c.kind === 'session' || c.kind === 'run' || c.kind === 'pr'));
  const waiting = now.filter((c) => c.needs).length;
  const next = m.lanes.find((l) => l.id === 'next').cards.length;
  const at = new Date(board.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const verdict = atWork.length
    ? `**${atWork.length} ${atWork.length === 1 ? 'task' : 'tasks'}** ${atWork.length === 1 ? 'is' : 'are'} being worked on, and **${waiting}** ${waiting === 1 ? 'thing waits' : 'things wait'} on you.`
    : `**Nothing** is being worked on right now; **${waiting}** ${waiting === 1 ? 'thing waits' : 'things wait'} on you.`;
  const bullets = atWork.map((c) => {
    const p = c.progress;
    const how = !p || p.state === 'blank' ? 'no steps listed yet' : p.state === 'done' ? `all ${p.total} steps done` : `step ${Math.min(p.done + 1, p.total)} of ${p.total}${p.now ? `: ${p.now}` : ''}`;
    return `${c.title} · ${how}`;
  });
  // short answers (her reading, 22 Nov): three tasks at most, the rest counted, with where to see them
  const shown = bullets.slice(0, 3);
  if (bullets.length > 3) shown.push(`${bullets.length - 3} more · on the Work board`);
  if (next) shown.push(`Next · ${next} ${next === 1 ? 'card' : 'cards'} lined up by you`);
  return { verdict, bullets: shown, at, line: `From the Work board, read ${at}. Sessions in the Claude app and CHIP's own runs.` };
}
