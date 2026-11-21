// Work's board, from CHIP's own data: what needs her (/needs) and the agent
// runs CHIP started (/runs). Lanes as Figma (Work · content 608:207182):
// Needs you, Agent, Gate, Ready (slim Work: no Merged today, no Just finished).
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
  line: ['Pull request', `${p.project} #${p.number}`, p.draft ? 'draft' : null].filter(Boolean).join(' · '),
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

/** Reads CHIP's data (kept between pages); `reload` reads it again (Check again). */
export function useWork() {
  const { data, error, at, loading, reload } = useCached(['/needs', '/runs', '/bar/state']);
  useEffect(() => {
    window.addEventListener('chip:changed', reload);
    return () => window.removeEventListener('chip:changed', reload);
  }, [reload]);
  // the PR and session lanes come on their own: a slow or missing GitHub never holds up the board
  const { data: extra, reload: reloadExtra } = useCached(['/work/lanes']);
  useEffect(() => {
    window.addEventListener('chip:changed', reloadExtra);
    return () => window.removeEventListener('chip:changed', reloadExtra);
  }, [reloadExtra]);
  // a move shows at once: the server's answer to the save stands in until the lanes are read again
  const [moved, setMoved] = useState(null);
  useEffect(() => {
    const on = (e) => setMoved(e.detail);
    window.addEventListener('chip:moves', on);
    return () => window.removeEventListener('chip:moves', on);
  }, []);
  useEffect(() => setMoved(null), [extra]);
  const lanes = extra?.[0] ? { ...extra[0], moves: moved ?? extra[0].moves } : moved ? { moves: moved } : null;
  const model = useMemo(() => (data ? workModel({ needs: data[0].items ?? [], runs: data[1].runs ?? [], runBase: data[1].base ?? null, agents: data[2]?.lanes ?? [], lanes }) : null), [data, lanes]);
  return { model, error, loading, reload: () => (reload(), reloadExtra()), checked: at ? hhmm(at) : null };
}

/* The sidebar's filters (her rule "branches filter the board"; the Status rows
   filter by lane): #/work?branch=<name> keeps the cards on that branch,
   #/work?lane=<id> keeps that lane. Read from the address, so a sidebar row is a link. */
export function filterFromHash(hash = window.location.hash) {
  const q = new URLSearchParams(hash.split('?')[1] ?? '');
  return { branch: q.get('branch'), lane: q.get('lane') };
}
export const LANE_NAMES = { needs: 'Needs you', agent: 'Agent', gate: 'At the gate', ready: 'Ready' };
/* A card an agent can take: a failed check with a brief, or a failed run (its own brief, again). */
export const runnable = (c) => !!(c.fixable || c.runBrief);
/** Saves where she put a card (lane null: back where it came from). */
export async function saveMove(id, lane) {
  const r = await fetch('/work/moves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, lane }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? 'CHIP did not save it');
  window.dispatchEvent(new CustomEvent('chip:moves', { detail: d.moves }));
  window.dispatchEvent(new Event('chip:changed'));
  return d.moves;
}
export function filtered(model, { branch, lane }) {
  if (!model || (!branch && !lane)) return model;
  const lanes = model.lanes
    .filter((l) => !lane || l.id === lane)
    .map((l) => (branch ? { ...l, cards: l.cards.filter((c) => c.branch === branch) } : l));
  return { ...model, lanes, total: lanes.reduce((n, l) => n + l.cards.length, 0), brief: branch ? briefOf(lanes) : model.brief };
}
