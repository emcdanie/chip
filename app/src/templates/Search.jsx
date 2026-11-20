// The top bar's search (Elleta picked "build basic", 21 Nov): type and a list
// opens under the field, up to 8 results, each a BELLA ListRow (name, where it
// lives, ›). Return or a click opens the selected one; arrows move it; Esc
// closes; ⌘K focuses the field (SearchField's own shortcut).
//
// What it searches: BELLA's parts (bella.json, the list Components shows) and
// CHIP's pages, by name, then by a part's one-line description. CHIP's /search
// finds docs and notes, and the new app has no page to open a doc in yet, so
// those wait for a Docs view.
//
// Gap: BELLA has no popover or listbox for SearchField (Combobox has one, but
// without the search mark and the ⌘K legend). The list is a Card of ListRows,
// placed under the field by the template (Screen.css), until BELLA has one.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import SearchField from '@bella/components/SearchField/SearchField';
import Card from '@bella/components/Card/Card';
import ListRow from '@bella/components/ListRow/ListRow';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';
import useCached from './useCached.js';

const PAGES = [
  { id: 'work', label: 'Work', where: 'Page · CHIP project' },
  { id: 'health', label: 'Health', where: 'Page · CHIP project' },
  { id: 'components', label: 'Components', where: 'Page · CHIP project' },
  { id: 'foundations', label: 'Foundations', where: 'Page · CHIP project' },
  { id: 'history', label: 'History', where: 'Page · CHIP project' },
  { id: 'playground', label: 'Playground', where: 'Page · CHIP project' },
  { id: 'not-again', label: 'Not again', where: 'Page' },
  { id: 'team', label: 'Team', where: 'Page' },
  { id: 'system-map', label: 'System map', where: 'Page' },
  { id: 'connectors', label: 'Connectors', where: 'Page · Settings' },
];
const MAX = 8;
// a long part name may wrap where its words meet (Anatomy|Highlight), never mid-word
const breakable = (name) => name.replace(/([a-z])([A-Z])/g, '$1\u200b$2');

/* Pages and parts whose name starts with the words, then names that hold them, then a part's description. */
function find(q, parts) {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const rank = (name, about = '') => (name.toLowerCase().startsWith(t) ? 0 : name.toLowerCase().includes(t) ? 1 : about.toLowerCase().includes(t) ? 2 : -1);
  const pages = PAGES.map((p) => ({ key: `page:${p.id}`, title: p.label, where: p.where, href: `#/${p.id}`, r: rank(p.label) }));
  const comps = parts.map((c) => ({ key: `part:${c.name}`, title: c.name, where: `Part · ${c.category ?? 'BELLA'}`, href: `#/components/${encodeURIComponent(c.id ?? c.name)}`, r: rank(c.name, c.description ?? '') }));
  return [...pages, ...comps].filter((x) => x.r >= 0).sort((a, b) => a.r - b.r || a.title.localeCompare(b.title)).slice(0, MAX);
}

/** showShortcut: the ⌘K legend (off on a phone). autoFocus: the phone's search button opened it. */
export default function Search({ showShortcut, autoFocus }) {
  const { data, error } = useCached(['/data/bella.json']);
  const parts = useMemo(() => data?.[0]?.components ?? [], [data]);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState('');
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  // a short wait after typing, so the list doesn't flicker on every key
  useEffect(() => {
    const t = setTimeout(() => setShown(q), 150);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (autoFocus) document.querySelector('.chip-screen__search input')?.focus();
  }, [autoFocus]);
  const results = useMemo(() => find(shown, parts), [shown, parts]);
  useEffect(() => setSel(0), [shown]);
  const go = (r) => {
    if (!r) return;
    window.location.hash = r.href;
    setOpen(false);
    setQ('');
    document.activeElement?.blur?.();
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      const n = results.length || 1;
      setSel((s) => (e.key === 'ArrowDown' ? (s + 1) % n : (s - 1 + n) % n));
    } else if (e.key === 'Escape') {
      // the list closes and focus stays in (or returns to) the field
      setOpen(false);
      box.current?.querySelector('input')?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[sel]);
    }
  };
  const showing = open && q.trim();
  // the selected option stays in view as the arrows move it (the list scrolls inside the window)
  useEffect(() => {
    if (showing) document.getElementById(`${listId}-o${sel}`)?.scrollIntoView({ block: 'nearest' });
  }, [sel, showing, listId]);
  const optionId = (i) => `${listId}-o${i}`;
  // SearchField draws the input; the combobox pattern lives on it (role, expanded, the list it
  // controls, the option arrows point at), set here until BELLA's Combobox is the search part
  const box = useRef(null);
  useEffect(() => {
    const input = box.current?.querySelector('input');
    if (!input) return;
    const expanded = !!(showing && results.length);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', String(expanded));
    input.setAttribute('aria-controls', listId);
    if (expanded) input.setAttribute('aria-activedescendant', optionId(sel));
    else input.removeAttribute('aria-activedescendant');
  });
  return (
    <div className="chip-screen__search" ref={box} onKeyDown={onKeyDown} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <SearchField showShortcut={showShortcut} placeholder="Search parts and pages" value={q} onChange={(v) => (setQ(v), setOpen(true))} />
      {showing ? (
        <div className="chip-screen__search-results">
          <Card>
            {error ? (
              <TextStack body="Search can’t read BELLA’s parts just now. Try again in a moment." />
            ) : shown !== q && !results.length ? (
              <TextStack body="Looking…" />
            ) : results.length ? (
              <Flow as="ul" gap={4} id={listId} role="listbox" aria-label={`${results.length} ${results.length === 1 ? 'result' : 'results'} for ${shown}`}>
                {results.map((r, i) => (
                  // an option, not a button: focus stays in the field (arrows, Return, Esc work there);
                  // mouse down picks it before the field's blur closes the list
                  <li key={r.key} id={optionId(i)} role="option" aria-selected={i === sel} onMouseDown={(e) => (e.preventDefault(), go(r))} onMouseEnter={() => setSel(i)}>
                    <ListRow as="div" layout="stacked" title={breakable(r.title)} description={r.where} trailing selected={i === sel} />
                  </li>
                ))}
              </Flow>
            ) : (
              <TextStack body={`Nothing called “${shown.trim()}” in BELLA’s parts or CHIP’s pages.`} />
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
