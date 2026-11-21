// Work · content: the Work board in her Notion lanes (approved page
// /screens/2026-11-22-workboard/, 22 Nov): Ideas, Next, Now, Shipped, Not doing.
// Built from BELLA parts and Flow only, on real data (workModel.js boardModel).
// - Tools row (her pick, section 3): Filter, Sort, Search, Branch, then Board · Table · List;
//   Check again and the Brief kept. New task is the page header's.
// - Cards (section 4, her short-card pick still open): progress as "n of m" and the step now,
//   in TaskCard's line until BELLA's TaskCard has its progress zone (named gap); the whole plan
//   opens on a click (SessionDrawer).
// - Drag (section 6): her published BoardLane drop space, a grey one where the card left and a
//   blue one where it lands; Move to… on the handle is the keyboard way, with Move up and down.
//   Into Now opens the plan first; nothing starts without her Approve. Out of Now to Next pauses
//   it (saved, my pick A still open); back into Now picks it up. Order and pause are saved.
// - A card that needs her opens its review page in full (her pick B, section 7).
import Notification from '@bella/components/Notification/Notification';
import Card from '@bella/components/Card/Card';
import BoardLane, { BoardLaneDropSpace } from '@bella/components/BoardLane/BoardLane';
import Menu, { MenuDivider, MenuItem } from '@bella/components/Menu/Menu';
import Toast from '@bella/components/Toast/Toast';
import TaskCard from '@bella/components/TaskCard/TaskCard';
import Tag from '@bella/components/Tag/Tag';
import ListRow from '@bella/components/ListRow/ListRow';
import DataTable from '@bella/components/DataTable/DataTable';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import SearchField from '@bella/components/SearchField/SearchField';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Button from '@bella/components/Button/Button';
import { useEffect, useRef, useState } from 'react';
import Toasts from '../templates/Toasts.jsx';
import { planRun } from '../templates/RunPlan.jsx';
import Flow from '../templates/Flow.jsx';
import WorkDrawer from './WorkDrawer.jsx';
import useNarrow from '../templates/useNarrow.js';
import useCached from '../templates/useCached.js';
import { AREAS, LANES, LANE_NAMES, going, runnable, saveMove, shown } from './workModel.js';

export const VIEWS = [
  { value: 'board', label: 'Board' },
  { value: 'table', label: 'Table' },
  { value: 'list', label: 'List' },
];

/* the List and Table views show the lane in its own tint's tone */
const LANE_TONE = { ideas: 'neutral', next: 'neutral', now: 'info', shipped: 'success', 'not-doing': 'neutral' };
const tagTone = (t) => (t === 'neutral' ? 'default' : t);
const TABLE_COLUMNS = [
  { key: 'title', label: 'Task', sortable: true },
  { key: 'lane', label: 'Lane', sortable: true, render: (r) => <Tag variant="line" tone={tagTone(LANE_TONE[r.laneId])}>{r.lane}</Tag> },
  { key: 'status', label: 'Status', sortable: true, render: (r) => (r.status ? <Tag variant="line" tone={tagTone(r.tone)}>{r.status}</Tag> : null) },
  { key: 'area', label: 'Area', sortable: true, render: (r) => r.area ?? '' },
  { key: 'who', label: 'Who acts', sortable: true, render: (r) => (r.who ? r.who[0].toUpperCase() + r.who.slice(1) : null) },
];

/* Lanes with nothing in them (Belfast-mode lines); a measured reason replaces the line where there is one. */
const EMPTY = {
  ideas: { mark: '💡', title: 'No ideas', line: 'New task sends one here.' },
  next: { mark: '⏭️', title: 'Nothing lined up', line: 'Drag ideas here in the order you want them.' },
  now: { mark: '🛋️', title: 'Nothing running', line: 'Drag a card into Now to plan it.' },
  shipped: { mark: '📦', title: 'None shipped', line: 'Finished work lands here.' },
  'not-doing': { mark: '🙅', title: 'Nothing ruled out', line: 'Drag here what we won’t do.' },
};

const SORTS = [
  { value: 'mine', label: 'Your order' },
  { value: 'updated', label: 'Last updated' },
  { value: 'started', label: 'When it started' },
];

