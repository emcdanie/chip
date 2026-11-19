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
const LINK_WORDS = { story: 'Open stories', docs: 'Open docs', contract: 'Open contract', dsds: 'Open spec', contrast: 'See pairs', a11y: 'Open notes' };
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
        storyUrl: c.storyUrl ?? null,
        anatomy: (c.parts ?? []).map((a) => ({ key: a.key, n: a.n, title: a.title, detail: a.detail, token: a.token, value: a.value?.light ?? null, kind: a.kind, trigger: a.trigger, zone: a.zone })),
        checks,
        pass,
        ready: pass === checks.length,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  // BELLA's version number when it has one ("BELLA 0.3.0", as Figma); never a commit hash
  return { parts, version: version ? `BELLA ${version}` : null, checked: day(checkedAt), ready: parts.filter((p) => p.ready).length };
}

/** Reads CHIP's data (kept between pages, shared with Health). */
export function useComponents() {
  const { data, error, reload } = useCached(['/data/bella.json', '/gaps']);
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
/* Figma's Why line under a record: the commit body's first plain sentence,
   without the "Name, date: \"quote\"" attribution (copy speaks to the role). */
function whyOf(body) {
  const t = String(body ?? '').replace(/\s+/g, ' ').trim().replace(/^[A-Z][\w ]*, \d{1,2} \w{3} \d{4}:?\s*(\([^)]*\)\s*)?("[^"]*"[.,]?\s*)?/, '');
  const one = firstSentence(t);
  return one && !/\bElleta\b/.test(one) && one.length <= 160 ? one : null;
}

export function detailModel(part, { history, pairs, map }) {
  const anatomy = part.anatomy.map((a) => {
    const contrast = pairFor(a.token, pairs?.pairs);
    return { ...a, contrast, status: contrast && !contrast.ok ? 'finding' : 'pass' };
  });
  const entries = (history?.entries ?? []).map((e) => ({ id: e.sha, title: cap(e.subject.replace(/^\w+(\([^)]*\))?!?:\s*/, '')), why: whyOf(e.detail), date: e.date, type: (e.types ?? [])[0] ?? null }));
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
