// What stands behind a Processes step, read live from the files (Elleta, 22 Nov 2026: "see the skill, harness whatever
// to see highlights of how its working why"). Read only. A step maps to a skill or a script through the table below;
// the file id a page sends is only ever a key of that table, so no path a caller types is opened (same idea as
// system-docs.mjs). server/test/step-facts.test.mjs proves the origin guard and the allow-list.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { structure } from './system-docs.mjs';
import { auditHistory } from './audits.mjs';

const HOME = homedir();
const CHIP = process.env.CHIP_ROOT || join(HOME, 'DEV/chip-whole');
const THEME = process.env.BELLA_THEME_DIR || join(HOME, 'DEV/bella-chip-theme');

// `${map}:${step}` -> where it comes from. skill: a name searched in the skill folders; script: a file in one of the two checkouts.
export const STEPS = {
  'audits:tokarch': { skill: 'ds-token-architecture', kind: 'tokens', terms: ['ds-token-architecture'] },
  'audits:prodinsp': { skill: 'product-inspection', kind: 'product', terms: ['product-inspection'] },
  'audits:dsinsp': { skill: 'ds-inspection', kind: 'ds', terms: ['ds-inspection'] },
  'audits:pixel': { skill: 'figma-pixel-perfect', terms: ['pixel-check'] },
  'audits:sweep': { script: 'chip:scripts/data-sweep.mjs', terms: ['data-sweep'] },
  'audits:copilot': { script: 'chip:scripts/second-review.mjs', terms: ['Second review', 'Copilot'] },
  'audits:hook': { script: 'hook:pre-commit', terms: ['pre-commit', 'Local CI'] },
  'pipeline:contrast': { script: 'theme:scripts/contrast-pairs.mjs', terms: ['contrast pairs'] },
  'pipeline:contracts': { script: 'theme:scripts/contract-parity.mjs', terms: ['contract parity'] },
};

const ROOTS = { chip: CHIP, theme: THEME };
const hookFile = () => {
  for (const base of [CHIP, join(HOME, 'DEV/chip')]) {
    const f = join(base, '.git/hooks/pre-commit');
    if (existsSync(f)) return f;
  }
  return null;
};
const scriptPath = (ref) => {
  if (ref === 'hook:pre-commit') return hookFile();
  const [root, rel] = ref.split(':');
  const f = join(ROOTS[root], rel);
  return existsSync(f) ? f : null;
};

/** Where a skill's SKILL.md lives: the user's skill folders, then the synced and plugin ones. */
export function findSkill(name) {
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  const direct = [join(HOME, '.claude/skills', name), join(HOME, '.agents/skills', name)];
  const under = (dir, depth) => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).flatMap((e) => (depth > 0 ? [join(dir, e.name, name), ...under(join(dir, e.name), depth - 1)] : [join(dir, e.name, name)]));
  };
  const found = [...direct, ...under(join(HOME, '.claude/skills/synced'), 0), ...under(join(HOME, '.claude/plugins/cache'), 3).filter((p) => p.includes('/skills/'))];
  return found.map((d) => join(d, 'SKILL.md')).find((f) => existsSync(f)) ?? null;
}