/* the label on the blue drop space: what the drop does */
function dropLabel(card, from, to) {
  if (to === 'now' && from !== 'now') return going(card) ? 'Drop here to pick it up' : runnable(card) ? 'Drop here to start' : 'Drop here';
  if (from === 'now' && to === 'next' && going(card)) return 'Drop here to pause';
  return 'Drop here';
}

function Lane({ lane, move, why }) {
  const e = why ? { ...EMPTY[lane.id], line: why } : EMPTY[lane.id];
  const d = move.drag;
  const over = move.over?.lane === lane.id ? move.over : null;
  const target = d && over ? <BoardLaneDropSpace key="drop" label={dropLabel(d.card, d.from, lane.id)} style={{ blockSize: d.h }} /> : null;
  const items = lane.cards.flatMap((c) => {
    const lifted = d?.card.id === c.id;
    const card = (
      // the wrapper only names the card for the drop position and hides it while it is lifted (its
      // grey space stands in); the card itself is BELLA's TaskCard as published
      <div key={c.id} data-card={c.id} data-needs={c.needs ? '' : undefined} hidden={lifted && d.shown}>
        <TaskCard
          title={c.title}
          line={c.line}
          status={c.status}
          statusTone={c.tone}
          onOpen={c.open || c.kind === 'session' ? () => move.open(c) : undefined}
          dragging={lifted}
          draggable
          onDragStart={(ev) => move.start(ev, c, lane.id)}
          onDragEnd={move.end}
          onMoveTo={() => move.setMenu(move.menu === c.id ? null : c.id)}
        />
        {move.menu === c.id ? <div ref={(el) => el?.scrollIntoView({ block: 'nearest' })}><MoveMenu card={c} lane={lane} move={move} /></div> : null}
      </div>
    );
    const out = [];
    if (target && over.before === c.id) out.push(target);
    if (lifted && d.shown) out.push(<BoardLaneDropSpace key="origin" kind="origin" style={{ blockSize: d.h }} />);
    out.push(card);
    return out;
  });
  if (target && !over.before) items.push(target);
  return (
    <BoardLane name={lane.name} lane={lane.kind} count={lane.cards.length} headingLevel={2} dropTarget={!!over} empty={<EmptyState size="lane" mark={e.mark} title={e.title} line={e.line} />}>
      {items.length ? items : null}
    </BoardLane>
  );
}

/* the same choice in the Move to… menu, in words */
function moveLabel(card, from, to) {
  if (to === 'now' && from !== 'now' && going(card)) return 'Pick it up (Now)';
  if (to === 'now' && from !== 'now' && runnable(card)) return 'Start it: opens the plan (Now)';
  if (from === 'now' && to === 'next' && going(card)) return 'Pause it (Next)';
  return `Move to ${LANE_NAMES[to]}`;
}

/* The keyboard way (the handle's Move to…): up and down in its lane, then the other lanes. */
function MoveMenu({ card, lane, move }) {
  const i = lane.cards.findIndex((c) => c.id === card.id);
  const pick = (fn) => () => (move.setMenu(null), fn());
  return (
    <Menu label={`Move ${card.title}`} onClose={() => move.setMenu(null)}>
      {i > 0 ? <MenuItem label="Move up" onSelect={pick(() => move.drop(card, lane.id, lane.id, lane.cards[i - 1].id))} /> : null}
      {i >= 0 && i < lane.cards.length - 1 ? <MenuItem label="Move down" onSelect={pick(() => move.drop(card, lane.id, lane.id, lane.cards[i + 2]?.id ?? null))} /> : null}
      {i > 0 || i < lane.cards.length - 1 ? <MenuDivider /> : null}
      {LANES.filter((l) => l.id !== lane.id).map((l) => (
        <MenuItem key={l.id} label={moveLabel(card, lane.id, l.id)} onSelect={pick(() => move.drop(card, lane.id, l.id, null))} />
      ))}
      {card.moved ? <MenuItem label="Put back where CHIP found it" onSelect={pick(() => move.back(card))} /> : null}
    </Menu>
  );
}

