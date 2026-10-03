// OBI's two paths. Questions about BELLA data (stories, contracts, docs,
// anatomy, contrast, tokens, what a component is missing) are answered here
// from data/bella.json, with no model call. Everything else goes to the model
// with retrieval. Also: which components an answer names, and when a pronoun
// cannot be resolved.

const yes = (v) => (v ? 'present' : 'missing');

export function componentsIn(text, bella) {
  if (!text || !bella) return [];
  return bella.components.filter((c) => new RegExp(`\\b${c.name}\\b`).test(text)).map((c) => c.name);
}

export function tokensIn(text) {
  return [...new Set(text?.match(/--[a-z][\w-]+/g) ?? [])];
}

function named(q, bella, page) {
  const inQ = componentsIn(q, bella);
  if (inQ.length) return bella.components.find((c) => c.name === inQ[0]);
  const m = page?.match(/^Atlas · (\w+)$/);
  return m ? bella.components.find((c) => c.name === m[1]) : null;
}

const gaps = (c) => [
  { check: 'Story', status: yes(c.hasStory), ok: c.hasStory },
  { check: 'Docs description', status: yes(c.hasDocs), ok: c.hasDocs },
  { check: 'Contract', status: yes(c.hasContract), ok: c.hasContract },
  { check: 'Contract parity', status: c.health.contract.status, ok: c.health.contract.status === 'pass' },
  { check: 'Contrast pairs', status: c.health.contrast.status, ok: c.health.contrast.status === 'pass' },
  { check: 'DSDS entry', status: yes(c.inDsds), ok: c.inDsds },
  { check: 'Anatomy', status: c.parts.length ? `${c.parts.length} parts` : 'none recorded', ok: c.parts.length > 0 },
];

/**
 * Returns { title, columns, rows, rowKey, note, components } when the question
 * is about BELLA data, or null to send it to the model.
 */
export function answerFromData(q, bella, page) {
  if (!bella) return null;
  const s = q.toLowerCase();
  const all = bella.components;
  const list = (title, rows, extra = []) => ({
    title,
    rowKey: 'name',
    columns: [{ key: 'name', label: 'Component' }, ...extra],
    rows,
    components: rows.map((r) => r.name),
  });
  const without = (what) => new RegExp(`\\b(no|without|missing|lacks?|lacking)\\b[^?]*\\b${what}`).test(s);

  if (without('stor(y|ies)')) {
    const rows = all.filter((c) => !c.hasStory).map((c) => ({ name: c.name, docs: yes(c.hasDocs) }));
    return list(`${rows.length} of ${all.length} components have no story`, rows, [{ key: 'docs', label: 'Docs' }]);
  }
  if (without('contracts?')) {
    const rows = all.filter((c) => !c.hasContract).map((c) => ({ name: c.name, story: yes(c.hasStory) }));
    return list(`${rows.length} of ${all.length} components have no contract`, rows, [{ key: 'story', label: 'Story' }]);
  }
  if (without('(docs|description)')) {
    const rows = all.filter((c) => !c.hasDocs).map((c) => ({ name: c.name, story: yes(c.hasStory) }));
    return list(`${rows.length} of ${all.length} components have no docs description`, rows, [{ key: 'story', label: 'Story' }]);
  }
  if (without('anatomy')) {
    const rows = all.filter((c) => !c.parts.length).map((c) => ({ name: c.name }));
    return list(`${rows.length} of ${all.length} components have no anatomy recorded`, rows);
  }
  if (/contrast/.test(s) && /\b(fail|failing|fails)\b/.test(s)) {
    const rows = all.filter((c) => c.health.contrast.status === 'fail').map((c) => ({ name: c.name, pairs: c.health.contrast.failing.join(', ') }));
    return list(`${rows.length} components fail a contrast pair`, rows, [{ key: 'pairs', label: 'Failing pairs' }]);
  }
  const token = tokensIn(q)[0];
  if (token && /\b(use|uses|using|reference|references|read|reads|depend|reach)\b/.test(s)) {
    const names = bella.tokenUsage[token] ?? [];
    const rows = names.map((n) => ({ name: n }));
    return list(`${rows.length} components use ${token}`, rows);
  }
  if (/\bhow many components\b/.test(s)) {
    return list(`BELLA has ${all.length} components`, all.map((c) => ({ name: c.name, story: yes(c.hasStory), contract: yes(c.hasContract) })), [
      { key: 'story', label: 'Story' },
      { key: 'contract', label: 'Contract' },
    ]);
  }
  const c = named(q, bella, page);
  if (c && /\btokens?\b/.test(s) && !token) {
    const rows = c.tokens.list.map((t) => ({ name: t, used: (bella.tokenUsage[t] ?? []).length }));
    return { title: `${c.name} reads ${rows.length} tokens`, rowKey: 'name', columns: [{ key: 'name', label: 'Token' }, { key: 'used', label: 'Components using it', numeric: true }], rows, components: [c.name] };
  }
  if (c && /\b(missing|gaps?|lacks?|what'?s wrong|incomplete)\b/.test(s)) {
    const rows = gaps(c);
    const missing = rows.filter((r) => !r.ok).length;
    return {
      title: missing ? `${c.name}: ${missing} of ${rows.length} checks need work` : `${c.name}: nothing missing`,
      rowKey: 'check',
      columns: [{ key: 'check', label: `${c.name} check` }, { key: 'status', label: 'Status' }],
      rows,
      components: [c.name],
    };
  }
  return null;
}

const PERSON = /\b(he|him|his|she|her|hers)\b/i;
const THING = /\b(it|this|that|these|those|here)\b/i;

/** A clarifying question when a pronoun cannot be resolved, or null. */
export function clarify(q, turns, page) {
  const earlier = turns.filter((t) => t.kind === 'ask');
  // a person counts as named when an earlier question has a capitalised word
  // past its first (a name, not the start of the sentence)
  const namesSomeone = (t) => t.q.split(/\s+/).slice(1).some((w) => /^[A-Z][a-z]+/.test(w));
  if (PERSON.test(q) && !earlier.some(namesSomeone)) {
    return 'Who do you mean? Name the person and I will look in your sources.';
  }
  if (THING.test(q) && !page?.startsWith('Atlas') && !earlier.length && q.split(/\s+/).length <= 6) {
    return 'Which component or doc do you mean?';
  }
  return null;
}

/** 2 or 3 questions built from the real gaps on the page. */
export function suggestionsFor(page, bella) {
  if (!bella) return [];
  const m = page?.match(/^Atlas · (\w+)$/);
  if (m) {
    const c = bella.components.find((x) => x.name === m[1]);
    if (!c) return [];
    const out = ["What's missing here?"];
    if (!c.hasStory) out.push(`What should a story for ${c.name} show?`);
    if (!c.parts.length) out.push(`How is ${c.name} built, part by part?`);
    if (!c.hasContract) out.push(`What should ${c.name}'s contract say?`);
    const t = c.tokens.list.find((x) => x.startsWith('--color-semantic-')) ?? c.tokens.list[0];
    if (out.length < 3 && t) out.push(`Which components use ${t}?`);
    return out.slice(0, 3);
  }
  const out = [];
  if (bella.counts.withStory < bella.counts.components) out.push('Which components have no story?');
  if (bella.counts.withContract < bella.counts.components) out.push('Which components have no contract?');
  const lowest = bella.stations.filter((st) => st.score !== null).sort((a, b) => a.score - b.score)[0];
  if (lowest) out.push(`How could BELLA raise its ${lowest.name} score?`);
  return out.slice(0, 3);
}
