// Components, from CHIP's own data: BELLA's components (/data/bella.json,
// with each part's anatomy from its contract) and the gaps per check (/gaps).
// The six checks are Health's (healthModel.js), so both pages count alike.
import { useMemo } from 'react';
import useCached from '../templates/useCached.js';
import { CHECKS } from './healthModel.js';

/* Figma's per-part words for each check. */
const PART_WORDS = {
  story: ['Has a story', 'No story yet'],
  docs: ['Doc page is current', 'No doc page'],
  contract: ['Contract matches the code', "Contract doesn't match the code"],
  dsds: ['In the machine-readable spec', 'Not in the machine-readable spec'],
  contrast: ['All pairs pass', 'No contrast pair declared'],
  a11y: ['Keyboard and labels pass', 'No keyboard and label checks'],
};

export function componentsModel({ components = [], gaps = {}, version }) {
  const parts = components
    .map((c) => {
      const checks = CHECKS.map((k) => {
        const ok = !gaps[k.id]?.[c.name];
        return { id: k.id, title: k.title, ok, line: PART_WORDS[k.id][ok ? 0 : 1], action: k.action };
      });
      const pass = checks.filter((k) => k.ok).length;
      return { id: c.id ?? c.name, name: c.name, category: c.category ?? 'Other', anatomy: c.parts ?? [], checks, pass, ready: pass === checks.length };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  // BELLA's version number when it has one ("BELLA 0.3.0", as Figma); never a commit hash
  return { parts, version: version ? `BELLA ${version}` : null, ready: parts.filter((p) => p.ready).length };
}

/** Reads CHIP's data (kept between pages, shared with Health). */
export function useComponents() {
  const { data, error } = useCached(['/data/bella.json', '/gaps']);
  const model = useMemo(() => (data ? componentsModel({ components: data[0].components, gaps: data[1].gaps, version: data[0].source?.version }) : null), [data]);
  return { model, error };
}