/** Drag, drop and Move to…: every move is saved; into Now opens the plan first. */
function useMove({ open }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [menu, setMenu] = useState(null);
  const [notice, setNotice] = useState(null);
  const start = (ev, card, from) => {
    ev.dataTransfer.setData('text/plain', card.id);
    ev.dataTransfer.effectAllowed = 'move';
    const h = ev.currentTarget.getBoundingClientRect().height;
    setDrag({ card, from, h, shown: false });
    // the grey space takes the card's place a frame later, once the browser has its drag picture
    requestAnimationFrame(() => setDrag((x) => (x?.card.id === card.id ? { ...x, shown: true } : x)));
  };
  const end = () => (setDrag(null), setOver(null));
  useEffect(() => {
    if (!drag) return undefined;
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    return () => (window.removeEventListener('dragend', end), window.removeEventListener('drop', end));
  }, [drag]);
  const toast = (tone, message, action) => setNotice({ tone, message, action });
  // Undo puts it back where it was: the lane she had put it in, or where CHIP found it
  const save = async (card, lane, opts, said, from) => {
    try {
      await saveMove(card.id, lane, opts);
      if (said) toast('success', said, { label: 'Undo', onClick: () => (setNotice(null), saveMove(card.id, card.moved ? from : null).catch(() => {})) });
    } catch (err) {
      toast('danger', `Not moved: ${card.title}. ${err.message}`);
    }
  };
  // into Now: the plan opens first (templates/RunPlan.jsx); only her Approve starts the run
  const plan = async (card) => {
    try {
      let brief = card.brief ?? card.runBrief;
      if (!brief && card.check) brief = (await fetch(`/review/${encodeURIComponent(card.check)}`).then((r) => r.json())).brief;
      if (!brief) throw new Error('CHIP has its own fix for this one, so it waits on its review card, not an agent.');
      const run = await planRun({ brief, title: card.title, from: 'Work board' });
      if (!run) return toast('info', `Not started: ${card.title}. The plan was closed, so it stays where it was.`);
      await saveMove(card.id, 'now');
      toast('success', `Started: ${card.title}. It shows in Now on step 1.`);
      window.dispatchEvent(new Event('chip:changed'));
    } catch (err) {
      if (!err.shown) toast('danger', `Not started: ${card.title}. ${err.message}`);
    }
  };
  const drop = (card, from, to, before) => {
    if (!to) return;
    if (to === from && before === card.id) return;
    if (to === 'now' && from !== 'now') {
      if (going(card)) return save(card, null, {}, `Picked up: ${card.title}. Back in Now.`, from);
      if (runnable(card)) return plan(card);
    }
    if (from === 'now' && to === 'next' && going(card))
      return save(card, 'next', { before, paused: true }, `Paused: ${card.title}. Saved in Next; it ${card.kind === 'run' ? 'finishes the step it is on' : 'carries on until its agent reads the board'}.`, from);
    return save(card, to, { before }, to === from ? `Moved: ${card.title}. The new order is saved.` : `Moved to ${LANE_NAMES[to]}: ${card.title}.`, from);
  };
  const back = (card) => save(card, null, {}, `Put back: ${card.title}. It sits where CHIP found it.`);
  return { drag, over, setOver, menu, setMenu, start, end, drop, back, notice, setNotice, open };
}

