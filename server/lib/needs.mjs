// Needs you (The Bar, phase 6, 3 Nov late): only what waits on Elleta, from
// the checks, the fix branches, git state in the three repos and the lane
// reports, ranked by risk (High, Medium, Low), newest first within a level.
// Every item says what its button will do and how to undo it. CHIP never
// pushes: a push item shows what would be pushed (the commits, the files); she types
// git push herself in a plain shell. CHIP never types a push (click test, 22 Nov).
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

// The Bar shows each item as "status · risk", then one short bold title
// (the mock's card); `what` stays the full sentence for the detail.
const short = (text, n = 64) => {
  const t = String(text).split(/ \(|; /)[0].trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,:;]$/, '')}…`;
};
function failureTitle(c) {
  const f = c.failures?.[0] ?? c.summary;
  const prefix = c.gate ? 'Gate' : c.name;
  // a crash, not a finding: never show the raw command or a path in a title
  // (19 Nov re-audit: "Command failed: git -C /Users/…" on the page). The raw
  // text stays in `what` and the review card.
  if (/Command failed|^fatal:|\/Users\/|ENOENT|EACCES/.test(String(f))) return c.gate ? `Gate: ${c.name} couldn't run` : `${c.name} couldn't run`;
  // contrast: "wee-dote: selected wash vs the page is 1.04:1, … (needs 1.08:1; …)"
  const pair = f.match(/^([\w-]+): (.+?) is ([\d.]+:1).*?needs ([\d.]+:1)/);
  if (pair) return `${prefix}: ${pair[1].replace(/-/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase())} ${pair[2]} ${pair[3]}, needs ${pair[4]}`;
  // a story's picture: "…: ChatThread: a picture is 30.5% different from its baseline"
  const shot = f.match(/(\w+): a picture is ([\d.]+%) different/);
  if (shot) return `${prefix}: ${shot[1]} story is ${shot[2]} off its baseline`;
  return `${prefix}: ${short(f.replace(`${c.name}: `, ''), 56)}`;
}

const reposOf = () => [
    { id: 'bella', name: 'BELLA', dir: BELLA, branch: BASE },
    { id: 'chip', name: 'CHIP', dir: ROOT, branch: git(ROOT, ['rev-parse', '--abbrev-ref', 'HEAD']) },
    { id: 'site', name: 'the site', dir: join(homedir(), 'DEV', 'ctrl-alt-design'), branch: null },
];

/** GET /push/:repo: what a push would send, read only: the branch, where it goes, and each
 *  commit GitHub hasn't seen with the files it touches. Nothing here pushes, and no command is
 *  typed anywhere: the push stays hers to type (needs you, push item). */
export function pushPreview(id, repos = reposOf()) {
  const r = repos.find((x) => x.id === id);
  if (!r) throw new Error(`No repo called ${id}`);
  const branch = r.branch ?? git(r.dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const up = branch && git(r.dir, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]);
  if (!up) return { repo: r.id, name: r.name, branch, upstream: null, commits: [], files: 0 };
  // what GitHub holds now, not this machine's last fetched copy
  const tip = remoteTip(r.dir, up);
  const base = tip && git(r.dir, ['cat-file', '-e', `${tip}^{commit}`]) !== null ? tip : up;
  const log = git(r.dir, ['log', '--format=%h%x09%cI%x09%s', `${base}..${branch}`]) ?? '';
  const commits = log.split('\n').filter(Boolean).map((l) => {
    const [sha, date, subject] = l.split('\t');
    return { sha, date, subject };
  });
  const files = (git(r.dir, ['diff', '--name-only', `${base}...${branch}`]) ?? '').split('\n').filter(Boolean);
  return { repo: r.id, name: r.name, branch, upstream: up, commits, files: files.length, sample: files.slice(0, 8) };
}

/** What GitHub itself holds for this branch right now (git ls-remote), not the copy of it this machine last fetched:
 *  the fetched copy goes stale the moment someone pushes from another checkout (the 23 Nov "Push chip/parts-dev?" card
 *  kept showing after her push). null when GitHub does not answer in 4 s: the card then says nothing rather than guess. */
function remoteTip(dir, up) {
  const [remote, ...rest] = up.split('/');
  try {
    const out = execFileSync('git', ['-C', dir, '--no-optional-locks', 'ls-remote', '--heads', remote, `refs/heads/${rest.join('/')}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).trim();
    return out ? out.split(/\s/)[0] : '';
  } catch {
    return null;
  }
}

