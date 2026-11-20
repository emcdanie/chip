// Work · content: the code twin of the Figma slot fill (CHIP Dashboard
// 608:207182), on CHIP's own data. Built so far: the board (default, bad day,
// clear day, loading follow from the data), the List view as Figma's "list"
// state, the Table view as Figma's "table" state (800:81240), the Brief
// with its action and close, Check again. Figma states still
// to build: push / push rejected, filtered to a branch, agent unavailable. BELLA parts and Flow only.
//
// Dragging (b21, Figma 608:207314; rule A from the coordinator, 19 Nov): a
// failed check drags from Needs you to Agent (or its handle's menu, by
// keyboard), which hands the check's brief to an agent run (POST /runs: its
// own branch, the gate, then her Accept). Pull, merge and push cards stay
// put. The drop space shows only while dragging.
//
// Gaps (parts-dev): the model menu on Fix; Figma's deadline bar has no CHIP
// data, so it is left out (no number invented); Iconoir "List" for the List
// card's head is not in BELLA's registry (Clock stands in); BoardLane always
// draws its dot, so lanes are wider than Figma's (Screen.css).
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import BoardLane, { BoardLaneDropSpace } from '@bella/components/BoardLane/BoardLane';
import Menu, { MenuItem } from '@bella/components/Menu/Menu';
import Toast from '@bella/components/Toast/Toast';
import Toasts from '../templates/Toasts.jsx';
import TaskCard from '@bella/components/TaskCard/TaskCard';
import ListRow from '@bella/components/ListRow/ListRow';
import DataTable from '@bella/components/DataTable/DataTable';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import { useEffect, useRef, useState } from 'react';
import Flow from '../templates/Flow.jsx';
import WorkDrawer from './WorkDrawer.jsx';
import { LANE_NAMES } from './workModel.js';
import useNarrow from '../templates/useNarrow.js';

export const VIEWS = [
  { value: 'board', label: 'Board' },
  { value: 'table', label: 'Table' },
  { value: 'list', label: 'List' },
];