export default function WorkContent({ model: all, filter: hashFilter = {}, view = 'board', onView, checked, onCheck, loading }) {
  const phone = useNarrow();
  const [briefShut, setBriefShut] = useState(false);
  const [opened, setOpen] = useState(null);
  const [filter, setFilter] = useState(null);
  const [sort, setSort] = useState('mine');
  const [q, setQ] = useState('');
  const [tool, setTool] = useState(null); // 'filter' | 'sort' | 'search'
  const checkAsked = useRef(false);
  // Search opens as its field, ready to type in
  const searchRef = useRef(null);
  useEffect(() => {
    if (tool === 'search') searchRef.current?.querySelector('input')?.focus();
  }, [tool]);
  const model = shown(all, { filter, sort, q, branch: hashFilter.branch });
  // a review page opens in full outside CHIP's frame (her pick B); a pull request on GitHub; a component on its page; the rest in the drawer
  const open = (c) => {
    const o = c.open;
    if (c.kind === 'session') return setOpen({ kind: 'session', card: c });
    if (o.kind === 'page' || o.kind === 'link') return window.open(o.href, '_blank', 'noopener');
    if (o.kind === 'hash') return (window.location.hash = o.href);
    setOpen(o);
  };
  const move = useMove({ open });
  // over a lane: the blue space goes before the first card whose middle is below the pointer
  const onDragOver = (ev) => {
    if (!move.drag) return;
    const el = ev.target.closest?.('[data-bella-component="board-lane"]');
    const lane = LANES.find((l) => l.name === el?.querySelector('h2')?.textContent);
    if (!lane) return;
    ev.preventDefault();
    // in Now, what needs you stays on top: a card lands under it
    const cards = [...el.querySelectorAll('[data-card]')].filter((c) => !c.hidden && !(lane.id === 'now' && c.hasAttribute('data-needs')));
    const before = cards.find((c) => {
      const r = c.getBoundingClientRect();
      return ev.clientY < r.top + r.height / 2;
    })?.dataset.card ?? null;
    if (move.over?.lane !== lane.id || move.over?.before !== before) move.setOver({ lane: lane.id, before });
  };
  const onDrop = (ev) => {
    const d = move.drag;
    const o = move.over;
    move.end();
    if (!d || !o) return;
    ev.preventDefault();
    move.drop(d.card, d.from, o.lane, o.before);
  };
  const now = all?.lanes.find((l) => l.id === 'now')?.cards ?? [];
  const working = now.filter((c) => !c.needs).length;
  const waiting = now.filter((c) => c.needs).length;
  const filterLabel = filter === 'needs' ? 'Needs you' : filter === 'components' ? 'Components that need work' : filter?.startsWith('area:') ? filter.slice(5) : filter?.startsWith('lane:') ? `Lane: ${LANE_NAMES[filter.slice(5)]}` : null;
  return (
    <>
      {/* Tools row: what the board shows and the last check on the left; Filter, Sort, Search, Branch and the views on the right */}
      <Flow direction={phone ? 'column' : 'row'} gap={16} justify="between" align={phone ? 'start' : 'center'} grow={phone ? undefined : 'first'}>
        <Flow direction="row" gap={16} wrap align="center">
          {filterLabel ? (
            <FilterChip pressed onClick={() => setFilter(null)} ariaLabel={`${filterLabel}, ${model?.total ?? 0} cards. Clear the filter`}>
              {`${filterLabel} · ${model?.total ?? 0}`}
            </FilterChip>
          ) : (
            <TextStack title={all ? `${working} at work · ${waiting} wait on you` : 'Reading the board'} />
          )}
          <Flow direction="row" gap={8} align="center">
            {checked ? <TextStack subtitle={`Checked ${checked}`} /> : null}
            <Button variant="tertiary" size="sm" icon="RefreshDouble" leadingIcon busy={!!loading} onClick={() => ((checkAsked.current = true), onCheck?.())}>
              {loading ? 'Checking…' : 'Check again'}
            </Button>
          </Flow>
        </Flow>
        <Flow direction="row" gap={8} align="center" justify="end" wrap stretch={phone}>
          <div className="chip-pop">
            <Button variant="tertiary" size="sm" iconOnly icon="FilterList" ariaLabel="Filter" ariaExpanded={tool === 'filter'} onClick={() => setTool((t) => (t === 'filter' ? null : 'filter'))} />
            {tool === 'filter' ? (
              <div className="chip-pop__menu">
                <Menu label="Filter" onClose={() => setTool(null)}>
                  <MenuItem label="Everything" icon={filter ? undefined : 'Check'} onSelect={() => (setFilter(null), setTool(null))} />
                  <MenuItem label={`Needs you · ${waiting}`} icon={filter === 'needs' ? 'Check' : undefined} onSelect={() => (setFilter('needs'), setTool(null))} />
                  <MenuItem label={`Components that need work · ${all?.components ?? 0}`} icon={filter === 'components' ? 'Check' : undefined} onSelect={() => (setFilter('components'), setTool(null))} />
                  <MenuDivider />
                  {AREAS.map((a) => (
                    <MenuItem key={a} label={a} icon={filter === `area:${a}` ? 'Check' : undefined} onSelect={() => (setFilter(`area:${a}`), setTool(null))} />
                  ))}
                  <MenuDivider />
                  {LANES.map((l) => (
                    <MenuItem key={l.id} label={`Lane: ${l.name}`} icon={filter === `lane:${l.id}` ? 'Check' : undefined} onSelect={() => (setFilter(`lane:${l.id}`), setTool(null))} />
                  ))}
                </Menu>
              </div>
            ) : null}
          </div>
          <div className="chip-pop">
            <Button variant="tertiary" size="sm" iconOnly icon="NavArrowUpDown" ariaLabel={`Sort: ${SORTS.find((s) => s.value === sort).label}`} ariaExpanded={tool === 'sort'} onClick={() => setTool((t) => (t === 'sort' ? null : 'sort'))} />
            {tool === 'sort' ? (
              <div className="chip-pop__menu">
                <Menu label="Sort" onClose={() => setTool(null)}>
                  {SORTS.map((s) => (
                    <MenuItem key={s.value} label={s.label} icon={sort === s.value ? 'Check' : undefined} onSelect={() => (setSort(s.value), setTool(null))} />
                  ))}
                </Menu>
              </div>
            ) : null}
          </div>
          {tool === 'search' || q ? (
            <div ref={searchRef}>
              <SearchField label="Search the board" placeholder="Search cards" value={q} onChange={setQ} />
            </div>
          ) : (
            <Button variant="tertiary" size="sm" iconOnly icon="Search" ariaLabel="Search the board" onClick={() => setTool('search')} />
          )}
          <BranchPicker branch={hashFilter.branch} />
          <SegmentedControl options={VIEWS} value={view} onChange={onView} label="Work view" />
        </Flow>
      </Flow>
      {!model ? (
        <EmptyState size="lane" mark="⏳" title="Reading the board" line="Fetching the sessions, what needs you and the ideas." />
      ) : (
        <>
          {model.brief && !briefShut ? (
            <Notification tone="info" title="Brief · from CHIP’s checks" message={model.brief.message} action={model.brief.action && model.brief.open ? { label: model.brief.action, onClick: () => open({ open: model.brief.open }) } : undefined} onClose={() => setBriefShut(true)} closeLabel="Hide the brief" />
          ) : null}
          {move.notice ? (
            <Toasts>
              <Toast tone={move.notice.tone} action={move.notice.action} onClose={() => move.setNotice(null)}>
                {move.notice.message}
              </Toast>
            </Toasts>
          ) : null}
          <WorkDrawer item={opened} onClose={() => setOpen(null)} onNotice={(n) => move.setNotice({ tone: n.tone, message: `${n.title}. ${n.message}` })} onChanged={() => window.dispatchEvent(new Event('chip:changed'))} onAccepted={() => (setOpen(null), window.dispatchEvent(new Event('chip:changed')))} />
          {view === 'table' ? (
            model.total ? (
              <DataTable caption="Every card on the board" columns={TABLE_COLUMNS} rows={model.lanes.flatMap((l) => l.cards.map((c) => ({ ...c, lane: l.name, laneId: l.id })))} rowKey="id" />
            ) : (
              <EmptyState size="lane" mark="🔍" title="No cards" line={filterLabel || q ? 'Nothing matches. Clear the filter or the search.' : 'Nothing on the board.'} />
            )
          ) : view === 'list' ? (
            <Card>
              <Flow gap={16}>
                <SectionHead icon="Clock" iconTone="info" title="Every card" description="The board, as rows" number={model.total} words={model.total === 1 ? 'card' : 'cards'} />
                {model.total ? (
                  <Flow as="ul" gap={8} aria-label="All cards">
                    {model.lanes.flatMap((l) =>
                      l.cards.map((c) => (
                        <ListRow key={c.id} layout="stacked" divider statusBar={LANE_TONE[l.id]} overline={l.name} title={c.title} description={c.line} trailing={c.open || c.kind === 'session' ? true : undefined} onClick={c.open || c.kind === 'session' ? () => open(c) : undefined} />
                      )),
                    )}
                  </Flow>
                ) : (
                  <EmptyState size="lane" mark="🔍" title="No cards" line="Nothing matches. Clear the filter or the search." />
                )}
              </Flow>
            </Card>
          ) : (
            <Flow board direction="row" gap={24} aria-label="Work board" onDragOver={onDragOver} onDrop={onDrop}>
              {model.lanes.map((l) => (
                <Lane key={l.id} lane={l} move={move} why={filterLabel || q ? 'Nothing here matches the filter or the search.' : model.why?.[l.id]} />
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
        {branch ?? 'Branch'}
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
