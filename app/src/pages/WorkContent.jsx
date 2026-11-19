// Work · content: the code twin of the Figma slot fill (CHIP Dashboard
// 608:207182), on CHIP's own data. Built so far: the board (default, bad day,
// clear day, loading follow from the data), the List view, Check again.
// Figma states still to build: Table view, dragging, push / push rejected,
// filtered to a branch, agent unavailable. BELLA parts and Flow only.
//
// Gaps (parts-dev): the Brief's brain icon; the model menu on Fix; Figma's
// deadline bar has no CHIP data, so it is left out (no number invented).
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import Heading from '@bella/components/Heading/Heading';
import BoardLane from '@bella/components/BoardLane/BoardLane';
import TaskCard from '@bella/components/TaskCard/TaskCard';
import ListRow from '@bella/components/ListRow/ListRow';
import Tag from '@bella/components/Tag/Tag';
import TextStack from '@bella/components/TextStack/TextStack';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import Flow from '../templates/Flow.jsx';
import useNarrow from '../templates/useNarrow.js';

export const VIEWS = [
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'List' },
];

/* Lanes with nothing in them: Belfast-mode lines (her 19 Nov empty states). */
const EMPTY = {
  needs: { mark: '☕', title: 'Nothing needs you', line: 'Kettle on. I’ll shout if something breaks.' },
  agent: { mark: '🛋️', title: 'No agent working', line: 'Send a fix and one gets up off the sofa.' },
  gate: { mark: '🚦', title: 'Nothing at the gate', line: 'Green lights all round.' },
  ready: { mark: '📭', title: 'Nothing ready', line: 'Finished work waits here for your Accept.' },
};

function Lane({ lane, index }) {
  const e = EMPTY[lane.id];
  return (
    <BoardLane name={lane.name} index={String(index + 1).padStart(2, '0')} order={lane.order} lane={lane.id === 'needs' ? 'needs-you' : 'other'} count={lane.cards.length} headingLevel={2}>
      {lane.cards.length
        ? lane.cards.map((c) => <TaskCard key={c.id} title={c.title} line={c.line} branch={c.branch} status={c.status} statusTone={c.tone} href="#/health-old" />)
        : [<EmptyState key="empty" size="lane" mark={e.mark} title={e.title} line={e.line} />]}
    </BoardLane>
  );
}

export default function WorkContent({ model, view = 'board', onView, checked, onCheck, loading }) {
  // Four lanes need about 1200px; below that they stack, full width.
  const stacked = useNarrow(1200);
  return (
    <>
      {/* Control bar: what you look at and the last check on the left, the view switch on the right. */}
      <Flow direction="row" gap={16} wrap justify="between" align="center">
        <Flow direction="row" gap={16} wrap align="center">
          <Heading tier="subsection" as="h2">{`All branches · ${model ? model.total : '…'} tasks`}</Heading>
          <Flow direction="row" gap={8} align="center">
            {checked ? <TextStack subtitle={`Checked ${checked}`} /> : null}
            <Button variant="tertiary" size="sm" icon="RefreshDouble" leadingIcon onClick={onCheck}>
              {loading ? 'Checking…' : 'Check again'}
            </Button>
          </Flow>
        </Flow>
        <SegmentedControl options={VIEWS} value={view} onChange={onView} label="Work view" />
      </Flow>
      {!model ? (
        <EmptyState size="lane" mark="⏳" title="Reading the board" line="Fetching what needs you and what the agents are up to." />
      ) : (
        <>
          {model.brief ? <Notification tone="info" title="Brief · from CHIP’s checks" message={model.brief.message} /> : null}
          {model.finished.length ? (
            <Card>
              <Flow gap={8}>
                <Heading tier="subsection" as="h2">Just finished</Heading>
                {model.finished.map((f) => (
                  <span key={f.id}>{f.text}</span>
                ))}
              </Flow>
            </Card>
          ) : null}
          {view === 'list' ? (
            <Card>
              <Flow as="ul" gap={8} aria-label="All tasks">
                {model.lanes.flatMap((l) => l.cards.map((c) => <ListRow key={c.id} layout="stacked" title={c.title} description={c.line} tag={<Tag variant="flat">{l.name}</Tag>} trailing href="#/health-old" />))}
              </Flow>
              {model.total ? null : <EmptyState size="lane" mark="🏖️" title="A clear day" line="Nothing on the board. Go on, take the afternoon." />}
            </Card>
          ) : (
            <Flow direction={stacked ? 'column' : 'row'} gap={24} equal={!stacked}>
              {model.lanes.map((l, i) => (
                <Lane key={l.id} lane={l} index={i} />
              ))}
            </Flow>
          )}
        </>
      )}
    </>
  );
}
