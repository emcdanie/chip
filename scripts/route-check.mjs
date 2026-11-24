// Route check (Elleta, 23 Nov 2026 evening: a side-menu item opened an old page design while she tested the new
// navigation; CLAUDE.md "Navigation": every menu item and link opens the current page). Reads the app's own sources,
// no server needed, and fails when
//   - a side-menu item, a System tab, a Find page result, a redirect target or a link the server sends opens an
//     address that is not a current page (templates/routes.js CURRENT, after canon()),
//   - an address of the retired app (App.jsx: Overview, Projects, Atlas, the old Docs, Runs, Checks, OBI, the Kit) or
//     an unknown address does not land on a current page,
//   - main.jsx can still render the retired app or the Kit, or a current page has no branch in main.jsx.
// on-system-guard.mjs runs it on every commit. Usage: node scripts/route-check.mjs  (npm run check:routes)
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const { canon, isCurrent, CURRENT } = await import(join(ROOT, 'app/src/templates/routes.js'));

const ways = [];
const add = (from, href) => ways.push({ from, href });
// the side menu (Screen.jsx menuModel): every href, a template literal tried with a sample value
const screen = read('app/src/templates/Screen.jsx');
const model = screen.slice(screen.indexOf('function menuModel'), screen.indexOf('\n}\n', screen.indexOf('function menuModel')));
for (const m of model.matchAll(/href:\s*(['`])(#\/[^'`]*)\1/g)) add('side menu', m[2].replace(/\$\{[^}]*\}/g, 'chip'));
// the breadcrumb's way back
for (const m of screen.matchAll(/`(#\/work\?project=)\$\{[^}]*\}`|'(#\/work)'/g)) add('breadcrumb', (m[1] ? `${m[1]}chip` : m[2]));
// System's tabs
for (const m of read('app/src/templates/projectViews.js').matchAll(/href:\s*'(#\/[^']*)'/g)) add('tab', m[1]);
// Find's pages: an id opens #/<id> unless it names its own href
const search = read('app/src/templates/Search.jsx');
const pages = search.slice(search.indexOf('export const PAGES'), search.indexOf('];', search.indexOf('export const PAGES')));
for (const m of pages.matchAll(/\{\s*id:\s*'([^']+)'[^}]*?(?:href:\s*'(#\/[^']*)')?[^}]*\}/g)) add('Find', m[2] ?? `#/${m[1]}`);
// links the server hands the app (cards, notices)
for (const f of readdirSync(join(ROOT, 'server/lib')).filter((f) => f.endsWith('.mjs'))) {
  for (const m of read(`server/lib/${f}`).matchAll(/['`](#\/[a-z][\w/-]*)/g)) add(`server/lib/${f}`, m[1]);
}
// the retired app's own addresses and a few never used, all must land on a current page
for (const h of ['#/', '#/home', '#/health-old', '#/overview', '#/projects', '#/projects/chip', '#/atlas', '#/atlas/button', '#/play/chip', '#/docs', '#/docs/notes', '#/connectors-old', '#/history-old', '#/runs', '#/checks', '#/gaps', '#/drift', '#/obi', '#/kit', '#/map', '#/settings', '#/components', '#/components/Button?tab=fix', '#/foundations', '#/history', '#/system', '#/needs', '#/health/work', '#/not-again?tab=library', '#/system-map?view=map', '#/no-such-page']) add('old or unknown address', h);

const bad = [];
for (const w of ways) {
  const to = canon(w.href);
  if (!isCurrent(to)) bad.push(`${w.from}: ${w.href} opens ${to}, not a current page`);
}

// main.jsx renders only current pages
const main = read('app/src/main.jsx');
if (/from '\.\/App\.jsx'|<App\b/.test(main)) bad.push('main.jsx can still render the retired app (App.jsx)');
if (/from '\.\/Kit\.jsx'|<Kit\b/.test(main)) bad.push('main.jsx can still render the Kit');
for (const c of CURRENT) if (!main.includes(`'#/${c}'`)) bad.push(`main.jsx has no branch for the current page #/${c}`);

for (const b of bad) console.log(`FAIL ${b}`);
console.log(`route-check: ${ways.length - bad.filter((b) => b.includes(' opens ')).length} of ${ways.length} ways in open a current page${bad.length ? `; ${bad.length} failing` : ''}`);
process.exit(bad.length ? 1 : 0);
