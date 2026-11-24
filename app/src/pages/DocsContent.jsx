// A searchable list of every doc behind the system, grouped by kind. Each row opens in the reading drawer as structured
// sections. Titles, first lines, dates (git) and sizes are read from the files by /system-docs; nothing here is typed.
// Keyboard: arrows move through the search, the kinds and the rows; Enter opens; Esc closes the drawer.
import { useMemo, useRef, useState } from 'react';
import SearchField from '@bella/components/SearchField/SearchField';
import Disclosure from '@bella/components/Disclosure/Disclosure';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import TextStack from '@bella/components/TextStack/TextStack';
import StatusDot from '@bella/components/StatusDot/StatusDot';
import NoResults from '../templates/NoResults.jsx';
import Flow from '../templates/Flow.jsx';
import useCached from '../templates/useCached.js';
import { DocDrawer, day, size } from './DocReader.jsx';

const BLURB = {
  Principles: 'What BELLA stands for.',
  Tokens: 'Every colour, size and motion value.',
  Typography: 'How type is set.',
  Motion: 'How things move and why.',
  Decisions: 'What was decided, newest first.',
  Agents: 'The rules agents follow.',
  'Component specs': 'One per part: props, variants, states, tokens.',
  Reference: 'Studies and background.',
  CHIP: 'CHIP’s own plans and feature list.',
};

/** Docs whose title or first line holds every word typed. */
export function matchDocs(docs, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return docs;
  return docs.filter((d) => {
    const t = `${d.title} ${d.line}`.toLowerCase();
    return words.every((w) => t.includes(w));
  });
}

export default function DocsContent({ docs: given }) {
  const live = useCached(given ? [] : ['/system-docs']);
  const all = given ?? live.data?.[0]?.docs ?? null;
  const kinds = given ? [...new Set(given.map((d) => d.kind))] : live.data?.[0]?.kinds ?? [];
  const [q, setQ] = useState('');
  const [open, setOpen] = useState([]);
  const [doc, setDoc] = useState(null);
  const list = useRef(null);
  const found = useMemo(() => (all ? matchDocs(all, q) : []), [all, q]);
  const searching = q.trim().length > 0;
  // arrows move between the search, the kinds and the rows; Enter and Space are the buttons' own
  const onKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const els = [...(list.current?.querySelectorAll('input, summary, button[aria-expanded], li[role="button"], li button, a[href]') ?? [])].filter((x) => x.offsetParent);
    const at = els.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? els[at + 1] : els[at - 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };
  // the one status line (her review, 24 Nov): how many, when the newest changed, and whether CHIP is reading them live
  const newest = all?.map((d) => d.updated).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0];
  const when = newest ? new Date(newest).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '') : null;
  if (!all) return <TextStack body={live.error ? 'CHIP could not read the docs folders.' : 'Reading the docs…'} />;
  return (
    <Flow gap={24}>
      <div ref={list} onKeyDown={onKey}>
        <Flow gap={16}>
          <TextStack
            body={
              <>
                {`${searching ? `${found.length} of ` : ''}${all.length} documents${when ? ` · updated ${when}` : ''} · `}
                <StatusDot tone={live.stale ? 'attention' : 'success'} label={live.stale ? "Couldn't refresh" : 'Live'} />
              </>
            }
          />
          <SearchField label="Search the docs" placeholder="Search titles and first lines…" showShortcut={false} value={q} onChange={setQ} />
          {found.length ? (
            <Flow gap={8} role="group" aria-label="Docs by kind">
              {kinds.map((k) => {
                const rows = found.filter((d) => d.kind === k);
                if (!rows.length) return null;
                const isOpen = searching || open.includes(k);
                return (
                  <Disclosure key={k} title={k} summary={String(rows.length)} open={isOpen} onToggle={(on) => !searching && setOpen((was) => (on ? [...was, k] : was.filter((x) => x !== k)))}>
                    <Flow gap={8}>
                      <TextStack body={BLURB[k] ?? ''} />
                      <ListRowGroup ariaLabel={`${k}: ${rows.length}`}>
                        {rows.map((d) => (
                          <ListRow key={d.id} layout="stacked" title={d.title} description={d.line || undefined} body={`updated ${day(d.updated)} · ${size(d.bytes)}`} trailing onClick={() => setDoc(d.id)} />
                        ))}
                      </ListRowGroup>
                    </Flow>
                  </Disclosure>
                );
              })}
            </Flow>
          ) : (
            <NoResults noun="docs" what={`“${q.trim()}”`} on={[{ key: 'q', label: `search “${q.trim()}”`, would: all?.length, onRemove: () => setQ('') }]} />
          )}
        </Flow>
      </div>
      {doc ? <DocDrawer id={doc} onClose={() => setDoc(null)} /> : null}
    </Flow>
  );
}
