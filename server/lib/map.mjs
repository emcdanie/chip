// The system map on Connectors (phase 6 I, 3 Nov late): BELLA's pipeline as
// a tree, every node's state from real data (bella.json, the checks, the
// connectors' last test, git), and what each one blocks when it fails.
// Edges point from what a node reads to the node. A node whose source is
// failing says "Blocked by …", like a status page greys what depends on it.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, OLLAMA_URL, CHIP_CLAUDE_BIN } from './config.mjs';
import { BELLA } from './bella-work.mjs';
import { BASE, listChecks } from './checks.mjs';
import { waitingChecks } from './review.mjs';
import { bellaPairs } from '../../scripts/lib/bella-pairs.mjs';

// one number, one source: the pairs count comes from BELLA's own list, the reader Health uses (/gaps)
function pairsLine() {
  try {
    const r = bellaPairs(BELLA);
    return `${r.checked} pairs checked across 4 themes${r.ok ? ', all clear the bar' : ''}.`;
  } catch {
    return 'Not run yet.';
  }
}
import * as host from '../host/registry.js';

const git = (args) => {
  try {
    return execFileSync('git', ['-C', BELLA, '--no-optional-locks', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
};
const lastChange = (paths) => git(['log', '-1', '--format=%h · %ad · %s', '--date=short', BASE, '--', ...paths]);
const has = (cmd) => {
  try {
    execFileSync('/bin/sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const fromCheck = (c) => (!c ? 'unknown' : c.status === 'passed' ? 'ok' : c.status === 'failed' ? 'bad' : c.status === 'waiting' ? 'warn' : 'unknown');
const fromServer = (s) => (!s ? 'unknown' : s.disabled ? 'off' : s.status === 'connected' ? 'ok' : s.status === 'error' ? 'bad' : 'unknown');
// a Figma path is optional while another one reads: closed reads as off, never as failing
const optional = (s) => (fromServer(s) === 'bad' ? 'off' : fromServer(s));

// one gate, one reading (audit 10): the gate on BELLA's newest commit with a result, from
// bella.json's history, the source Health's Gate card reads (app/src/pages/healthModel.js)
function gateOf(history = []) {
  const last = history.filter((h) => h.gate).sort((a, b) => b.committedAt.localeCompare(a.committedAt))[0];
  if (!last) return { state: 'unknown', detail: 'Not run yet.' };
  const parts = [last.gate.contrastPairs, last.gate.contractParity].filter((x) => x != null);
  const ok = parts.filter(Boolean).length;
  const when = new Date(last.committedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return {
    state: last.gate.ok ? 'ok' : 'bad',
    detail: `${ok} of ${parts.length} pass on the last commit, ${when}. ${ok === parts.length ? 'All pass, every commit.' : `${parts.length - ok} failing.`}`,
  };
}

/** GET /map */
export async function systemMap() {
  const bella = JSON.parse(readFileSync(join(ROOT, 'data/bella.json'), 'utf8'));
  const { checks } = listChecks({ waiting: waitingChecks() });
  const lastGate = gateOf(bella.history);
  const ck = Object.fromEntries(checks.map((c) => [c.id, c]));
  // a read only: a test runs at start, on Refresh and on a Test button, never on a page load
  const list = host.servers();
  const servers = Object.fromEntries(list.map((s) => [s.name, s]));
  const fig = host.figmaSummary(list);
  // Figma counts as up when any read path answers; the others are then optional
  const figmaState = (s) => (fig.connected ? optional(s) : fromServer(s));
  const readPath = ['figma-rest', 'figma'].find((n) => servers[n]?.status === 'connected') ?? 'figma-rest';
  let ollama = 'unknown';
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    ollama = r.ok ? 'ok' : 'bad';
  } catch {
    ollama = 'bad';
  }
  const n = bella.counts;
  const node = (o) => ({ deps: [], ...o });
  const nodes = [
    // Design
    // the BELLA library's file key: Components' Figma check reads the library through it (audit 10: Figma's Need setup "Figma key")
    node({ id: 'figma-key', group: 'Design', name: 'Figma key', state: process.env.FIGMA_FILE_KEY ? 'ok' : 'bad', detail: process.env.FIGMA_FILE_KEY ? 'The BELLA library’s file key is in server/.env.' : 'Add the BELLA library’s file key to server/.env as FIGMA_FILE_KEY: the part after /design/ in its Figma link. Then restart CHIP.', source: 'server/.env', action: { type: 'test', server: 'figma-rest', label: 'Add key' } }),
    node({ id: 'figma-rest', group: 'Design', name: 'Figma REST', state: figmaState(servers['figma-rest']), detail: servers['figma-rest']?.setup ? `Optional upgrade: reads Figma with no app open once a token is in server/.env. ${fig.sentence}` : servers['figma-rest']?.status === 'error' ? servers['figma-rest'].error : `${servers['figma-rest']?.status ?? 'not tested'}. ${servers['figma-rest']?.note ?? ''}`, source: 'Figma REST API · server/.env', action: { type: 'test', server: 'figma-rest', label: 'Test it' } }),
    node({ id: 'figma', group: 'Design', name: 'Figma desktop MCP', state: figmaState(servers.figma), detail: servers.figma ? `${servers.figma.status === 'error' ? 'Closed now' : servers.figma.status}. Answers while the Figma app is open with Dev Mode MCP on; reads the file that is open.` : 'Not configured.', source: 'chip.config.local.json · last test', action: { type: 'test', server: 'figma', label: 'Test it' } }),
    node({ id: 'figma-console', group: 'Design', name: 'figma-console', state: figmaState(servers['figma-console']), detail: servers['figma-console'] ? `${servers['figma-console'].status}. ${servers['figma-console'].note}` : 'Not configured.', source: 'chip.config.local.json · last test', action: { type: 'test', server: 'figma-console', label: 'Test it' } }),
    // Source
    node({ id: 'tokens', group: 'Source', name: 'Tokens', state: fromCheck(ck['tokens-built']), detail: `${n.cssVars.light} CSS variables, four themes. ${ck['tokens-built']?.summary ?? 'Not checked yet.'}`, source: `tokens/*.json · ${lastChange(['tokens']) ?? ''}` }),
    node({ id: 'contracts', group: 'Source', name: 'Contracts', state: fromCheck(ck.contract), detail: `${n.withContract} of ${n.components} components have one. ${ck.contract?.summary ?? ''}`, source: `tokens/contracts.json · ${lastChange(['tokens/contracts.json']) ?? ''}`, deps: ['tokens'] }),
    node({ id: 'components', group: 'Source', name: 'Components', state: 'ok', detail: `${n.components} components in src/components.`, source: `src/components · ${lastChange(['src/components']) ?? ''}`, deps: ['tokens', 'contracts'] }),
    // Checks
    node({ id: 'contrast', group: 'Checks', name: 'Contrast pairs', state: fromCheck(ck.contrast), detail: ck.contrast?.failures?.[0] ?? pairsLine(), source: 'scripts/contrast-pairs.mjs (BELLA’s own pairs, as Health reads them)', deps: ['tokens'], action: { type: 'review', check: 'contrast', label: 'Open the review card' } }),
    // a part with no story needs someone, as Health counts it (audit 11), whether or not the visual run has happened
    node({ id: 'stories', group: 'Checks', name: 'Stories & tests', state: n.withStory < n.components ? 'bad' : fromCheck(ck.visual), detail: `${n.withStory} of ${n.components} components have a story. ${ck.visual?.summary ?? 'Not run yet.'}`, source: 'npm run audit:visual · data/checks/visual.json', deps: ['components'], action: { type: 'run', check: 'visual', label: 'Run the stories' } }),
    node({ id: 'agents', group: 'Checks', name: 'AGENTS.md', state: fromCheck(ck['agents-md']), detail: ck['agents-md']?.summary ?? 'Not run yet.', source: `AGENTS.md · ${lastChange(['AGENTS.md']) ?? ''}`, deps: ['components'] }),
    node({ id: 'gate', group: 'Checks', name: 'Gate', measured: true, state: lastGate.state, detail: lastGate.detail, source: 'npm run gate · the pre-commit hook · data/bella.json history', deps: ['contrast', 'contracts', 'agents', 'tokens', 'stories'] }),
    node({ id: 'bench', group: 'Checks', name: 'Bench', state: ck['bench-static']?.status === 'not-run' ? 'unknown' : ck['bench-static']?.score >= 70 ? 'ok' : 'warn', detail: ck['bench-static']?.summary ?? 'Not run yet.', source: '~/DEV/tools/odsb · data/checks/bench-static.json', deps: ['components', 'agents'], action: { type: 'run', check: 'bench-static', label: 'Run the bench now' } }),
    node({ id: 'compare', group: 'Checks', name: 'Compare with Figma', state: 'unknown', detail: `Reads each component set through ${readPath === 'figma' ? 'the desktop MCP (REST has no token)' : 'the Figma REST API'}.`, source: 'Components · Compare tab · Connectors › Figma baseline', deps: [readPath, 'components'] }),
    // Review and ship
    node({ id: 'review', group: 'Review', name: 'Review card', state: 'ok', detail: 'Accept makes a local chip/fix-* branch; Undo deletes it.', source: 'server/lib/review.mjs', deps: ['gate'] }),
    node({ id: 'ci', group: 'Review', name: 'CI', state: 'unknown', detail: `GitHub runs the gate after a push. ${git(['rev-list', '--count', `${BASE}@{upstream}..${BASE}`]) === '0' ? `${BASE} has nothing unpushed.` : 'Local commits are not pushed yet.'}`, source: 'GitHub Actions (read only through gh)', deps: ['gate'] }),
    node({ id: 'ship', group: 'Ship', name: 'Merge and release', state: 'unknown', detail: 'A maintainer merges. CHIP never merges or pushes.', source: 'git', deps: ['review', 'ci'] }),
    // Context
    node({ id: 'git', group: 'Context', name: 'git', state: git(['rev-parse', BASE]) ? 'ok' : 'bad', detail: `${BASE} @ ${git(['rev-parse', '--short', BASE]) ?? '?'}.`, source: BELLA.replace(process.env.HOME, '~') }),
    node({ id: 'ollama', group: 'Context', name: 'Local model', state: ollama, detail: ollama === 'ok' ? `Ollama answers at ${OLLAMA_URL}.` : `Ollama is not answering at ${OLLAMA_URL}.`, source: 'OBI (search, local answers)' }),
    node({ id: 'claude', group: 'Context', name: 'Claude', state: has(CHIP_CLAUDE_BIN) ? 'ok' : 'bad', detail: has(CHIP_CLAUDE_BIN) ? 'Claude Code is installed; OBI answers through it by default, and the Claude tab runs it.' : 'The claude command is not on PATH.', source: 'OBI · the Claude tab' }),
    node({ id: 'notion', group: 'Context', name: 'Notion', state: servers.notion ? fromServer(servers.notion) : existsSync(join(ROOT, 'data/notion')) ? 'ok' : 'unknown', detail: servers.notion?.status === 'connected' ? `${servers.notion.detail ?? 'Answering.'} The same token feeds npm run sync:notion.` : servers.notion?.error ?? 'Read through CHIP’s own sync into data/notion.', source: 'Notion API · server/.env · npm run sync:notion', action: servers.notion ? { type: 'test', server: 'notion', label: 'Test it' } : undefined }),
  ];
  // a failing source blocks what reads it, all the way down
  const byId = Object.fromEntries(nodes.map((x) => [x.id, x]));
  const blockedBy = (x, seen = new Set()) => {
    for (const d of x.deps) {
      if (seen.has(d)) continue;
      seen.add(d);
      const dep = byId[d];
      if (!dep) continue;
      if (dep.state === 'bad') return dep;
      const up = blockedBy(dep, seen);
      if (up) return up;
    }
    return null;
  };
  for (const x of nodes) {
    // a measured reading (the gate, from BELLA's commits) keeps its answer: one gate, one reading
    // on Health, System map and Connectors (user test 21 Nov, item 3)
    const b = x.state !== 'bad' && !x.measured ? blockedBy(x) : null;
    if (b) {
      x.blockedBy = { id: b.id, name: b.name };
      x.state = 'blocked';
    }
    x.dependents = nodes.filter((o) => o.deps.includes(x.id)).map((o) => o.name);
  }
  const groups = [...new Set(nodes.map((x) => x.group))].map((g) => {
    const kids = nodes.filter((x) => x.group === g);
    // a part that's off (an optional Figma path) doesn't count against its stage
    const inUse = kids.filter((k) => k.state !== 'off');
    const worst = ['bad', 'blocked', 'warn', 'unknown', 'ok'].find((s) => inUse.some((k) => k.state === s)) ?? 'off';
    return { id: g, name: g, state: worst, ok: inUse.filter((k) => k.state === 'ok').length, of: inUse.length };
  });
  const bad = nodes.filter((x) => x.state === 'bad');
  const blocking = bad.map((b) => ({ b, hit: nodes.filter((x) => x.blockedBy?.id === b.id).map((x) => x.name) })).filter((x) => x.hit.length);
  const sentence = bad.length
    ? `Failing: ${bad.map((b) => b.name).join(', ')}.${blocking.length ? ` Blocked because of that: ${blocking.map((x) => `${x.hit.join(', ')} (by ${x.b.name})`).join('; ')}.` : ''}`
    : 'Nothing is failing.';
  return { nodes, groups, sentence, base: BASE };
}
