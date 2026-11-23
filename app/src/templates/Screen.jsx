// CHIP / Screen: the code twin of the Figma template (CHIP Dashboard
// 601:112027). One shell for every new page: the side menu (her nav C pick,
// 22 Nov) with the Find field at its top, then one row with the menu button, the
// breadcrumb and the page's actions (her mark-up, 23 Nov: no top bar), its tabs
// and the content slot.
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
import PageHeader from '@bella/components/PageHeader/PageHeader';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import Drawer from '@bella/components/Drawer/Drawer';
import Button from '@bella/components/Button/Button';
import Tooltip from '@bella/components/Tooltip/Tooltip';
import Link from '@bella/components/Link/Link';
import Icon from '@bella/components/Icon/Icon';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';
import { NewStart as NewTask } from './NewStart.jsx';
import Search from './Search.jsx';
import useNarrow from './useNarrow.js';
import WorkDock, { openWork } from './WorkDock.jsx';
import MarkUp, { useMarkUp } from './MarkUp.jsx';
import RunStatus from './RunStatus.jsx';
import BrandWordmark from '@bella/components/BrandWordmark/BrandWordmark';

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
import { boardModel } from '../pages/workModel.js';
import { PROJECT_VIEWS } from './projectViews.js';
import { useTheme } from '../theme.js';
import './Screen.css';

/* CHIP's own data for the panel, kept between pages (useCached) so the
 * Projects group never blanks while a page loads. The Status counts are the
 * Work board's own lanes (workModel), so the panel and the board always agree;
 * 0 is a real count (no runs), shown as Figma shows it. */
// Back puts the page where you left it (second-pass M23): the content's scroll is kept per address when you navigate
// away, and given back when the way in was Back or Forward. The data may still be loading, so it waits for the room.
const scrollAt = new Map();
let enteredBy = 'push';
if (typeof window !== 'undefined' && window.navigation && !window.__chipScrollKeep) {
  window.__chipScrollKeep = true;
  window.navigation.addEventListener('navigate', (e) => {
    const sc = document.querySelector('.chip-screen__content');
    if (sc) scrollAt.set(window.location.href, sc.scrollTop);
    enteredBy = e.navigationType;
  });
}
function useRestoreScroll() {
  useEffect(() => {
    const want = enteredBy === 'traverse' ? scrollAt.get(window.location.href) : undefined;
    if (!want) return undefined;
    let tries = 0;
    let raf;
    const put = () => {
      const sc = document.querySelector('.chip-screen__content');
      if (sc && sc.scrollHeight - sc.clientHeight >= want) sc.scrollTop = want;
      else if (tries++ < 60) raf = requestAnimationFrame(put);
    };
    raf = requestAnimationFrame(put);
    return () => cancelAnimationFrame(raf);
  }, []);
}

function useShellData() {
  // the same reads as the Work board (useCached shares them), so the menu's Needs you count is the board's own
  const { data, reload } = useCached(['/needs', '/runs', '/gaps']);
  const { data: proj, reload: reloadProj } = useCached(['/projects']);
  const { data: extra, reload: reloadExtra } = useCached(['/work/lanes']);
  const { data: board, reload: reloadBoard } = useCached(['/work/board']);
  // a move, a run or an Accept anywhere: the count follows at once
  useEffect(() => {
    const on = () => (reload(), reloadExtra(), reloadBoard(), reloadProj());
    window.addEventListener('chip:changed', on);
    return () => window.removeEventListener('chip:changed', on);
  }, [reload, reloadExtra, reloadBoard, reloadProj]);
  const projects = proj?.[0]?.projects ?? null;
  if (!data) return { projects, needs: null, needsCards: null };
  const [n, r, g] = data;
  const model = boardModel({ needs: n?.items ?? [], runs: r?.runs ?? [], runBase: r?.base ?? null, lanes: extra?.[0] ?? null, board: board?.[0] ?? null, gaps: g?.gaps ?? null });
  // what waits on her: the cards in Now that need her, the number the board's Needs you filter shows
  // ONE source for "Needs you" (second-pass D7: the bell said 12, its panel 5): these cards. The menu badge, the bell,
  // the Work panel's tab and its list all read them.
  const needsCards = (model.lanes.find((l) => l.id === 'now')?.cards ?? []).filter((c) => c.needs);
  return { projects, needs: needsCards.length, needsCards };
}

