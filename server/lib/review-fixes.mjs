// Everything waiting for her look is in Needs you (Elleta, 24 Nov 2026, 10:40): the before and after pictures the builders
// make today in screens/2026-11-24-review-fixes/<area>/ become one decision card per area, read live from the folders (a new
// or changed picture shows on the next load), and the A/B pages still waiting on her pick are listed beside them. Her
// answers go to the review server's POST /answers, as the review pages' own decide.js sends them; an area she answered stays
// answered until a picture in it changes after her answer.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PROGRESS_DIR, REVIEW_URL } from './lanes.mjs';

export const SCREENS_DIR = dirname(PROGRESS_DIR);
export const FIXES_DIR = '2026-11-24-review-fixes';
/* The A/B pages waiting on her pick (coordinator, 24 Nov 10:40); a hash opens the page at that section. */
export const WAITING_PAGES = ['2026-11-24-phone-shell/', '2026-11-24-tools-row/', '2026-11-23-components-gap/#nav', '2026-11-24-prop-decisions/', '2026-11-23-old-pages/'];

const IMG = /\.(png|jpe?g|webp|gif)$/i;
const ROLE = [
  ['after', /(^|[-_/])(after|now|built)(?=[-_/.]|$)/i],
  ['before', /(^|[-_/])(before|as-is|old)(?=[-_/.]|$)/i],
];
/** A folder's name in her words: "needs-you" -> "Needs you", "status-marks" -> "Status marks". */
export const plainName = (slug) => String(slug).replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** One picture's place in a pair: its role (after, before, other), its width and the topic it shows. */
export function pictureOf(path) {
  const name = path.replace(IMG, '');
  const role = ROLE.find(([, re]) => re.test(name))?.[0] ?? 'other';
  const width = Number(name.match(/(?:^|[-_/])(\d{3,4})(?:px)?(?=[-_/]|$)/)?.[1]) || null;
  const topic =
    name
      .replace(/(^|[-_/])(after|now|built|before|as-is|old)(?=[-_/]|$)/gi, '$1')
      .replace(/(^|[-_/])\d{3,4}(px)?(?=[-_/]|$)/g, '$1')
      .replace(/(^|[-_/])(chip-)?(light|dark)(?=[-_/]|$)/g, '$1')
      .replace(/[-_/]+/g, ' ')
      .trim() || 'page';
  return { path, role, width, topic };
}

/** Up to five bullets ("- ..." or "* ..." lines) from a what-changed.md, or [] when there is none. **word** marks a key word. */
export function readBullets(file, max = 5) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .map((l) => l.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1])
    .filter(Boolean)
    .slice(0, max);
}

/** An area folder as one card: its pictures paired before and after by topic and width, its newest change, its page line. */
export function readArea(dir, slug, base) {
  const files = [];
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      for (const g of readdirSync(full)) if (IMG.test(g)) files.push({ path: `${f}/${g}`, mtime: statSync(join(full, g)).mtimeMs });
    } else if (IMG.test(f)) files.push({ path: f, mtime: st.mtimeMs });
  }
  const pics = files.map((f) => ({ ...pictureOf(f.path), mtime: f.mtime, src: `${base}${encodeURI(f.path)}` }));
  const afters = pics.filter((p) => p.role === 'after');
  const shown = afters.length ? afters : pics.filter((p) => p.role === 'other');
  // one topic per thing she looks at, each with its widths; a before of the same topic and width sits behind it
  const topics = new Map();
  for (const p of shown) {
    const t = topics.get(p.topic) ?? { topic: p.topic, views: [] };
    const before = pics.find((b) => b.role === 'before' && b.topic === p.topic && b.width === p.width) ?? pics.find((b) => b.role === 'before' && b.topic === p.topic) ?? null;
    t.views.push({ width: p.width, src: p.src, before: before?.src ?? null });
    topics.set(p.topic, t);
  }
  for (const t of topics.values()) t.views.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  let lede = null;
  const page = join(dir, 'index.html');
  if (existsSync(page)) {
    const html = readFileSync(page, 'utf8');
    lede = (html.match(/<h1[^>]*>([^<]+)/)?.[1] ?? '').trim() || null;
  }
  // what changed, in plain words: up to five "- " bullets from the folder's what-changed.md (24 Nov: "What changed: motion,
  // shape and space…" was file keywords, not what changed); without the file, the line below stands
  const bullets = readBullets(join(dir, 'what-changed.md'));
  const changedAt = files.length ? Math.max(...files.map((f) => f.mtime)) : null;
  return {
    id: `fixes-${slug}`,
    slug,
    title: plainName(slug),
    url: base,
    page: existsSync(page) ? `${base}index.html` : null,
    line: lede ?? (topics.size ? `What changed: ${[...topics.keys()].join(', ')}` : 'No pictures yet'),
    bullets,
    topics: [...topics.values()],
    pictures: files.length,
    changedAt: changedAt ? new Date(changedAt).toISOString() : null,
  };
}

