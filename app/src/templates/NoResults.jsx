// The one "nothing matches" state (search-filter plan, 23 Nov 2026): says what matched nothing, then offers
// to take each thing off with the count it would bring back. Every list uses it; no page writes its own wording.
// what: what was looked for ("butt", "Figma"); on: [{ key, label, would, onRemove }] (would = rows that removal shows);
// onClearAll: take everything off. Counts are measured by the page from its own data; omit `would` when unknown.
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import { markOf } from './marks.js';

export default function NoResults({ what, noun = 'results', on = [], onClearAll, size = 'lane', mark = '🔍' }) {
  const title = what ? `Nothing matches ${what}` : `No ${noun}`;
  const line = on.length ? `You have ${on.length === 1 ? '1 thing' : `${on.length} things`} on. Take ${on.length === 1 ? 'it' : 'one'} off to see more.` : `There are no ${noun} here yet.`;
  const actions = on.length ? (
    <>
      {on.map((o) => (
        <Button key={o.key} variant="secondary" onClick={o.onRemove}>
          {o.would != null ? `Take off ${o.label} · shows ${o.would}` : `Take off ${o.label}`}
        </Button>
      ))}
      {on.length > 1 && onClearAll ? <Button variant="tertiary" onClick={onClearAll}>Clear all</Button> : null}
    </>
  ) : undefined;
  return <EmptyState size={size} {...markOf(mark)} title={title} line={line} actions={actions} />;
}
