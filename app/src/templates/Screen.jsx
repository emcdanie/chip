// CHIP / Screen: the code twin of the Figma template (CHIP Dashboard
// 601:112027). One shell for every new page: the side menu (her nav C pick,
// 22 Nov), the top bar with where you are, then the page header, its tabs and
// the content slot.
// A page is this template plus one content component (Figma's slot fill);
// pages pass words and parts, never styles (scripts/on-system-guard.mjs).
//
// Built only from published BELLA parts. The grid is the one template CSS
// file (Screen.css), token values only. Data is CHIP's own where it has it
// (/projects, /needs); anything CHIP does not measure shows no number.
import { useEffect, useState } from 'react';
import useCached from './useCached.js';
import SideMenu from '@bella/components/SideMenu/SideMenu';
import NavList from '@bella/components/NavList/NavList';
import Menu, { MenuItem } from '@bella/components/Menu/Menu';
import TopBar from '@bella/components/TopBar/TopBar';
import PageHeader from '@bella/components/PageHeader/PageHeader';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import Drawer from '@bella/components/Drawer/Drawer';
import Button from '@bella/components/Button/Button';
import Tooltip from '@bella/components/Tooltip/Tooltip';
import Avatar from '@bella/components/Avatar/Avatar';
import Progress from '@bella/components/Progress/Progress';
import TextStack from '@bella/components/TextStack/TextStack';
import Input from '@bella/components/Input/Input';
import Notification from '@bella/components/Notification/Notification';
import Flow from './Flow.jsx';
import Search from './Search.jsx';
import { useHealth } from '../pages/healthModel.js';
import useNarrow from './useNarrow.js';
import WorkDock, { openWork } from './WorkDock.jsx';

