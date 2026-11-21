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
// card's head is not in BELLA's registry (Clock stands in); BoardLane spaces
// its cards 16 apart where Figma's board has 12 (a BELLA part, not CHIP's).
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import BoardLane, { BoardLaneDropSpace } from '@bella/components/BoardLane/BoardLane';
import Menu, { MenuItem } from '@bella/components/Menu/Menu';
import Toast from '@bella/components/Toast/Toast';
import Toasts from '../templates/Toasts.jsx';
import TaskCard from '@bella/components/TaskCard/TaskCard';
import Tag from '@bella/components/Tag/Tag';
import ListRow from '@bella/components/ListRow/ListRow';
import DataTable from '@bella/components/DataTable/DataTable';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import { useEffect, useRef, useState } from 'react';
import { planRun } from '../templates/RunPlan.jsx';
import { runnable, saveMove } from './workModel.js';
import Flow from '../templates/Flow.jsx';
import WorkDrawer from './WorkDrawer.jsx';
import { LANE_NAMES } from './workModel.js';
import useNarrow from '../templates/useNarrow.js';
import useCached from '../templates/useCached.js';

export const VIEWS = [
  { value: 'board', label: 'Board' },
  { value: 'table', label: 'Table' },
  { value: 'list', label: 'List' },
];

/* Figma's Table state (800:81240): every task as a row, sortable, on the page ground. */
/* Lane as a Tag in the lane's tone (her 21 Nov, question 7 A) and Status as its Tag (21 Nov: tables
   show the status Tag); sorting stays on the words. Neutral is Tag's default tone. */
const tagTone = (t) => (t === 'neutral' ? 'default' : t);
const TABLE_COLUMNS = [
  { key: 'title', label: 'Task', sortable: true },
  { key: 'lane', label: 'Lane', sortable: true, render: (r) => <Tag variant="line" tone={tagTone(LANE_BAR[r.laneId])}>{r.lane}</Tag> },
  { key: 'status', label: 'Status', sortable: true, render: (r) => (r.status ? <Tag variant="line" tone={tagTone(r.tone)}>{r.status}</Tag> : null) },
  { key: 'branch', label: 'Branch', sortable: true, render: (r) => r.branch ?? 'No branch' },
  // the role alone; capitalised here because it starts its cell (Elleta, 21 Nov)
  { key: 'who', label: 'Who acts', sortable: true, render: (r) => (r.who ? r.who[0].toUpperCase() + r.who.slice(1) : null) },
];

/* Lanes with nothing in them: Belfast-mode lines (her 19 Nov empty states). */
const EMPTY = {
  needs: { mark: '☕', title: 'Nothing needs you', line: 'Kettle on. I’ll shout if something breaks.' },
  agent: { mark: '🛋️', title: 'No agent working', line: 'Send a fix and one gets up off the sofa.' },
  gate: { mark: '🚦', title: 'Nothing at the gate', line: 'Green lights all round.' },
  ready: { mark: '📭', title: 'Nothing ready', line: 'Finished work waits here for your Accept.' },
};

/* BoardLane's lane, published 21 Nov ("A, light tints"): each lane its own tint
   and a filled count plate; no number, no dot. */
const LANE_KIND = { needs: 'needs-you', agent: 'agent', gate: 'gate', ready: 'ready' };

/* The List view's status bar per lane: the short rounded bar at the row's
   left (20 Nov rule; published List row), the same tone as the lane's tint. */
const LANE_BAR = { needs: 'attention', agent: 'info', gate: 'neutral', ready: 'success' };

