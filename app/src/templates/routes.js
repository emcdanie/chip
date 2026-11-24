// CHIP's routes in one place (Elleta, 23 Nov: Health takes Home's place and holds Work; Components, Foundations and
// History are one System place; Playground is its own). The old addresses keep working: canon() turns each into its
// new place, keeping the part and the query (#/work?filter=needs becomes #/health/work?filter=needs).
// Her pick B (23 Nov, "Work beside Health"): Work is its own item and stays #/work.
//   #/work              Work                        #/system/components[/<id>]   System, Components tab
//   #/health            Health (#/home goes here)   #/system/foundations         System, Foundations tab
//   #/playground        Playground                  #/system/history             System, History tab
const MOVED = {
  '': 'work',
  home: 'health',
  components: 'system/components',
  foundations: 'system/foundations',
  history: 'system/history',
  system: 'system/components',
};
// the short-lived Health > Work address (23 Nov, before her pick) opens Work
const WORK_UNDER_HEALTH = /^#\/health\/work(?=[?]|$)/;

// The pages CHIP draws today, on the CHIP / Screen template (main.jsx renders exactly these). An address is current when
// its path (before any ?query) is one of them, or starts with one that takes a part after it.
export const CURRENT = ['work', 'health', 'health/audits', 'playground', 'not-again', 'system-map', 'team', 'connectors', 'system/components', 'system/foundations', 'system/docs', 'system/history', 'present'];
const WITH_PART = ['system/components', 'present'];
const pathOf = (hash) => String(hash || '').replace(/^#?\/?/, '').split('?')[0].replace(/\/$/, '');
/** Whether an address opens a current page (never the retired app). */
export function isCurrent(hash) {
  const path = pathOf(hash);
  return CURRENT.includes(path) || WITH_PART.some((c) => path.startsWith(`${c}/`));
}

// The retired app's addresses (App.jsx: Overview, Projects, Atlas, the old Docs, Runs, Checks, OBI, the Kit) and any
// address CHIP does not know open the current page that took their place, never the old design (Elleta, 23 Nov
// evening: a menu item opened an old page; CLAUDE.md "Navigation").
const RETIRED = {
  'health-old': 'health',
  overview: 'health',
  checks: 'health',
  gaps: 'health',
  drift: 'health',
  obi: 'health',
  runs: 'work',
  projects: 'work',
  play: 'playground',
  'connectors-old': 'connectors',
  settings: 'connectors',
  'history-old': 'system/history',
  docs: 'system/docs',
  atlas: 'system/components',
  kit: 'system/components',
  map: 'system-map',
};

/** The address in its new form, or the same address when it is already new. Never an address of the retired app. */
export function canon(hash) {
  const to = moved(hash);
  if (isCurrent(to)) return to;
  const m = String(to || '').match(/^#?\/?([\w-]*)(\/[^?]*)?(\?.*)?$/);
  const head = m?.[1] ?? '';
  // a retired Atlas part opens the same part on System > Components (#/atlas/button)
  if (head === 'atlas' && m?.[2]) return `#/system/components${m[2]}`;
  return `#/${RETIRED[head] ?? 'work'}`;
}

function moved(hash) {
  // Needs you is Work's filter, so the old #/needs address opens it there
  if (/^#?\/?needs\/?(?=[?]|$)/.test(String(hash || ''))) return '#/work?filter=needs';
  if (WORK_UNDER_HEALTH.test(hash)) return String(hash).replace('#/health/work', '#/work');
  const m = String(hash || '').match(/^#?\/?([\w-]*)(\/[^?]*)?(\?.*)?$/);
  if (!m) return hash;
  const [, head, rest = '', query = ''] = m;
  if (!(head in MOVED)) return hash;
  // a bare #/system keeps its first tab; a moved page keeps its part (#/components/Button)
  const to = head === 'system' && rest ? `system${rest}` : rest && head !== 'home' ? `${MOVED[head]}${rest}` : MOVED[head];
  return `#/${to}${query}`;
}

/** The part open on System > Components, from either address form. */
export function partFromHash(hash = window.location.hash) {
  const id = canon(hash).split('?')[0].split('/')[3];
  return id ? decodeURIComponent(id) : null;
}
