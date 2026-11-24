// The workbench for going through items one by one and marking them up (Elleta's Workbench A, 23 Nov 2026:
// "the tools should always be available no? when i scroll i cant see them anymore", "the cards maybe can be on the
// bottom and scroll across and i can pick them"). Shared by Playground picks and the Needs you view, so both look and
// behave alike:
//   - the picture big in the middle, with its title, what to decide and the comment count on one line above it;
//   - the picture's own thin tool column (zoom in, Fit, zoom out) on its top-left corner (PicturePins, 24 Nov);
//   - one row under the picture (the choice, thumbs, one comment box, one Send), passed in as `row`;
//   - the comments as a thin panel on the right, opened from the count and closed again;
//   - the items as a strip of the Work board's cards along the bottom that scrolls sideways, the open one outlined,
//     with Back and Next and the arrow keys;
//   - on a phone: picture (its tools in a small row right under it), the row, then the strip.
// BELLA parts: TaskCard (use="pick", selected), SectionHead, Button, Heading, Link,
// TextStack. Layout: Flow only (sticky, strip). No page CSS.
import { useEffect, useRef } from 'react';
import Button from '@bella/components/Button/Button';
import Heading from '@bella/components/Heading/Heading';
import Link from '@bella/components/Link/Link';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TaskCard from '@bella/components/TaskCard/TaskCard';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';
import useNarrow from './useNarrow.js';
import { useDrawerUrl } from './ReadingDrawer.jsx';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The strip of cards: items [{ id, title, line, status, tone }], currentId, onPick(id). Back and Next move the open
 * card; Left and Right do the same with focus in the strip; the open card scrolls into view.
 */
export function CardStrip({ title, items, currentId, onPick, label, action }) {
  const row = useRef(null);
  const at = Math.max(0, items.findIndex((it) => it.id === currentId));
  const go = (d) => {
    const next = items[Math.min(items.length - 1, Math.max(0, at + d))];
    if (next && next.id !== currentId) onPick(next.id);
    return next;
  };
  // the open card comes into view inside the strip, without moving the page up or down
  useEffect(() => {
    const ul = row.current;
    const li = ul?.querySelector('[aria-current="true"]');
    if (!ul || !li) return;
    const u = ul.getBoundingClientRect();
    const l = li.getBoundingClientRect();
    if (l.left < u.left) ul.scrollBy({ left: l.left - u.left - 8, behavior: 'smooth' });
    else if (l.right > u.right) ul.scrollBy({ left: l.right - u.right + 8, behavior: 'smooth' });
  }, [currentId]);
  const keys = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = go(e.key === 'ArrowRight' ? 1 : -1);
    if (next) requestAnimationFrame(() => row.current?.querySelector('[aria-current="true"] button')?.focus());
  };
  return (
    <Flow gap={8}>
      {/* the head is one block across the grid: the title and count, Back and Next as its action at the right end */}
      <SectionHead
        title={title}
        number={items.length ? `${at + 1} of ${items.length}` : '0'}
        titleLevel={2}
        action={
          action || items.length > 1 ? <Flow direction="row" gap={8} align="center" wrap>
            {action}
            {/* Back and Next only when there is somewhere to go */}
            {items.length > 1 ? (
              <>
                <Button variant="secondary" iconOnly icon="NavArrowLeft" ariaLabel="Back" disabled={at <= 0} onClick={() => go(-1)} />
                <Button variant="secondary" iconOnly icon="NavArrowRight" ariaLabel="Next" disabled={at >= items.length - 1} onClick={() => go(1)} />
              </>
            ) : null}
          </Flow> : undefined
        }
      />
      <Flow as="ul" strip gap={16} ref={row} aria-label={label ?? `${title}, ${at + 1} of ${items.length} open. Left and right arrows move.`} onKeyDown={keys}>
        {items.map((it) => (
          <li key={it.id} aria-current={it.id === currentId ? 'true' : undefined}>
            <TaskCard title={it.title} line={it.line} status={it.status} showTag statusTone={it.tone ?? 'neutral'} use="pick" selected={it.id === currentId} onOpen={() => onPick(it.id)} />
          </li>
        ))}
      </Flow>
    </Flow>
  );
}

// the address with the comments panel open or closed (second pass S6: an open panel is in the URL, so the count is a
// plain Link, as Workbench A draws it, and Back closes the panel)
function notesHref(open) {
  const [base, q = ''] = window.location.hash.split('?');
  const p = new URLSearchParams(q);
  if (open) p.set('drawer', 'comments');
  else p.delete('drawer');
  const qs = p.toString();
  return `${base}${qs ? `?${qs}` : ''}`;
}

/**
 * title, subtitle: what is open and what to decide. count: the number of comments, a Link that opens the panel (open
 * state in the address, ?drawer=comments). notes(close): the panel's content.
 * picture, row: the stage and the one row under it. strip: CardStrip's props. top: the line above (counts and filters).
 * bar: the Send all bar (SendBar with inFlow).
 */
export default function Workbench({ id, title, subtitle, count, notes, picture, row, strip, top, bar }) {
  const phone = useNarrow(640);
  const [notesOpen, setNotes] = useDrawerUrl('comments');
  // the picture's tools are the picture's own now (PicturePins draws ToolColumn on its corner, her review 24 Nov: the
  // side column was "too wide and sits oddly at the side"), so the picture takes the bench's whole width
  const head = (
    <Flow direction={phone ? 'column' : 'row'} gap={phone ? 4 : 12} align="start" justify="between">
      <Heading tier="subsection" as="h2" after={subtitle ? <TextStack subtitle={subtitle} /> : null}>
        {title}
      </Heading>
      {notes ? <Link href={notesHref(!notesOpen)}>{plural(count ?? 0, 'comment')}</Link> : null}
    </Flow>
  );
  const panel = notesOpen && notes ? notes(() => setNotes(false)) : null;
  const centre = (
    <Flow gap={12} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {head}
      {picture}
      {row}
    </Flow>
  );
  // one Flow for the whole bench: 16 between its groups (line, bench, strip, bar), 8 and 12 inside them, so the groups
  // read apart and the strip sits close under the comment row (her note, 23 Nov 22:00: "tighter")
  return (
    <Flow gap={16}>
      {top}
      {phone ? (
        <Flow gap={16}>
          {centre}
          {panel}
        </Flow>
      ) : (
        // on the page's 12 columns (visual study, 22 Nov): the picture takes them all, or nine with the comments panel,
        // which takes the last three
        <Flow grid>
          <Flow style={{ gridColumn: `span ${panel ? 9 : 12}` }}>{centre}</Flow>
          {panel ? <Flow style={{ gridColumn: 'span 3' }}>{panel}</Flow> : null}
        </Flow>
      )}
      {/* Workbench A: the Send all bar under the strip on a wide screen, above it on a phone */}
      {phone ? bar : null}
      {strip ? <CardStrip {...strip} /> : null}
      {phone ? null : bar}
    </Flow>
  );
}