function Lane({ lane: given, move, why }) {
  // an empty lane says why, from what was measured (/work/lanes); the friendly line stays where nothing was
  const e = why ? { ...EMPTY[given.id], line: why } : EMPTY[given.id];
  // a card on its way to the agent leaves Needs you at once
  const lane = given.id === 'needs' ? { ...given, cards: given.cards.filter((c) => !move.starting.some((s) => s.id === c.id)) } : given;
  const agent = lane.id === 'agent';
  const dragged = move.dragging ? move.find(move.dragging) : null;
  // the drop space shows only while a card is being dragged, at the top of every other lane;
  // in Agent it says the drop starts work (a plan first), elsewhere it moves the card
  const dropHere = dragged && dragged.lane !== lane.id && (!agent || runnable(dragged.card) || dragged.card.home === 'agent');
  const cards = [
    // it opens while a card is dragged, and after the drop (or a cancel) it closes up before it goes (parts-dev dc158de)
    ...(dropHere || (move.closing && move.find(move.closing)?.lane !== lane.id) ? [<BoardLaneDropSpace key="drop" label={agent && runnable(dragged?.card ?? {}) ? 'Drop here to plan the run' : `Drop here to move it to ${lane.name}`} open={!!dropHere} onClosed={() => move.setClosing(false)} />] : []),
    ...(agent ? move.starting.filter((c) => !lane.cards.some((t) => t.title === c.title)).map((c) => <TaskCard key={`start-${c.id}`} title={c.title} line="Plan open, waiting for your Approve" status="Starting" statusTone="info" />) : []),
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
          // every card moves, by mouse (drag) or keyboard (its Move to… menu); the move is saved
          draggable
          onDragStart={(ev) => (ev.dataTransfer.setData('text/plain', c.id), (ev.dataTransfer.effectAllowed = 'move'), move.setDragging(c.id))}
          onDragEnd={() => move.setDragging(null)}
          onMoveTo={() => move.setMenu(move.menu === c.id ? null : c.id)}
        />
      );
      if (move.menu !== c.id) return [card];
      return [
        card,
        <Menu key={`menu-${c.id}`} label={`Move ${c.title}`} onClose={() => move.setMenu(null)}>
          {Object.entries(LANE_NAMES)
            // Agent only for what an agent can take: pull, merge and push stay with a person
            .filter(([id]) => id !== lane.id && (id !== 'agent' || runnable(c) || c.home === 'agent'))
            .map(([id, name]) =>
              id === 'agent' && runnable(c) ? (
                <MenuItem key={id} label="Send to the agent (opens the plan)" icon="Sparks" onSelect={() => (move.setMenu(null), move.drop(c, lane.id, id))} />
              ) : (
                <MenuItem key={id} label={id === c.home ? `Put back in ${name}` : `Move to ${name}`} onSelect={() => (move.setMenu(null), move.drop(c, lane.id, id))} />
              ),
            )}
        </Menu>,
      ];
    }),
  ].filter(Boolean);
  const live = agent ? lane.cards.length + move.starting.filter((c) => !lane.cards.some((t) => t.title === c.title)).length : lane.cards.length;
  return (
    // Figma's lane head: name and count; an empty lane shows its centred Empty state (Show empty)
    <BoardLane name={lane.name} lane={LANE_KIND[lane.id]} count={live} headingLevel={2} dropTarget={!!dropHere} empty={<EmptyState size="lane" mark={e.mark} title={e.title} line={e.line} />}>
      {cards.length ? cards : null}
    </BoardLane>
  );
}

