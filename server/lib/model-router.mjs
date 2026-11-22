// The model router (Elleta, 22 Nov: "its still missing the other models and the model router thing we talked about").
// Auto picks by the question, says who answered and why in one line, and never runs a cloud model by itself:
// when it would pick Claude it says so and waits for her click ("no paid run without a plan").
//   data lookups and short facts -> the quick local model (8b)
//   longer explanations          -> the deeper local model (27b) when it is installed
//   reviews and code questions   -> Claude Sonnet, as a one-click offer, with the budget "x of 20 today"
const sizeOf = (m) => Number(String(m.label ?? m.id).match(/(\d+(?:\.\d+)?)b\b/i)?.[1] ?? 0);
const REVIEW = /\b(review|audit|critique|refactor|code|diff|pull request|implement\w*|bug|stack trace|why does .* fail)\b/i;
const EXPLAIN = /\b(how|why|explain|walk me through|compare|what does .* mean|difference between|how did|tell me about)\b/i;

export const kindOf = (q, { data = false } = {}) => {
  const words = String(q).trim().split(/\s+/).filter(Boolean).length;
  if (REVIEW.test(q) && !data) return 'review';
  if (data) return 'lookup';
  if (EXPLAIN.test(q) || words > 18) return 'explain';
  return 'short';
};

const REASON = { lookup: "it is a lookup in CHIP's data", short: 'it is a short fact', explain: 'it is an explanation', review: 'it is a review or a code question' };

/** The pick for a question. models: GET /models' list; budget: { used, limit }. Pure: tests feed it lists. */
export function routeModel(question, { models = [], budget = { used: 0, limit: 20 }, data = false } = {}) {
  const kind = kindOf(question, { data });
  const local = models.filter((m) => m.place === 'local' && m.available).sort((a, b) => sizeOf(a) - sizeOf(b));
  const quick = local.find((m) => m.isDefault) ?? local[0] ?? null;
  const deep = [...local].reverse().find((m) => sizeOf(m) > sizeOf(quick ?? {})) ?? null;
  const sonnet = models.find((m) => m.id === 'claude:sonnet');
  const up = (m) => ((m.id === quick?.id && deep) ? { id: deep.id, label: deep.label, cost: 'free' } : sonnet?.available ? { id: sonnet.id, label: sonnet.label, cost: 'uses your plan' } : null);
  const free = (m, why) => ({ id: m.id, label: m.label, place: 'local', kind, cost: 'free', confirm: false, alt: up(m), why: `Auto: local ${m.label.replace(/^qwen3\.?\d*:/, '')} because ${why}, free` });
  if (kind === 'review') {
    if (sonnet?.available && budget.used < budget.limit) {
      return { id: sonnet.id, label: sonnet.label, place: 'cloud', kind, cost: 'uses your plan', confirm: true, budget, why: `Auto: ${sonnet.label} because ${REASON.review}; it uses your plan, ${budget.used} of ${budget.limit} today` };
    }
    const m = deep ?? quick;
    if (m) return free(m, `${REASON.review}, and Claude is ${sonnet?.available ? `used up for today (${budget.used} of ${budget.limit})` : 'not available'}`);
  }
  if (kind === 'explain' && deep) return free(deep, REASON.explain);
  if (quick) return free(quick, kind === 'explain' ? 'it is an explanation and the deeper model is not installed' : REASON[kind]);
  return { id: null, label: null, place: null, kind, cost: null, confirm: false, why: 'Auto: no local model is running and nothing was sent anywhere' };
}

/** What the menu shows: groups in order, each model with its cost note and availability said in words. */
export function menuOf(models, budget) {
  const hint = (m) => (m.place === 'local' ? (sizeOf(m) >= 20 ? 'deeper' : 'quick') : m.hint);
  const entry = (m) => ({
    id: m.id, label: m.kind === 'decider' ? `${m.label} decider` : m.label, group: m.group, place: m.place, available: m.available,
    note: m.available ? (m.place === 'local' ? `${hint(m)} · free · stays on this Mac` : m.note) : `not available: ${m.note ?? 'not connected'}`,
  });
  const order = ['On this machine', 'Cloud'];
  return {
    auto: { id: 'auto', label: 'Auto', note: `picks by the question · Claude ${budget.used} of ${budget.limit} today` },
    models: models.map(entry).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || (a.available === b.available ? 0 : a.available ? -1 : 1) || sizeOf(a) - sizeOf(b)),
    budget,
  };
}
