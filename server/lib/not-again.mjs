// What keeps coming back (Elleta, 22 Nov: "build A, the ranked list of what came back in the last 14 days with a
// permanent-fix button, with C, closed loops with before and after, as the proof"). Read from the logs CHIP keeps:
// the gate checks' own log (data/checks/log.jsonl: id, ok, ranAt, commit) and the permanent-fix log (data/fixes.json: kind,
// date landed, what changed, commit, what it closes). Nothing typed: where nothing is kept it says so.
const DAY = 86400000;
const WINDOW = 14 * DAY;

/** Failed gate runs per check in the last 14 days, most first: count, last time, trend (last 7 days against the 7 before). */
export function recurring(log, { names = {}, now = Date.now() } = {}) {
  const by = new Map();
  for (const r of log) {
    if (r.ok || !r.ranAt) continue;
    const t = Date.parse(r.ranAt);
    if (!(t <= now) || now - t > WINDOW) continue;
    const e = by.get(r.id) ?? { id: r.id, name: names[r.id] ?? r.name ?? r.id, count: 0, recent: 0, before: 0, last: null, commit: null };
    e.count += 1;
    if (now - t <= 7 * DAY) e.recent += 1;
    else e.before += 1;
    if (!e.last || t > Date.parse(e.last)) {
      e.last = r.ranAt;
      e.commit = r.commit ?? null;
    }
    by.set(r.id, e);
  }
  return [...by.values()]
    .map((e) => ({ ...e, trend: e.recent > e.before ? 'up' : e.recent < e.before ? 'down' : 'same' }))
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
}

/** The landed fixes in the log (server/lib/fixes.mjs), newest first. Each: what it was, what it closes, when it landed, what
 * changed, the commit, and how often the check it answers to failed in the 14 days before against the 14 days after.
 * "before" and "after" are null where no gate check is tied to it (not recorded); "after" is null until 3 days have passed
 * (too early). A planned fix has not landed, so it is not a closed loop. */
export function closedLoops(log, fixes, { now = Date.now() } = {}) {
  return fixes
    .filter((f) => f.status === 'landed' && f.landed)
    .map((f) => {
      const at = Date.parse(f.landed);
      const id = f.check ?? null;
      const failures = (from, to) => log.filter((r) => !r.ok && r.id === id && Date.parse(r.ranAt) >= from && Date.parse(r.ranAt) < to).length;
      const after = now - at >= 3 * DAY;
      return {
        kind: f.kind,
        closes: f.closes,
        landed: f.landed,
        changed: f.changed ?? null,
        commit: f.commit ?? null,
        before: id ? failures(at - WINDOW, at) : null,
        after: id && after ? failures(at, Math.min(now, at + WINDOW)) : null,
        measured: Boolean(id),
        tooEarly: !after,
      };
    })
    .sort((a, b) => (a.landed < b.landed ? 1 : -1));
}

/** Fixes she approved that have not landed yet, newest first: the page says "Planned" and which item they close. */
export function plannedFixes(fixes) {
  return fixes.filter((f) => f.status === 'planned').sort((a, b) => (a.planned < b.planned ? 1 : -1)).map((f) => ({ kind: f.kind, closes: f.closes, planned: f.planned }));
}
