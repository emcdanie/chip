// The one search (Elleta picked "build basic", 21 Nov; moved into the side menu's Find field, her mark-up of 23 Nov:
// one search, where Figma has its Find field): type and a list opens under the field, up to 8 results, each a BELLA
// ListRow (name, where it lives, ›). Return or a click opens the selected one; arrows move it; Esc closes; ⌘K focuses
// the field (the template's shortcut, Screen.jsx, which first shows the menu when it is hidden). The filter button
// beside the field (as Figma's Find) narrows the list to parts or pages.
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
import Button from '@bella/components/Button/Button';
import Tooltip from '@bella/components/Tooltip/Tooltip';
import Menu, { MenuItem } from '@bella/components/Menu/Menu';
import Card from '@bella/components/Card/Card';
import ListRow from '@bella/components/ListRow/ListRow';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';
import useCached from './useCached.js';

export const PAGES = [
  { id: 'work', label: 'Work', where: 'Page · CHIP project' },
  { id: 'health', label: 'Health', where: 'Page · CHIP project' },
  { id: 'components', label: 'Components', where: 'Page · CHIP project' },
  { id: 'foundations', label: 'Foundations', where: 'Page · CHIP project' },
  { id: 'history', label: 'History', where: 'Page · CHIP project' },
  { id: 'docs', label: 'Docs', where: 'Page · CHIP project', href: '#/system/docs' },
  { id: 'playground', label: 'Playground', where: 'Page · CHIP project' },
  { id: 'not-again', label: 'Not again', where: 'Page' },
  { id: 'team', label: 'Team', where: 'Page' },
  { id: 'system-map', label: 'System map', where: 'Page' },
  { id: 'connectors', label: 'Connectors', where: 'Page' },
];
const MAX = 8;
// a long part name may wrap where its words meet (Anatomy|Highlight), never mid-word: a <wbr>, which
// a screen reader skips (a zero-width space can change how it reads the name; audit 21 Nov r2)
const breakable = (name) => name.split(/(?<=[a-z])(?=[A-Z])/).flatMap((w, i) => (i ? [<wbr key={i} />, w] : [w]));

// what the filter beside the field lets through
const KINDS = [
  { id: 'all', label: 'Parts and pages' },
  { id: 'part', label: 'Parts only' },
  { id: 'page', label: 'Pages only' },
];

/* Pages and parts whose name starts with the words, then names that hold them, then a part's description. */
export function find(q, parts, kind = 'all') {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  // spaces and hyphens don't count in a name: "avatar stack" finds AvatarStack (click test, 22 Nov)
  const squash = (x) => x.toLowerCase().replace(/[\s_-]+/g, '');
  const n = squash(t);
  const rank = (name, about = '') => (squash(name).startsWith(n) ? 0 : squash(name).includes(n) ? 1 : about.toLowerCase().includes(t) ? 2 : -1);
  const pages = PAGES.map((p) => ({ key: `page:${p.id}`, title: p.label, where: p.where, href: p.href ?? `#/${p.id}`, r: rank(p.label) }));
  const comps = parts.map((c) => ({ key: `part:${c.name}`, title: c.name, where: `Part · ${c.category ?? 'BELLA'}`, href: `#/system/components/${encodeURIComponent(c.id ?? c.name)}`, r: rank(c.name, c.description ?? '') }));
  return [...(kind === 'part' ? [] : pages), ...(kind === 'page' ? [] : comps)].filter((x) => x.r >= 0).sort((a, b) => a.r - b.r || a.title.localeCompare(b.title)).slice(0, MAX);
}

/** The Find field and its filter, for the side menu's search slot (SideMenu `search`). inDrawer: the menu is a Drawer
 *  (below 1024), so the list sits in the drawer under the field instead of floating over the page. */
export default function Search({ inDrawer = false }) {
  const { data, error } = useCached(['/data/bella.json']);
  const parts = useMemo(() => data?.[0]?.components ?? [], [data]);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState('');
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('all');
  const [kinds, setKinds] = useState(false);
  const listId = useId();
  // a short wait after typing, so the list doesn't flicker on every key
  useEffect(() => {
    const t = setTimeout(() => setShown(q), 150);
    return () => clearTimeout(t);
  }, [q]);
  const results = useMemo(() => find(shown, parts, kind), [shown, parts, kind]);
  useEffect(() => setSel(0), [shown, kind]);
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
  const only = KINDS.find((k) => k.id === kind);
  const what = kind === 'part' ? 'BELLA’s parts' : kind === 'page' ? 'CHIP’s pages' : 'BELLA’s parts or CHIP’s pages';
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
    <>
      <div className="chip-screen__search" ref={box} onKeyDown={onKeyDown} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
        <SearchField showShortcut={false} placeholder="Find" label="Find parts and pages" value={q} onChange={(v) => (setQ(v), setOpen(true))} />
        {showing ? (
          <div className={`chip-screen__search-results${inDrawer ? ' chip-screen__search-results--inline' : ''}`}>
            <Card>
              {error ? (
                <TextStack body="Search can’t read BELLA’s parts just now. Try again in a moment." />
              ) : shown !== q && !results.length ? (
                <TextStack body="Looking…" />
              ) : results.length ? (
                <Flow gap={8}>
                <TextStack subtitle={`${results.length === MAX ? `The first ${MAX} results` : `${results.length} ${results.length === 1 ? 'result' : 'results'}`} for “${shown.trim()}”${kind === 'all' ? '' : ` · ${only.label}`}`} />
                <Flow as="ul" gap={4} id={listId} role="listbox" aria-label={`${results.length} ${results.length === 1 ? 'result' : 'results'} for ${shown}`}>
                  {results.map((r, i) => (
                    // an option, not a button: focus stays in the field (arrows, Return, Esc work there);
                    // mouse down picks it before the field's blur closes the list
                    <li key={r.key} id={optionId(i)} role="option" aria-selected={i === sel} onMouseDown={(e) => (e.preventDefault(), go(r))} onMouseEnter={() => setSel(i)}>
                      <ListRow as="div" layout="stacked" title={breakable(r.title)} description={r.where} trailing selected={i === sel} />
                    </li>
                  ))}
                </Flow>
                </Flow>
              ) : (
                <TextStack body={`Nothing called “${shown.trim()}” in ${what}.`} />
              )}
            </Card>
          </div>
        ) : null}
      </div>
      {/* the filter beside the field, as Figma's Find (her reference): what the list may show; pressed while it narrows */}
      <span className="chip-pop">
        <Tooltip label={`Filter: ${only.label}`}>
          <Button variant="tertiary" iconOnly icon="FilterList" ariaLabel={`Filter results: ${only.label}`} ariaHaspopup="menu" ariaExpanded={kinds} ariaPressed={kind !== 'all'} onClick={() => setKinds((o) => !o)} />
        </Tooltip>
        {kinds ? (
          <div className="chip-pop__menu chip-pop__menu--end">
            <Menu label="Filter results" onClose={() => setKinds(false)}>
              {KINDS.map((k) => (
                <MenuItem key={k.id} label={k.label} icon={k.id === kind ? 'Check' : undefined} onSelect={() => (setKind(k.id), setKinds(false), box.current?.querySelector('input')?.focus())} />
              ))}
            </Menu>
          </div>
        ) : null}
      </span>
    </>
  );
}