/** Hands a failed check to an agent run: the check's brief from its review card, then POST /runs. */
function useMove() {
  const [dragging, setDraggingNow] = useState(null);
  // the drop space stays a moment after a drag ends, closing up
  const [closing, setClosing] = useState(false);
  const setDragging = (id) => {
    if (!id && dragging) setClosing(dragging);
    setDraggingNow(id);
  };
  const [menu, setMenu] = useState(null);
  const [starting, setStarting] = useState([]);
  const [notice, setNotice] = useState(null);
  // a card sent to the agent opens its plan first (templates/RunPlan.jsx): Approve starts the run, closing changes nothing
  const send = async (card) => {
    setStarting((s) => [...s, card]);
    try {
      let plan;
      if (card.runBrief) plan = { brief: card.runBrief, title: card.title, from: 'Work board', subtitle: 'Run again · the same brief, on a new branch' };
      else {
        const review = await fetch(`/review/${encodeURIComponent(card.check)}`).then((r) => r.json());
        if (!review.brief) throw new Error('CHIP has its own fix for this one, so it waits on its review card, not an agent.');
        plan = { brief: review.brief, title: card.title, from: 'Work board' };
      }
      const run = await planRun(plan);
      if (run) window.dispatchEvent(new Event('chip:changed'));
      else setStarting((s) => s.filter((c) => c.id !== card.id));
    } catch (err) {
      // the card goes back to Needs you; it shows "Starting" only while the run is on its way
      setStarting((s) => s.filter((c) => c.id !== card.id));
      if (!err.shown) setNotice({ tone: 'danger', title: `Not sent: ${card.title}`, message: err.message });
    }
  };
  // a drop or a menu pick: to Agent, a card an agent can take opens its plan; back home clears her move;
  // anywhere else is saved as her placement (/work/moves), with feedback on the card's new lane and a toast
  const drop = async (card, from, to) => {
    if (!to || to === from) return;
    if (to === 'agent' && runnable(card)) return send(card);
    if (to === 'agent' && card.home !== 'agent') return setNotice({ tone: 'attention', title: `Stays with you: ${card.title}`, message: 'An agent can’t take this one: pull, merge and push are a person’s call.' });
    try {
      await saveMove(card.id, to === card.home ? null : to);
      setNotice({ tone: 'success', title: to === card.home ? `Put back: ${card.title}` : `Moved to ${LANE_NAMES[to]}: ${card.title}`, message: to === card.home ? 'It sits where CHIP measured it again.' : 'Saved. It keeps its own status; Move to… puts it back.' });
    } catch (err) {
      setNotice({ tone: 'danger', title: `Not moved: ${card.title}`, message: err.message });
    }
  };
  return { dragging, setDragging, closing, setClosing, menu, setMenu, starting, send, drop, notice, setNotice };
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
    // a pull request opens on GitHub in a new tab; everything else in this shell's drawer
    open: (o, card) => (o.kind === 'link' ? window.open(o.href, '_blank', 'noopener') : ((from.current = card ?? null), setOpen(o))),
    isNew: (id) => arrived.current.has(id),
    find: (id) => {
      for (const l of model?.lanes ?? []) {
        const card = l.cards.find((c) => c.id === id);
        if (card) return { card, lane: l.id };
      }
      return null;
    },
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
  const checkAsked = useRef(false);
  useEffect(() => {
    // only for her Check again, never for a reload a move or a run set off (its own toast says what happened)
    if (wasLoading.current && !loading && model && checkAsked.current) {
      checkAsked.current = false;
      const n = model.lanes.find((l) => l.id === 'needs')?.cards.length ?? 0;
      move.setNotice({ tone: 'success', title: `Checked ${checked ?? ''}`.trim(), message: n ? `${n} ${n === 1 ? 'thing needs' : 'things need'} you.` : 'Nothing needs you.' });
    }
    wasLoading.current = !!loading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  // a drop anywhere on a lane moves the dragged card there (move.drop says what that means)
  const onDrop = (ev) => {
    const el = ev.target.closest?.('[data-bella-component="board-lane"]');
    const name = el?.querySelector('h2')?.textContent;
    const to = Object.keys(LANE_NAMES).find((id) => LANE_NAMES[id] === name);
    const found = move.dragging ? move.find(move.dragging) : null;
    move.setDragging(null);
    if (!found || !to) return;
    ev.preventDefault();
    move.drop(found.card, found.lane, to);
  };
  return (
    <>
      {/* Control bar: what you look at and the last check on the left, the view switch on the right. */}
      {/* the switch keeps the right end at every width: the left group wraps, never the bar (audit 10 at 1024 and 1100); below 800 it stacks, the switch on its own row at the right */}
      <Flow direction={phone ? 'column' : 'row'} gap={16} justify="between" align={phone ? 'start' : 'center'} grow={phone ? undefined : 'first'}>
        <Flow direction="row" gap={16} wrap align="center">
          {/* what the board shows: all branches, or the sidebar's branch or status, with the way back */}
          <TextStack title={`${filter.branch ?? (filter.lane ? LANE_NAMES[filter.lane] : 'All branches')} · ${model ? model.total : '…'} ${model?.total === 1 ? 'task' : 'tasks'}`} />
          {/* branches filter the board (READ FIRST): picked here since the side menu names no branch (nav C, 22 Nov) */}
          <BranchPicker branch={filter.branch} />
          {filter.branch || filter.lane ? (
            <Button variant="tertiary" size="sm" href="#/work">
              Show all
            </Button>
          ) : null}
          <Flow direction="row" gap={8} align="center">
            {checked ? <TextStack subtitle={`Checked ${checked}`} /> : null}
            {/* busy while the check runs: the icon turns and clicks wait (Button busy, parts-dev 99a021d) */}
            <Button variant="tertiary" size="sm" icon="RefreshDouble" leadingIcon busy={!!loading} onClick={() => ((checkAsked.current = true), onCheck?.())}>
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
              <DataTable caption="Every task on the board" columns={TABLE_COLUMNS} rows={model.lanes.flatMap((l) => l.cards.map((c) => ({ ...c, lane: l.name, laneId: l.id })))} rowKey="id" />
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
              {model.lanes.map((l) => (
                <Lane key={l.id} lane={l} move={move} why={model.why?.[l.id]} />
              ))}
            </Flow>
          )}
        </>
      )}
    </>
  );
}

/* The board's branch filter: the project's newest branches, the one checked out first. */
function BranchPicker({ branch }) {
  const [open, setOpen] = useState(false);
  const { data } = useCached(['/projects/chip']);
  const live = data?.[0]?.live;
  const names = (live?.branches ?? []).slice(0, 8).map((b) => b.name);
  if (!names.length) return null;
  const pick = (name) => {
    setOpen(false);
    window.location.hash = name ? `#/work?branch=${encodeURIComponent(name)}` : '#/work';
  };
  return (
    <div className="chip-pop">
      <Button variant="tertiary" size="sm" icon="NavArrowDown" ariaExpanded={open} onClick={() => setOpen((o) => !o)}>
        Branch
      </Button>
      {open ? (
        <div className="chip-pop__menu">
          <Menu label="Branches" onClose={() => setOpen(false)}>
            <MenuItem label="All branches" icon={branch ? undefined : 'Check'} onSelect={() => pick(null)} />
            {names.map((n) => (
              <MenuItem key={n} label={n === live.branch ? `${n} · checked out` : n} icon={n === branch ? 'Check' : undefined} onSelect={() => pick(n)} />
            ))}
          </Menu>
        </div>
      ) : null}
    </div>
  );
}
