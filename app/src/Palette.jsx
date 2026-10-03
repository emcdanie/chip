// ⌘K jump palette: type, then pick. Results are grouped: Components (open in
// Atlas), Docs (open the source), and last "Ask OBI: <query>". Keyboard first:
// Enter takes the first result, Down moves into the list, Up and Down move
// through it, Esc closes and returns to the field. BELLA has no combobox, so
// this is BELLA's Input plus a NavList of the results.
import React, { useEffect, useRef, useState } from 'react';
import Input from '@bella/components/Input/Input';
import Kbd from '@bella/components/Kbd/Kbd';
import NavList from '@bella/components/NavList/NavList';

const ASK = '#ask-obi';

export default function Palette({ bella, docs, onOpenAtlas, onAsk }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const query = q.trim();
  const needle = query.toLowerCase();

  const comps = query ? (bella?.components ?? []).filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 6) : [];
  const words = needle.split(/\s+/).filter((w) => w.length > 2);
  const docHits = query
    ? docs
        .map((d) => ({ d, hits: words.filter((w) => d.title.toLowerCase().includes(w)).length }))
        .filter((x) => x.hits > 0 || x.d.title.toLowerCase().includes(needle))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 5)
        .map((x) => x.d)
    : [];
  const docHref = (d) => d.url ?? `/source?path=${encodeURIComponent(d.path)}`;

  const groups = [];
  if (comps.length) groups.push({ label: 'Components', items: comps.map((c) => ({ href: `#/atlas/${c.id}`, label: c.name, badge: c.parts.length || undefined })) });
  if (docHits.length) groups.push({ label: 'Docs', items: docHits.map((d) => ({ href: docHref(d), label: d.title })) });
  if (query) groups.push({ label: 'OBI', items: [{ href: ASK, label: `Ask OBI: ${query}` }] });

  useEffect(() => {
    function away(e) {
      if (!root.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, []);

  function close(refocus) {
    setOpen(false);
    if (refocus) document.getElementById('chip-search')?.focus();
  }

  function go(href, e) {
    e?.preventDefault();
    if (href === ASK) onAsk(query);
    else if (href.startsWith('#/atlas/')) onOpenAtlas(href.slice('#/atlas/'.length));
    else window.open(href, '_blank', 'noopener');
    setQ('');
    close(false);
  }

  const links = () => [...(root.current?.querySelectorAll('.palette-results a') ?? [])];

  function onKeyDown(e) {
    const ls = links();
    const at = ls.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' && ls.length) {
      e.preventDefault();
      ls[Math.min(at + 1, ls.length - 1)].focus();
    } else if (e.key === 'ArrowUp' && at >= 0) {
      e.preventDefault();
      if (at === 0) document.getElementById('chip-search')?.focus();
      else ls[at - 1].focus();
    }
  }

  return (
    <div className="palette" ref={root} onKeyDown={onKeyDown}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const first = groups[0]?.items[0];
          if (first) go(first.href);
        }}
      >
        <Input
          id="chip-search"
          label={
            <span className="search-label">
              Jump to a component or doc, or ask OBI <Kbd keys={['⌘', 'K']} label="Command K" />
            </span>
          }
          value={q}
          onChange={(v) => {
            setQ(v);
            setOpen(true);
          }}
          placeholder="Button, dashboards, which components have no story?"
          autoComplete="off"
        />
      </form>
      {open && groups.length ? (
        <div className="palette-results">
          <NavList label="Results" groups={groups} onNavigate={go} />
        </div>
      ) : null}
    </div>
  );
}
