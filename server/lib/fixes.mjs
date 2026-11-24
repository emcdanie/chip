// The permanent-fix log (Elleta, 23 Nov: "build the permanent-fix log so Closed loops shows real before and after").
// One small file, data/fixes.json: each entry is something that keeps coming back and the fix that closes it.
//   planned: she approved the plan on Not again; nothing has landed yet (no commit, no date landed)
//   landed:  the change is committed: kind, date landed, what changed, commit id, the recurring item it closes
// Nothing is typed in for her: a fix lands only from a kept run (keepRun) or from a real commit that git can find.
import express from 'express';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DATA_DIR, ROOT } from './config.mjs';

export const FIXES_FILE = process.env.CHIP_FIXES_FILE || join(DATA_DIR, 'fixes.json');
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export function readFixes(file = FIXES_FILE) {
  try {
    const a = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
function write(list, file) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`);
  renameSync(tmp, file);
}

/** A commit id git can find in this repo (or the repo given), as its short form; null when it cannot. */
export function commitOf(id, { cwd = ROOT, git = (args, c) => execFileSync('git', ['-C', c, '--no-optional-locks', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } = {}) {
  if (!/^[0-9a-f]{7,40}$/i.test(String(id ?? ''))) return null;
  try {
    return git(['rev-parse', '--short', `${id}^{commit}`], cwd).trim() || null;
  } catch {
    return null;
  }
}

const idOf = (list) => `fix-${list.length + 1}-${Date.now().toString(36)}`;

/** She approved a plan: record what it will close. Never landed here. runTitle ties it to the run that keepRun lands. */
export function planFix(input, { file = FIXES_FILE, now = new Date() } = {}) {
  const kind = clip(input?.kind, 120);
  const closes = clip(input?.closes, 160);
  if (!kind || !closes) throw new Error('A fix needs its name and the recurring item it closes');
  const list = readFixes(file);
  const e = { id: idOf(list), status: 'planned', kind, closes, check: clip(input?.check, 60) || null, changed: clip(input?.changed, 300) || null, runTitle: clip(input?.runTitle, 120) || null, planned: now.toISOString() };
  list.push(e);
  write(list, file);
  return e;
}

/** The change is committed. Needs a commit git can find. Lands the newest planned fix for that run title, else records a new one. */
export function landFix(input, { file = FIXES_FILE, now = new Date(), verify = commitOf, cwd = ROOT } = {}) {
  const commit = verify(input?.commit, { cwd });
  if (!commit) throw new Error('That commit is not in this repository, so nothing is logged as landed');
  const list = readFixes(file);
  const title = clip(input?.runTitle, 120);
  const planned = title ? [...list].reverse().find((f) => f.status === 'planned' && f.runTitle === title) : null;
  const landed = Number.isFinite(Date.parse(input?.landed)) ? new Date(input.landed).toISOString() : now.toISOString();
  const base = planned ?? { id: idOf(list), kind: clip(input?.kind, 120), closes: clip(input?.closes, 160), check: clip(input?.check, 60) || null, runTitle: title || null };
  if (!base.kind || !base.closes) throw new Error('A landed fix needs its name and the recurring item it closes');
  const e = { ...base, status: 'landed', landed, commit, changed: clip(input?.changed, 300) || base.changed || null };
  if (planned) list[list.indexOf(planned)] = e;
  else list.push(e);
  write(list, file);
  return e;
}

/** Routes: a write needs CHIP's own Origin (a tool with none is refused too); a read from another site is refused. */
export function fixesRoutes({ origins, file = FIXES_FILE }) {
  const r = express.Router();
  const ok = (req, res, write) => {
    const o = req.get('origin');
    if (o ? !origins.has(o) : write) {
      res.status(403).json({ error: 'Not from CHIP' });
      return false;
    }
    return true;
  };
  r.get('/not-again/fixes', (req, res) => {
    if (ok(req, res, false)) res.json({ fixes: readFixes(file) });
  });
  r.post('/not-again/fixes', express.json({ limit: '20kb' }), (req, res) => {
    if (!ok(req, res, true)) return;
    try {
      res.status(201).json(planFix(req.body, { file }));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  return r;
}
