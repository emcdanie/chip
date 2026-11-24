// The one "what is on" bar (search-filter plan, 23 Nov 2026): each applied filter, search or sort as a
// pressed FilterChip that takes itself off, "Showing n of N", and Clear all. Sits above the results, never
// above the filters, so nothing jumps. Pages pass what is on; they never build their own.
// applied: [{ key, label, removeLabel, onRemove }]; extra: more actions after Clear all (History's Save this search).
import FilterChip from '@bella/components/FilterChip/FilterChip';
import Icon from '@bella/components/Icon/Icon';
import Button from '@bella/components/Button/Button';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';

export default function ResultsBar({ applied, shown, total, onClearAll, extra }) {
  if (!applied?.length) return null;
  return (
    <Flow direction="row" gap={8} wrap align="center" role="group" aria-label="What is on">
      {applied.map((a) => (
        <FilterChip key={a.key} pressed onClick={a.onRemove} ariaLabel={a.removeLabel ?? `Remove ${a.label}`}>
          {a.label} <Icon name="Xmark" size="sm" />
        </FilterChip>
      ))}
      <Button variant="tertiary" onClick={onClearAll}>Clear all</Button>
      {extra}
      {shown != null ? <TextStack subtitle={`Showing ${shown} of ${total}`} /> : null}
    </Flow>
  );
}
