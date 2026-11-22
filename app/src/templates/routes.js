// CHIP's routes in one place (Elleta, 23 Nov: Health takes Home's place and holds Work; Components, Foundations and
// History are one System place; Playground is its own). The old addresses keep working: canon() turns each into its
// new place, keeping the part and the query (#/work?filter=needs becomes #/health/work?filter=needs).
//   #/health            Health, Overview tab        #/system/components[/<id>]   System, Components tab
//   #/health/work       Health, Work tab            #/system/foundations         System, Foundations tab
//   #/playground        Playground                  #/system/history             System, History tab
const MOVED = {
  '': 'health',
  home: 'health',
  work: 'health/work',
  components: 'system/components',
  foundations: 'system/foundations',
  history: 'system/history',
  system: 'system/components',
};

/** The address in its new form, or the same address when it is already new. */
export function canon(hash) {
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
