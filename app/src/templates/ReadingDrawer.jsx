// The one drawer template (Elleta, 23 Nov 2026: "I just want it to be legible and it's too long"; plan approved 09:52,
// docs/reference/screens/2026-11-23-drawer-template/, data kinds in docs/reference/drawer-data-types.md). Every drawer is
// the same five bands, built from BELLA parts only, and wraps BELLA's Drawer without restyling it:
//   1 title and status   the Drawer head (`label`, `status`); Back when a table or a detail is open (`onBack`)
//   2 answer             one plain line: what it is and what to do, the few key words marked (`answer`)
//   3 picture            the bar with its target tick, ring or dated chart first, never prose (`picture`)
//   4 groups or table    ReadingGroups (branch rows, one open, 7 rows then See all) or ReadingTable (filter chips
//                        above a DataTable whose row opens its detail and that stacks at 320); Facts for label-value lines
//   5 action             at the right edge, in BELLA's Drawer footer (`footer`)
//   foot                 one grey source line (`source`): where the data comes from and when; a commit id sits behind
//                        a link to History, never in the text, and no branch name or slug is written out
// BELLA's Drawer Head is 24 at the sides and its Body 8 (specs/components/Drawer.spec.yaml), because a ListRow brings its
// own 16. Anything that is not a row takes the 16 here (Flow inset) and lands on the title's 24 edge; rows sit bare.
import { useEffect, useRef, useState } from 'react';
import Drawer from '@bella/components/Drawer/Drawer';
import BranchGroup from '@bella/components/BranchGroup/BranchGroup';
import Button from '@bella/components/Button/Button';
import DataTable from '@bella/components/DataTable/DataTable';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Link from '@bella/components/Link/Link';
import ListRow, { ListRowGroup } from '@bella/components/ListRow/ListRow';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';

/** A headed group: the heading takes the inset, the rows under it sit bare. */
export function ReadingSection({ title, description, icon, iconTone, rows }) {
  return (
    <Flow gap={8}>
      <Flow inset>
        <SectionHead icon={icon} iconTone={iconTone} title={title} description={description} showInfo={false} />
      </Flow>
      {rows}
    </Flow>
  );
}

/** Non-row content: 16 in at the sides, on the title's edge. */
export function Inset({ gap = 16, children }) {
  return (
    <Flow inset gap={gap}>
      {children}
    </Flow>
  );
}

/* Label and value on one line, never two headings (plan: "Three labels become inline lead-ins (From, Made by)").
   facts: [{ label, value }]. The label is the lead-in in the subtle ink, the value the sentence. */
export function Facts({ facts, label }) {
  return (
    <Flow gap={8} as="ul" aria-label={label}>
      {facts.filter((f) => f.value).map((f) => (
        <li key={f.label}>
          <TextStack body={<><strong>{f.label}</strong> {f.value}</>} />
        </li>
      ))}
    </Flow>
  );
}

/* The source line at the foot (Charts rule: "Each chart card ends on one grey line: source and when it ran; commit ids
   sit behind the link"). from: where the data comes from in words; when: "read 12:49"; commit: an id, shown only as the
   link "the commit", which opens History on it inside CHIP. */
export function SourceLine({ from, when, commit }) {
  return (
    <Inset>
      <TextStack
        subtitle={
          <>
            {[from, when].filter(Boolean).join(' · ')}
            {commit ? (
              <>
                {' · '}
                <Link href={`#/system/history?q=${encodeURIComponent(commit)}`}>
                  the commit
                </Link>
              </>
            ) : null}
          </>
        }
      />
    </Inset>
  );
}

/* The head of a list that shows part of itself (23 Nov evening, her Drift drawer: after See all, Show fewer sat at the
   foot of 94 rows and she had to scroll to find it). One pattern for every drawer: the count at the left, the toggle at
   the right, above the list, so the way back stays where she pressed. extra: more tertiary actions on the same row. */
export function ListHead({ shown, total, unit, open, onToggle, extra }) {
  const more = total > shown || open;
  return (
    <Flow direction="row" gap={8} justify="between" align="center" wrap>
      <TextStack subtitle={more ? `Showing ${shown} of ${total} ${unit}` : `${total} ${unit}`} />
      <Flow direction="row" gap={8} align="center" wrap>
        {more ? (
          <Button variant="tertiary" size="sm" ariaExpanded={open} onClick={onToggle}>
            {open ? 'Show fewer' : `Show all ${total}`}
          </Button>
        ) : null}
        {extra}
      </Flow>
    </Flow>
  );
}

