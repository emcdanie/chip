// Work · content: the Work board in her Notion lanes (approved page
// /screens/2026-11-22-workboard/, 22 Nov): Ideas, Next, Now, Shipped, Not doing.
// Built from BELLA parts and Flow only, on real data (workModel.js boardModel).
// - Tools row (her pick, section 3): Filter, Sort, Search, then Board · Table (List taken out, 23 Nov: it added nothing
//   beside the board and the table, only an extra button);
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
import BoardLane, { BoardLaneDropSpace } from '@bella/components/BoardLane/BoardLane';
import Menu, { MenuDivider, MenuItem } from '@bella/components/Menu/Menu';
import Toast from '@bella/components/Toast/Toast';
import TaskCard from '@bella/components/TaskCard/TaskCard';
import LastRun from '@bella/components/LastRun/LastRun';
import { clockWords, tookWords } from '../runClock.js';
import Tag from '@bella/components/Tag/Tag';
import DataTable from '@bella/components/DataTable/DataTable';
import TextStack from '@bella/components/TextStack/TextStack';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import SearchField from '@bella/components/SearchField/SearchField';
import FilterChip from '@bella/components/FilterChip/FilterChip';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Progress from '@bella/components/Progress/Progress';
import Button from '@bella/components/Button/Button';
import { useEffect, useRef, useState } from 'react';
import Toasts from '../templates/Toasts.jsx';
import { planRun } from '../templates/RunPlan.jsx';
import Flow from '../templates/Flow.jsx';
import ResultsBar from '../templates/ResultsBar.jsx';
import NoResults from '../templates/NoResults.jsx';
import WorkDrawer from './WorkDrawer.jsx';
import NeedsYouView from './NeedsYouView.jsx';
import useNarrow from '../templates/useNarrow.js';
import useCached from '../templates/useCached.js';
import { AREAS, LANES, LANE_NAMES, filterFromHash, going, projectStats, runnable, saveMove, shown } from './workModel.js';

export const VIEWS = [
  { value: 'board', label: 'Board' },
  { value: 'table', label: 'Table' },
];

/* the Table view shows the lane in its own tint's tone */
// the lane tags follow the lane washes (23 Nov): Ideas ochre, Next navy, Now blue, Shipped green, Not doing pink
const LANE_TONE = { ideas: 'ochre', next: 'navy', now: 'info', shipped: 'success', 'not-doing': 'pink' };
const tagTone = (t) => (t === 'neutral' ? 'default' : t);
// status sorts by urgency, not alphabet (second pass S5): failed, then waiting on her, then working, quiet, done
const URGENCY = { danger: 0, attention: 1, info: 2, neutral: 3, success: 4 };
const TABLE_COLUMNS = [
  { key: 'title', label: 'Task', sortable: true },
  { key: 'lane', label: 'Lane', sortable: true, render: (r) => <Tag variant="solid" tone={tagTone(LANE_TONE[r.laneId])}>{r.lane}</Tag> },
  { key: 'status', label: 'Status', sortable: true, sortValue: (r) => URGENCY[r.tone] ?? 5, render: (r) => (r.status ? <Tag variant="line" tone={tagTone(r.tone)}>{r.status}</Tag> : null) },
  { key: 'area', label: 'Area', sortable: true, render: (r) => r.area ?? '' },
  { key: 'who', label: 'Who acts', sortable: true, render: (r) => (r.who ? r.who[0].toUpperCase() + r.who.slice(1) : null) },
];

/* Lanes with nothing in them (Belfast-mode lines); a measured reason replaces the line where there is one. */
const EMPTY = {
  ideas: { mark: '💡', title: 'No ideas', line: 'New task sends one here.' },
  next: { mark: '⏭️', title: 'Nothing lined up', line: 'Drag ideas here in the order you want them.' },
  now: { mark: '🛋️', title: 'Nothing running', line: 'Drag a card into Now to plan it.' },
  shipped: { mark: '📦', title: 'None shipped', line: 'Finished work lands here.' },
  'not-doing': { mark: '🙅‍♀️', title: 'Nothing ruled out', line: 'Drag here what we won’t do.' },
};

const SORTS = [
  { value: 'mine', label: 'Your order' },
  { value: 'updated', label: 'Last updated' },
  { value: 'started', label: 'When it started' },
];

/* The short card (section 4, 23 Nov: "i like these and i dont see them in the board yet"): TaskCard draws
   one bar with "n of m" beside it and the step running now from its progress props; every card with work
   carries c.progress ({ state, done, total, now }) and c.what (the line without the count). A card with no
   steps keeps its one line. A picture thumbnail in the card is a named gap: TaskCard has no picture part. */
