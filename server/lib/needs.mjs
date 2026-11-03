// Needs you (The Bar, phase 6, 3 Nov late): only what waits on Elleta, from
// the checks, the fix branches, git state in the three repos and the lane
// reports, ranked by risk (High, Medium, Low), newest first within a level.
// Every item says what its button will do and how to undo it. CHIP never
// pushes: a push item opens a terminal with the command typed, not run.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ROOT } from './config.mjs';
import { BELLA } from './bella-work.mjs';
import { BASE, listChecks } from './checks.mjs';
import { fixableChecks, reviewCard, waitingChecks } from './review.mjs';
import { laneState } from './bar.mjs';

const RANK = { High: 3, Medium: 2, Low: 1 };
const FRESH_DAYS = 7; // lane notes older than this are history, not a request
const git = (dir, args) => {
  try {
    return execFileSync('git', ['-C', dir, '--no-optional-locks', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
};

function gitItems() {
  const out = [];
  const repos = [
    { id: 'bella', name: 'BELLA', dir: BELLA, branch: BASE },
    { id: 'chip', name: 'CHIP', dir: ROOT, branch: git(ROOT, ['rev-parse', '--abbrev-ref', 'HEAD']) },
    { id: 'site', name: 'the site', dir: join(homedir(), 'DEV', 'ctrl-alt-design'), branch: null },
  ];
  for (const r of repos) {
    const branch = r.branch ?? git(r.dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!branch || branch === 'HEAD') continue;
    const up = git(r.dir, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]);
    if (!up) continue;
    const ahead = Number(git(r.dir, ['rev-list', '--count', `${up}..${branch}`]) ?? 0);
    const behind = Number(git(r.dir, ['rev-list', '--count', `${branch}..${up}`]) ?? 0);
    if (behind) {
      const subj = git(r.dir, ['log', '-1', '--format=%s', up]);
      out.push({
        id: `behind-${r.id}`, kind: 'Git', risk: 'Medium', at: Date.parse(git(r.dir, ['log', '-1', '--format=%cI', up]) ?? '') || Date.now(),
        what: `${r.name}'s ${branch} is ${behind} commit${behind === 1 ? '' : 's'} behind GitHub`,
        detail: `GitHub has "${subj}" that this machine hasn't pulled, so the checks ran on the older tip.`,
        riskWhy: 'Medium: the checks may be answering for a version that is no longer the latest.',
        thisWill: `open a terminal in ${r.name} with git pull --ff-only typed, not run`,
        undo: 'nothing runs until you press Return',
        action: { type: 'terminal', repo: r.id, command: 'git pull --ff-only', label: 'Open a terminal to pull' },
      });
    }
    if (ahead) {
      out.push({
        id: `ahead-${r.id}`, kind: 'Git', risk: 'High', at: Date.parse(git(r.dir, ['log', '-1', '--format=%cI', branch]) ?? '') || Date.now(),
        what: `Push ${branch}? ${ahead} commit${ahead === 1 ? '' : 's'} CI hasn't run`,
        detail: `${r.name} has ${ahead} local commit${ahead === 1 ? '' : 's'} on ${branch} that GitHub hasn't seen. The gate ran locally; CI hasn't.`,
        riskWhy: 'High: a push is outward-facing and other people see it.',
        thisWill: `open a terminal in ${r.name} with git push typed, not run`,
        undo: 'nothing runs until you press Return; after a push, a revert commit',
        action: { type: 'terminal', repo: r.id, command: 'git push', label: `Open a terminal to push` },
      });
    }
  }
  return out;
}

function checkItems() {
  const waiting = waitingChecks();
  const { checks, gate } = listChecks({ waiting });
  const out = [];
  for (const c of checks) {
    if (c.status === 'failed') {
      const card = reviewCard(c.id);
      out.push({
        id: `check-${c.id}`, kind: c.gate ? 'Gate' : 'Check', risk: c.gate ? 'High' : 'Medium', at: Date.parse(c.ranAt),
        what: `${c.gate ? 'Gate' : c.name}: ${c.failures?.[0] ?? c.summary}`,
        detail: c.gate ? gate.summary : c.summary,
        riskWhy: c.gate ? 'High: while the gate fails, BELLA accepts no commit, so nothing can be merged safely.' : 'Medium: the bench grades, it does not block.',
        thisWill: card.thisWill ? 'open the review card: why it fails, the exact change, who it reaches' : 'open the review card with a brief for a Claude session',
        undo: 'opening it changes nothing',
        action: { type: 'review', check: c.id, label: card.thisWill ? 'Review the fix' : 'See why it fails' },
      });
    } else if (c.status === 'waiting' && c.manual) {
      out.push({
        id: `check-${c.id}`, kind: 'Bench', risk: 'Low', at: Date.parse(c.ranAt),
        what: `${c.name} is due: last run ${new Date(c.ranAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        detail: `${c.summary} ${c.cost}.`,
        riskWhy: 'Low: it only reads BELLA, but it spends plan usage, so it waits for your yes.',
        thisWill: 'open a terminal in the bench folder with the run command typed, not run',
        undo: 'nothing runs until you press Return',
        action: { type: 'terminal', repo: 'chip', command: `cd ~/DEV/tools/odsb && npx tsx src/cli.ts run --profile medium --label ${new Date().toLocaleString('en', { month: 'short' }).toLowerCase()}`, label: 'Open a terminal to run it' },
      });
    } else if (c.status === 'waiting') {
      const card = reviewCard(c.id);
      out.push({
        id: `fix-${c.id}`, kind: 'Fix', risk: 'Medium', at: Date.now(),
        what: `Merge ${card.branch}? ${card.title}, gate green on the branch`,
        detail: `${card.change?.sentence ?? ''} The branch is local; ${BASE} hasn't moved.`,
        riskWhy: 'Medium: merging changes what every consumer of BELLA renders in that theme.',
        thisWill: 'open the review card, where Undo deletes the branch',
        undo: 'Undo on the card deletes the branch',
        action: { type: 'review', check: c.id, label: 'Open the review card' },
      });
    }
  }
  for (const f of fixableChecks()) {
    out.push({
      id: `improve-${f.id}`, kind: 'Bench', risk: 'Low', at: Date.now() - 1,
      what: `${f.line.replace(/\.$/, '')}: CHIP can make the change`,
      detail: `${f.title}. The check passes; this is a finding the bench scores, with a change ready to review.`,
      riskWhy: 'Low: it adds a file and changes nothing anything renders.',
      thisWill: 'open the review card: the change, what it won’t touch, Accept and Undo',
      undo: 'opening it changes nothing',
      action: { type: 'review', check: f.id, label: 'Review the change' },
    });
  }
  return out;
}

function laneItems() {
  const out = [];
  let stale = 0;
  for (const l of laneState()) {
    if (l.status !== 'waiting on you' || !l.needs?.length) continue;
    const age = (Date.now() - l.updated) / 86400000;
    if (age > FRESH_DAYS) {
      stale += l.needs.length;
      continue;
    }
    for (const [i, n] of l.needs.entries()) {
      out.push({
        id: `lane-${l.id}-${i}`, kind: l.name, risk: /\bmerge|push|deploy\b/i.test(n.text) ? 'High' : 'Low', at: l.updated,
        what: n.text.length > 140 ? `${n.text.slice(0, 137)}…` : n.text,
        detail: n.text,
        riskWhy: /\bmerge|push|deploy\b/i.test(n.text) ? 'High: it asks to merge, push or deploy.' : 'Low: a question; nothing runs until you answer.',
        thisWill: `open ${l.name}'s lane in The Bar`,
        undo: 'opening it changes nothing',
        action: { type: 'lane', lane: l.id, label: `Open ${l.name}'s lane` },
      });
    }
  }
  return { items: out, stale };
}

/** GET /needs */
export function needsYou() {
  const lanes = laneItems();
  const items = [...checkItems(), ...gitItems(), ...lanes.items].sort((a, b) => RANK[b.risk] - RANK[a.risk] || (b.at || 0) - (a.at || 0));
  return { items, staleLaneNotes: lanes.stale, freshDays: FRESH_DAYS };
}