/* Grouped content as branch rows (Elleta, 23 Nov: "i really like the styling on this ... we could do that with some of the
   content in the drawers"): BELLA BranchGroup, a row with a colour bar at its left, the group's name, a count and a plus or
   minus, opening to its items, each a ListRow with a state mark (statusBar, the group's tone) and a short status line.
   Colour names the group only; the group's name is the state in a word (Failing, Needs work, Healthy), so an item repeats
   nothing. One group open at a time (single); an open group shows 7 rows, then See all. Opening a group brings it to the
   top of the drawer's body (her 22 Nov: the first item was cut at the top edge).
   groups: [{ name, tone, hue?, items: [{ key, title, line?, state?, value?, body, onClick, action }] }]; the count is items.length, never typed.
   A group that explains instead of listing (How was this measured?) passes `body` and its own `count` (the number it explains). */
const HUES = ['navy', 'blue', 'stone'];
const FIRST = 7;
export function ReadingGroups({ groups, single = true, openFirst = false, label }) {
  const shown = groups.filter((g) => g.body || g.items?.length);
  const [open, setOpen] = useState(() => (openFirst && shown[0] ? [shown[0].name] : []));
  const [all, setAll] = useState([]);
  const toggle = (name) => {
    const on = !open.includes(name);
    asked.current = on ? name : null;
    setOpen((was) => (single ? (on ? [name] : []) : on ? [...was, name] : was.filter((n) => n !== name)));
  };
  const box = useRef(null);
  const asked = useRef(null);
  useEffect(() => {
    if (!asked.current) return;
    const at = shown.findIndex((g) => g.name === asked.current);
    asked.current = null;
    if (at < 0) return;
    requestAnimationFrame(() => box.current?.querySelectorAll('[data-bella-component="branch-group"]')[at]?.scrollIntoView({ block: 'start' }));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box}>
      <Flow inset gap={8} as="div" role="group" aria-label={label}>
        {shown.map((g, gi) => {
          const full = all.includes(g.name);
          const items = g.items ? (full ? g.items : g.items.slice(0, FIRST)) : [];
          return (
            <BranchGroup key={g.name} name={g.name} count={g.count ?? g.items.length} hue={g.hue ?? HUES[gi % HUES.length]} open={open.includes(g.name)} onToggle={() => toggle(g.name)}>
              {g.body ? <Inset>{g.body}</Inset> : null}
              {g.items?.length > FIRST ? (
                <Inset>
                  <ListHead shown={items.length} total={g.items.length} unit={g.unit ?? 'items'} open={full} onToggle={() => setAll((a) => (full ? a.filter((n) => n !== g.name) : [...a, g.name]))} />
                </Inset>
              ) : null}
              {g.items ? <ListRowGroup ariaLabel={`${g.name}: ${g.items.length}`}>
                {items.map((it, k) => (
                  <ListRow
                    key={it.key ?? it.title}
                    as="div"
                    layout="inline"
                    title={it.title}
                    description={it.line}
                    valueLabel={it.state}
                    value={it.value}
                    body={it.body}
                    trailing={it.onClick && !it.action ? true : undefined}
                    onClick={it.onClick}
                    actionButton={it.action}
                    divider={k < items.length - 1}
                  />
                ))}
              </ListRowGroup> : null}
            </BranchGroup>
          );
        })}
      </Flow>
    </div>
  );
}

/* A long list of parts (over 12) as a table with the filter chips above it, the pattern she likes ("I like that I can
   filter with those buttons, it's clear"). BELLA DataTable: sortable, its row opens the item's detail (onOpen), stacked
   under 480 (stack). filters: [{ value, label, test(row) }], each chip carrying its count; the first is the default.
   columns: DataTable columns (name first, the main number second). onOpen(key) opens the detail in the same drawer. */
