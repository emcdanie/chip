// Components, from CHIP's own data: BELLA's components (/data/bella.json, each
// part's contract with its anatomy, variants, states and description) and the
// gaps per check (/gaps). One part's detail adds its history
// (/bella-history/:id), BELLA's measured contrast pairs (/contrast-pairs) and
// whether CHIP can reach Figma (/map, figma-rest). The six checks are Health's
// (healthModel.js), so both pages count alike. Nothing is invented: a piece
// with no data is left out or says so.
import { useMemo } from 'react';
import useCached from '../templates/useCached.js';
import { CHECKS } from './healthModel.js';

/* Figma 690:492657's link words per check row ("Contrast · See pairs ›"). */
// a passing check's words: open-words only where the row opens something (Story, Docs in
// Storybook); the rest state the result in place (audit, 21 Nov: "Open contract" opened nothing)
const LINK_WORDS = { story: 'Open story', docs: 'Open docs', contract: 'Matches the code', dsds: 'In the spec', contrast: 'Pairs declared', a11y: 'Notes written' };
const MISSING_WORDS = { story: 'No story', docs: 'No doc page', contract: "Doesn't match", dsds: 'Not in the spec', contrast: 'No pair', a11y: 'No checks' };
const ORDER = ['story', 'docs', 'contract', 'dsds', 'contrast', 'a11y'];
/* The contract's state names in Figma's words. */
const STATE_WORDS = { default: 'Default', hover: 'Hover', active: 'Pressed', pressed: 'Pressed', focus: 'Focus', disabled: 'Disabled' };

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null);
const firstSentence = (s) => (s ?? '').replace(/\s+/g, ' ').trim().match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? (s ?? '').trim();