const hasProgress = (c) => !!c.progress && c.progress.state !== 'blank' && c.progress.total > 0 && !!c.what;
const cardLine = (c) => (hasProgress(c) ? c.what : c.line);
/* Steps done, the step running and what is left (feedback plan 23 Nov: "every card shows how far along it is"): the bar says done of
   all, the step row the one running, and this the ones left; a card that is going also counts its time and the last step's age. */
const stepsLeft = (p) => (p.state === 'error' ? undefined : p.state === 'done' ? 0 : Math.max(0, p.total - p.done - (p.state === 'working' ? 1 : 0)));
const goingNow = (c) => hasProgress(c) && c.progress.state === 'working' && !c.paused;

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
          line={cardLine(c)}
          progress={hasProgress(c)}
          progressDone={c.progress?.done}
          progressTotal={c.progress?.total}
          stepNow={hasProgress(c) && c.progress.state !== 'done' ? c.progress.now ?? undefined : undefined}
          progressLeft={hasProgress(c) ? stepsLeft(c.progress) : undefined}
          since={goingNow(c) ? c.startedAt ?? undefined : undefined}
          lastStepAt={goingNow(c) ? c.lastStepAt ?? undefined : undefined}
          paused={!!c.paused}
          stopped={hasProgress(c) && c.progress.state === 'error'}
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

