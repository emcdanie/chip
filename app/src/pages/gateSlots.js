/* Gate runs as bars (her pick "C · Apple style", 22 Nov): every recorded run, GitHub CI and CHIP's own, put
   into a slot of the range she picked. Day: half hours from the first run (or six hours back) to now, on the
   most recent day that has runs; week and month: a slot per day; year: a slot per month. Only what was
   recorded; a slot with no run is an empty slot, not a made-up one. */
export function gateRuns(checks) {
  const out = [];
  for (const r of checks?.ci ?? []) if (r.status === 'completed' && r.createdAt) out.push({ at: new Date(r.createdAt), ok: r.conclusion === 'success', cause: null });
  for (const r of checks?.log ?? []) if (r.ranAt) out.push({ at: new Date(r.ranAt), ok: Boolean(r.ok), cause: r.ok ? null : r.name ?? null });
  return out.sort((a, b) => a.at - b.at);
}

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function gateSlots(runs, range, now = new Date()) {
  const put = (slots, key, run) => {
    const s = slots.get(key);
    if (!s) return;
    if (run.ok) s.passed += 1;
    else {
      s.failed += 1;
      if (run.cause && !s.causes.includes(run.cause)) s.causes.push(run.cause);
    }
  };
  const done = (slots) => [...slots.values()].map(({ causes, ...s }) => ({ ...s, ...(causes.length ? { cause: causes.join(', ') } : {}) }));
  if (range === 'day') {
    const last = [...runs].reverse().find((r) => r.at <= now)?.at ?? now;
    const day = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    const today = runs.filter((r) => sameDay(r.at, last));
    const first = today[0]?.at ?? last;
    const startMin = Math.min(Math.floor((first.getHours() * 60 + first.getMinutes()) / 30) * 30, Math.floor(((sameDay(last, now) ? now : last).getHours() * 60 - 360) / 30) * 30);
    const endMin = Math.ceil(((sameDay(last, now) ? now : last).getHours() * 60 + (sameDay(last, now) ? now : last).getMinutes() + 1) / 30) * 30;
    const slots = new Map();
    for (let m = Math.max(0, startMin); m < Math.min(1440, endMin); m += 30) {
      const a = new Date(day.getTime() + m * 60000);
      const b = new Date(day.getTime() + (m + 30) * 60000);
      slots.set(m, { label: hhmm(a), range: `${hhmm(a)}-${hhmm(b)}`, ...(m % 60 === 0 ? { axisLabel: hhmm(a) } : {}), passed: 0, failed: 0, causes: [] });
    }
    for (const r of today) put(slots, Math.floor((r.at.getHours() * 60 + r.at.getMinutes()) / 30) * 30, r);
    return done(slots);
  }
  if (range === 'year') {
    const slots = new Map();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      slots.set(`${d.getFullYear()}-${d.getMonth()}`, { label: d.toLocaleDateString('en-GB', { month: 'short' }), range: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), passed: 0, failed: 0, causes: [] });
    }
    for (const r of runs) put(slots, `${r.at.getFullYear()}-${r.at.getMonth()}`, r);
    return done(slots);
  }
  const days = range === 'week' ? 7 : 30;
  const slots = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    slots.set(key, { label: days === 7 ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : String(d.getDate()), range: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), ...(days === 30 && d.getDate() % 5 !== 1 ? { axisLabel: '' } : {}), passed: 0, failed: 0, causes: [] });
  }
  for (const r of runs) put(slots, `${r.at.getFullYear()}-${r.at.getMonth()}-${r.at.getDate()}`, r);
  return done(slots);
}
