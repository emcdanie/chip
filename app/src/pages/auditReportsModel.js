// The audit report's numbers made into what the page shows: every change, its word and its filter, the chart
// points on one shared time scale. Pure: it reads /audit-reports and nothing else, so a test can feed it a fixture.
// Rule (CLAUDE.md, Charts, "Change charts"): a move under 3 points is grey and says "no real change"; a measure
// with one run is "first run"; chip counts are counted from the rows the page shows.

export const REAL = 3;
export const FILTERS = [
  { id: 'real', label: 'Real change' },
  { id: 'none', label: 'No real change' },
  { id: 'first', label: 'First run' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-12" as "12 Nov", read as text so no time zone can move the day. */
export const dayWords = (d) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
export const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
const r1 = (n) => Math.round(n * 10) / 10;

/** One change: the last two points of a measure, in one unit. */
function change(id, name, points, extra = {}) {
  const pts = points.filter((p) => p[1] != null);
  if (pts.length < 2) {
    const p = pts[0];
    return { id, name, kind: 'first', value: p?.[1] ?? null, day: p?.[0] ?? null, ...extra };
  }
  const [a, b] = pts.slice(-2);
  const delta = r1(b[1] - a[1]);
  return { id, name, kind: Math.abs(delta) >= REAL ? 'real' : 'none', delta, from: a[0], to: b[0], value: b[1], ...extra };
}

export const AUDIT_NAME = {
  product: 'CHIP app inspection',
  figma: 'CHIP Figma screens audit',
  ds: 'BELLA system inspection',
  tokens: 'BELLA tokens audit',
  a11y: 'Accessibility',
  agents: 'Agents',
};

/** Everything the page needs from the server's answer. */
export function buildReport(d) {
  const b = d.bench;
  const ms = b.series.md;
  const bs = b.series.bare;
  const rd = d.readiness;
  const changes = [
    change('bench-md', 'Benchmark, AGENTS.md score', ms, { group: 'bench' }),
    change('bench-bare', 'Benchmark, no-file score', bs, { group: 'bench' }),
    change('ready-static', 'Readiness score (files only)', rd.static.p, { group: 'ready' }),
    change('ready-composite', 'Readiness score (with the agent run)', rd.composite.p, { group: 'ready' }),
    ...d.audits
      .filter((a) => a.ran)
      .map((a) => {
        // runs in the same unit as the latest one only: a score out of 100 never meets a count of checks
        const same = (a.runs ?? []).filter((r) => r.unit === a.unit);
        return change(`audit-${a.id}`, AUDIT_NAME[a.id] ?? a.title, same.map((r) => [r.day, r.value]), { group: a.id, unit: a.unit });
      }),
  ];
  changes.sort((x, y) => (y.kind === 'real') - (x.kind === 'real') || Math.abs(y.delta ?? 0) - Math.abs(x.delta ?? 0));

  // the shared time scale of the small charts: days since the earliest point, to the latest
  const days = [...rd.static.p, ...rd.composite.p, ...d.audits.flatMap((a) => (a.runs ?? []).map((r) => [r.day]))].map((p) => p[0]).sort();
  const D0 = days[0];
  const span = Math.max(1, daysBetween(D0, days[days.length - 1]));
  const line = (p) => ({ points: p.map(([day, value]) => ({ label: dayWords(day), value, x: daysBetween(D0, day) })), xRange: [0, span] });

  return { changes, line, span, D0, last: days[days.length - 1] };
}

/** How many rows each chip holds, counted from the rows. */
export function counts(changes) {
  return { all: changes.length, real: changes.filter((c) => c.kind === 'real').length, none: changes.filter((c) => c.kind === 'none').length, first: changes.filter((c) => c.kind === 'first').length };
}

export const changeWord = (c) => (c.kind === 'first' ? 'first run' : c.kind === 'none' ? 'no real change' : c.delta < 0 ? 'worse' : 'better');
export const changeTone = (c) => (c.kind === 'first' ? 'info' : c.kind === 'none' ? 'neutral' : c.delta < 0 ? 'danger' : 'success');