export default function WorkContent({ model: all, filter: hashFilter = {}, view = 'board', onView, checked, unread = [], last, onCheck, loading }) {
  const phone = useNarrow();
  const { data: proj, reload: reloadProj } = useCached(['/projects']);
  useEffect(() => {
    window.addEventListener('chip:changed', reloadProj);
    return () => window.removeEventListener('chip:changed', reloadProj);
  }, [reloadProj]);
  const projects = (proj?.[0]?.projects ?? []).filter((p) => /^[\w &-]{1,40}$/.test(p.name));
  const [briefShut, setBriefShut] = useState(false);
  const [opened, setOpen] = useState(null);
  // the filter starts from the address, so the side menu's "Needs you" opens the board filtered
  // the project is its own choice beside the filter (second pass M21: a project plus one filter, e.g. BELLA and Needs you)
  const split = (f) => (f?.startsWith('project:') ? { filter: null, project: f.slice(8) } : { filter: f ?? null, project: null });
  const [filter, setFilterNow] = useState(split(hashFilter.filter).filter);
  const [project, setProjectNow] = useState(split(hashFilter.filter).project);
  useEffect(() => {
    const on = () => {
      const h = split(filterFromHash().filter);
      setFilterNow(h.filter);
      setProjectNow(h.project ?? new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('project'));
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  // picking or clearing one keeps the address in step, so a reload or a shared link shows the same board
  const setProject = (name) => {
    setProjectNow(name);
    const a = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    name ? a.set('project', name) : a.delete('project');
    const next = `#/work${a.toString() ? `?${a}` : ''}`;
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  };
  const setFilter = (f) => {
    if (f?.startsWith('project:')) return setProject(f.slice(8));
    setFilterNow(f);
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    if (f) q.set('filter', f);
    else q.delete('filter');
    const next = `#/work${q.toString() ? `?${q}` : ''}`;
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  };
  // search and sort come from the address and go back into it (search-filter plan, 23 Nov: a list's state is a link)
  const fromAddr = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const [sort, setSort] = useState(SORTS.some((s) => s.value === fromAddr.get('sort')) ? fromAddr.get('sort') : 'mine');
  const [q, setQ] = useState((fromAddr.get('q') ?? '').slice(0, 80));
  // the Table's sort is held here, so the toolbar's Sort button and menu follow the headers (second pass S4)
  const [tsort, setTsort] = useState(() => {
    const [key, direction] = (fromAddr.get('tsort') ?? '').split(':');
    return TABLE_COLUMNS.some((c) => c.sortable && c.key === key) && ['ascending', 'descending'].includes(direction) ? { key, direction } : null;
  });
  useEffect(() => {
    const a = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    q ? a.set('q', q) : a.delete('q');
    sort !== 'mine' ? a.set('sort', sort) : a.delete('sort');
    tsort ? a.set('tsort', `${tsort.key}:${tsort.direction}`) : a.delete('tsort');
    const next = `#/work${a.toString() ? `?${a}` : ''}`;
    if (window.location.hash.startsWith('#/work') && window.location.hash !== next) window.history.replaceState(null, '', next);
  }, [q, sort, tsort]);
  const [tool, setTool] = useState(null); // 'filter' | 'sort' | 'search'
  const checkAsked = useRef(false);
  // a menu that closes hands focus back to the button that opened it (second pass S10)
  const lastTool = useRef(null);
  useEffect(() => {
    if (!tool && lastTool.current) document.querySelector(`[data-tool="${lastTool.current}"] button`)?.focus();
    lastTool.current = tool === 'filter' || tool === 'sort' ? tool : null;
  }, [tool]);
  // Search opens as its field, ready to type in
  const searchRef = useRef(null);
  useEffect(() => {
    if (tool === 'search') searchRef.current?.querySelector('input')?.focus();
  }, [tool]);
  // Esc takes the filter, the sort and the search off (nothing open: the menus and the search field keep their own Esc)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || tool || e.defaultPrevented || (e.target.closest?.('input, textarea, [role="dialog"], [role="menu"]'))) return;
      setSort('mine');
      setTsort(null);
      setQ('');
      setFilter(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const model = shown(all, { filter, project, sort, q });
  // every Filter item says how many cards it would show with the project and search that are on (second pass M21)
  const count = (f) => shown(all, { filter: f, project, q }).total;
  const tcol = tsort && TABLE_COLUMNS.find((c) => c.key === tsort.key);
  const sortOn = view === 'table' ? !!tsort : sort !== 'mine';
  const sortLabel = view === 'table' ? (tsort ? `${tcol.label}, ${tsort.direction === 'ascending' ? 'up' : 'down'}` : 'Your order') : SORTS.find((x) => x.value === sort).label;
  const sortOff = () => (view === 'table' ? setTsort(null) : setSort('mine'));
  // a review page that needs her opens inside CHIP over the board (her pick A, 23 Nov); a pull request on GitHub; a component on its page; the rest in the drawer
  const [reviewing, setReviewing] = useState(null);
  const open = (c) => {
    const o = c.open;
    if (c.kind === 'session') return setOpen({ kind: 'session', card: c });
    // every card that needs her opens the Needs you view, where she goes through them all and marks them up (her pick
    // A, 23 Nov 23:00: "every new needs you card opens on this view, that's really helpful"); a card with no picture shows
    // its summary there with Open it, which then opens it the old way
    if (c.needs && !c.fromNeedsView) return setReviewing(c.id);
    if (o.kind === 'page') return setReviewing(c.id); // a review page opens inside CHIP, needs her or not
    if (o.kind === 'link') return window.open(o.href, '_blank', 'noopener');
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
  // the project chip (23 Nov): the counts above the lanes and in the tools row are the picked project's, read from its cards
  const projectName = project ? (projects.find((p) => p.id === project || p.name.toLowerCase() === project.toLowerCase())?.name ?? project) : null;
  const stats = projectStats(all, projectName);
  const working = stats.now;
  const waiting = stats.waiting;
  const everything = (all?.lanes ?? []).reduce((n, l) => n + l.cards.length, 0);
  const filterLabel = filter === 'needs' ? 'Needs you' : filter === 'components' ? 'Components that need work' : filter?.startsWith('area:') ? filter.slice(5) : filter?.startsWith('project:') ? (projects.find((p) => p.id === filter.slice(8) || p.name.toLowerCase() === filter.slice(8).toLowerCase())?.name ?? filter.slice(8)) : filter?.startsWith('lane:') ? `Lane: ${LANE_NAMES[filter.slice(5)]}` : null;
  return (
    <>
      {/* Tools row, full width (23 Nov: "i want this to span so the numerical values are on the right"): Filter, Sort,
          Search on the left; the count, the last check and the views on the right. */}
      {reviewing ? null : <Flow sticky={!phone} style={phone ? undefined : { background: 'var(--color-background-default)', insetBlockStart: 'calc(var(--spacing-24) * -1)', paddingBlock: 'var(--spacing-24) var(--spacing-8)', marginBlockStart: 'calc(var(--spacing-24) * -1)' }} gap={16}>
        <Flow direction={phone ? 'column' : 'row'} gap={16} justify="between" align={phone ? 'start' : 'center'}>
        <Flow direction="row" gap={8} align="center" wrap stretch={phone}>
          <div data-tool="filter" className="chip-pop" style={phone ? { position: 'static' } : undefined}>
            <Button variant="tertiary" size="sm" iconOnly icon="FilterList" ariaLabel="Filter" ariaPressed={!!filter} ariaExpanded={tool === 'filter'} onClick={() => setTool((t) => (t === 'filter' ? null : 'filter'))} />
            {tool === 'filter' ? (
              <div className="chip-pop__menu" style={phone ? { marginInlineStart: 'var(--spacing-16)' } : undefined}>
                <Menu label="Filter" onClose={() => setTool(null)}>
                  <MenuItem label={`Everything · ${count(null)}`} icon={filter ? undefined : 'Check'} onSelect={() => (setFilter(null), setTool(null))} />
                  <MenuItem label={`Needs you · ${count('needs')}`} icon={filter === 'needs' ? 'Check' : undefined} onSelect={() => (setFilter('needs'), setTool(null))} />
                  <MenuItem label={`Components that need work · ${count('components')}`} icon={filter === 'components' ? 'Check' : undefined} onSelect={() => (setFilter('components'), setTool(null))} />
                  <MenuDivider />
                  {AREAS.map((a) => (
                    <MenuItem key={a} label={`${a} · ${count(`area:${a}`)}`} icon={filter === `area:${a}` ? 'Check' : undefined} onSelect={() => (setFilter(`area:${a}`), setTool(null))} />
                  ))}
                  <MenuDivider />
                  {LANES.map((l) => (
                    <MenuItem key={l.id} label={`Lane: ${l.name} · ${count(`lane:${l.id}`)}`} icon={filter === `lane:${l.id}` ? 'Check' : undefined} onSelect={() => (setFilter(`lane:${l.id}`), setTool(null))} />
                  ))}
                </Menu>
              </div>
            ) : null}
          </div>
          <div data-tool="sort" className="chip-pop" style={phone ? { position: 'static' } : undefined}>
            <Button variant="tertiary" size="sm" iconOnly icon="NavArrowUpDown" ariaLabel={`Sort: ${sortLabel}`} ariaPressed={sortOn} ariaExpanded={tool === 'sort'} onClick={() => setTool((t) => (t === 'sort' ? null : 'sort'))} />
            {tool === 'sort' ? (
              <div className="chip-pop__menu" style={phone ? { marginInlineStart: 'var(--spacing-16)' } : undefined}>
                <Menu label="Sort" onClose={() => setTool(null)}>
                  {view === 'table' ? (
                    <>
                      <MenuItem label="Your order" icon={tsort ? undefined : 'Check'} onSelect={() => (setTsort(null), setTool(null))} />
                      {TABLE_COLUMNS.filter((c) => c.sortable).map((c) => (
                        <MenuItem key={c.key} label={c.label} icon={tsort?.key === c.key ? 'Check' : undefined} onSelect={() => (setTsort({ key: c.key, direction: 'ascending' }), setTool(null))} />
                      ))}
                    </>
                  ) : (
                    SORTS.map((s) => <MenuItem key={s.value} label={s.label} icon={sort === s.value ? 'Check' : undefined} onSelect={() => (setSort(s.value), setTool(null))} />)
                  )}
                </Menu>
              </div>
            ) : null}
          </div>
          {tool === 'search' || q ? (
            <div ref={searchRef}>
              <SearchField label="Search the board" placeholder="Search cards" showShortcut={false} value={q} onChange={setQ} />
            </div>
          ) : (
            <Button variant="tertiary" size="sm" iconOnly icon="Search" ariaPressed={!!q} ariaLabel="Search the board" onClick={() => setTool('search')} />
          )}
        </Flow>
        <Flow direction="row" gap={16} wrap align="center" justify={phone ? 'start' : 'end'}>
          <TextStack title={all ? `${working} at work · ${waiting} wait on you` : 'Reading the board'} />
          <Flow direction="row" gap={8} align="center">
            {last ? <LastRun when={clockWords(last.at)} took={tookWords(last.tookMs)} result={last.found} /> : checked ? <TextStack subtitle={`Checked ${checked}${unread.length ? ` · could not read: ${[...new Set(unread.map((u) => u.why))].join('; ')}` : ''}`} /> : null}
            <Button variant="tertiary" size="sm" icon="RefreshDouble" leadingIcon busy={!!loading} onClick={() => ((checkAsked.current = true), onCheck?.())}>
              {loading ? 'Checking…' : 'Check again'}
            </Button>
          </Flow>
          <SegmentedControl options={VIEWS} value={view} onChange={onView} label="Work view" />
        </Flow>
      </Flow>
        {/* the project filter (New, 23 Nov): one chip per project, read from /projects: CHIP, Site, BELLA and the ones made
            in New. Inside the sticky tools block, so it stays in view and never scrolls under the tools row (24 Nov: it
            showed cut off under it). Not on the tools line itself: at 1440 the tools and the four chips need about 1200
            of the 1144 there is. */}
        {!all || (projects?.length ?? 0) < 2 ? null : (
          <Flow direction="row" gap={8} wrap align="center" role="group" aria-label="Project">
            <FilterChip pressed={!project} onClick={() => project && setProject(null)}>
              All
            </FilterChip>
            {projects.map((p) => (
              <FilterChip key={p.id} pressed={project?.toLowerCase() === p.name.toLowerCase() || project?.toLowerCase() === p.id.toLowerCase()} onClick={() => setProject(project?.toLowerCase() === p.name.toLowerCase() || project?.toLowerCase() === p.id.toLowerCase() ? null : p.name)}>
                {p.name}
              </FilterChip>
            ))}
          </Flow>
        )}
      </Flow>}
      {/* where the picked project stands: its own numbers and a bar, counted from its cards; on a phone the short form (the line above already says now and waiting) */}
      {reviewing || !all || !projectName || stats.cards === 0 ? null : (
        <Progress label={projectName} value={phone ? `${stats.shipped} of ${stats.total} shipped` : `${stats.shipped} shipped · ${stats.now} now · ${stats.waiting} waiting on you`} fill={stats.total ? Math.round((100 * stats.shipped) / stats.total) : 0} tone="success" summary={`${projectName}: ${stats.shipped} shipped, ${stats.now} now, ${stats.waiting} waiting on you.`} />
      )}
      {/* what is on, with a way off, and how much of the board it leaves (feedback for Filter, Sort and Search) */}
      {reviewing || !all || !(filter || sortOn || q) ? null : (
        <ResultsBar
          applied={[
            filter && { key: 'filter', label: `Filtered by: ${filterLabel}`, removeLabel: `Filtered by ${filterLabel}. Take the filter off`, onRemove: () => setFilter(null) },
            sortOn && { key: 'sort', label: `Sorted by: ${sortLabel.toLowerCase()}`, removeLabel: 'Back to your order', onRemove: sortOff },
            q && { key: 'q', label: `Search: ${q}`, removeLabel: `Searching for ${q}. Take the search off`, onRemove: () => setQ('') },
          ].filter(Boolean)}
          shown={model?.total}
          total={project ? shown(all, { project }).total : everything}
          onClearAll={() => (setSort('mine'), setTsort(null), setQ(''), setFilter(null))}
        />
      )}
      {!model ? (
        <EmptyState size="lane" mark="⏳" title="Reading the board" line="Fetching the sessions, what needs you and the ideas." />
      ) : (
        <>
          {model.brief && !briefShut && !reviewing ? (
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
          {reviewing ? (
            <NeedsYouView
              cards={model.lanes.flatMap((l) => l.cards).filter((c) => c.needs || c.id === reviewing)}
              startId={reviewing}
              onBack={() => setReviewing(null)}
              onOpenOther={(c) => (setReviewing(null), open({ ...c, fromNeedsView: true }))}
              onNotice={(n) => move.setNotice({ tone: n.tone, message: `${n.title}. ${n.message}` })}
            />
          ) : projectName && stats.cards === 0 && !q ? (
            <EmptyState size="page" mark="🔌" title={`Nothing from ${projectName} is on the board`} line={`No card is tagged ${projectName}. Start a task for it from New, or connect a Claude Code session working in its folder, and its cards show here.`} />
          ) : model.total === 0 && (filter || q) ? (
            <NoResults
              noun="cards"
              what={q ? `“${q}”${filter ? ` in ${filterLabel}` : ''}` : filterLabel}
              on={[
                filter && { key: 'filter', label: filterLabel, would: shown(all, { filter: null, sort, q }).total, onRemove: () => setFilter(null) },
                q && { key: 'q', label: `search “${q}”`, would: shown(all, { filter, sort, q: '' }).total, onRemove: () => setQ('') },
              ].filter(Boolean)}
              onClearAll={() => (setSort('mine'), setTsort(null), setQ(''), setFilter(null))}
            />
          ) : view === 'table' ? (
            model.total ? (
              <DataTable caption="Every card on the board" columns={TABLE_COLUMNS} rows={model.lanes.flatMap((l) => l.cards.map((c) => ({ ...c, lane: l.name, laneId: l.id })))} rowKey="id" sort={tsort} onSortChange={setTsort} freezeFirst onOpen={(id) => { const c = model.lanes.flatMap((l) => l.cards).find((x) => x.id === id); if (c) open(c); }} />
            ) : (
              <EmptyState size="lane" mark="🔍" title="No cards" line="Nothing on the board." />
            )
          ) : (
            <Flow board direction="row" gap={24} aria-label="Work board" onDragOver={onDragOver} onDrop={onDrop}>
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
