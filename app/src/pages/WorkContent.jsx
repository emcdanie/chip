// Work · content: the code twin of the Figma slot fill (CHIP Dashboard
// 608:207182), on CHIP's own data. Built so far: the board (default, bad day,
// clear day, loading follow from the data), the List view as Figma's "list"
// state, the Brief with its action and close, Check again. Figma states still
// to build: push / push rejected, filtered to a branch, agent unavailable; Figma's Table has no drawn state yet. BELLA parts and Flow only.
//
// Dragging (b21, Figma 608:207314; rule A from the coordinator, 19 Nov): a
// failed check drags from Needs you to Agent (or its handle's menu, by
// keyboard), which hands the check's brief to an agent run (POST /runs: its
// own branch, the gate, then her Accept). Pull, merge and push cards stay
// put. The drop space shows only while dragging.
//
// Gaps (parts-dev): Toast (a Notification stands in); the model menu on Fix; Figma's
// deadline bar has no CHIP data, so it is left out (no number invented).
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import BoardLane, { BoardLaneDropSpace } from '@bella/components/BoardLane/BoardLane';
import Menu, { MenuItem } from '@bella/components/Menu/Menu';
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

function Lane({ lane: given, index, move }) {
  const e = EMPTY[given.id];
  // a card on its way to the agent leaves Needs you at once
  const lane = given.id === 'needs' ? { ...given, cards: given.cards.filter((c) => !move.starting.some((s) => s.id === c.id)) } : given;
  const agent = lane.id === 'agent';
  const cards = [
    // the drop space shows only while a card is being dragged, at the top of Agent
    ...(agent && move.dragging ? [<BoardLaneDropSpace key="drop" label="Drop here to start" />] : []),
    ...(agent ? move.starting.filter((c) => !lane.cards.some((t) => t.title === c.title)).map((c) => <TaskCard key={`start-${c.id}`} title={c.title} line="Sent from Needs you" status="Starting" statusTone="info" />) : []),
    ...lane.cards.flatMap((c) => {
      const needs = lane.id === 'needs';
      const card = (
        <TaskCard
          key={c.id}
          title={c.title}
          line={c.line}
          status={c.status}
          statusTone={c.tone}
          href="#/health-old"
          dragging={move.dragging === c.id}
          draggable={needs && c.fixable ? true : undefined}
          onDragStart={needs && c.fixable ? (ev) => (ev.dataTransfer.setData('text/plain', c.id), (ev.dataTransfer.effectAllowed = 'move'), move.setDragging(c.id)) : undefined}
          onDragEnd={needs && c.fixable ? () => move.setDragging(null) : undefined}
          onMoveTo={needs ? () => move.setMenu(move.menu === c.id ? null : c.id) : undefined}
        />
      );
      if (move.menu !== c.id) return [card];
      return [
        card,
        <Menu key={`menu-${c.id}`} label={`Move ${c.title}`} onClose={() => move.setMenu(null)}>
          {c.fixable ? (
            <MenuItem label="Send to the agent" icon="Sparks" onSelect={() => (move.setMenu(null), move.send(c))} />
          ) : (
            <MenuItem label="Stays with you: pull, merge and push are your call" onSelect={() => move.setMenu(null)} />
          )}
        </Menu>,
      ];
    }),
  ].filter(Boolean);
  const live = agent ? lane.cards.length + move.starting.filter((c) => !lane.cards.some((t) => t.title === c.title)).length : lane.cards.length;
  return (
    // Figma's lane head: number, name, count; no order line
    <BoardLane name={lane.name} index={String(index + 1).padStart(2, '0')} lane={lane.id === 'needs' ? 'needs-you' : 'other'} statusTone={LANE_TONE[lane.id]} count={live} headingLevel={2} dropTarget={agent && !!move.dragging}>
      {cards.length ? cards : [<EmptyState key="empty" size="lane" mark={e.mark} title={e.title} line={e.line} />]}
    </BoardLane>
  );
}

/** Hands a failed check to an agent run: the check's brief from its review card, then POST /runs. */
function useMove() {
  const [dragging, setDragging] = useState(null);
  const [menu, setMenu] = useState(null);
  const [starting, setStarting] = useState([]);
  const [notice, setNotice] = useState(null);
  const send = async (card) => {
    setStarting((s) => [...s, card]);
    try {
      const review = await fetch(`/review/${encodeURIComponent(card.check)}`).then((r) => r.json());
      if (!review.brief) throw new Error('CHIP has its own fix for this one, so it waits on its review card, not an agent.');
      const r = await fetch('/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: review.brief, title: card.title, from: 'Work board' }) });
      const run = await r.json();
      if (!r.ok || run.error) throw new Error(run.error ?? 'The agent did not start.');
      setNotice({ tone: 'success', title: `Sent to the agent: ${card.title}`, message: 'It works on its own branch, then the gate checks it. You Accept or Undo when it’s ready.' });
      window.dispatchEvent(new Event('chip:changed'));
    } catch (err) {
      // the card goes back to Needs you; it shows "Starting" only while the run is on its way
      setStarting((s) => s.filter((c) => c.id !== card.id));
      setNotice({ tone: 'danger', title: `Not sent: ${card.title}`, message: err.message });
    }
  };
  return { dragging, setDragging, menu, setMenu, starting, send, notice, setNotice };
}

export default function WorkContent({ model, view = 'board', onView, checked, onCheck, loading }) {
  const [briefShut, setBriefShut] = useState(false);
  const move = useMove();
  // a drop anywhere on the Agent lane sends the dragged card
  const onDrop = (ev) => {
    const lane = ev.target.closest?.('[data-bella-component="board-lane"]');
    const card = model?.lanes[0].cards.find((c) => c.id === move.dragging);
    move.setDragging(null);
    if (!card || lane?.querySelector('h2')?.textContent !== 'Agent') return;
    ev.preventDefault();
    move.send(card);
  };
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
              icon="Brain"
              title="Brief · from CHIP’s checks"
              message={model.brief.message}
              action={model.brief.action ? { label: model.brief.action, href: '#/health-old' } : undefined}
              onClose={() => setBriefShut(true)}
              closeLabel="Hide the brief"
            />
          ) : null}
          {/* feedback for a move, beside the card's own "Starting" (Toast is a part gap) */}
          {move.notice ? <Notification tone={move.notice.tone} title={move.notice.title} message={move.notice.message} onClose={() => move.setNotice(null)} closeLabel="Hide" /> : null}
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
            <Flow board direction="row" gap={24} aria-label="Work board" onDragOver={(ev) => move.dragging && ev.preventDefault()} onDrop={onDrop}>
              {model.lanes.map((l, i) => (
                <Lane key={l.id} lane={l} index={i} move={move} />
              ))}
            </Flow>
          )}
        </>
      )}
    </>
  );
}