// A page opens at its top with nothing scrolled or focused, unless a link
// names a section (Elleta, 20 Nov 2026: "the pages open to weird places").
// The one reset for every CHIP page: main.jsx calls it when the address moves
// to another page, the old app (App.jsx) when its view changes. A section
// link scrolls after this runs, so it still wins. The browser's own restore
// (reload, Back) is off for the same reason.
if (typeof history !== 'undefined' && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
export function openAtTop() {
  window.scrollTo(0, 0);
  // the window no longer scrolls; the page's content does (READ FIRST, 22 Nov)
  document.querySelector('.chip-screen__content')?.scrollTo(0, 0);
}
import { boardModel, filterFromHash } from '../pages/workModel.js';
import { PROJECT_VIEWS } from './projectViews.js';
import { useTheme } from '../theme.js';
import './Screen.css';

/* CHIP's own data for the panel, kept between pages (useCached) so the
 * Projects group never blanks while a page loads. The Status counts are the
 * Work board's own lanes (workModel), so the panel and the board always agree;
 * 0 is a real count (no runs), shown as Figma shows it. */
function useShellData() {
  // the same reads as the Work board (useCached shares them), so the menu's Needs you count is the board's own
  const { data, reload } = useCached(['/needs', '/runs', '/gaps']);
  const { data: proj } = useCached(['/projects']);
  const { data: extra, reload: reloadExtra } = useCached(['/work/lanes']);
  const { data: board, reload: reloadBoard } = useCached(['/work/board']);
  // a move, a run or an Accept anywhere: the count follows at once
  useEffect(() => {
    const on = () => (reload(), reloadExtra(), reloadBoard());
    window.addEventListener('chip:changed', on);
    return () => window.removeEventListener('chip:changed', on);
  }, [reload, reloadExtra, reloadBoard]);
  const projects = proj?.[0]?.projects ?? null;
  if (!data) return { projects, needs: null };
  const [n, r, g] = data;
  const model = boardModel({ needs: n?.items ?? [], runs: r?.runs ?? [], runBase: r?.base ?? null, lanes: extra?.[0] ?? null, board: board?.[0] ?? null, gaps: g?.gaps ?? null });
  // what waits on her: the cards in Now that need her, the number the board's Needs you filter shows
  const needs = (model.lanes.find((l) => l.id === 'now')?.cards ?? []).filter((c) => c.needs).length;
  return { projects, needs };
}

/* Back and Forward, from the app's own history (the hash routes), also Alt+Left and Alt+Right (CHIP rule "Minimal
   chrome": small icon buttons in the top bar). Disabled when there is nowhere to go; the browser's Navigation API
   says so where it exists, elsewhere both stay available and do nothing at the ends. */
function useHistoryState() {
  const nav = typeof window !== 'undefined' ? window.navigation : null;
  const read = () => ({ back: nav ? nav.canGoBack : true, forward: nav ? nav.canGoForward : true });
  const [state, setState] = useState(read);
  useEffect(() => {
    if (!nav) return undefined;
    const on = () => setState(read());
    nav.addEventListener('currententrychange', on);
    on();
    return () => nav.removeEventListener('currententrychange', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // a field keeps its own word-jump
      e.preventDefault();
      if (e.key === 'ArrowLeft') window.history.back();
      else window.history.forward();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return state;
}

/* The one side menu (her nav C pick, 22 Nov), in her words: where you go, what is pinned, the projects,
   and Team and Settings at the foot. One current item, the page you are on (aria-current page): a pinned
   page wins over its project, so Components marks Components, the other CHIP tabs mark CHIP. Branches
   filter the board from Work's own control bar, so no branch name sits in the menu. Site and BELLA open
   the old app's project page until theirs are rebuilt. */
const projectOf = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('project');

function menuModel({ place, tab, projects, needs, filter, onSearch }) {
  const needsHere = tab === 'work' && new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('filter') === 'needs';
  return {
    items: [
      { label: 'Search', icon: 'Search', onClick: onSearch },
      { label: 'Home', href: '#/home', icon: 'Home', current: place === 'home' },
      { label: 'Needs you', href: '#/work?filter=needs', icon: 'Bell', badge: needs || undefined, current: needsHere },
      { label: 'Not again', href: '#/not-again', icon: 'Book', current: place === 'not-again' },
    ],
    pinned: [
      { label: 'Components', href: '#/components', icon: 'ViewGrid', current: tab === 'components' },
      { label: 'System map', href: '#/system-map', icon: 'Map', current: place === 'map' },
    ],
    // every project opens the new board (23 Nov: "the old board show when i click projects like site")
    projects: (projects ?? []).map((p) => ({ label: p.name, href: p.id === 'chip' ? '#/work' : `#/work?project=${p.id}`, current: p.id === (projectOf() ?? 'chip') && place === 'projects' && tab !== 'components' && !needsHere })),
    foot: [
      { label: 'Team', href: '#/team', icon: 'Group', current: place === 'team' },
      { label: 'Settings', href: '#/connectors', icon: 'Settings', current: place === 'settings' },
    ],
  };
}

// where a new task goes: the progress board, as Team's replies and Playground's notes
const BOARD = 'http://localhost:3123';

/* New task (Figma's page header action): a sentence, sent to the progress board. */
/** variant: white (secondary) where the page's card holds the committing action (her y28 B). */
export function NewTask({ variant = 'primary' }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [said, setSaid] = useState(null); // 'sent' | 'failed'
  async function send() {
    try {
      const r = await fetch(`${BOARD}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'task', text: text.trim(), page: window.location.hash }) });
      if (!r.ok) throw new Error(String(r.status));
      setText('');
      setOpen(false);
      setSaid('sent');
    } catch {
      setSaid('failed');
    }
  }
  return (
    <>
      <Button variant={variant} size="sm" onClick={() => (setSaid(null), setOpen(true))}>
        {said === 'sent' ? 'Task sent' : 'New task'}
      </Button>
      <Drawer
        side="right"
        open={open}
        onClose={() => setOpen(false)}
        label="New task"
        footer={
          <Button variant="primary" disabled={!text.trim()} onClick={send}>
            Send task
          </Button>
        }
      >
        <Flow gap={16}>
          <Input label="What needs doing?" multiline value={text} onChange={setText} placeholder="One sentence is enough" />
          {said === 'failed' ? <Notification tone="danger" title="The progress board" message={`It doesn't answer at ${BOARD}, so your task wasn't sent. It's still in the box.`} /> : null}
        </Flow>
      </Drawer>
    </>
  );
}

/** The selected tab's panel around the content, and an empty hidden panel for each other tab. */
export function TabPanels({ tabs, children }) {
  return (
    <>
      <div {...tabPanelProps(tabs.idBase, tabs.value, true)} tabIndex={undefined} className="chip-tabpanel">
        {children}
      </div>
      {tabs.items.filter((t) => t.id !== tabs.value).map((t) => (
        <div key={t.id} {...tabPanelProps(tabs.idBase, t.id, false)} tabIndex={undefined} />
      ))}
    </>
  );
}

/* The project's health under its title, as Figma: a bar and "95% healthy · 13 checks to fix". */
function HealthLine() {
  const { model } = useHealth();
  const phone = useNarrow();
  if (!model?.health) return null;
  const { pct } = model.health;
  return (
    <Flow direction={phone ? 'column' : 'row'} gap={phone ? 8 : 12} align={phone ? undefined : 'center'}>
      <div className="chip-screen__health-bar">
        <Progress drawIn label="Project health" shape="bar" showLabel={false} showTarget={false} tone={pct >= 90 ? 'success' : 'attention'} fill={pct} target={0} />
      </div>
      <TextStack subtitle={`${pct}% healthy · ${model.fixCount} ${model.fixCount === 1 ? 'check' : 'checks'} to fix`} />
    </Flow>
  );
}

/**
 * place: the rail item you are on (an id from PLACES).
 * header: PageHeader props (title, lede, health, actions, ...).
 * tabs: optional { items, value, onChange, label, idBase } for the Tabs under the header.
 * children: the page's content component.
 */
export default function Screen({ place, header, tabs, children }) {
  useTheme();
  const { projects, needs } = useShellData();
  // below 1024 the side menu steps out behind the top bar's Menu button; on a phone it rises as a sheet
  const menuOut = useNarrow(1024);
  const hist = useHistoryState();
  const phone = useNarrow();
  // below 400 the field would read "Sea": a search button that opens the field across the bar
  const tiny = useNarrow(400);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clientsOpen, setClientsOpen] = useState(false);
  const filter = filterFromHash();
  const tab = place === 'projects' ? tabs?.value : null;
  // the top bar says where you are: "CHIP › Work" on a project tab, "CHIP › Team" elsewhere
  const here = tab ? (PROJECT_VIEWS.find((v) => v.id === tab)?.label ?? header?.title) : header?.title;
  const onSearch = () => {
    setMenuOpen(false);
    if (tiny) setSearching(true);
    else requestAnimationFrame(() => document.querySelector('.chip-screen__main [role="search"] input')?.focus());
  };
  const menu = menuModel({ place, tab, projects, needs, filter, onSearch });
  // the drawer holds the same rows as BELLA's NavList (Drawer's own content); Search is in the top bar there
  const strip = ({ label, href, icon, badge, current }) => ({ label, href, icon, badge, current });
  const groups = [
    { items: menu.items.filter((i) => i.href).map(strip) },
    { label: 'Pinned', items: menu.pinned.map(strip) },
    ...(menu.projects.length ? [{ label: 'Projects', items: menu.projects.map((p) => ({ ...strip(p), icon: 'Folder' })) }] : []),
    { items: menu.foot.map(strip) },
  ];
  return (
    <div className="chip-screen">
      {menuOut ? (
        <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} label="Menu" side={phone ? 'bottom' : 'left'}>
          <NavList label="Main" groups={groups} onNavigate={() => setMenuOpen(false)} />
        </Drawer>
      ) : (
        <div className="chip-screen__menu">
          <SideMenu client="BELLA" clientExpanded={clientsOpen} onClientClick={() => setClientsOpen((o) => !o)} items={menu.items} pinned={menu.pinned} projects={menu.projects} foot={menu.foot} />
          {/* CHIP has one client, so its list says so */}
          {clientsOpen ? (
            <div className="chip-pop__menu">
              <Menu label="Clients" onClose={() => setClientsOpen(false)}>
                <MenuItem label="BELLA · the only client CHIP has" icon="Check" onSelect={() => setClientsOpen(false)} />
              </Menu>
            </div>
          ) : null}
        </div>
      )}
      <div className="chip-screen__main">
        {/* On a phone the ⌘ K legend steps out so the field keeps room for its words. */}
        {/* The side-menu button is the first thing in the top bar, at its left end, and stays there whether the menu is
            open or closed (Elleta, 23 Nov). BELLA's TopBar has no leading slot yet (gap for the parts session), so it sits
            over the bar's own padding and comes first in the tab order. */}
        <div className="chip-screen__topbar">
          <span className="chip-screen__lead">
            <Tooltip label="Back">
              <Button variant="tertiary" iconOnly icon="NavArrowLeft" ariaLabel="Back" disabled={!hist.back} onClick={() => window.history.back()} />
            </Tooltip>
            <Tooltip label="Forward">
              <Button variant="tertiary" iconOnly icon="NavArrowRight" ariaLabel="Forward" disabled={!hist.forward} onClick={() => window.history.forward()} />
            </Tooltip>
            {menuOut ? (
              <Tooltip label="Menu">
                <Button variant="tertiary" iconOnly icon="SidebarExpand" ariaLabel="Menu" ariaExpanded={menuOpen} ariaHaspopup="dialog" onClick={() => setMenuOpen(true)} />
              </Tooltip>
            ) : null}
          </span>
        <TopBar
          // room at the left for the menu button (below)
          style={{ paddingInlineStart: `calc(var(--spacing-8) + var(--h-control) * ${menuOut ? 3 : 2} + var(--spacing-4) * ${menuOut ? 2 : 1} + var(--spacing-8))` }}
          placeParent={(projects ?? []).find((p) => p.id === projectOf())?.name ?? 'CHIP'}
          // the way out of any page: the project's Work page
          placeParentHref={projectOf() ? `#/work?project=${projectOf()}` : '#/work'}
          placeCurrent={here}
          // below 400 the place line, search, the bell and Menu don't fit (335 at 320): the page title and
          // the selected tab say where you are there
          showPlace={!tiny}
          search={tiny && !searching ? <Button variant="tertiary" iconOnly icon="Search" ariaLabel="Search" onClick={() => setSearching(true)} /> : <Search showShortcut={!phone} autoFocus={tiny && searching} />}
          right={
            tiny && searching ? (
              <Button variant="tertiary" iconOnly icon="Xmark" ariaLabel="Close search" onClick={() => setSearching(false)} />
            ) : (
              // straight into TopBar's right group (12 apart, its own spacing): a Flow there shrank and spilled
              // its buttons past the edge at 320
              <>
                {/* the bell opens what needs you, in the Work panel (Figma Flow 12, screen 1); ⌘J opens it too */}
                <Button variant="tertiary" iconOnly icon="Bell" ariaLabel={needs ? `${needs} things need you` : 'What needs you'} ariaHaspopup="dialog" onClick={() => openWork('needs')} />
                {/* on a phone the place line needs the room: the avatar steps out (minimal chrome) */}
                {phone ? null : <Avatar name="Elleta McDaniel" size="sm" />}
              </>
            )
          }
        />
        </div>
        <div className="chip-screen__page">
          <div className={`chip-screen__head${tabs ? '' : ' chip-screen__head--plain'}`}>
            {/* project pages carry New task, as Figma; the health bar only on the Health tab (Elleta, 20 Nov: "Take it off"); Home carries New task too (Figma Flow 8); other rail pages (Team, Not again) carry neither */}
            {/* on a project's tabs the project name ("CHIP") is PageHeader size project, 28 on 36, so the tab's own
                subject leads (batch 4, published 22 Nov); every other page keeps size page, 40 on 48 */}
            <PageHeader {...(place === 'projects' ? { size: 'project', ...(tabs?.value === 'health' ? { health: <HealthLine /> } : {}), actions: <NewTask />, ...header } : place === 'home' ? { actions: <NewTask />, ...header } : header)} />
            {tabs ? (
              <Tabs tabs={tabs.items} value={tabs.value} onChange={tabs.onChange} label={tabs.label} idBase={tabs.idBase} />
            ) : null}
          </div>
          <main className="chip-screen__content" id="main">
            {/* the content is the selected tab's panel, and each other tab has its (empty, hidden)
                one, so every tab's aria-controls lands (audit 21 Nov); the panel keeps the page grid */}
            {tabs ? <TabPanels tabs={tabs}>{children}</TabPanels> : children}
          </main>
        </div>
      </div>
      <WorkDock />
    </div>
  );
}
