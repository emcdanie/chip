// What keeps coming back (Elleta, 22 Nov: "build A, the ranked list of what came back in the last 14 days with a
// permanent-fix button, with C, closed loops with before and after, as the proof"). Read from the logs CHIP keeps:
// the gate checks' own log (data/checks/log.jsonl: id, ok, ranAt, commit) and the action log (data/actions.jsonl: a kept
// run is a permanent fix: kind, date landed, what changed). Nothing typed: where nothing is kept it says so.
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

/** A kept run is a permanent fix. For each one: what it was, when it landed, what changed, and how often the check it
 * answers to failed in the 14 days before against the 14 days after (null where that cannot be told yet). */
export function closedLoops(log, actions, { now = Date.now() } = {}) {
  const kept = actions.filter((a) => a.kind === 'keep' && a.at);
  return kept
    .map((a) => {
      const at = Date.parse(a.at);
      // the check a fix answers to: named in its title (checks are logged by id; a fix says "Fix <thing>'s drift", so no id is guessed)
      const id = a.check ?? null;
      const failures = (from, to) => log.filter((r) => !r.ok && (!id || r.id === id) && Date.parse(r.ranAt) >= from && Date.parse(r.ranAt) < to).length;
      const after = now - at >= 3 * DAY;
      return {
        kind: a.title ?? 'A fix',
        landed: a.at,
        changed: a.sentence || (a.files?.length ? `${a.files.length} ${a.files.length === 1 ? 'file' : 'files'}` : null),
        files: a.files ?? [],
        before: id ? failures(at - WINDOW, at) : null,
        after: id && after ? failures(at, Math.min(now, at + WINDOW)) : null,
        measured: Boolean(id),
      };
    })
    .sort((a, b) => (a.landed < b.landed ? 1 : -1));
}