/* The breadcrumb, in the page header's meta line under the top bar (BELLA has no Breadcrumb part yet: Link, an icon and
   plain text). Its first part is the way back (Elleta, 23 Nov: "just a back from the breadcrumb"): a link with a back
   arrow and the tooltip "Back" to the project's Work page, or one step back in the browser when the page before
   this one was inside CHIP. */
function Crumb({ trail, href, linked, compact }) {
  // the bar's meta holds the parents; the last segment is the page's h1 (PageHeader size bar)
  const parents = trail.slice(0, -1);
  const [parent, ...rest] = parents;
  const back = (e) => {
    const nav = window.navigation;
    const prev = nav?.canGoBack ? nav.entries()[nav.currentEntry.index - 1] : null;
    if (prev?.url && new URL(prev.url).origin === window.location.origin) {
      e.preventDefault();
      window.history.back();
    }
  };
  return (
    <Flow as="nav" aria-label="Breadcrumb" direction="row" gap={8} align="center" {...(compact && linked ? { 'data-no-separator': true } : {})}>
      {linked ? (
        <Tooltip label="Back">
          <span onClick={back}>
            <Link href={href} aria-label={compact ? `Back to ${parent}` : undefined}>
              <Flow as="span" direction="row" gap={4} align="center">
                <Icon name="NavArrowLeft" size="sm" />
                {compact ? null : parent}
              </Flow>
            </Link>
          </span>
        </Tooltip>
      ) : (
        <TextStack meta={parent} />
      )}
      {compact ? null : rest.map((t) => (
        <Flow as="span" key={t} direction="row" gap={8} align="center">
          <TextStack meta="›" aria-hidden="true" />
          <TextStack meta={t} />
        </Flow>
      ))}
    </Flow>
  );
}

/* The one side menu (her nav C pick, 22 Nov), in her words: where you go, what is pinned, the projects,
   and Team and Settings at the foot. One current item, the page you are on (aria-current page): a pinned
   page wins over its project, so Components marks Components, the other CHIP tabs mark CHIP. Branches
   filter the board from Work's own control bar, so no branch name sits in the menu. Site and BELLA open
   the old app's project page until theirs are rebuilt. */
const projectOf = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('project');

function menuModel({ place, tab, projects, needs }) {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const needsHere = place === 'work' && q.get('filter') === 'needs';
  const project = projectOf();
  // one current item (Elleta, 23 Nov): Needs you wins over Work, a named project over Work
  const workHere = place === 'work' && !needsHere && !project;
  return {
    items: [
      { label: 'Work', href: '#/work', icon: 'CheckCircle', current: workHere },
      { label: 'Health', href: '#/health', icon: 'Activity', current: place === 'health' },
      { label: 'System', href: '#/system/components', icon: 'ViewGrid', current: !!tab },
      { label: 'Playground', href: '#/playground', icon: 'Play', current: place === 'playground' },
      { label: 'Needs you', href: '#/work?filter=needs', icon: 'Bell', badge: needs || undefined, current: needsHere },
      { label: 'Not again', href: '#/not-again', icon: 'Book', current: place === 'not-again' },
    ],
    pinned: [{ label: 'Processes', href: '#/system-map', icon: 'Map', current: place === 'map' }],
    // every project opens the new board (23 Nov: "the old board show when i click projects like site")
    // the side menu's Projects set the Work board's project filter and put the project in the breadcrumb (picked A, 22 Nov:
    // one board with a project filter, no board per project)
    projects: (projects ?? []).map((p) => ({ label: p.name, href: `#/work?project=${p.id}`, current: place === 'work' && !needsHere && p.id === project })),
    foot: [
      { label: 'Team', href: '#/team', icon: 'Group', current: place === 'team' },
      { label: 'Settings', href: '#/connectors', icon: 'Settings', current: place === 'settings' },
    ],
  };
}

