/* Gate runs as bars (her pick "C · Apple style", 22 Nov): every recorded run, GitHub CI and CHIP's own, put
   into a slot of the range she picked. Day: half hours from the first run (or six hours back) to now, on the
   most recent day that has runs; week and month: a slot per day; year: a slot per month. Only what was
   recorded; a slot with no run is an empty slot, not a made-up one. */
export function gateRuns(checks) {
  const out = [];
  // a cancelled run is neither a pass nor a failure of the gate: it is left out of the counts
  for (const r of checks?.ci ?? []) if (r.status === 'completed' && r.createdAt && r.conclusion !== 'cancelled' && r.conclusion !== 'skipped') out.push({ at: new Date(r.createdAt), ok: r.conclusion === 'success', cause: r.conclusion === 'success' ? null : r.workflowName ?? null, source: 'ci', title: r.title ?? null, url: r.url ?? null, sha: r.headSha ? String(r.headSha).slice(0, 7) : null });
  for (const r of checks?.log ?? []) if (r.ranAt) out.push({ at: new Date(r.ranAt), ok: Boolean(r.ok), cause: r.ok ? null : r.name ?? null, source: 'chip', title: r.ok ? null : r.name ?? null, url: null, sha: null });
  return out.sort((a, b) => a.at - b.at);
}

/* What each failing check means, in plain words, in one place (Elleta, 22 Nov: "i still dont know what the failure was..
   or why this is important"). what = what failed; why = why it matters. A name not listed here is shown as it is, with no
   reason made up. */
export const GATE_WORDS = {
  'Contracts match the code': { what: "a part's written contract (its options) no longer equals the real code", why: 'agents build from options that do not exist' },
  'Generated files are up to date': { what: 'the built files (colour tokens, specs) differ from what the build makes now', why: 'CHIP and Storybook show old values' },
  'Colour contrast': { what: 'a text colour and its background fall short of AAA', why: 'some people cannot read that text' },
  'Contrast pairs': { what: 'a text colour and its background fall short of AAA', why: 'some people cannot read that text' },
  'AGENTS.md covers every component': { what: 'the agent instructions do not name every part', why: 'agents do not know a part exists' },
  'AGENTS.md check': { what: 'the agent instructions do not name every part', why: 'agents do not know a part exists' },
  'Visual audit': { what: 'a part no longer looks like its saved picture', why: 'a visual change slipped in unseen' },
};
export const plainWhat = (name) => GATE_WORDS[name]?.what ?? name;

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
      s.failedRuns.push(run);
      if (run.cause && !s.causes.includes(run.cause)) s.causes.push(run.cause);
    }
  };
  const done = (slots) => [...slots.values()].map(({ causes, ...s }) => ({ ...s, ...(causes.length ? { cause: causes.map(plainWhat).join(', ') } : {}) }));
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
      slots.set(m, { label: hhmm(a), range: `${hhmm(a)}-${hhmm(b)}`, ...(m % 60 === 0 ? { axisLabel: hhmm(a) } : {}), passed: 0, failed: 0, causes: [], failedRuns: [] });
    }
    for (const r of today) put(slots, Math.floor((r.at.getHours() * 60 + r.at.getMinutes()) / 30) * 30, r);
    return done(slots);
  }
  if (range === 'year') {
    const slots = new Map();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      slots.set(`${d.getFullYear()}-${d.getMonth()}`, { label: d.toLocaleDateString('en-GB', { month: 'short' }), range: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), passed: 0, failed: 0, causes: [], failedRuns: [] });
    }
    for (const r of runs) put(slots, `${r.at.getFullYear()}-${r.at.getMonth()}`, r);
    return done(slots);
  }
  const days = range === 'week' ? 7 : 30;
  const slots = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    slots.set(key, { label: days === 7 ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : String(d.getDate()), range: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), ...(days === 30 && d.getDate() % 5 !== 1 ? { axisLabel: '' } : {}), passed: 0, failed: 0, causes: [], failedRuns: [] });
  }
  for (const r of runs) put(slots, `${r.at.getFullYear()}-${r.at.getMonth()}-${r.at.getDate()}`, r);
  return done(slots);
}

/* The answer on the card (Elleta, 23 Nov: "explain to me why it helps"): the question and its answer from the runs
   recorded. CI runs only count as the gate's passes (CHIP's own log is shown in the bars). since = the first run;
   trend = the last `days` against the `days` before; most = the check that fails most often. */
export function gateAnswer(runs, now = new Date(), days = 30) {
  const ci = runs.filter((r) => r.source === 'ci');
  if (!ci.length) return null;
  const passed = ci.filter((r) => r.ok).length;
  const failed = ci.filter((r) => !r.ok);
  const last = failed[failed.length - 1] ?? null;
  const day = 86400000;
  const rate = (a, b) => {
    const w = ci.filter((r) => r.at >= a && r.at < b);
    return w.length ? Math.round((100 * w.filter((r) => r.ok).length) / w.length) : null;
  };
  const recent = rate(new Date(now - days * day), new Date(+now + day));
  const before = rate(new Date(now - 2 * days * day), new Date(now - days * day));
  const counts = new Map();
  for (const r of failed) counts.set(r.cause ?? 'a check', (counts.get(r.cause ?? 'a check') ?? 0) + 1);
  const [most] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { total: ci.length, passed, since: ci[0].at, last, recent, before, trend: recent == null || before == null ? null : recent - before, most: most ? { name: most[0], n: most[1] } : null };
}

/** The failed runs inside the range's window, newest first (the Y range is the last 12 months). */
export function failedIn(runs, range, now = new Date()) {
  const from = range === 'year' ? new Date(now.getFullYear(), now.getMonth() - 11, 1) : range === 'month' ? new Date(now - 29 * 86400000) : range === 'week' ? new Date(now - 6 * 86400000) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = range === 'day' ? (() => { const last = [...runs].reverse().find((r) => r.at <= now)?.at ?? now; return new Date(last.getFullYear(), last.getMonth(), last.getDate()); })() : from;
  return runs.filter((r) => !r.ok && r.at >= start).sort((a, b) => b.at - a.at);
}

const firstSentence = (t) => String(t ?? '').split(/(?<=[.!?])\s/)[0].trim() || null;
const hhmmOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayOfD = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
/* What one failed run says, in plain words: what failed, why it matters, what caused it (the commit or change that was
   running, from the run's own record; never guessed) and what fixed it (the next passing run). */
export function explainRun(run, runs) {
  const words = GATE_WORDS[run.cause] ?? null;
  const caused = firstSentence(run.title);
  const fixer = runs.filter((r) => r.ok && r.source === run.source && r.at > run.at).sort((a, b) => a.at - b.at)[0] ?? null;
  const when = (d) => (sameDay(d, run.at) ? hhmmOf(d) : `${dayOfD(d)} ${hhmmOf(d)}`);
  return {
    what: words?.what ?? run.cause ?? 'The gate',
    why: words?.why ?? null,
    cause: caused && caused !== run.cause ? caused : null,
    fixed: fixer ? `${when(fixer.at)}${firstSentence(fixer.title) ? ` by ${firstSentence(fixer.title)}` : ''}` : null,
  };
}