export function componentsModel({ components = [], gaps = {}, version, checkedAt }) {
  const parts = components
    .map((c) => {
      // the published content's order and words (690:490822, 21 Nov): Story, Docs, Contract, Machine-readable spec, Contrast, A11y; Figma set is the seventh row (ChecksCard)
      const checks = ORDER.map((id) => CHECKS.find((k) => k.id === id)).map((k) => {
        const ok = !gaps[k.id]?.[c.name];
        return { id: k.id, title: k.id === 'story' ? 'Story' : k.title, ok, words: ok ? LINK_WORDS[k.id] : MISSING_WORDS[k.id], action: k.action };
      });
      const pass = checks.filter((k) => k.ok).length;
      return {
        id: c.id ?? c.name,
        name: c.name,
        category: c.category ?? 'Other',
        lede: firstSentence(c.description),
        variants: c.variants ?? [],
        states: (c.states ?? []).filter((s) => STATE_WORDS[s]).map((s) => ({ id: s, label: STATE_WORDS[s] })),
        // every state the contract names, as words, for a part whose states cannot be drawn
        stateNames: [...new Set((c.states ?? []).map((s) => cap(String(s).replace(/[-_]+/g, ' '))))],
        storyUrl: c.storyUrl ?? null,
        anatomy: (c.parts ?? []).map((a) => ({ key: a.key, n: a.n, title: a.title, detail: a.detail, token: a.token, value: a.value?.light ?? null, kind: a.kind, trigger: a.trigger, zone: a.zone })),
        checks,
        pass,
        ready: pass === checks.length,
        // the part's own documentation, as BELLA's snapshot carries it (bella.json, from its contract)
        doc: {
          use: c.usage ?? [],
          dont: c.dont ?? [],
          a11y: c.a11y ?? null,
          minTarget: c.minTarget ?? null,
          rendersAs: c.rendersAs ?? null,
          tokens: c.tokens?.list ?? [],
          usedIn: c.composesInto ?? [],
          madeOf: c.composedFrom ?? [],
          props: c.props ?? [],
        },
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  // BELLA's version number when it has one ("BELLA 0.3.0", as Figma); never a commit hash
  return { parts, version: version ? `BELLA ${version}` : null, checked: day(checkedAt), ready: parts.filter((p) => p.ready).length };
}

/** Reads CHIP's data (kept between pages, shared with Health). */
export function useComponents() {
  const { data, error, reload } = useCached(['/data/bella.json', '/gaps'], { live: true });
  const model = useMemo(
    () => (data ? componentsModel({ components: data[0].components, gaps: data[1].gaps, version: data[0].source?.version, checkedAt: data[1].at }) : null),
    [data],
  );
  return { model, error, reload };
}

/* Chip light is the theme the page shows ("Button as BELLA ships it · Chip theme"). */
const THEME = 'chip-light';

/** One anatomy part's contrast: BELLA's measured pair that uses its token, in Chip light. */
export function pairFor(token, pairs) {
  if (!token) return null;
  const p = (pairs ?? []).find((x) => x.fg === token || x.bg === token);
  if (!p) return null;
  const ratio = p.measured?.find((m) => m.theme === THEME)?.ratio ?? p.worst;
  return { label: p.label, ratio, bar: p.bar, ok: ratio != null && ratio >= p.bar };
}

/** history: /bella-history/:id; pairs: /contrast-pairs; map: /map. */
/* Product copy names a role, never a person (Many users, not one, 20 Nov):
   a "(Name, 17 Nov)" byline in a commit subject goes, and a name left in the
   words reads as the role. Figma node ids are bookkeeping and go too. */
const NAMES = /\bElleta\b/g;
function noNames(t) {
  return String(t ?? '')
    .replace(/\s*\([A-Z][a-z]+(?: [A-Z][a-z]+)?,\s*\d{1,2} [A-Z][a-z]{2}(?: \d{4})?[^)]*\)/g, '')
    .replace(/\s*\(?read \d{1,2} [A-Z][a-z]{2}(?: \d{4})?\)?/g, '')
    .replace(/\s*\b\d{2,4}:\d{2,7}\b/g, '')
    .replace(NAMES, 'the maintainer')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* Figma's Why line under a record: the commit body's first plain sentence,
   after its "Name, date: \"quote\"" opening; none when the body has none. */
function whyOf(body, full = false) {
  const t = String(body ?? '').replace(/\s+/g, ' ').trim().replace(/^[A-Z][\w ]*, \d{1,2} \w{3}(?: \d{4})?:?\s*(\([^)]*\)\s*)?("[^"]*"[.,]?\s*)?(?:,?\s*after [^.]*\.\s*)?/, '');
  const one = short(noNames(firstSentence(t)), full);
  return one.length > 3 ? one : null;
}

// Figma: two lines under each record (audit 10, "less, so the important thing
// shows"). Lists in brackets go, then a long line ends at a word; History has the rest.
const WHY_MAX = 110;
/** A Why line cut at a word to `max` characters, with an ellipsis. */
export function clip(text, max) {
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max + 1).slice(0, text.slice(0, max + 1).lastIndexOf(' ')).replace(/[,;:.]$/, '')}…`;
}
function short(text, full = false) {
  let t = text.replace(/^[-–]\s*/, '');
  for (let prev; prev !== t; ) { prev = t; t = t.replace(/\s*\([^()]*\)/g, ''); }
  // an unclosed bracket in the commit text: drop it up to its comma or colon, and any stray closer
  t = t.replace(/\s*\([^()]*?[,:]+\s*/g, ': ').replace(/[()]/g, '');
  t = t.replace(/\s+([,.;:])/g, '$1').replace(/\s+/g, ' ').trim();
  const out = full ? t : clip(t, WHY_MAX);
  // the page breaks a path (Components/<Type>/<Name>) after its slashes with <wbr> (ComponentsContent)
  return out;
}

export function detailModel(part, { history, pairs, map }) {
  const anatomy = part.anatomy.map((a) => {
    const contrast = pairFor(a.token, pairs?.pairs);
    return { ...a, contrast, status: contrast && !contrast.ok ? 'finding' : 'pass' };
  });
  const entries = (history?.entries ?? []).map((e) => ({ id: e.sha, title: cap(noNames(e.subject.replace(/^\w+(\([^)]*\))?!?:\s*/, ''))), why: whyOf(e.detail), whyAll: whyOf(e.detail, true), date: e.date, type: (e.types ?? [])[0] ?? null, types: e.types ?? [] }));
  const figma = (map?.nodes ?? []).find((n) => n.id === 'figma-rest') ?? null;
  return {
    anatomy,
    findings: anatomy.filter((a) => a.status === 'finding').length + part.checks.filter((k) => !k.ok).length,
    history: entries,
    updated: day(entries[0]?.date),
    figmaBlind: figma ? figma.state !== 'ok' : false,
  };
}

/** One part's history, BELLA's contrast pairs and the Figma connection. */
export function usePartDetail(part) {
  // nothing to read until a part is picked
  const { data } = useCached(part ? [`/bella-history/${part.id}`, '/contrast-pairs', '/map'] : []);
  return useMemo(() => (part && data ? detailModel(part, { history: data[0], pairs: data[1], map: data[2] }) : null), [part, data]);
}

/* ---------- The studio (layout B, 22 Nov): checks, fixes and documentation, all measured ---------- */

/* Why a check matters: the rule and where it is written. A check's own rule comes from /gaps (each gap
   carries it); these are the rules for the checks /gaps doesn't carry, quoted from where they live. */
const RULES = {
  parity: { rule: 'Figma first, code follows: code is built from published Figma, so a part that differs from Figma can’t be rebuilt from it.', source: 'BELLA READ FIRST, guideline 5' },
  lint: { rule: 'Every part is benchmarked, and Figma lint finds no hard-coded values.', source: 'BELLA READ FIRST, Tokens and parts' },
  a11y: { rule: 'Targets are at least 44 by 44, and all text meets 7:1.', source: 'BELLA AGENTS.md, Floors' },
};
const STORY_TITLE = { story: 'Story', docs: 'Doc page', contract: 'Contract', dsds: 'Spec entry', contrast: 'Contrast', a11y: 'A11y notes' };

/** The checks a part answers to, each a row that opens its detail: what was found, and why it matters.
 *  drift: /drift; lint: /figma-lint/:id; gate: /checks .gate; gaps: /gaps .gaps; checks: the part's six
 *  (touch target included); stories: /stories. Nothing measured shows "Not measured" and its source. */
export function studioChecks({ part, checks, drift, lint, gate, gaps, gapsAt, links = {}, weakest }) {
  const rows = [];
  const d = drift?.parts?.find((x) => x.name === part.name);
  if (!d || !d.compared)
    rows.push({ id: 'parity', ran: null, title: 'Parity with Figma', tone: 'neutral', value: 'Not measured', items: [{ title: 'Source', value: d ? `${part.name}.spec.yaml has no Figma read` : `No spec for ${part.name} in BELLA` }], why: RULES.parity });
  else
    rows.push({
      id: 'parity',
      ran: drift.at ?? null,
      title: 'Parity with Figma',
      tone: d.differ ? 'danger' : 'success',
      value: d.differ ? `${d.differ} to fix` : 'Matches',
      count: d.differ || null,
      items: [
        ...d.fields.map((f) => ({ title: f, value: 'differs', fails: true })),
        ...(d.sameValueOnly ? [{ title: 'Same value in Chip', value: d.sameValueOnly }] : []),
      ],
      // measured from the spec's own mismatch list, written when BELLA's spec was last built from a Figma read
      source: `From ${part.name}.spec.yaml, its last Figma read${drift.at ? ` (spec built ${day(drift.at)})` : ''}`,
      why: RULES.parity,
    });
  for (const k of checks) {
    const g = gaps?.[k.id]?.[part.name];
    const any = g ?? Object.values(gaps?.[k.id] ?? {})[0];
    const why = any?.why?.rule ? { rule: firstSentence(any.why.rule), source: any.why.source } : k.id === 'a11y' ? RULES.a11y : null;
    const items = g
      ? [
          { title: 'What’s missing', value: firstSentence(g.missing) },
          ...(g.where?.[0] ? [{ title: 'Where', value: `${g.where[0].file} · ${g.where[0].field}` }] : []),
          ...(g.suggest?.text ? [{ title: 'Start from', value: firstSentence(g.suggest.text) }] : []),
        ]
      : [{ title: 'Result', value: k.id === 'contrast' && weakest ? `Weakest: ${weakest}` : k.words }];
    rows.push({ id: k.id, ran: gapsAt ?? null, title: STORY_TITLE[k.id] ?? k.title, tone: k.ok ? 'success' : 'danger', value: k.ok ? 'pass' : k.words, items, why, href: links[k.id] ?? null });
  }
  if (!lint || lint.read === false)
    rows.push({ id: 'lint', ran: null, title: 'Figma lint', tone: 'neutral', value: 'Not measured', items: [{ title: 'Why not', value: lint?.reason ?? 'CHIP has not asked Figma yet.' }], why: RULES.lint });
  else {
    const found = lint.findings ?? lint.issues ?? [];
    rows.push({ id: 'lint', ran: lint.at ?? null, title: 'Figma lint', tone: found.length ? 'danger' : 'success', value: found.length ? `${found.length} to fix` : 'pass', count: found.length || null, items: found.slice(0, 12).map((f) => ({ title: f.title ?? f.rule ?? String(f), value: f.node ?? '' })), why: RULES.lint });
  }
  if (gate)
    rows.push({
      id: 'gate',
      ran: gate.ranAt ?? null,
      title: 'The gate',
      tone: gate.counts?.failed ? 'danger' : gate.counts?.passed ? 'success' : 'neutral',
      value: gate.counts ? `pass ${gate.counts.passed}/${gate.counts.total}` : 'Not measured',
      items: (gate.members ?? []).map((m) => ({ title: m.name, value: m.status })),
      source: gate.ranAt ? `Ran ${day(gate.ranAt)}` : null,
      why: { rule: gate.plain, source: gate.schedule },
    });
  return rows;
}

/** The fixes a part's checks suggest, one per thing to change, all picked to start. */
export function studioFixes({ part, rows, findings = [] }) {
  const out = [];
  for (const a of findings) out.push({ id: `finding-${a.key}`, area: a.title, verb: 'Raise', key: `${a.title.toLowerCase()} contrast`, line: `${a.title}: ${a.contrast.label} measures ${a.contrast.ratio.toFixed(2)}:1, needs ${a.contrast.bar}:1.` });
  const parity = rows.find((r) => r.id === 'parity' && r.tone === 'danger');
  for (const f of parity?.items.filter((i) => i.fails) ?? []) out.push({ id: `parity-${f.title}`, area: 'Figma parity', verb: 'Match', key: f.title.replace(/^props\.|^tokens\./, ''), line: `${part.name}'s ${f.title} differs between Figma and code (${part.name}.spec.yaml, mismatch).` });
  for (const r of rows.filter((x) => x.tone === 'danger' && !['parity', 'gate', 'lint'].includes(x.id)))
    out.push({ id: `check-${r.id}`, area: r.title, verb: 'Add', key: r.title.toLowerCase(), line: r.items[0]?.value ?? `${r.title} fails for ${part.name}.` });
  return out;
}

/* "--motion-duration-150" → 150: the durations a part's tokens name, so Motion is read, never typed. */
export const motionOf = (tokens) => [...new Set(tokens.map((t) => t.match(/^--motion-duration-(\d+)$/)?.[1]).filter(Boolean).map(Number))].sort((a, b) => a - b);

/** The part's documentation as rows: purpose, use and don't, states, anatomy, a11y, decisions. */
export function studioDocs(part, detail) {
  const d = part.doc;
  // a don't line says what not to do before its colon; the rest is the reason
  const dont = d.dont.map((t) => {
    const [head, ...rest] = String(t).replace(/^Do not\s+/i, '').split(/:\s+/);
    return { title: cap(head), value: rest.join(': ') || null };
  });
  const a11y = String(d.a11y ?? '')
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^([^:]{2,40}):\s+(.+)$/);
      return m ? { title: m[1], value: m[2] } : { title: x, value: null };
    });
  const decisions = (detail?.history ?? []).filter((e) => e.types.includes('decision') || /\bdecid|\bpick(ed)?\b/i.test(e.title));
  return { purpose: part.lede, use: d.use, dont, a11y, decisions, motion: motionOf(d.tokens) };
}

/** The spec's props (/bella-spec/:id) as rows; the values the stage shows win over the defaults. */
export function studioProps(spec, shown) {
  return (spec?.props ?? [])
    .filter((p) => !['className', 'style', 'children'].includes(p.name))
    .map((p) => ({ name: p.name, values: p.values, value: shown[p.name] ?? (p.default != null ? String(p.default).replace(/^'|'$/g, '') : null) }));
}

/** What the studio reads for one part, each on its own so one slow or missing answer never blanks the rest. */
export function useStudio(part) {
  const shared = useCached(['/drift', '/checks', '/gaps', '/stories'], { live: true }).data;
  const lint = useCached(part ? [`/figma-lint/${part.id}`] : []).data;
  const spec = useCached(part ? [`/bella-spec/${part.id}`] : []).data;
  return {
    drift: shared?.[0] ?? null,
    gate: shared?.[1]?.gate ?? null,
    gaps: shared?.[2] ?? null,
    stories: shared?.[3] ?? null,
    lint: lint?.[0] ?? null,
    spec: spec?.[0] ?? null,
    ready: Boolean(shared),
  };
}