// The cards speak in her words (23 Nov: no branch names, no git verbs): "Save BELLA to GitHub", "Get BELLA's latest".
export function gitItems(repos = reposOf()) {
  const out = [];
  for (const r of repos) {
    const branch = r.branch ?? git(r.dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!branch || branch === 'HEAD') continue;
    const up = git(r.dir, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]);
    if (!up) continue;
    const tip = remoteTip(r.dir, up);
    if (tip === null) continue; // GitHub did not answer: not measured, so no card
    const known = tip && git(r.dir, ['cat-file', '-e', `${tip}^{commit}`]) !== null;
    const ahead = tip === '' ? Number(git(r.dir, ['rev-list', '--count', branch]) ?? 0) : known ? Number(git(r.dir, ['rev-list', '--count', `${tip}..${branch}`]) ?? 0) : 0;
    const behind = known ? Number(git(r.dir, ['rev-list', '--count', `${branch}..${tip}`]) ?? 0) : tip ? 1 : 0;
    if (behind) {
      const subj = known ? git(r.dir, ['log', '-1', '--format=%s', tip]) : null;
      const n = known ? `${behind} ${behind === 1 ? 'change' : 'changes'}` : 'newer changes';
      out.push({
        id: `behind-${r.id}`, kind: 'Git', risk: 'Medium', status: 'Waiting on you',
        title: `Get ${r.name}'s latest from GitHub? ${n} not here yet`, at: (known && Date.parse(git(r.dir, ['log', '-1', '--format=%cI', tip]) ?? '')) || Date.now(),
        what: `GitHub has ${n} that ${r.name} on this machine does not`,
        detail: `${subj ? `GitHub has "${subj}" that this machine hasn't got, so ` : 'GitHub has work this machine hasn\'t got, so '}the checks ran on the older version.`,
        riskWhy: 'Medium: the checks may be answering for a version that is no longer the latest.',
        thisWill: `open a terminal in ${r.name} with the update typed, not run`,
        undo: 'nothing runs until you press Return',
        action: { type: 'terminal', repo: r.id, command: 'git pull --ff-only', label: 'Open a terminal to update' },
      });
    }
    if (ahead) {
      out.push({
        id: `ahead-${r.id}`, kind: 'Git', risk: 'High', status: 'Waiting on you',
        title: `Save ${r.name} to GitHub? ${ahead} ${ahead === 1 ? 'change' : 'changes'} not there yet`, at: Date.parse(git(r.dir, ['log', '-1', '--format=%cI', branch]) ?? '') || Date.now(),
        what: `${ahead} ${ahead === 1 ? 'change' : 'changes'} in ${r.name} that GitHub doesn't have yet`,
        detail: `${r.name} has ${ahead} ${ahead === 1 ? 'change' : 'changes'} that GitHub hasn't seen. The checks ran here; GitHub's haven't.`,
        riskWhy: 'High: saving to GitHub is outward-facing and other people see it.',
        thisWill: `show the ${ahead === 1 ? 'change' : 'changes'} that would go to GitHub; nothing is sent until you do it yourself`,
        undo: 'looking changes nothing; after saving, a revert',
        action: { type: 'push', repo: r.id, label: 'See what would be saved' },
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
        status: 'Failed', title: failureTitle(c),
        what: `${c.name}: ${c.failures?.[0] ?? c.summary}`,
        detail: c.gate ? gate.summary : c.summary,
        riskWhy: c.gate ? 'High: while the gate fails, BELLA accepts no commit, so nothing can be merged safely.' : 'Medium: the bench grades, it does not block.',
        thisWill: card.thisWill ? 'open the review card: why it fails, the exact change, who it reaches' : 'open the review card with a brief for a Claude session',
        undo: 'opening it changes nothing',
        action: { type: 'review', check: c.id, label: card.thisWill ? 'Review the fix' : 'See why it fails' },
      });
    } else if (c.status === 'waiting' && c.manual) {
      out.push({
        id: `check-${c.id}`, kind: 'Bench', risk: 'Low', at: Date.parse(c.ranAt),
        status: 'Waiting on you', title: `${c.name} is due`,
        what: `${c.name} is due: last run ${new Date(c.ranAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        detail: `${c.summary} ${c.cost}.`,
        riskWhy: 'Low: it only reads BELLA, but it spends plan usage, so it waits for your yes.',
        thisWill: 'open a terminal in the bench folder with the run command typed, not run',
        undo: 'nothing runs until you press Return',
        action: { type: 'terminal', repo: 'chip', command: `cd ~/DEV/tools/odsb && npx tsx src/cli.ts run --profile medium --label ${new Date().toLocaleString('en', { month: 'short' }).toLowerCase()}`, label: 'Open a terminal to run it' },
      });
    } else if (c.status === 'waiting') {
      const card = reviewCard(c.id);
      // only what is measured (data check, 22 Nov: the card said "gate green" and "hasn't moved" for an old
      // branch already inside the base): a branch with no commit of its own has nothing to merge, so no card;
      // the gate is green only when CHIP's Accept committed this very commit through it; how far the base
      // moved is counted, never assumed
      const ahead = Number(git(BELLA, ['rev-list', '--count', `${BASE}..${card.branch}`]) ?? 0);
      if (!ahead) continue;
      const behind = Number(git(BELLA, ['rev-list', '--count', `${card.branch}..${BASE}`]) ?? 0);
      const gated = card.job?.status === 'done' && card.job.sha === card.sha;
      out.push({
        id: `fix-${c.id}`, kind: 'Fix', risk: 'Medium', at: Date.now(),
        status: 'Ready to review', title: `Merge ${card.branch}?`,
        what: `Merge ${card.branch}? ${card.title}, ${gated ? 'committed through the gate' : 'not through the gate yet'}`,
        detail: `${card.change?.sentence ?? ''} ${ahead} ${ahead === 1 ? 'commit' : 'commits'} of its own; ${behind ? `${BASE} has moved ${behind} ${behind === 1 ? 'commit' : 'commits'} since` : `${BASE} hasn't moved since`}.`.trim(),
        riskWhy: card.blast?.sentence ? `Medium: ${card.blast.sentence}` : `Medium: merging adds the branch's ${ahead === 1 ? 'commit' : 'commits'} to ${BASE}.`,
        thisWill: 'open the review card, where Undo deletes the branch',
        undo: 'Undo on the card deletes the branch',
        action: { type: 'review', check: c.id, label: 'Open the review card' },
      });
    }
  }
  for (const f of fixableChecks()) {
    out.push({
      id: `improve-${f.id}`, kind: 'Bench', risk: 'Low', at: Date.now() - 1,
      status: 'Ready to review', title: short(f.line.replace(/^[^:]+: /, '').replace(/\.$/, '')),
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
        status: 'Waiting on you', title: `${l.name}: ${short(n.text.split(/(?<=[?.!])\s/)[0], 56)}`,
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
  return { items, staleLaneNotes: lanes.stale, freshDays: FRESH_DAYS, gate: listChecks({ waiting: waitingChecks() }).gate.counts };
}
