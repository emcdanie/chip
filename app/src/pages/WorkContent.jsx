// Work · content: the code twin of the Figma slot fill (CHIP Dashboard
// 608:207182), on CHIP's own data. Built so far: the board (default, bad day,
// clear day, loading follow from the data), the List view as Figma's "list"
// state, the Brief with its action and close, Check again. Figma states still
// to build: dragging, push / push rejected, filtered to a branch, agent
// unavailable; Figma's Table has no drawn state yet. BELLA parts and Flow only.
//
// Gaps (parts-dev): the Brief's brain icon; the model menu on Fix; Figma's
// deadline bar has no CHIP data, so it is left out (no number invented).
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import BoardLane from '@bella/components/BoardLane/BoardLane';
import TaskCard from '@bella/components/TaskCard/TaskCard';
import ListRow from '@bella/components/ListRow/ListRow';
import IconWell from '@bella/components/IconWell/IconWell';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import { useState } from 'react';
import Flow from '../templates/Flow.jsx';

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

/* Each lane's dot is the panel's Status dot for the same lane (dots mean status).
   Figma's lane head has no dot, but BoardLane always draws one (part gap, parts-dev). */
const LANE_TONE = { needs: 'attention', agent: 'info', gate: 'neutral', ready: 'success' };

/* The List view's mark per lane, as Figma's "list" state draws it. */
const LANE_WELL = { needs: ['WarningCircle', 'warning'], agent: ['Activity', 'info'], gate: ['ShieldCheck', 'info'], ready: ['CheckCircle', 'success'] };

function Lane({ lane, index }) {
  const e = EMPTY[lane.id];
  return (
    // Figma's lane head: number, name, count; no order line
    <BoardLane name={lane.name} index={String(index + 1).padStart(2, '0')} lane={lane.id === 'needs' ? 'needs-you' : 'other'} statusTone={LANE_TONE[lane.id]} count={lane.cards.length} headingLevel={2}>
      {lane.cards.length
        ? lane.cards.map((c) => <TaskCard key={c.id} title={c.title} line={c.line} branch={c.branch} status={c.status} statusTone={c.tone} href="#/health-old" />)
        : [<EmptyState key="empty" size="lane" mark={e.mark} title={e.title} line={e.line} />]}
    </BoardLane>
  );
}

export default function WorkContent({ model, view = 'board', onView, checked, onCheck, loading }) {
  const [briefShut, setBriefShut] = useState(false);
  return (
    <>
      {/* Control bar: what you look at and the last check on the left, the view switch on the right. */}
      <Flow direction="row" gap={16} wrap justify="between" align="center">
        <Flow direction="row" gap={16} wrap align="center">
          <TextStack title={`All branches · ${model ? model.total : '…'} tasks`} />
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
          {model.brief && !briefShut ? (
            <Notification
              tone="info"
              title="Brief · from CHIP’s checks"
              message={model.brief.message}
              action={model.brief.action ? { label: model.brief.action, href: '#/health-old' } : undefined}
              onClose={() => setBriefShut(true)}
              closeLabel="Hide the brief"
            />
          ) : null}
          {model.finished.length ? (
            <Card>
              <Flow gap={8}>
                <SectionHead title="Just finished" titleLevel={2} />
                {model.finished.map((f) => (
                  <span key={f.id}>{f.text}</span>
                ))}
              </Flow>
            </Card>
          ) : null}
          {view === 'list' ? (
            <Card>
              <Flow gap={16}>
                <SectionHead icon="Clock" iconTone="info" title="Today" description="Everything on the board, as rows" number={model.total} words={model.total === 1 ? 'task' : 'tasks'} />
                {model.total ? (
                  <Flow as="ul" gap={8} aria-label="All tasks">
                    {model.lanes.flatMap((l) =>
                      l.cards.map((c) => (
                        <ListRow
                          key={c.id}
                          layout="stacked"
                          divider
                          iconWell={<IconWell icon={LANE_WELL[l.id][0]} tone={LANE_WELL[l.id][1]} />}
                          title={c.title}
                          description={[c.line, c.status].filter(Boolean).join(' · ')}
                          actionButton={c.action ? <Button variant="secondary" size="sm" href="#/health-old">{c.action}</Button> : undefined}
                          trailing={c.action ? undefined : true}
                          href={c.action ? undefined : '#/health-old'}
                        />
                      )),
                    )}
                  </Flow>
                ) : (
                  <EmptyState size="lane" mark="🏖️" title="A clear day" line="Nothing on the board. Go on, take the afternoon." />
                )}
              </Flow>
            </Card>
          ) : (
            <Flow board direction="row" gap={24} aria-label="Work board">
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