/* Figma's Table state (800:81240): every task as a row, sortable, on the page ground. */
const TABLE_COLUMNS = [
  { key: 'title', label: 'Task', sortable: true },
  { key: 'lane', label: 'Lane', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'branch', label: 'Branch', sortable: true, render: (r) => r.branch ?? 'No branch' },
  { key: 'who', label: 'Who acts', sortable: true },
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

/* The List view's status bar per lane: the short rounded bar at the row's
   left (20 Nov rule; published List row), the same tone as the lane's dot. */
const LANE_BAR = { needs: 'attention', agent: 'info', gate: 'neutral', ready: 'success' };

function Lane({ lane: given, index, move }) {
  const e = EMPTY[given.id];
  // a card on its way to the agent leaves Needs you at once
  const lane = given.id === 'needs' ? { ...given, cards: given.cards.filter((c) => !move.starting.some((s) => s.id === c.id)) } : given;
  const agent = lane.id === 'agent';
  const cards = [
    // the drop space shows only while a card is being dragged, at the top of Agent
    // it opens while a card is dragged, and after the drop (or a cancel) it closes up before it goes (parts-dev dc158de)
    ...(agent && (move.dragging || move.closing) ? [<BoardLaneDropSpace key="drop" label="Drop here to start" open={!!move.dragging} onClosed={() => move.setClosing(false)} />] : []),
    ...(agent ? move.starting.filter((c) => !lane.cards.some((t) => t.title === c.title)).map((c) => <TaskCard key={`start-${c.id}`} title={c.title} line="Sent from Needs you" status="Starting" statusTone="info" />) : []),
    ...[...lane.cards, ...Object.values(move.leaving).filter((x) => x.lane === lane.id && !lane.cards.some((c) => c.id === x.card.id)).map((x) => x.card)].flatMap((c) => {
      const needs = lane.id === 'needs';
      const card = (
        <TaskCard
          key={c.id}
          title={c.title}
          line={c.line}
          status={c.status}
          statusTone={c.tone}
          onOpen={c.open ? () => move.open(c.open, { card: c, lane: lane.id }) : undefined}
          // motion items 4 and 6: a card new to Needs you (or back from Undo) pops in; an accepted one leaves
          entering={needs && move.isNew(c.id)}
          leaving={!!move.leaving[c.id]}
          onLeft={move.leaving[c.id] ? () => move.left(c.id) : undefined}
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
  const [dragging, setDraggingNow] = useState(null);
  // the drop space stays a moment after a drag ends, closing up
  const [closing, setClosing] = useState(false);
  const setDragging = (id) => {
    if (!id && dragging) setClosing(true);
    setDraggingNow(id);
  };
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
  return { dragging, setDragging, closing, setClosing, menu, setMenu, starting, send, notice, setNotice };
}

export default function WorkContent({ model, filter = {}, view = 'board', onView, checked, onCheck, loading }) {
  const phone = useNarrow();
  const [briefShut, setBriefShut] = useState(false);
  // what a card, row or the brief opened: the drawer in this shell, never the old app
  const [opened, setOpen] = useState(null);
  // the card the drawer was opened from, so Accept can send that card off the board
  const from = useRef(null);
  // cards leaving after Accept, kept on screen (even once the board drops them) until they've slid out
  const [leaving, setLeaving] = useState({});
  // Needs you's cards as first shown: only cards that arrive after that pop in, never on first load
  const seen = useRef(null);
  const arrived = useRef(new Set());
  const needsIds = model?.lanes.find((l) => l.id === 'needs')?.cards.map((c) => c.id) ?? null;
  if (needsIds && !seen.current) seen.current = new Set(needsIds);
  else if (needsIds) needsIds.forEach((id) => !seen.current.has(id) && (seen.current.add(id), arrived.current.add(id)));
  const move = {
    ...useMove(),
    open: (o, card) => ((from.current = card ?? null), setOpen(o)),
    isNew: (id) => arrived.current.has(id),
    leaving,
    left: (id) => (setLeaving(({ [id]: _, ...rest }) => rest), window.dispatchEvent(new Event('chip:changed'))),
  };
  const accepted = () => {
    const f = from.current;
    setOpen(null);
    if (f) setLeaving((l) => ({ ...l, [f.card.id]: f }));
    else window.dispatchEvent(new Event('chip:changed'));
  };
  // Check again ends with a toast that says what it found (feedback on the control plus a toast)
  const wasLoading = useRef(false);
  useEffect(() => {
    if (wasLoading.current && !loading && model) {
      const n = model.lanes.find((l) => l.id === 'needs')?.cards.length ?? 0;
      move.setNotice({ tone: 'success', title: `Checked ${checked ?? ''}`.trim(), message: n ? `${n} ${n === 1 ? 'thing needs' : 'things need'} you.` : 'Nothing needs you.' });
    }
    wasLoading.current = !!loading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
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
      {/* the switch keeps the right end at every width: the left group wraps, never the bar (audit 10 at 1024 and 1100); below 800 it stacks, the switch on its own row at the right */}
      <Flow direction={phone ? 'column' : 'row'} gap={16} justify="between" align={phone ? 'start' : 'center'} grow={phone ? undefined : 'first'}>
        <Flow direction="row" gap={16} wrap align="center">
          {/* what the board shows: all branches, or the sidebar's branch or status, with the way back */}
          <TextStack title={`${filter.branch ?? (filter.lane ? LANE_NAMES[filter.lane] : 'All branches')} · ${model ? model.total : '…'} ${model?.total === 1 ? 'task' : 'tasks'}`} />
          {filter.branch || filter.lane ? (
            <Button variant="tertiary" size="sm" href="#/work">
              Show all
            </Button>
          ) : null}
          <Flow direction="row" gap={8} align="center">
            {checked ? <TextStack subtitle={`Checked ${checked}`} /> : null}
            {/* busy while the check runs: the icon turns and clicks wait (Button busy, parts-dev 99a021d) */}
            <Button variant="tertiary" size="sm" icon="RefreshDouble" leadingIcon busy={!!loading} onClick={onCheck}>
              {loading ? 'Checking…' : 'Check again'}
            </Button>
          </Flow>
        </Flow>
        <Flow direction="row" justify="end" stretch={phone}>
          <SegmentedControl options={VIEWS} value={view} onChange={onView} label="Work view" />
        </Flow>
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
              action={model.brief.action && model.brief.open ? { label: model.brief.action, onClick: () => move.open(model.brief.open) } : undefined}
              onClose={() => setBriefShut(true)}
              closeLabel="Hide the brief"
            />
          ) : null}
          {/* feedback for a move: the card's own "Starting", plus a toast */}
          {move.notice ? (
            <Toasts>
              <Toast tone={move.notice.tone} onClose={() => move.setNotice(null)}>
                {`${move.notice.title}. ${move.notice.message}`}
              </Toast>
            </Toasts>
          ) : null}
          <WorkDrawer item={opened} onClose={() => setOpen(null)} onNotice={move.setNotice} onChanged={() => window.dispatchEvent(new Event('chip:changed'))} onAccepted={accepted} />
          {view === 'table' ? (
            model.total ? (
              <DataTable caption="Every task on the board" columns={TABLE_COLUMNS} rows={model.lanes.flatMap((l) => l.cards.map((c) => ({ ...c, lane: l.name })))} rowKey="id" />
            ) : (
              <EmptyState size="lane" mark="🏖️" title="A clear day" line="Nothing on the board. Go on, take the afternoon." />
            )
          ) : view === 'list' ? (
            <Card>
              <Flow gap={16}>
                <SectionHead icon="Clock" iconTone="info" title="Today" description="Everything on the board, as rows" number={model.total} words={model.total === 1 ? 'task' : 'tasks'} />
                {model.total ? (
                  <Flow as="ul" gap={8} aria-label="All tasks">
                    {model.lanes.flatMap((l) =>
                      l.cards.map((c) => (
                        // Figma 612:88931: the lane as the overline, name, detail; the
                        // action on the right as text, else the › that opens it
                        <ListRow
                          key={c.id}
                          layout="stacked"
                          divider
                          statusBar={LANE_BAR[l.id]}
                          overline={l.name}
                          title={c.title}
                          description={c.line}
                          actionButton={c.action && c.open ? <Button variant="tertiary" size="sm" onClick={() => move.open(c.open)}>{c.action}</Button> : undefined}
                          trailing={!c.action && c.open ? true : undefined}
                          onClick={!c.action && c.open ? () => move.open(c.open) : undefined}
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
