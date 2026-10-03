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
    caption: 'Components',
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
    return { title: `${c.name} reads ${rows.length} tokens`, caption: `${c.name} tokens`, rowKey: 'name', columns: [{ key: 'name', label: 'Token' }, { key: 'used', label: 'Components using it', numeric: true }], rows, components: [c.name] };
  }
  if (c && /\b(missing|gaps?|lacks?|what'?s wrong|incomplete)\b/.test(s)) {
    const rows = gaps(c);
    const missing = rows.filter((r) => !r.ok).length;
    return {
      title: missing ? `${c.name}: ${missing} of ${rows.length} checks need work` : `${c.name}: nothing missing`,
      caption: `${c.name} checks`,
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

/* ---------- Auto: which brain answers, cheapest first ---------- */
// (BELLA data questions and /commands are routed before this and never reach
// a model.) Later, a decider (Jev) is asked first and these rules only run
// when its probability is under 0.7.
const REASON = {
  review: 'a review', plan: 'a plan', write: 'writing', draft: 'a draft', compare: 'a comparison',
  critique: 'a critique', explain: 'an explanation', why: 'an explanation', tradeoff: 'trade-offs', tradeoffs: 'trade-offs',
};
const CLAUDE_ASKS = /\b(review|plan|write|draft|compare|critique|explain why|why does|why is|trade-?offs?)\b/i;

/** { provider: 'claude' | 'local:<model>' | null, why } for Auto. */
export function routeFor(q, models, budget) {
  const local = models.find((m) => m.place === 'local' && m.isDefault) ?? models.find((m) => m.place === 'local');
  const claude = models.find((m) => m.id === 'claude' && m.available);
  // no list yet (or Ollama down): still the server's own default model, so a
  // real answer or a real error comes back
  const localPick = { provider: local?.id ?? 'local:', why: `${local?.label ?? 'the local model'} · docs question` };
  if (/figma\.com\/(file|design|proto|board)/i.test(q)) {
    return { provider: null, why: 'Figma link · Figma is not connected to CHIP yet' };
  }
  const words = q.trim().split(/\s+/).length;
  const parts = (q.match(/\?/g) ?? []).length;
  const verb = CLAUDE_ASKS.exec(q)?.[0]?.toLowerCase().replace(/-/g, '');
  const wantsClaude = verb
    ? `asked for ${REASON[verb] ?? REASON[verb.split(' ')[0]] ?? 'reasoning'}`
    : words > 40 ? 'a long question' : parts > 1 ? 'a multi-part question' : null;
  if (!wantsClaude) return localPick;
  if (!claude) return { ...localPick, why: `${localPick.why} (Claude would fit, but it is not available)` };
  if (budget && budget.used >= budget.limit) return { ...localPick, why: `${localPick.why} (today's Claude budget of ${budget.limit} is used)` };
  return { provider: 'claude', why: `Claude · ${wantsClaude}` };
}

/** The local model hedges: low confidence, worth a second opinion. (A
 *  retrieval miss is not this: see isMiss.) */
export function soundsUnsure(text) {
  return /\b(not sure|i'?m unsure|unclear from the sources|may be inaccurate|i might be wrong)\b/i.test(text ?? '');
}

/** The model found nothing it could use: a retrieval miss, not the model's fault. */
export function isMiss(text) {
  return /^\s*nothing in my sources covers/i.test(text ?? '');
}

/* ---------- citations: one marker per sentence, one per run ---------- */
// Models over-cite ("… [2]. … [2]. … [2][3]."). Per paragraph or list item:
// a sentence keeps its first marker only, and a run of sentences citing the
// same source keeps one marker, at the end of the run. Works on any
// provider's text, as it streams.
export function tidyCitations(text) {
  if (!text) return text;
  return text
    .split('\n')
    .map((line) => {
      const lead = line.match(/^\s*(?:[-*] |#+\s*)?/)[0];
      const body = line.slice(lead.length);
      const sentences = body.split(/(?<=[.!?])\s+/);
      const marks = sentences.map((s) => {
        const m = s.match(/\[(\d+)\]/);
        return m ? m[1] : null;
      });
      const out = sentences.map((s, i) => {
        let plain = s.replace(/\s*\[\d+\]/g, '').replace(/\s+([.,;:!?])/g, '$1');
        const n = marks[i];
        // drop the marker when the next sentence cites the same source
        if (!n || marks[i + 1] === n) return plain;
        return /[.!?:;]$/.test(plain) ? plain.replace(/([.!?:;]+)$/, ` [${n}]$1`) : `${plain} [${n}]`;
      });
      return lead + out.join(' ');
    })
    .join('\n');
}

/* ---------- tools: when a question is for Figma ---------- */
// One line each, so Elleta can read and change them (docs/host.md):
//   - a figma.com link with a node, or "frame / design context / screenshot"
//     plus "figma"            -> the official Figma MCP (read only)
//   - "variables / plugin / library" plus "figma" -> Figma Console MCP
//   - "export / batch / many files" plus "figma"  -> the Figma CLI (not set up yet)
// Returns { server, tool, args, label, why } or null: label is the short
// "what" for the answer's one line, why is the reason, shown under Details.
export function toolRouteFor(q) {
  const url = q.match(/https?:\/\/(?:www\.)?figma\.com\/(?:design|file|proto|board)\/[^\s]+/i)?.[0];
  const mentionsFigma = /\bfigma\b/i.test(q) || Boolean(url);
  if (!mentionsFigma) return null;
  // a page question reads the document root (0:0), never the selection
  if (/\bpages?\b/i.test(q) && !url?.includes('node-id')) {
    return { server: 'figma', tool: 'get_metadata', args: { nodeId: '0:0' }, label: 'pages of the open file', why: 'a question about pages reads the whole document' };
  }
  if (url) {
    const node = new URL(url).searchParams.get('node-id');
    if (node) return { server: 'figma', tool: 'get_metadata', args: { nodeId: node.replace('-', ':') }, label: 'the frame in the link', why: 'the question has a Figma link with a node' };
    // with nothing selected Figma lists the pages; with a selection, it describes it
    return { server: 'figma', tool: 'get_metadata', args: {}, label: 'the open file', why: 'the question has a Figma link without a node' };
  }
  if (/\b(export|batch|many files|script)\b/i.test(q)) return { server: 'figma-cli', tool: null, args: {}, label: 'batch work', why: 'Figma batch work goes to the Figma CLI, which is not set up yet' };
  if (/\b(variables?|plugin|library|libraries)\b/i.test(q)) return { server: 'figma-console', tool: 'figma_get_variables', args: {}, label: 'read variables', why: 'Figma variables, plugins and libraries go to Figma Console' };
  if (/\b(frame|design context|screenshot|selection|selected)\b/i.test(q)) {
    return /\bscreenshot\b/i.test(q)
      ? { server: 'figma', tool: 'get_screenshot', args: {}, label: 'screenshot of your selection', why: 'a Figma screenshot goes to the official Figma MCP' }
      : { server: 'figma', tool: 'get_design_context', args: {}, label: 'your selection', why: 'a Figma frame or selection goes to the official Figma MCP' };
  }
  return null;
}

/* ---------- tool output, in words ---------- */
// Every tool answer opens with a sentence, not a dump; the raw output goes
// under Details. Node IDs (12:34) stay out of the sentence.
const NODE_ID = /\b\d+:\d+\b/g;
const listOf = (names, max = 6) => {
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A short plain answer for a tool's output (or its error). */
export function summarizeTool({ server, tool, text = '', error = null, q = '' }) {
  if (error) {
    const p = parseJson(error);
    const j = p && typeof p === 'object' && !Array.isArray(p) ? p : null;
    const str = (v) => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v));
    // the Desktop Bridge advice is shown as its own line under the answer
    const msg = (j ? [str(j.error), /Desktop Bridge/i.test(str(j.message) ?? '') ? null : str(j.message)].filter(Boolean).join('. ') : '') || String(error);
    return `${server} could not do that: ${msg.replace(/^\[[\w-]+\]\s*/, '').replace(NODE_ID, '').replace(/\s+/g, ' ').trim()}`;
  }
  const out = text.trim();
  if (!out) return `${server} ran ${tool} and returned nothing.`;

  // official Figma MCP: page list ("- 0:1: Cover")
  const pages = [...out.matchAll(/^- \d+:\d+: (.+)$/gm)].map((m) => m[1].trim()).filter((n) => !/^-+$/.test(n));
  if (pages.length && /pages/i.test(out)) return `The open file has ${plural(pages.length, 'page')}: ${listOf(pages)}.`;

  // XML node metadata: the top node and its direct children
  const top = out.match(/^<(\w+) id="[^"]*" name="([^"]*)"[^>]*>/);
  if (top) {
    const lines = out.split('\n');
    const indent = (l) => l.match(/^\s*/)[0].length;
    const base = indent(lines.find((l) => l.trim().startsWith('<')) ?? '');
    const kids = lines.filter((l) => /^\s*<\w+ id=/.test(l) && indent(l) === base + 2).map((l) => l.match(/name="([^"]*)"/)?.[1]).filter(Boolean);
    const w = top[0].match(/width="([\d.]+)"/)?.[1];
    const h = top[0].match(/height="([\d.]+)"/)?.[1];
    const size = w && h && +w > 0 ? ` (${Math.round(w)} × ${Math.round(h)})` : '';
    if (top[1] === 'document') {
      const pages = kids.filter((n) => !/^-+$/.test(n.trim()));
      return `The open file has ${plural(pages.length, 'page')}: ${listOf(pages)}.`;
    }
    // asked for pages, got a node: say so, never answer a different question
    if (/\bpages?\b/i.test(q)) return 'Figma gave me your selection, not the page list. Deselect everything and ask again.';
    const kind = top[1] === 'canvas' ? 'page' : top[1];
    return `${top[2]} is a ${kind}${size}${kids.length ? ` with ${plural(kids.length, 'layer')}: ${listOf(kids)}` : ''}.`;
  }

  // JSON (Figma Console): errors, variables, collections, or a count of keys
  const j = parseJson(out);
  if (j && typeof j === 'object') {
    if (j.error) return summarizeTool({ server, tool, error: out });
    const vars = j.variables ?? j.data?.variables;
    const cols = j.collections ?? j.variableCollections ?? j.data?.variableCollections;
    if (Array.isArray(vars)) return `${plural(vars.length, 'variable')}${Array.isArray(cols) ? ` in ${plural(cols.length, 'collection')}: ${listOf(cols.map((c) => c.name))}` : ''}.`;
    if (j.success === true || j.ok === true) return `Done. ${j.message ?? ''}`.trim();
    if (Array.isArray(j)) return `${tool.replace(/^figma_/, '').replace(/_/g, ' ')} returned ${plural(j.length, 'item')}.`;
    const keys = Object.keys(j).filter((k) => !k.startsWith('_'));
    return `${tool.replace(/^figma_/, '').replace(/_/g, ' ')} returned ${listOf(keys, 5)}.`;
  }

  // git
  if (server === 'git' && tool === 'status') {
    const [head, ...files] = out.split('\n');
    const branch = head.match(/^## (\S+?)(?:\.\.\.|\s|$)/)?.[1];
    return `On ${branch ?? 'this branch'}: ${files.length ? `${plural(files.length, 'changed file')}` : 'nothing changed'}.`;
  }
  if (server === 'git' && tool === 'log') {
    const commits = out.split('\n').map((l) => l.replace(/^[0-9a-f]{7,}\s+/, ''));
    return `The last ${plural(commits.length, 'commit')}: ${commits.slice(0, 3).join('; ')}${commits.length > 3 ? '; …' : ''}.`;
  }

  // anything else: its first real line
  const first = out.split('\n').find((l) => l.trim()) ?? '';
  return first.replace(NODE_ID, '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

/* ---------- usage, in words (Health's Usage card and /usage) ---------- */
const fmtTokens = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('en'));

/** The week's ledger (GET /usage) as figures with a line under each. */
export function usageFigures(u) {
  const { data, local, cloud } = u.routes;
  return {
    answers: { value: u.answers, delta: `data ${data} · local ${local} · cloud ${cloud}` },
    tokens: {
      value: fmtTokens(u.tokensLocal),
      delta: `${u.cloudTokens ? `${fmtTokens(u.cloudTokens)} went to the cloud` : 'none went to the cloud'}${u.uncounted ? ` · ${u.uncounted} earlier answers not counted` : ''}`,
    },
    value: u.value
      ? { value: `≈ ${u.value.currency === 'USD' ? '$' : ''}${u.value.amount.toFixed(2)}${u.value.currency === 'USD' ? '' : ` ${u.value.currency}`}`, delta: `value at ${u.value.model} API rates; you are on a plan` }
      : { value: 'Not set', delta: 'add rates to data/pricing.json' },
    local: { value: u.keptLocalShare == null ? '–' : `${Math.round(u.keptLocalShare * 100)}%`, delta: 'of questions never left the laptop' },
  };
}

/** The same, as lines for /usage. */
export function usageLines(u) {
  const f = usageFigures(u);
  const tools = Object.entries(u.tools).sort((a, b) => b[1] - a[1]);
  return [
    `Answers this week: ${f.answers.value} (${f.answers.delta}).`,
    `Tokens kept local: ${f.tokens.value} (${f.tokens.delta}).`,
    u.value ? `${f.value.value} ${f.value.delta}.` : 'Value at API rates: not set (add rates to data/pricing.json).',
    `${f.local.value} ${f.local.delta}.`,
    tools.length ? `Tool calls: ${tools.map(([n, c]) => `${n} ${c}`).join(', ')}.` : 'No tool calls this week.',
  ];
}
