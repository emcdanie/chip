// A scrolling list of work items drawn as the Work board's cards (Elleta, 23 Nov: "should we not just reuse the
// board cards?"): BELLA's TaskCard, the whole card is the button. Shared by Playground Picks and the Needs you
// view. BELLA GAPS (named for the coordinator): TaskCard has no `selected` state, so the open item is drawn with
// the info (blue) border, the blue that means selection; it has no area tag; and it always draws its drag handle,
// which does nothing in a list.
import TaskCard from '@bella/components/TaskCard/TaskCard';
import Flow from './Flow.jsx';

/** items: [{ id, title, line, status, tone }]; currentId marks the open one; onPick(id). */
export default function PickList({ items, currentId, onPick, label }) {
  return (
    <Flow as="ul" gap={8} aria-label={label}>
      {items.map((it) => (
        <li key={it.id} aria-current={it.id === currentId ? 'true' : undefined}>
          <TaskCard title={it.title} line={it.line} status={it.status} showTag statusTone={it.id === currentId ? 'info' : it.tone ?? 'neutral'} onOpen={() => onPick(it.id)} />
        </li>
      ))}
    </Flow>
  );
}
