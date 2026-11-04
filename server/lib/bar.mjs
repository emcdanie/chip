// The Bar · CHIP port. Watches lane inbox files and streams state/events to
// OBI. Logic ported from ~/DEV/tools/the-bar/server.js; CHIP's HTTP server
// owns the routes (GET /bar/state, /bar/stream, /bar/img).
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { ROOT, DATA_DIR, INBOX_DIR } from './config.mjs';
import { spawnSync, execFileSync } from 'node:child_process';

// ---------- config ----------
function readLocalConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'chip.config.local.json'), 'utf8')); } catch { return {}; }
}
const localCfg = readLocalConfig();
const barCfg = localCfg.bar ?? {};
const expand = (p) => (typeof p === 'string' ? p.replace(/^~\//, `${homedir()}/`) : p);
const CAD = expand(barCfg.cadInbox) || path.join(homedir(), 'DEV', 'ctrl-alt-design', 'docs', 'reference', 'inbox');
const BELLA = expand(barCfg.bellaInbox) || path.join(homedir(), 'DEV', 'bella', 'docs', 'reference', 'inbox');
const CHIP_INBOX = INBOX_DIR;
const BELLA_ROOT = path.resolve(BELLA, '../../..');

function gitRemoteRepo(dir) {
  try {
    const url = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return m ? m[1] : null;
  } catch { return null; }
}
const CAD_REPO = 'emcdanie/ctrl-alt-design';
const BELLA_REPO = gitRemoteRepo(BELLA_ROOT);
const CHIP_REPO  = gitRemoteRepo(ROOT);

const IMG = /\.(png|jpe?g|webp|gif)$/i;
const HIST = path.join(DATA_DIR, 'bar-history.jsonl');
const SEEN_FILE = path.join(DATA_DIR, 'bar-seen.json');
const ROOTS = { cad: CAD, bella: BELLA };

// Frankie: dual report paths, newest wins. Reported in /bar/state as frankieSource.
const FRANKIE_REPORT_PATHS = [
  path.join(CHIP_INBOX, 'report.md'),
  path.join(BELLA, 'report.md'),
];

const LANES = [
  { id: 'seamus',  name: 'Seamus',  role: 'barman · Cowork', repo: null },
  { id: 'dara',    name: 'Dara',    role: 'lane a · site',   report: path.join(CAD, 'reports/a.md'),     now: path.join(CAD, 'lanes/a.md'),          repo: CAD_REPO },
  { id: 'bernie',  name: 'Bernie',  role: 'lane b · fixes',  report: path.join(CAD, 'reports/b.md'),     now: path.join(CAD, 'lanes/b.md'),          repo: CAD_REPO },
  { id: 'saoirse', name: 'Saoirse', role: 'Figma',           report: path.join(CAD, 'reports/figma.md'), now: path.join(CAD, 'lanes/figma.md'),      repo: CAD_REPO },
  { id: 'frankie', name: 'Frankie', role: 'BELLA', frankieDual: true,                                                                                 repo: BELLA_REPO },
  { id: 'liam',    name: 'Liam',    role: 'CHIP',            report: path.join(CHIP_INBOX, 'liam-report.md'), now: path.join(CHIP_INBOX, 'liam-next.md'), repo: CHIP_REPO },
];
const SCREEN_DIRS = [['cad', 'screens'], ['bella', 'screens']];

// ---------- CI truth ----------
// PR numbers: only from lines that carry a claim word or start with #/PR/OK.
// Strips: everything after "Needs Elleta", inline backtick/quote/paren content,
// and Markdown bold-label lines (**label**: — liam-style summary headers).
export function extractPrNums(text) {
  if (!text) return [];
  const needsIdx = text.search(/^(?:#{1,2}\s+)?Needs Elleta\b/im);
  const body = needsIdx >= 0 ? text.slice(0, needsIdx) : text;
  const stripped = body
    .replace(/`[^`\n]*`/g, '')
    .replace(/"[^"\n]*"/g, '')
    .replace(/\([^)\n]*\)/g, '');
  const CLAIM     = /\b(green|red|running|merged|passed|failed|in.?progress|pending|CI)\b/i;
  const BOLD_LABEL = /^\*\*[^*\n]+\*\*\s*:/;
  const PR_START  = /^(?:PR\s*#?|OK\s*#|#)\d{2,4}/i;
  const PR_PAT    = /(?:PR\s*#?|OK\s*#|#)(\d{2,4})\b/gi;
  const nums = new Set();
  for (const raw of stripped.split('\n')) {
    const line = raw.trim();
    if (!line || BOLD_LABEL.test(line)) continue;
    if (!CLAIM.test(line) && !PR_START.test(line)) continue;
    for (const m of line.matchAll(PR_PAT)) nums.add(Number(m[1]));
  }
  return [...nums];
}

// Claim: what the lane says about its own CI result. Last status word wins.
export function parseClaim(text) {
  if (!text) return 'none';
  const hits = [];
  const G = /\b(CI green|CI passed|CI pass\b|tests pass(?:ed)?|checks pass(?:ed)?|gate(?:s)? pass(?:ed)?|all green|succeed(?:ed)?|passed|green)\b/gi;
  const R = /\b(CI red|CI fail(?:ed)?|tests fail(?:ed)?|gate(?:s)? fail(?:ed)?|failed|red)\b/gi;
  const W = /\b(CI running|in.?progress|running|pending)\b/gi;
  for (const m of text.matchAll(G)) hits.push({ pos: m.index, val: 'green' });
  for (const m of text.matchAll(R)) hits.push({ pos: m.index, val: 'red' });
  for (const m of text.matchAll(W)) hits.push({ pos: m.index, val: 'running' });
  if (!hits.length) return 'none';
  return hits.reduce((a, b) => b.pos > a.pos ? b : a).val;
}

// Mismatch: claim ≠ ci, and both are meaningful (not none/unknown/merged).
export function isMismatch(claim, ci) {
  if (claim === 'none' || ci === 'unknown' || ci === 'merged') return false;
  return claim !== ci;
}

// Derive CI status from gh output (synchronous, call only at scan/report-change time).
function ghCiStatus(n, repo) {
  if (!repo) return 'unknown';
  try {
    const r = spawnSync('gh', ['pr', 'view', String(n), '--repo', repo, '--json', 'number,state,statusCheckRollup'],
      { encoding: 'utf8', timeout: 12000 });
    if (r.status !== 0 || !r.stdout) return 'unknown';
    const d = JSON.parse(r.stdout);
    if (d.state === 'MERGED') return 'merged';
    if (d.state === 'CLOSED') return 'unknown';
    const checks = (d.statusCheckRollup ?? []);
    if (!checks.length) return 'unknown';
    for (const c of checks) {
      if (c.__typename === 'CheckRun' && c.conclusion === 'FAILURE') return 'red';
      if (c.__typename === 'StatusContext' && (c.state === 'FAILURE' || c.state === 'ERROR')) return 'red';
    }
    for (const c of checks) {
      if (c.status === 'IN_PROGRESS' || c.status === 'QUEUED' || c.status === 'PENDING') return 'running';
      if (c.__typename === 'StatusContext' && c.state === 'PENDING') return 'running';
    }
    return 'green';
  } catch { return 'unknown'; }
}

// ciCache: laneId → { reportMtime: number, prs: [{n, claim, ci, checkedAt}] }
const ciCache = {};

function refreshCiForLane(laneId, reportText, reportMtime, repo) {
  const nums = extractPrNums(reportText);
  const claim = parseClaim(reportText);
  const prs = repo ? nums.map((n) => ({ n, claim, ci: ghCiStatus(n, repo), checkedAt: Date.now() })) : [];
  ciCache[laneId] = { reportMtime, prs };
}

// ---------- state ----------
let events = [];
for (const line of (read(HIST) || '').split('\n')) {
  if (line.trim()) try { events.push(JSON.parse(line)); } catch {}
}
let seen = {}; try { seen = JSON.parse(read(SEEN_FILE) || '{}'); } catch { seen = {}; }
const firstRun = !seen.__init;
const clients = new Set();

// ---------- helpers ----------
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function mtime(p) { try { return fs.statSync(p).mtimeMs; } catch { return 0; } }

function push(ev) {
  ev.id = `${ev.t}-${Math.random().toString(36).slice(2, 7)}`;
  events.push(ev);
  try { fs.appendFileSync(HIST, JSON.stringify(ev) + '\n'); } catch {}
  broadcast({ type: 'event', event: ev });
}
function saveSeen() { try { fs.writeFileSync(SEEN_FILE, JSON.stringify(seen)); } catch {} }
function broadcast(msg) {
  const s = `data: ${JSON.stringify(msg)}\n\n`;
  for (const c of clients) c.write(s);
}

// ---------- parsing ----------
function nowVersion(text) { const m = text && text.match(/##\s*NOW\s*\(v(\d+)/i); return m ? Number(m[1]) : null; }
function nowFirstLine(text) {
  const m = text && text.match(/##\s*NOW\s*\(([^)]*)\)\s*[—-]?\s*([^\n]*)/i);
  return m ? { label: m[1].trim(), line: m[2].trim() } : null;
}
function reportVersion(text) { const m = text && text.match(/NOW\s+v(\d+)/i); return m ? Number(m[1]) : null; }
function needs(text) {
  if (!text) return [];
  const i = text.search(/Needs Elleta/i);
  if (i < 0) return [];
  const out = [];
  for (const raw of text.slice(i).split('\n').slice(1)) {
    const line = raw.trim();
    if (!line) { if (out.length) break; else continue; }
    if (/^(—|--|tuts|cheers|right|grand)/i.test(line) && out.length) break;
    const m = line.match(/^(?:\d+[.)]|[-*•])\s+(.*)/);
    if (m) out.push(m[1]); else if (out.length) out[out.length - 1] += ' ' + line;
  }
  return out.filter((s) => !/^(none|nothing|n\/a)\b|standing by/i.test(s));
}
function commands(s) {
  const out = new Set();
  for (const m of s.matchAll(/`([^`]+)`/g)) out.add(m[1]);
  for (const m of s.matchAll(/\bOK #\d+/g)) out.add(m[0]);
  return [...out];
}

// ---------- lane state ----------
function frankieReport() {
  // newest of the two paths wins
  const mtimes = FRANKIE_REPORT_PATHS.map((p) => ({ p, m: mtime(p) }));
  const best = mtimes.reduce((a, b) => (b.m > a.m ? b : a), mtimes[0]);
  return { text: read(best.p), path: best.p, source: best.p.startsWith(CHIP_INBOX) ? 'chip-inbox' : 'bella-inbox' };
}

export function laneState() {
  const frankieRep = frankieReport();
  return LANES.map((l) => {
    if (l.frankieDual) {
      const rep = frankieRep.text;
      const n = needs(rep).map((t) => ({ text: t, cmds: commands(t) }));
      const rv = reportVersion(rep);
      // no report file read: nothing is known, so say so rather than "done"
      let status = rep == null ? 'no report' : 'done';
      if (n.length) status = 'waiting on you';
      return { id: l.id, name: l.name, role: l.role, status, needs: status === 'working' || status === 'parked' ? [] : n, reportVersion: rv, updated: mtime(frankieRep.path), frankieSource: frankieRep.source, prs: (ciCache['frankie']?.prs ?? []) };
    }
    // no report file to read: "no report", never a status CHIP can't see
    if (!l.report) return { ...l, status: 'no report', needs: [] };
    const rep = read(l.report);
    if (rep == null) return { id: l.id, name: l.name, role: l.role, status: 'no report', needs: [], updated: 0, prs: ciCache[l.id]?.prs ?? [] };
    const nowText = l.now ? read(l.now) : null;
    const nv = nowVersion(nowText), rv = reportVersion(rep);
    const n = needs(rep).map((t) => ({ text: t, cmds: commands(t) }));
    let status = 'done';
    const nowNewer = l.now && mtime(l.now) > mtime(l.report) + 1000;
    if (nowText && /\bPARKED\b/.test(nowFirstLine(nowText)?.line || '')) status = 'parked';
    else if (nowNewer || (nv && rv && nv > rv)) status = 'working';
    else if (n.length) status = 'waiting on you';
    return { id: l.id, name: l.name, role: l.role, status, needs: status === 'working' || status === 'parked' ? [] : n, nowVersion: nv, reportVersion: rv, updated: mtime(l.report), prs: (ciCache[l.id]?.prs ?? []) };
  });
}

// ---------- scanning ----------
function walk(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of list) {
    if (d.name.startsWith('.')) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, depth + 1, out); else if (IMG.test(d.name)) out.push(p);
  }
  return out;
}
function imageLane(rootKey, file) {
  if (rootKey === 'bella') return 'frankie';
  const base = path.basename(file), dir = path.basename(path.dirname(file));
  for (const l of LANES) {
    if (!l.report) continue;
    const txt = (l.now ? read(l.now) || '' : '') + (l.report ? read(l.report) || '' : '');
    if (l.report && l.report.startsWith(CAD) && (txt.includes(base) || (dir !== 'screens' && txt.includes(dir + '/')))) return l.id;
  }
  let best = 'seamus', bm = 0;
  for (const l of LANES) if (l.report && l.report.startsWith(CAD)) { const m = mtime(l.report); if (m > bm) { bm = m; best = l.id; } }
  return best;
}

export function scan() {
  const t = Date.now();
  // regular lanes
  for (const l of LANES) {
    if (l.frankieDual) {
      // scan both frankie paths
      for (const fp of FRANKIE_REPORT_PATHS) {
        const m = mtime(fp), key = 'rep:' + fp;
        if (m && seen[key] !== m) {
          const text = read(fp);
          if (text) push({ t: m, lane: 'frankie', kind: 'report', text: text.trim() });
          refreshCiForLane('frankie', text, m, BELLA_REPO);
          seen[key] = m;
        }
      }
      continue;
    }
    if (l.now) {
      const p = l.now, m = mtime(p), key = 'now:' + p;
      if (m && seen[key] !== m) {
        const f = nowFirstLine(read(p));
        if (seen[key] !== undefined || firstRun) if (f) push({ t: m, lane: 'seamus', kind: 'job', to: l.name, text: `${l.name} · ${f.label}\n${f.line}` });
        seen[key] = m;
      }
    }
    if (l.report) {
      const p = l.report, m = mtime(p), key = 'rep:' + p;
      if (m && seen[key] !== m) {
        const text = read(p);
        if (text) push({ t: m, lane: l.id, kind: 'report', text: text.trim() });
        refreshCiForLane(l.id, text, m, l.repo);
        seen[key] = m;
      }
    }
  }
  for (const [rootKey, rel] of SCREEN_DIRS) {
    const base = path.join(ROOTS[rootKey], rel);
    for (const p of walk(base)) {
      const key = 'img:' + p;
      if (seen[key]) continue;
      seen[key] = mtime(p) || t;
      if (!firstRun || seen.__init) push({ t: seen[key], lane: imageLane(rootKey, p), kind: 'image', src: rootKey, path: path.relative(ROOTS[rootKey], p) });
    }
  }
  if (!seen.__init) seen.__init = t;
  saveSeen();
  broadcast({ type: 'state', lanes: laneState() });
}

// ---------- route handlers ----------
export function barState(_req, res) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ lanes: laneState(), events: events.slice(-300) }));
}

export function barStream(_req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  res.write(': hi\n\n');
  clients.add(res);
  _req.on('close', () => clients.delete(res));
}

export function barImg(req, res) {
  const u = new URL(req.url, 'http://x');
  const rootKey = u.searchParams.get('src');
  const root = ROOTS[rootKey];
  const rel = u.searchParams.get('p') || '';
  const p = root && path.resolve(root, rel);
  if (!p || !p.startsWith(path.resolve(root) + path.sep) || !IMG.test(p)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const ext = path.extname(p).toLowerCase();
  const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
  res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'max-age=3600' });
  fs.createReadStream(p).on('error', () => res.end()).pipe(res);
}

// ---------- start ----------
if (process.env.BAR_TEST !== '1') {
  scan();
  setInterval(scan, 2000);
  setInterval(() => broadcast({ type: 'ping' }), 25000);
}