/* density="compact": a read-only list (no sort, no row to open) takes BELLA DataTable's compact rows, so a short list of
   parts reads at a glance (23 Nov evening, Gaps: "tighter rows"). first: over this many rows the table shows that many,
   then "Show 10 more" (second-pass review, pattern 1); every row shows when there are 20 or fewer. A column marked
   byFilter (the state the chips filter on) is left out while a chip other than All is on: every row would repeat it.
   The chips are one row that scrolls sideways (Flow swipe), so the table starts high at 320. */
export function ReadingTable({ caption, rows, columns, rowKey = 'key', filters, defaultSort, onOpen, density, first = 20, unit = 'rows' }) {
  const [f, setF] = useState(filters?.[0]?.value ?? null);
  const [open, setOpen] = useState(false);
  const pick = filters?.find((x) => x.value === f);
  const all = pick?.test ? rows.filter(pick.test) : rows;
  const shown = all.length > first && !open ? all.slice(0, first) : all;
  // a chip that would show nothing is left out, and one chip alone is no filter
  const chips = (filters ?? []).filter((x) => !x.test || rows.some(x.test));
  return (
    <Inset gap={8}>
      {chips.length > 1 ? (
        <Flow direction="row" gap={8} swipe align="center" role="group" aria-label={`Filter: ${caption}`}>
          {chips.map((x) => (
            <FilterChip key={x.value} size="compact" pressed={f === x.value} onClick={() => (setF(x.value), setOpen(false))}>
              {`${x.label} ${x.test ? rows.filter(x.test).length : rows.length}`}
            </FilterChip>
          ))}
        </Flow>
      ) : null}
      {all.length > first ? <ListHead shown={shown.length} total={all.length} unit={unit} open={open} onToggle={() => setOpen(!open)} /> : null}
      <DataTable caption={caption} columns={pick?.test ? columns.filter((c) => !c.byFilter) : columns} rows={shown} rowKey={rowKey} defaultSort={defaultSort} onOpen={onOpen} density={density} stack />
    </Inset>
  );
}

/* The summary of a long list (option C, her pick): the top three rows and "See all N" into the table. Each row is one line
   with one divider (23 Nov evening); its detail is behind the row's click. */
export function ReadingTop({ rows, more, onMore, label }) {
  return (
    <Flow gap={8}>
      <ListRowGroup ariaLabel={label}>
        {rows.map((r, k) => (
          <ListRow key={r.key ?? r.title} layout="inline" title={r.title} description={r.line} valueLabel={r.state} value={r.value} trailing={r.onClick ? true : undefined} onClick={r.onClick} divider={k < rows.length - 1} />
        ))}
      </ListRowGroup>
      {onMore ? (
        <Inset>
          <Flow direction="row" justify="end">
            <Button variant="tertiary" size="sm" onClick={onMore}>
              {more}
            </Button>
          </Flow>
        </Inset>
      ) : null}
    </Flow>
  );
}

/* The open drawer is in the URL (second-pass review S6): #/health?drawer=drift opens Drift, so a drawer can be shared,
   reloaded and reached with Back. Opening sets ?drawer=<id>, closing takes it off; replaceState, so no page reload. */
const drawerOf = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('drawer');
export function setDrawerUrl(id, on) {
  const [base, q = ''] = window.location.hash.split('?');
  const p = new URLSearchParams(q);
  if (on) p.set('drawer', id);
  else if (p.get('drawer') === id) p.delete('drawer');
  else return;
  const qs = p.toString();
  window.history.replaceState(window.history.state, '', `${base}${qs ? `?${qs}` : ''}`);
}
export function useDrawerUrl(id) {
  const [open, setOpenState] = useState(() => drawerOf() === id);
  useEffect(() => {
    const on = () => setOpenState(drawerOf() === id);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [id]);
  const setOpen = (on) => (setOpenState(on), setDrawerUrl(id, on));
  return [open, setOpen];
}
export { drawerOf };

export default function ReadingDrawer({ answer, lead, picture, source, children, gap = 24, ...drawer }) {
  const line = answer ?? lead;
  return (
    <Drawer side="right" size="lg" {...drawer}>
      <Flow gap={gap}>
        {line || picture ? (
          <Inset gap={16}>
            {line ? <TextStack body={line} /> : null}
            {picture}
          </Inset>
        ) : null}
        {children}
        {source ? <SourceLine {...source} /> : null}
      </Flow>
    </Drawer>
  );
}