const clean = (s) => String(s).replace(/\*\*|`|^[-*]\s+/g, '').replace(/\s+/g, ' ').trim();
const sentence = (s, max = 220) => {
  const one = clean(s).split(/(?<=[.!?])\s/)[0];
  if (one.length <= max) return one;
  // cut at the last clause end inside the limit, never mid-word
  const cut = one.slice(0, max);
  const at = Math.max(cut.lastIndexOf(' — '), cut.lastIndexOf(', '), cut.lastIndexOf(' (')) > max * 0.5 ? Math.max(cut.lastIndexOf(' — '), cut.lastIndexOf(', '), cut.lastIndexOf(' (')) : cut.lastIndexOf(' ');
  return `${cut.slice(0, at).replace(/[,—(\s]+$/, '')}…`;
};

/** A skill: its description's first sentences, then its first headings, as 4 to 6 bullets. */
export function skillFacts(text) {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  const desc = fm?.[1].match(/^description:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, '') ?? '';
  const sentences = desc.split(/(?<=[.!?])\s+/).filter(Boolean);
  const heads = [...text.replace(/^---[\s\S]*?\n---/, '').matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => clean(m[1]).replace(/^\d+[.)]\s*/, ''));
  const bullets = [];
  if (sentences[0]) bullets.push(sentence(sentences[0], 120));
  const use = sentences.find((s) => /^Use (when|whenever)/i.test(s));
  if (use) bullets.push(sentence(use, 110));
  for (const h of heads.slice(1).map((x) => x.replace(/\s*\(.*?\)/g, ''))) {
    if (bullets.length >= 6) break;
    if (!bullets.includes(h)) bullets.push(`Covers: ${h}`);
  }
  return { what: sentence(sentences[0] ?? '', 120), bullets: bullets.slice(0, 6) };
}

/** A script: its header comment, what it fails on, as bullets. */
export function scriptFacts(text, isHook = false) {
  const lines = text.split('\n');
  const head = [];
  for (const l of lines.slice(isHook ? 1 : 0)) {
    if (/^#!/.test(l)) continue;
    const m = l.match(/^\s*(?:\/\/|#)\s?(.*)$/);
    if (!m) {
      if (head.length) break;
      if (l.trim() === '' || /^import /.test(l)) continue;
      break;
    }
    head.push(m[1]);
  }
  const joined = [];
  for (const l of head) {
    if (/^\s*[-*]\s/.test(l) || !joined.length) joined.push(l.trim());
    else joined[joined.length - 1] += ` ${l.trim()}`;
  }
  const strip = (x) => x.replace(/\([^)]*Elleta[^)]*\)/g, '').replace(/\s+([.,:])/g, '$1').replace(/\s+/g, ' ').trim();
  const parts = joined.map((l) => strip(clean(l))).flatMap((l) => l.split(/(?<=[.!?])\s+/)).filter((x) => x.length > 20 && !/["“”]|Elleta/.test(x) && !/:$/.test(x));
  const isFail = (x) => /\bfails?\b|\bblocks?\b|exit 1|refuses/i.test(x);
  const cap1 = (x) => x[0].toUpperCase() + x.slice(1);
  const bullets = [...parts.filter((x) => !isFail(x)).slice(0, 4).map((x) => cap1(sentence(x, 140))), ...parts.filter(isFail).slice(0, 2).map((x) => cap1(sentence(x, 150)))];
  return { what: bullets[0] ?? '', bullets: bullets.slice(0, 6) };
}

/** One line on why it matters, from the project's CLAUDE.md: the first line naming the step. */
function whyOf(terms, found = {}) {
  for (const f of [join(CHIP, 'CLAUDE.md'), join(HOME, 'DEV/chip/CLAUDE.md')]) {
    if (!existsSync(f)) continue;
    const lines = readFileSync(f, 'utf8').split('\n');
    for (const t of terms) {
      const l = lines.find((x) => x.toLowerCase().includes(t.toLowerCase()) && x.length > 40 && !/^#/.test(x));
      if (l) {
        // the section it sits in, so the screen can show where the rule comes from (Sources are the real thing, 23 Nov)
        const at = lines.indexOf(l);
        const head = lines.slice(0, at).reverse().find((x) => /^##\s/.test(x));
        found.heading = head ? head.replace(/^##\s+/, '').replace(/\s*\([^)]*\)\s*$/, '').trim() : null;
        return sentence(clean(l).replace(/\(Elleta[^)]*\)/g, ''), 190);
      }
    }
  }
  return null;
}

const daysSince = (day) => Math.floor((Date.now() - new Date(`${day}T12:00:00`).getTime()) / 86_400_000);

/** The facts behind one step. Nothing here is typed by hand except the table of where a step comes from. */
export function stepFacts(map, step) {
  const e = STEPS[`${map}:${step}`];
  const out = { map, step, source: null, what: null, bullets: [], why: null, runs: [], last: null, gaps: [], inGuard: null };
  if (!e) {
    out.gaps.push('No skill or script is wired to this step', 'No saved result: nothing keeps what this one found');
    return out;
  }
  let text = null;
  if (e.skill) {
    const f = findSkill(e.skill);
    out.source = { kind: 'skill', name: e.skill, id: `skill:${e.skill}`, found: Boolean(f) };
    if (f) Object.assign(out, skillFacts((text = readFileSync(f, 'utf8'))));
  } else {
    const f = scriptPath(e.script);
    const name = e.script.split('/').pop();
    out.source = { kind: 'script', name, id: `script:${e.script}`, found: Boolean(f) };
    if (f) {
      Object.assign(out, scriptFacts((text = readFileSync(f, 'utf8')), e.script.startsWith('hook:')));
      // is it in the guard: named by the pre-commit hook, the on-system guard or a package.json script
      const hay = [hookFile(), join(CHIP, 'scripts/on-system-guard.mjs'), join(CHIP, 'package.json'), join(THEME, 'package.json')].filter((p) => p && existsSync(p)).map((p) => readFileSync(p, 'utf8')).join('\n');
      out.inGuard = e.script.startsWith('hook:') ? true : hay.includes(name);
      if (!out.inGuard) out.gaps.push(`${name} is not run by the pre-commit hook, the guard or an npm script`);
    }
  }
  const found = {};
  out.why = whyOf(e.terms, found);
  out.whyHeading = found.heading ?? null;
  if (e.kind) {
    out.runs = auditHistory(e.kind).slice(-8);
    out.last = out.runs.at(-1) ?? null;
    if (!out.last) out.gaps.push('No saved result: no report in docs/reference/audit');
    else if (daysSince(out.last.day) > 7) out.gaps.push(`Not run since ${out.last.day}, ${daysSince(out.last.day)} days ago`);
  } else out.gaps.push('No saved result: nothing keeps what this one found');
  return out;
}

/** The file behind a step as structure for the reading drawer. null when the id is not in the table. */
export function stepFile(id) {
  const [kind, ...rest] = String(id).split(':');
  const key = rest.join(':');
  const entry = Object.values(STEPS).find((e) => (kind === 'skill' ? e.skill === key : kind === 'script' ? e.script === key : false));
  if (!entry) return null;
  const file = kind === 'skill' ? findSkill(key) : scriptPath(key);
  if (!file) return null;
  const text = readFileSync(file, 'utf8').slice(0, 80_000);
  const st = statSync(file);
  const head = { id, kind: kind === 'skill' ? 'Skill' : 'Script', title: kind === 'skill' ? key : key.split('/').pop(), updated: st.mtime.toISOString(), bytes: st.size };
  if (kind === 'skill') return { ...head, ...structure(text) };
  const lang = key.endsWith('.mjs') || key.endsWith('.js') ? 'javascript' : 'text';
  return { ...head, sections: [{ title: null, level: 0, blocks: [{ t: 'code', lang, text }] }] };
}

/** Routes behind the origin guard: a GET from another site is refused, like every other route here. */
export function stepRoutes({ origins }) {
  const r = express.Router();
  const ok = (req, res) => {
    const o = req.get('origin');
    if (o && !origins.has(o)) {
      res.status(403).json({ error: 'Not from CHIP' });
      return false;
    }
    return true;
  };
  r.get('/step-facts', (req, res) => {
    if (!ok(req, res)) return;
    res.set('Cache-Control', 'no-store');
    res.json(stepFacts(String(req.query.map ?? ''), String(req.query.step ?? '')));
  });
  r.get('/step-file', (req, res) => {
    if (!ok(req, res)) return;
    const f = stepFile(String(req.query.id ?? ''));
    if (!f) return res.status(404).json({ error: 'Not a file CHIP shows' });
    res.json(f);
  });
  return r;
}