/** Her last answer to one page (answers.json, cards shape, matched by the page's address), with when she sent it. */
export function lastAnswer(answers, path) {
  let out = null;
  for (const e of Array.isArray(answers) ? answers : []) {
    const a = e?.answers;
    if (!a?.cards || !a.url) continue;
    let p;
    try {
      p = new URL(a.url, 'http://x').pathname;
    } catch {
      continue;
    }
    if (p !== path) continue;
    const hit = a.cards.find((c) => c.answer || c.note);
    if (hit) out = { answer: hit.answer ?? null, note: hit.note ?? null, sent: e.sent ?? null };
  }
  return out;
}

/** A waiting A/B page: its title and how many of its questions she has not answered yet. */
export function readPage(dir, rel, base, answers) {
  const [folder, hash] = rel.split('#');
  const file = join(dir, folder, 'index.html');
  if (!existsSync(file)) return null;
  const html = readFileSync(file, 'utf8');
  const title = (html.match(/<h1[^>]*>([^<]+)/)?.[1] ?? plainName(folder.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\/$/, ''))).trim();
  const parts = [...html.matchAll(/<section class="part"[^>]*>\s*<h2[^>]*>([^<]+)/g)].map((m) => m[1].trim());
  const path = new URL(`../${folder}`, base).pathname;
  const answered = new Set();
  for (const e of Array.isArray(answers) ? answers : []) {
    const a = e?.answers;
    if (!a?.cards || new URL(a.url ?? '/', 'http://x').pathname !== path) continue;
    for (const c of a.cards) if (c.answer) answered.add(String(c.title).trim());
  }
  const open = parts.filter((t) => !answered.has(t)).length;
  const img = html.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
  return { id: `page-${folder.replace(/\W+/g, '-').replace(/-$/, '')}`, title, url: new URL(`../${folder}${hash ? `#${hash}` : ''}`, base).href, img: img ? new URL(img, new URL(`../${folder}`, base)).href : null, questions: parts.length || 1, open: parts.length ? open : 1 };
}

/** GET /needs/reviews: the review-fix areas and the waiting A/B pages, read now. */
export function reviewsWaiting({ screens = SCREENS_DIR, review = REVIEW_URL, now = Date.now() } = {}) {
  let answers = [];
  try {
    answers = JSON.parse(readFileSync(join(screens, 'progress', 'answers.json'), 'utf8'));
  } catch {}
  const fixesDir = join(screens, FIXES_DIR);
  const areas = [];
  if (existsSync(fixesDir)) {
    for (const slug of readdirSync(fixesDir).sort()) {
      const dir = join(fixesDir, slug);
      if (!statSync(dir).isDirectory()) continue;
      const base = new URL(`../${FIXES_DIR}/${slug}/`, review).href;
      const area = readArea(dir, slug, base);
      if (!area.pictures) continue;
      const said = lastAnswer(answers, new URL(base).pathname);
      // answered stays answered until a picture changes after her answer
      const stale = said?.sent && area.changedAt && Date.parse(area.changedAt) > Date.parse(said.sent);
      areas.push({ ...area, answered: said && !stale ? said : null, changedSinceAnswer: !!stale });
    }
  }
  const pages = WAITING_PAGES.map((rel) => readPage(screens, rel, review, answers)).filter(Boolean);
  return { areas, pages, reached: existsSync(fixesDir), at: new Date(now).toISOString() };
}