/* New (her pick A, 23 Nov): the header's start button, in templates/NewStart.jsx. Exported here under its old name so the pages that place it keep one import. */
export { NewTask };

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

/**
 * place: the rail item you are on (an id from PLACES).
 * header: PageHeader props (title, lede, health, actions, ...).
 * tabs: optional { items, value, onChange, label, idBase } for the Tabs under the header.
 * children: the page's content component.
 */
export default function Screen({ place, header, tabs, children }) {
  useTheme();
  const { projects, needs, needsCards } = useShellData();
  // below 1024 the side menu steps out behind the top bar's Menu button; on a phone it rises as a sheet
  const menuOut = useNarrow(1024);
  // the menu can be hidden at every width (23 Nov): remembered in this browser; on a phone the same button raises the sheet
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('chip.menu.collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleMenu = () => {
    if (menuOut) return setMenuOpen((o) => !o);
    setCollapsed((c) => {
      try {
        window.localStorage.setItem('chip.menu.collapsed', c ? '0' : '1');
      } catch {
        /* private window: it just is not remembered */
      }
      return !c;
    });
    return undefined;
  };
  // Cmd+\\ (Ctrl+\\) shows and hides the menu. Cmd+K (Ctrl+K) goes to the Find field at the menu's top, showing
  // the menu first when it is hidden or out (below 1024 the Drawer, which takes focus as it opens, so it tries a few frames)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === '\\') {
        e.preventDefault();
        toggleMenu();
      } else if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (menuOut) setMenuOpen(true);
        else if (collapsed) toggleMenu();
        let tries = 0;
        const put = () => {
          const input = document.querySelector('.chip-screen__search input');
          if (input && document.activeElement !== input) {
            input.focus();
            input.select?.();
          }
          if (tries++ < 10) requestAnimationFrame(put);
        };
        requestAnimationFrame(put);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const phone = useNarrow();
  const markup = useMarkUp();
  useRestoreScroll();
  const [menuOpen, setMenuOpen] = useState(false);
  const [clientsOpen, setClientsOpen] = useState(false);
  const tab = place === 'projects' ? tabs?.value : null;
  const view = PROJECT_VIEWS.find((v) => v.id === tab);
  const projectName = (projects ?? []).find((p) => p.id === projectOf())?.name ?? 'CHIP';
  // the top bar says where you are: "CHIP › Work", "CHIP › System › Components", "CHIP › Team"
  const trail = view ? [projectName, view.groupLabel, view.label] : header?.parent ? [projectName, header.parent, header.title] : [projectName, place === 'work' ? 'Work' : place === 'health' ? 'Health' : header?.title];
  // the tab's title says where you are ("Health · CHIP", "System · Components · CHIP"), so tabs and History tell apart
  useEffect(() => {
    document.title = [...trail.slice(1), trail[0]].filter(Boolean).join(' · ');
  }, [trail.join('|')]);
  const menu = menuModel({ place, tab, projects, needs });
  // the drawer holds the Find field and the same rows as BELLA's NavList (Drawer's own content)
  const strip = ({ label, href, icon, badge, current }) => ({ label, href, icon, badge, current });
  const groups = [
    { items: menu.items.filter((i) => i.href).map(strip) },
    { label: 'Pinned', items: menu.pinned.map(strip) },
    ...(menu.projects.length ? [{ label: 'Projects', items: menu.projects.map((p) => ({ ...strip(p), icon: 'Folder' })) }] : []),
    { items: menu.foot.map(strip) },
  ];
  return (
    <div className={`chip-screen${!menuOut && collapsed ? ' chip-screen--collapsed' : ''}`}>
      <div className="chip-screen__main">
        <div className="chip-screen__page">
          <div className={`chip-screen__head${tabs ? '' : ' chip-screen__head--plain'}`}>
            {/* the one row at the top (her mark-up, 23 Nov: no top bar above it, no line under it): the side-menu button at
                the left, in place whether the menu is open or closed, then the breadcrumb, its last segment the page's h1; at
                the right edge what is running, Mark up, the bell (notifications only) and the page's one action. Project
                pages carry New; Not again passes its own. When the whole title and the actions don't fit on one row (a
                phone, a long System title at 1024), the actions move under it, still at the right edge, so nothing is cut. */}
            <Flow direction="row" wrap justify="end" align="center" gap={8} grow="first">
              <PageHeader
                size="bar"
                title={trail[trail.length - 1]}
                meta={
                  <Flow as="span" direction="row" gap={8} align="center">
                    <Tooltip label={menuOut || collapsed ? 'Show menu' : 'Hide menu'}>
                      <Button variant="tertiary" iconOnly icon={menuOut || collapsed ? 'SidebarExpand' : 'SidebarCollapse'} ariaLabel={menuOut || collapsed ? 'Show menu' : 'Hide menu'} ariaExpanded={menuOut ? menuOpen : !collapsed} ariaHaspopup={menuOut ? 'dialog' : undefined} onClick={toggleMenu} />
                    </Tooltip>
                    <Crumb trail={trail} compact={phone} href={header?.back ?? (projectOf() ? `#/work?project=${projectOf()}` : '#/work')} linked={place !== 'work'} />
                  </Flow>
                }
              />
              <Flow direction="row" gap={8} align="center">
                {/* whether anything is running, always visible (Elleta, 23 Nov); it brings its own drawer and toast */}
                <RunStatus />
                {/* Mark up (Elleta, 23 Nov): every page markable like Figma comments; notes stay drafts until one Send all */}
                <span data-markup-own>
                  <Tooltip label={markup.on ? 'Stop marking up' : 'Mark up'}>
                    <Button variant="tertiary" iconOnly icon="EditPencil" ariaLabel="Mark up" ariaPressed={markup.on} onClick={() => markup.setOn((o) => !o)} />
                  </Tooltip>
                </span>
                {/* the bell opens what needs you, in the Work panel (Figma Flow 12, screen 1); ⌘J opens it too */}
                <Tooltip label="Notifications">
                  <Button variant="tertiary" iconOnly icon="Bell" ariaLabel={needs ? `${needs} things need you, open the Work panel` : 'Nothing needs you, open the Work panel'} ariaHaspopup="dialog" onClick={() => openWork('needs')} />
                </Tooltip>
                {header?.actions ?? (['projects', 'work', 'health', 'playground'].includes(place) ? <NewTask /> : null)}
              </Flow>
            </Flow>
            {tabs ? (
              <Tabs className="chip-screen__tabs" tabs={tabs.items} value={tabs.value} onChange={tabs.onChange} label={tabs.label} idBase={tabs.idBase} />
            ) : null}
          </div>
          <main className="chip-screen__content" id="main">
            {/* the content is the selected tab's panel, and each other tab has its (empty, hidden)
                one, so every tab's aria-controls lands (audit 21 Nov); the panel keeps the page grid */}
            {tabs ? <TabPanels tabs={tabs}>{children}</TabPanels> : children}
          </main>
        </div>
      </div>
      {/* after the page in the source so the menu button, which is in the page, is the first stop for the keyboard; the grid puts the menu back on the left */}
      {menuOut ? (
        <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} label="Menu" side={phone ? 'bottom' : 'left'}>
          {/* the Find field first, as in the menu at full width (her mark-up, 23 Nov) */}
          <Flow role="search" direction="row" gap={4} align="start" grow="first">
            <Search inDrawer />
          </Flow>
          <NavList label="Main" groups={groups} onNavigate={() => setMenuOpen(false)} />
        </Drawer>
      ) : collapsed ? null : (
        <div className="chip-screen__menu">
          <div className="chip-screen__menu-body">
            <SideMenu client="BELLA" clientExpanded={clientsOpen} onClientClick={() => setClientsOpen((o) => !o)} search={<Search />} items={menu.items} pinned={menu.pinned} projects={menu.projects} foot={menu.foot} />
          </div>
          {/* the CHIP logotype closes the menu, its left edge on the rows' icons (her mark-up, 23 Nov) */}
          <div className="chip-screen__logo"><div className="chip-screen__logo-mark"><BrandWordmark word="CHIP" variant="logotype" size="full-bleed" /></div></div>
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
      <WorkDock needs={needsCards} />
      <MarkUp markup={markup} />
    </div>
  );
}
