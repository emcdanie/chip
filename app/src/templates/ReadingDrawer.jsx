// The one reading drawer (Elleta, 23 Nov 2026: "all of these are missing the padding"; the audit, Drift, Push, Fix and
// Needs you drawers each arranged their parts differently). It wraps BELLA's Drawer and never restyles it.
// BELLA's Drawer Head is 24 at the sides and its Body 8 (Figma Body, 21 Nov publish; specs/components/Drawer.spec.yaml:
// paddingLeft/Right spacing/8), because a ListRow brings its own 16. So anything that is not a row (headings, text,
// bars, cards) takes the 16 here (Flow inset) and lands on the title's 24 edge; rows sit bare, as they are.
// The standard order, top to bottom:
//   title + status (the Drawer head, from `label` and `status`/`subtitle`)
//   lead     one plain line saying what this is
//   picture  the chart or bars first
//   children bullets, sections and rows, in the page's own order (ReadingSection for a headed group of rows)
//   footer   the action at the right edge (BELLA's Drawer footer)
import { useEffect, useRef, useState } from 'react';
import Drawer from '@bella/components/Drawer/Drawer';
import Disclosure from '@bella/components/Disclosure/Disclosure';
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

/* Grouped content (Elleta, 23 Nov: "i really like the styling on this ... we could do that with some of the content in
   the drawers"). The mind-map page's branch rows: a group row with a colour bar, its name, a count and an open/close mark (BELLA's chevron stands in for the plus/minus),
   opening to items that each carry a state and a status line.
   BELLA GAP, named: no part is a colour-barred expandable group row (proposal: GroupRow, or a Disclosure `tone` that
   draws the bar and a plus/minus instead of the chevron). Nearest look from BELLA parts only: a Disclosure per group
   (native details: Enter and Space toggle, the browser sets expanded) holding ListRows whose statusBar is the group's
   tone. Colour names the group only; the group's name is the state in a word (Failing, Needs work, Healthy), so an item repeats nothing: no per-row tag.
   Tones (same meaning everywhere, five at most): attention = differs from what it should be; info = the spec side;
   danger = failed; success = clear; neutral = not yet decided or measured.
   groups: [{ name, tone, items: [{ key, title, state, line, body, onClick, action }] }]; the count is items.length, never
   typed. single: opening one closes the others. openFirst: the first group with items starts open. */
export function ReadingGroups({ groups, single = false, openFirst = false, label }) {
  const shown = groups.filter((g) => g.items.length);
  const [open, setOpen] = useState(() => (openFirst && shown[0] ? [shown[0].name] : []));
  const toggle = (name, on) => setOpen((was) => (single ? (on ? [name] : []) : on ? [...was, name] : was.filter((n) => n !== name)));
  // opening a group brings it to the top of the drawer's body: closing another above or below it shrinks the page, and
  // the old scroll position would land at the end of the new group with its first item cut at the top edge (her 22 Nov)
  const box = useRef(null);
  const asked = useRef(null);
  useEffect(() => {
    if (!asked.current) return;
    const at = shown.findIndex((g) => g.name === asked.current);
    asked.current = null;
    if (at < 0) return;
    requestAnimationFrame(() => box.current?.querySelectorAll('[role="group"] > details')[at]?.scrollIntoView({ block: 'start' }));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box}>
    <Flow inset gap={8} as="div" role="group" aria-label={label}>
      {shown.map((g) => (
        <Disclosure
          key={g.name}
          title={g.name}
          summary={String(g.items.length)}
          open={open.includes(g.name)}
          onToggle={(on) => ((asked.current = on ? g.name : null), toggle(g.name, on))}
        >
          <ListRowGroup ariaLabel={`${g.name}: ${g.items.length}`}>
            {g.items.map((it) => (
              <ListRow
                key={it.key ?? it.title}
                layout="stacked"
                statusBar={g.tone ?? 'neutral'}
                title={it.title}
                description={it.line}
                body={it.body}
                trailing={it.onClick && !it.action ? true : undefined}
                onClick={it.onClick}
                actionButton={it.action}
              />
            ))}
          </ListRowGroup>
        </Disclosure>
      ))}
    </Flow>
    </div>
  );
}

export default function ReadingDrawer({ lead, picture, children, gap = 24, ...drawer }) {
  return (
    <Drawer side="right" size="lg" {...drawer}>
      <Flow gap={gap}>
        {lead || picture ? (
          <Inset gap={16}>
            {lead ? <TextStack body={lead} /> : null}
            {picture}
          </Inset>
        ) : null}
        {children}
      </Flow>
    </Drawer>
  );
}
