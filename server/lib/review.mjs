// The review card (phase 6 G, 3 Nov late): a failing check opens one sheet
// that says why it fails, the exact change, what it won't touch, how far it
// reaches (from real dependents) and how to undo it. Accept makes the change
// on a local BELLA branch (chip/fix-*) in a temporary worktree, and commits
// it through BELLA's own pre-commit hook (NDA scan + the full gate), so the
// commit lands only when the gate is green. Undo deletes that branch: the
// base branch never moved. CHIP never pushes and never merges.
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { DATA_DIR, ROOT } from './config.mjs';
import { BELLA } from './bella-work.mjs';
import { BASE, measureBench, prepare, readResult, runCheck, staged } from './checks.mjs';
import { gapFix } from './gaps.mjs';

const ACTIONS = join(DATA_DIR, 'actions.jsonl');
const FIX_BRANCH = /^chip\/fix-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const git = (args, cwd = BELLA) => execFileSync('git', ['-C', cwd, '--no-optional-locks', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const hasBranch = (b) => !!git(['branch', '--list', b]).trim();

export function logAction(a) {
  mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(ACTIONS, `${JSON.stringify({ at: new Date().toISOString(), ...a })}\n`);
}
export function readActions() {
  try {
    return readFileSync(ACTIONS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/* ---------- colour: WCAG luminance and OKLCH, to compute a value that passes ---------- */
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lum = (hex) => {
  const [r, g, b] = rgbOf(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
function toOklch(hex) {
  const [r, g, b] = rgbOf(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
function fromOklch(L, C, H) {
  const A = C * Math.cos((H * Math.PI) / 180);
  const B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, gam(c))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
const oklchText = (hex) => {
  const [L, C, H] = toOklch(hex);
  return `oklch(${(L * 100).toFixed(2)}% ${C.toFixed(4)} ${H.toFixed(1)})`;
};

/* ---------- reading BELLA's token sources ---------- */
const readJson = (rel, dir = BELLA) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
// a token source as the next commit would have it: the staged copy when the
// shared checkout has one staged, else the base's (read-only either way)
const atNext = (rel) => {
  const st = staged();
  return JSON.parse(git(['show', st?.files.includes(rel) ? `:${rel}` : `${BASE}:${rel}`]));
};
const refPath = (v) => (typeof v === 'string' ? v.match(/^\{(.+)\}$/)?.[1] : null);
const dig = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

// the end of the JSON object that opens at text[open] ('{'), strings respected
function closeOf(text, open) {
  let depth = 0;
  let inStr = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

/* ---------- fixes: one per kind of failure CHIP knows how to fix ---------- */
// "wee-dote: selected wash vs the page is 1.04:1, the eye cannot find it
// (needs 1.08:1; --color-semantic-accent-subtle vs --color-semantic-background)"
const APART_RE = /^([\w-]+): (selected wash vs [\w ]+?) is ([\d.]+):1.*needs ([\d.]+):1; (--[\w-]+) vs (--[\w-]+)\)/;

function apartFix(line) {
  const m = line.match(APART_RE);
  if (!m) return null;
  const [, theme, label, now, need, washVar, againstVar] = m;
  if (washVar !== '--color-semantic-accent-subtle') return null;
  const semFile = `tokens/semantic/${theme}.json`;
  const sem = atNext(semFile);
  const prim = atNext('tokens/primitive.json');
  const ref = refPath(sem.color?.semantic?.['accent-subtle']?.$value);
  const bgRef = refPath(sem.color?.semantic?.background?.$value);
  const cardRef = refPath(sem.color?.semantic?.['surface-card']?.$value);
  const textRef = refPath(sem.color?.semantic?.['text-accent']?.$value);
  if (!ref || !bgRef || !cardRef) return null;
  const hex = (p) => dig(prim, p)?.$value;
  const [washHex, bgHex, cardHex, textHex] = [hex(ref), hex(bgRef), hex(cardRef), textRef ? hex(textRef) : null];
  const floor = Number(need);
  // darken in OKLCH (hue and chroma kept) until both pairs clear the floor with a margin
  const [L0, C, H] = toOklch(washHex);
  let pick = null;
  for (let L = L0; L > L0 - 0.15; L -= 0.0025) {
    const h = fromOklch(L, C, H);
    if (ratio(h, bgHex) >= floor + 0.02 && ratio(h, cardHex) >= floor + 0.02) {
      pick = h;
      break;
    }
  }
  if (!pick) return null;
  const group = ref.split('.').slice(0, -1).join('.'); // color.wee-dote
  const newRef = `${group}.wash`;
  const users = Object.entries(sem.color.semantic).filter(([, t]) => refPath(t.$value) === ref).map(([k]) => k);
  return {
    kind: 'apart',
    theme,
    title: `Make the ${theme} selected wash visible`,
    why: `In the ${theme} theme the selected wash (${washVar}) is ${now}:1 against ${label.replace('selected wash vs ', '')}. BELLA's rule is ${need}:1, the floor where the eye can still find a selected item. It shares one colour, ${ref} ${washHex}, with ${users.filter((u) => u !== 'accent-subtle').map((u) => u).join(', ') || 'nothing else'}, so changing that colour would move ${users.filter((u) => u !== 'accent-subtle').length === 1 ? 'it' : 'them'} too.`,
    change: {
      sentence: `Give the selected wash its own colour: a new primitive ${newRef} ${pick} (${oklchText(pick)}, the same hue as ${ref}, ${Math.round((L0 - toOklch(pick)[0]) * 1000) / 10}% darker), and point ${theme}'s accent-subtle at it.`,
      before: { token: `${theme} · accent-subtle`, value: `{${ref}}`, hex: washHex },
      after: { token: `${theme} · accent-subtle`, value: `{${newRef}}`, hex: pick },
      ratios: [
        { pair: 'Selected wash vs the page', before: ratio(washHex, bgHex), after: ratio(pick, bgHex), need: floor },
        { pair: 'Selected wash vs the card', before: ratio(washHex, cardHex), after: ratio(pick, cardHex), need: floor },
        ...(textHex ? [{ pair: 'Selected label on the wash', before: ratio(textHex, washHex), after: ratio(textHex, pick), need: 4.5 }] : []),
      ],
      files: ['tokens/primitive.json', semFile, 'and the files the build generates from them (bella.css, bella.json, bella.dsds.yaml, docs/bella.css, docs/tokens.md)'],
    },
    wontTouch: [
      `${ref} stays ${washHex}: ${users.filter((u) => u !== 'accent-subtle').length ? `${users.filter((u) => u !== 'accent-subtle').join(', ')} keep${users.length === 2 ? 's' : ''} it.` : 'nothing else reads it.'}`,
      'Light, dark and warm: their accent-subtle values do not move.',
      'No component code, no story, no contract.',
      `${BASE} and your checkout in ~/DEV/bella: the change sits on its own local branch until you merge it.`,
    ],
    apply(dir) {
      // text edits, not a re-serialise: the files are hand-formatted
      const pf = join(dir, 'tokens/primitive.json');
      let text = readFileSync(pf, 'utf8');
      const [gKey, leaf] = [group.split('.').at(-1), ref.split('.').at(-1)];
      const gAt = text.indexOf(`"${gKey}": {`);
      const leafAt = text.indexOf(`"${leaf}": {`, gAt);
      if (gAt < 0 || leafAt < 0) throw new Error(`No ${ref} in tokens/primitive.json`);
      const end = closeOf(text, text.indexOf('{', leafAt));
      const indent = text.slice(text.lastIndexOf('\n', leafAt) + 1, leafAt);
      const block = [
        `"wash": {`,
        `  "$value": "${pick}",`,
        `  "$type": "color",`,
        `  "$description": "${theme} selected wash: ${ref} darkened in OKLCH until it stays ${floor}:1 apart from the page and the card (contrast-pairs). Accepted from a CHIP review card, ${new Date().toISOString().slice(0, 10)}.",`,
        `  "$extensions": {`,
        `    "bella": {`,
        `      "oklch": "${oklchText(pick)}"`,
        `    }`,
        `  }`,
        `}`,
      ].map((l, i) => (i ? indent + l : l)).join('\n');
      text = `${text.slice(0, end)},\n${indent}${block}${text.slice(end)}`;
      JSON.parse(text);
      writeFileSync(pf, text);
      const sf = join(dir, semFile);
      let st = readFileSync(sf, 'utf8');
      const at = st.indexOf('"accent-subtle": {');
      const close = closeOf(st, st.indexOf('{', at));
      const piece = st.slice(at, close).replace(`"{${ref}}"`, `"{${newRef}}"`).replace(/("\$description": ")[^"]*(")/, `$1${theme} selected wash: its own colour, ${floor}:1 apart from the page and the card.$2`);
      st = st.slice(0, at) + piece + st.slice(close);
      JSON.parse(st);
      writeFileSync(sf, st);
      return ['tokens/primitive.json', semFile];
    },
    commitMessage: `fix(tokens): ${theme} selected wash ${floor}:1 apart (own primitive ${newRef})\n\n${label} was ${now}:1; contrast-pairs needs ${need}:1. accent-subtle now reads ${newRef} ${pick}; ${ref} is unchanged.\nAccepted from a CHIP review card.`,
    slug: `${theme}-selected-wash`,
    token: washVar,
  };
}

/* "No llms.txt": BELLA's component list in the ecosystem-standard file,
 * generated from the contracts (tokens/component.json) and the guidance
 * pages, so it is written once and regenerated, never kept by hand. */
function llmsFix(line) {
  if (!/No llms\.txt/.test(line)) return null;
  const build = (dir) => {
    const contract = JSON.parse(readFileSync(join(dir, 'tokens/component.json'), 'utf8')).component ?? {};
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const cats = {};
    for (const [id, block] of Object.entries(contract)) {
      const b = block.$extensions?.bella;
      if (!b?.name || !existsSync(join(dir, 'src/components', b.name))) continue; // contracts without code stay out
      const first = String(b.description ?? '').replace(/\s+/g, ' ').split(/(?<=\.)\s/)[0];
      const doc = existsSync(join(dir, `docs/components/${id}.md`)) ? `docs/components/${id}.md` : `src/components/${b.name}/${b.name}.tsx`;
      const vars = (b.variants ?? []).length ? ` Variants: ${b.variants.join(', ')}.` : '';
      (cats[b.category ?? 'Other'] ??= []).push(`- [${b.name}](${doc}): ${first}${vars}`);
    }
    const n = Object.values(cats).flat().length;
    return [
      `# ${pkg.name.toUpperCase()}`,
      '',
      `> ${pkg.description ?? 'A React design system with design tokens and per-component contracts.'} ${n} components, each with a contract in tokens/component.json.`,
      '',
      `Import every component from the package root (\`import { Button } from '${pkg.name}'\`, barrel at src/components/index.ts). Style with the tokens in tokens/bella.css; never hard-code a value a token holds. Read AGENTS.md before building with ${pkg.name.toUpperCase()}.`,
      '',
      ...Object.entries(cats).flatMap(([cat, rows]) => [`## ${cat}`, '', ...rows, '']),
      '## Foundations',
      '',
      '- [AGENTS.md](AGENTS.md): the rules agents follow, consumer first',
      '- [Tokens](docs/tokens.md): every token, generated from tokens/*.json',
      '- [Contracts](tokens/component.json): props, variants, states and usage per component',
      '- [DSDS spec](bella.dsds.yaml): the machine-readable spec, generated',
      '',
      `Generated by CHIP from the contracts on ${new Date().toISOString().slice(0, 10)}; regenerate it, don't edit it by hand.`,
      '',
    ].join('\n');
  };
  const preview = (() => {
    try {
      const dir = join(tmpdir(), 'chip-checks', 'bella'); // the checks' clean copy, when it exists
      return existsSync(join(dir, 'tokens/component.json')) ? build(dir) : null;
    } catch {
      return null;
    }
  })();
  return {
    kind: 'llms',
    withStaged: false,
    title: 'Give agents BELLA’s component list (llms.txt)',
    why: 'The bench found no llms.txt at BELLA’s root: the standard place an agent or a docs crawler looks for a system’s component list. Without it, an agent that doesn’t read AGENTS.md first has nothing to list the components from. It is the most cited gap in the bench’s survey.',
    change: {
      sentence: `Add llms.txt at BELLA’s root, generated from the contracts: one line per component (${preview ? preview.split('\n').filter((l) => l.startsWith('- [')).length - 4 : 'every'} of them) with its first sentence, variants and its guidance page, grouped by category, plus the foundations.`,
      preview,
      files: ['llms.txt (new)'],
    },
    wontTouch: ['No component, token, contract or story.', 'AGENTS.md stays as it is.', `${BASE} and your checkout in ~/DEV/bella, including what you have staged there: the change sits on its own branch from ${BASE}’s last commit.`],
    blast: { sentence: 'Nothing renders differently. Readers: agents and docs crawlers that look for llms.txt; the bench’s Enablement and Docs greppability scores.', components: [], composedInto: [], sourceFiles: [], apps: [] },
    apply(dir) {
      writeFileSync(join(dir, 'llms.txt'), build(dir));
      return ['llms.txt'];
    },
    remeasure: true,
    commitMessage: 'docs(agents): llms.txt, generated from the contracts\n\nThe bench (static) flagged "No llms.txt at the system root". One line per implemented component from tokens/component.json, grouped by category, plus the foundations.\nAccepted from a CHIP review card.',
    slug: 'llms-txt',
  };
}

const FIXERS = { contrast: [apartFix], 'bench-static': [llmsFix] };

/* ---------- blast radius: who reads the token, from BELLA's source and the apps ---------- */
function grepCount(dir, needle, exts = /\.(css|jsx?|tsx?)$/) {
  const hits = [];
  const walk = (d, depth) => {
    if (depth > 6) return;
    let names;
    try {
      names = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const n of names) {
      if (n.name.startsWith('.') || ['node_modules', 'dist', 'storybook-static', 'build', '.next', 'out'].includes(n.name)) continue;
      const p = join(d, n.name);
      if (n.isDirectory()) walk(p, depth + 1);
      else if (exts.test(n.name)) {
        try {
          if (readFileSync(p, 'utf8').includes(needle)) hits.push(p.slice(dir.length + 1));
        } catch {}
      }
    }
  };
  walk(dir, 0);
  return hits;
}

const blastCache = new Map();
function blastRadius(fix) {
  const key = `${fix.token}:${staged()?.hash ?? ''}`;
  const hit = blastCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.value;
  const value = measureBlast(fix);
  blastCache.set(key, { at: Date.now(), value });
  return value;
}
function measureBlast(fix) {
  const bella = JSON.parse(readFileSync(join(ROOT, 'data/bella.json'), 'utf8'));
  const files = grepCount(join(BELLA, 'src'), fix.token).filter((f) => !f.includes('__image_snapshots__'));
  const direct = [...new Set(files.map((f) => f.match(/components\/([^/]+)\//)?.[1]).filter(Boolean))];
  const comps = direct.map((n) => bella.components.find((c) => c.name === n)).filter(Boolean);
  const into = [...new Set(comps.flatMap((c) => c.composesInto ?? []))].filter((n) => !direct.includes(n));
  const apps = [
    { name: 'CHIP', dir: join(ROOT, 'app/src') },
    { name: 'The site', dir: join(homedir(), 'DEV', 'ctrl-alt-design', 'src') },
  ].map((a) => ({ name: a.name, files: existsSync(a.dir) ? direct.flatMap((n) => grepCount(a.dir, `${n}/${n}`).concat(grepCount(a.dir, `<${n}`))).filter((v, i, s) => s.indexOf(v) === i) : [] }));
  return {
    token: fix.token,
    theme: fix.theme,
    components: direct,
    composedInto: into,
    sourceFiles: files,
    apps: apps.map((a) => ({ name: a.name, count: a.files.length, files: a.files.slice(0, 6) })),
    sentence: `${direct.length ? direct.join(', ') : 'No component'} read${direct.length === 1 ? 's' : ''} ${fix.token}${into.length ? `, and ${into.join(', ')} build${into.length === 1 ? 's' : ''} on ${direct.length === 1 ? 'it' : 'them'}` : ''}. Only the ${fix.theme} theme changes. ${apps.map((a) => `${a.name}: ${a.files.length} file${a.files.length === 1 ? '' : 's'}`).join(' · ')}.`,
  };
}

/* ---------- the card ---------- */
const branchOf = (fix) => `chip/fix-${fix.slug}`;
const jobs = new Map(); // check id -> { status, step, log, branch, startedAt }

// a gap from the Overview's report ("gap-dsds-avatar-stack"): the same card,
// with the gap as its failure, so Accept and Undo work as for a check
const GAP_ID = /^gap-(dsds|contrast)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
function gapFixFor(id) {
  const m = id.match(GAP_ID);
  const fix = m ? gapFix(m[1], m[2]) : null;
  if (!fix) return { r: null, fix: null };
  const r = { ok: false, ranAt: fix.at, commit: git(['rev-parse', '--short', BASE]).trim(), failures: [fix.missing], summary: fix.missing };
  return { r, fix, line: fix.missing };
}

const fixCache = new Map(); // check id -> { key, value }
function fixFor(checkId) {
  if (checkId.startsWith('gap-')) return gapFixFor(checkId);
  const r0 = readResult(checkId);
  const key = `${r0?.ranAt}:${staged()?.hash ?? ''}`;
  const hit = fixCache.get(checkId);
  if (hit?.key === key) return hit.value;
  const value = findFix(checkId, r0);
  fixCache.set(checkId, { key, value });
  return value;
}
function findFix(checkId, r) {
  if (!r) return { r, fix: null };
  for (const f of FIXERS[checkId] ?? []) for (const line of r.failures ?? []) {
    const fix = f(line);
    if (fix) return { r, fix, line };
  }
  return { r, fix: null };
}

/** Check ids that pass but have a change CHIP can make (a bench finding). */
export function fixableChecks() {
  const out = [];
  for (const id of Object.keys(FIXERS)) {
    const { r, fix } = fixFor(id);
    if (r?.ok && fix && !hasBranch(branchOf(fix))) out.push({ id, title: fix.title, line: fixFor(id).line });
  }
  return out;
}

/** Check ids whose fix waits on her: accepted onto a branch, not merged. */
export function waitingChecks() {
  const out = [];
  for (const id of Object.keys(FIXERS)) {
    const { fix } = fixFor(id);
    if (fix && hasBranch(branchOf(fix))) out.push(id);
  }
  return out;
}

/** GET /review/:check */
export function reviewCard(checkId) {
  const { r, fix, line } = fixFor(checkId);
  if (!r) return { check: checkId, state: 'not-run' };
  if (r.ok && !fix) return { check: checkId, state: 'passed', summary: r.summary, ranAt: r.ranAt };
  if (r.ok && !fix && !jobs.has(checkId)) return { check: checkId, state: 'passed', summary: r.summary, ranAt: r.ranAt };
  const job = jobs.get(checkId) ?? null;
  if (!fix) {
    return {
      check: checkId, state: 'failed', ranAt: r.ranAt, commit: r.commit, summary: r.summary, failures: r.failures,
      why: r.failures?.length ? r.failures.join('\n') : r.summary,
      noFix: 'CHIP has no automatic change for this failure. Hand it to a Claude session with this brief.',
      brief: `BELLA ${r.commit} on ${BASE}: the check "${checkId}" fails.\n${(r.failures ?? []).map((f) => `- ${f}`).join('\n')}\nFix it on a local branch, run npm run gate, commit only when green. Do not push.`,
    };
  }
  const branch = branchOf(fix);
  const accepted = hasBranch(branch);
  const sha = accepted ? git(['rev-parse', '--short', branch]).trim() : null;
  const { apply, after, ...card } = fix;
  return {
    check: checkId,
    state: job?.status === 'running' ? 'accepting' : accepted ? 'accepted' : r.ok ? 'improve' : 'failed',
    ranAt: r.ranAt,
    commit: r.commit,
    failure: line,
    ...card,
    blast: fix.blast ?? blastRadius(fix),
    branch,
    sha,
    base: BASE,
    target: fix.withStaged !== false && staged() ? { kind: 'staged', files: staged().files.length } : { kind: 'committed' },
    thisWill: `make the local branch ${branch} from ${BASE}${fix.withStaged !== false && staged() ? ` with the ${staged().files.length} files you have staged in BELLA` : ''}, ${fix.thisWillDo ?? (fix.kind === 'llms' ? 'write llms.txt' : 'change two token files, rebuild')}, and commit through BELLA's gate (about 3 minutes)${fix.remeasure ? ', then re-run the bench on the branch' : ''}. Nothing is pushed or merged, and your BELLA checkout is not touched.`,
    undo: `delete the branch ${branch}. ${BASE} never moved, so BELLA is exactly as it was.`,
    // Accept after a green gate: she keeps the branch to merge herself
    kept: accepted ? readActions().some((x) => x.kind === 'keep' && x.branch === branch && x.sha === sha) : false,
    // after a restart the job is gone: the action log keeps what Accept measured
    job: job ?? (accepted ? (() => {
      const a = readActions().reverse().find((x) => x.kind === 'accept' && x.branch === branch && x.sha === sha);
      return a ? { status: 'done', measured: a.measured ?? null, diff: a.diff ?? null, sha } : null;
    })() : null),
    lastAttempt: job?.status === 'running' ? null : lastAttempt(checkId),
  };
}

const sh = (cmd, args, cwd) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, NO_COLOR: '1' } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
    p.on('error', (e) => resolve({ code: 1, out: e.message }));
  });

// the gate's visual audit serves Storybook on 6006; a Storybook already
// running there (another session's) would make it test the wrong build
const portBusy = (port) =>
  new Promise((resolve) => {
    const s = createConnection({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });

const DIFFS = join(DATA_DIR, 'checks', 'diffs');
const ATTEMPTS = join(DATA_DIR, 'checks', 'attempts');
// the last Accept the gate refused, per check, so the card can say why
// before she presses Accept again (kept until the staged work changes)
const attemptFile = (id) => join(ATTEMPTS, `${id}.json`);
function lastAttempt(id) {
  try {
    const a = JSON.parse(readFileSync(attemptFile(id), 'utf8'));
    return (a.stagedHash ?? null) === (staged()?.hash ?? null) ? a : null;
  } catch {
    return null;
  }
}
// rule failures in the audit's own words: "[audit:visual] <story>: <rule> (mean luminance …)"
const ruleFailures = (log) => [...strip(log ?? '').matchAll(/\[audit:visual\] ([\w-]+): ([^(\n]+?)\s*\(([^)]*)\)/g)].map((m) => ({ story: m[1], rule: m[2].trim(), measured: m[3] })).filter((v, i, a) => a.findIndex((x) => x.story === v.story && x.rule === v.rule) === i);
const strip = (t) => t.replace(/\x1b\[[0-9;]*m/g, ''); // eslint-disable-line no-control-regex

// what the gate's visual audit refused: suites, and the diff pictures
// jest-image-snapshot wrote (expected | difference | received), kept after
// the temporary worktree goes
function visualBlockers(dir, log, branch) {
  const text = strip(log);
  const suites = [...new Set([...text.matchAll(/FAIL\s+(?:browser: \w+\s+)?(src\/\S+\.stories\.tsx)/g)].map((m) => m[1]))];
  const pct = [...text.matchAll(/was ([\d.]+)% different from snapshot/g)].map((m) => Number(m[1]));
  const diffDir = join(dir, 'src/__image_snapshots__/__diff_output__');
  const shots = [];
  if (existsSync(diffDir)) {
    const keep = join(DIFFS, branch.replace(/\//g, '__'));
    mkdirSync(keep, { recursive: true });
    for (const f of readdirSync(diffDir).filter((x) => x.endsWith('.png'))) {
      copyFileSync(join(diffDir, f), join(keep, f));
      shots.push({ id: f.replace(/-diff\.png$/, ''), img: `/review-img/${encodeURIComponent(branch.replace(/\//g, '__'))}/${encodeURIComponent(f)}` });
    }
  }
  return suites.length ? { suites, shots: shots.map((s, i) => ({ ...s, percent: pct[i] ?? null })) } : null;
}

/** POST /review/:check/accept { baselines?: [stories file] }: with baselines,
 * the visual baselines of those stories files are re-recorded before the
 * commit (the gate then checks everything against them). */
export async function accept(checkId, { baselines = [] } = {}) {
  const { fix } = fixFor(checkId);
  if (!fix) throw new Error('Nothing to accept: the check passes, or CHIP has no change for it');
  const branch = branchOf(fix);
  if (!FIX_BRANCH.test(branch)) throw new Error(`Not a fix branch: ${branch}`);
  if (hasBranch(branch)) throw new Error(`${branch} already exists: undo it first`);
  if (jobs.get(checkId)?.status === 'running') return { running: true };
  if (!Array.isArray(baselines) || baselines.some((f) => !/^src\/[\w/.-]+\.stories\.tsx$/.test(f))) throw new Error('baselines must be stories files');
  if (await portBusy(6006)) throw new Error('Port 6006 is in use (a Storybook is running). The gate needs it for its visual audit; stop that Storybook, then Accept again.');
  const dir = join(tmpdir(), 'chip-fixes', branch.replace(/\//g, '__'));
  const job = { status: 'running', step: 'Making the branch', branch, baselines, startedAt: new Date().toISOString(), steps: [] };
  jobs.set(checkId, job);
  const step = (s) => {
    job.steps.push({ step: job.step, endedAt: new Date().toISOString() });
    job.step = s;
  };
  (async () => {
    let ok = false;
    try {
      mkdirSync(join(tmpdir(), 'chip-fixes'), { recursive: true });
      const { target } = prepare(dir, { branch, withStaged: fix.withStaged !== false });
      job.target = target;
      step(fix.kind === 'llms' ? 'Writing llms.txt from the contracts' : fix.kind.startsWith('gap-') ? `Making the change: ${fix.change.files[0]}` : 'Changing the token files');
      const files = fix.apply(dir);
      for (const [label, cmd, args] of fix.after ?? []) {
        step(label);
        const a = await sh(cmd, args, dir);
        if (a.code !== 0) throw Object.assign(new Error(`${label.replace(/ \(.*\)$/, '')} failed`), { log: strip(a.out).slice(-2000) });
      }
      if (fix.kind === 'apart') {
        step('Rebuilding the generated files');
        const b = await sh('npm', ['run', 'build'], dir);
        if (b.code !== 0) throw Object.assign(new Error('The token build failed'), { log: b.out.slice(-2000) });
      }
      if (fix.kind === 'apart') {
        step('Checking the pair');
        const c = await sh('node', ['scripts/contrast-pairs.mjs'], dir);
        if (c.code !== 0) throw Object.assign(new Error('The contrast check still fails'), { log: c.out.slice(-2000) });
      }
      if (baselines.length) {
        step(`Recording new baselines for ${baselines.map((f) => f.split('/').at(-1).replace('.stories.tsx', '')).join(', ')}`);
        const sb = await sh('npx', ['storybook', 'build', '--quiet'], dir);
        if (sb.code !== 0) throw Object.assign(new Error('Storybook did not build'), { log: sb.out.slice(-2000) });
        const server = spawn('npx', ['http-server', 'storybook-static', '-p', '6006', '--silent'], { cwd: dir, detached: true, stdio: 'ignore' });
        try {
          for (let i = 0; i < 60 && !(await portBusy(6006)); i++) await new Promise((r) => setTimeout(r, 500));
          const u = await sh('npx', ['test-storybook', '--url', 'http://127.0.0.1:6006', '--testTimeout=30000', '-u', ...baselines], dir);
          if (u.code !== 0) throw Object.assign(new Error('Re-recording the baselines failed'), { log: strip(u.out).slice(-2000) });
        } finally {
          try {
            process.kill(-server.pid);
          } catch {}
        }
        for (let i = 0; i < 20 && (await portBusy(6006)); i++) await new Promise((r) => setTimeout(r, 250));
      }
      const changed = git(['status', '--porcelain'], dir).split('\n').filter(Boolean).map((l) => l.slice(3)).filter((f) => f !== 'node_modules' && !f.startsWith('storybook-static'));
      git(['add', '--', ...changed], dir);
      step('Committing: BELLA’s hook runs the NDA scan and the full gate');
      const carried = target.kind === 'staged' ? `\n\nCarries the ${target.files} files staged in ~/DEV/bella (${target.hash}), which the gate refused on their own; the shared checkout is untouched.` : '';
      const rebased = baselines.length ? `\nNew visual baselines, accepted in the review card: ${baselines.join(', ')}.` : '';
      const cm = await sh('git', ['-C', dir, 'commit', '-q', '-m', fix.commitMessage + rebased + carried], dir);
      if (cm.code !== 0) {
        let gateLog = cm.out;
        try {
          gateLog = readFileSync('/tmp/bella-pre-commit-gate.log', 'utf8'); // where BELLA's hook writes the whole gate run
        } catch {}
        job.blockers = visualBlockers(dir, gateLog, branch);
        throw Object.assign(new Error(job.blockers ? `The gate refused the commit: ${job.blockers.suites.length} stories file${job.blockers.suites.length === 1 ? '' : 's'} no longer match${job.blockers.suites.length === 1 ? 'es' : ''} ${job.blockers.suites.length === 1 ? 'its' : 'their'} baseline` : 'BELLA’s gate refused the commit'), { log: strip(cm.out).slice(-2500) });
      }
      job.sha = git(['rev-parse', '--short', 'HEAD'], dir).trim();
      job.diff = git(['diff', `${BASE}...${branch}`, '--', ...files]).slice(0, 20000);
      if (fix.remeasure) {
        step('Re-running the bench on the branch');
        const before = readResult(checkId);
        const after = await measureBench(dir);
        job.measured = { before: before?.score ?? null, after: after.score, partsBefore: before?.parts ?? null, partsAfter: after.parts };
      }
      job.changed = changed;
      step(null);
      job.status = 'done';
      ok = true;
      try {
        unlinkSync(attemptFile(checkId));
      } catch {}
      logAction({ kind: 'accept', check: checkId, title: fix.title, branch, sha: job.sha, base: BASE, files: changed, measured: job.measured ?? null, diff: job.diff, sentence: fix.change.sentence + (baselines.length ? ` New baselines for ${baselines.join(', ')}.` : '') + (job.measured ? ` Bench ${job.measured.before} → ${job.measured.after}.` : '') });
    } catch (e) {
      job.status = 'failed';
      job.error = e.message;
      job.log = e.log ?? null;
      job.rules = ruleFailures(e.log);
      step(null);
      mkdirSync(ATTEMPTS, { recursive: true });
      const prev = lastAttempt(checkId);
      writeFileSync(attemptFile(checkId), JSON.stringify({ at: new Date().toISOString(), stagedHash: job.target?.hash ?? null, error: e.message, baselines, blockers: job.blockers ?? prev?.blockers ?? null, rules: job.rules.length ? job.rules : prev?.rules ?? [], log: job.log }, null, 2));
      logAction({ kind: 'accept-failed', check: checkId, title: fix.title, branch, error: e.message });
    } finally {
      // the worktree goes first: a branch checked out in it can't be deleted
      try {
        if (lstatSync(join(dir, 'node_modules')).isSymbolicLink()) unlinkSync(join(dir, 'node_modules'));
      } catch {}
      try {
        git(['worktree', 'remove', '--force', dir]);
      } catch {}
      if (!ok) {
        try {
          if (hasBranch(branch) && git(['rev-parse', branch]).trim() === git(['rev-parse', BASE]).trim()) git(['branch', '-D', branch]);
        } catch {}
      }
    }
  })();
  return { started: true, branch };
}

export function reviewImage(dir, file) {
  if (!/^chip__fix-[a-z0-9-]+$/.test(dir) || !/^[\w.-]+\.png$/.test(file)) throw new Error('bad path');
  return readFileSync(join(DIFFS, dir, file));
}

/** POST /review/:check/undo: deletes the local fix branch. */
export function undo(checkId) {
  const { fix } = fixFor(checkId);
  if (!fix) throw new Error('Nothing to undo');
  const branch = branchOf(fix);
  if (!FIX_BRANCH.test(branch) || !hasBranch(branch)) throw new Error(`No local branch ${branch}`);
  if (jobs.get(checkId)?.status === 'running') throw new Error('Accept is still running');
  const sha = git(['rev-parse', '--short', branch]).trim();
  // the branch must hold only CHIP's commit: never delete work someone added on top
  const ahead = Number(git(['rev-list', '--count', `${BASE}..${branch}`]).trim());
  if (ahead !== 1) throw new Error(`${branch} has ${ahead} commits, not CHIP's one; delete it yourself if you mean to`);
  git(['branch', '-D', branch]);
  jobs.delete(checkId);
  logAction({ kind: 'undo', check: checkId, title: fix.title, branch, sha, base: BASE });
  return { undone: branch, sha };
}

/** POST /review/:check/keep: Accept after a green gate. The branch stays for her to merge; nothing else runs. */
export function keep(checkId) {
  const { fix } = fixFor(checkId);
  if (!fix) throw new Error('Nothing to keep');
  const branch = branchOf(fix);
  if (!hasBranch(branch)) throw new Error(`No local branch ${branch}: Apply it first`);
  const sha = git(['rev-parse', '--short', branch]).trim();
  logAction({ kind: 'keep', check: checkId, title: fix.title, branch, sha, base: BASE });
  return { kept: branch, sha };
}

export const reviewJob = (checkId) => jobs.get(checkId) ?? null;
export { runCheck };
