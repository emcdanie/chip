// Components, from CHIP's own data: BELLA's components (/data/bella.json,
// with each part's anatomy from its contract) and the gaps per check (/gaps).
// The six checks are Health's (healthModel.js), so both pages count alike.
import { useEffect, useState } from 'react';
import { CHECKS } from './healthModel.js';

/* Figma's per-part words for each check. */
const PART_WORDS = {
  story: ['Has a story', 'No story yet'],
  docs: ['Doc page is current', 'No doc page'],
  contract: ['Contract matches the code', "Contract doesn't match the code"],
  dsds: ['In the DSDS spec', 'Not in the DSDS spec'],
  contrast: ['All pairs pass', 'No contrast pair declared'],
  a11y: ['Keyboard and labels pass', 'No keyboard and label checks'],
};

export function componentsModel({ components = [], gaps = {}, commit }) {
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
  return { parts, version: commit ? `BELLA ${commit}` : null, ready: parts.filter((p) => p.ready).length };
}

export function useComponents() {
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    const json = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${u} answered ${r.status}`))));
    Promise.all([json('/data/bella.json'), json('/gaps')])
      .then(([b, g]) => live && setModel(componentsModel({ components: b.components, gaps: g.gaps, commit: b.source?.commit })))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  return { model, error };
}
