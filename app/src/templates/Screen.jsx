// CHIP / Screen: the code twin of the Figma template (CHIP Dashboard
// 601:112027). One shell for every new page: the icon rail, the project
// panel, the top bar, then the page header, its tabs and the content slot.
// A page is this template plus one content component (Figma's slot fill);
// pages pass words and parts, never styles (scripts/on-system-guard.mjs).
//
// Built only from published BELLA parts. The grid is the one template CSS
// file (Screen.css), token values only. Data is CHIP's own where it has it
// (/projects, /needs); anything CHIP does not measure shows no number.
import { Fragment, useState } from 'react';
import useCached from './useCached.js';
import IconRail from '@bella/components/IconRail/IconRail';
import NavItem from '@bella/components/NavItem/NavItem';
import ProjectPanel from '@bella/components/ProjectPanel/ProjectPanel';
import TreeItem from '@bella/components/TreeItem/TreeItem';
import TopBar from '@bella/components/TopBar/TopBar';
import PageHeader from '@bella/components/PageHeader/PageHeader';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import Drawer from '@bella/components/Drawer/Drawer';
import Button from '@bella/components/Button/Button';
import Avatar from '@bella/components/Avatar/Avatar';
import Progress from '@bella/components/Progress/Progress';
import TextStack from '@bella/components/TextStack/TextStack';
import Input from '@bella/components/Input/Input';
import Notification from '@bella/components/Notification/Notification';
import Flow from './Flow.jsx';
import Search from './Search.jsx';
import { useHealth } from '../pages/healthModel.js';
import useNarrow from './useNarrow.js';

// A page opens at its top with nothing scrolled or focused, unless a link
// names a section (Elleta, 20 Nov 2026: "the pages open to weird places").
// The one reset for every CHIP page: main.jsx calls it when the address moves
// to another page, the old app (App.jsx) when its view changes. A section
// link scrolls after this runs, so it still wins. The browser's own restore
// (reload, Back) is off for the same reason.
if (typeof history !== 'undefined' && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
export function openAtTop() {
  window.scrollTo(0, 0);
}
import { filterFromHash, filtered, workModel } from '../pages/workModel.js';
import { useTheme } from '../theme.js';
import './Screen.css';

/* The rail's places, in Figma's order. Pages not yet rebuilt open the old
 * app, which stays beside the new routes until Elleta has seen that list. */
const PLACES = [
  // Home has no page of its own yet (Figma Home waits on Elleta's pick), so it
  // opens Work, the board; Work is a project view, so it marks Projects (Figma).
  // Projects opens the project's overview (Health), and every other project
  // view marks Projects: one current item, the one you are on. Settings holds
  // Connectors (Elleta, 19 Nov: "under Settings, titled Connectors"); there is no Projects page.
  { id: 'home', label: 'Home', icon: 'Home', href: '#/work' },
  { id: 'projects', label: 'Projects', icon: 'Folder', href: '#/health' },
  { id: 'not-again', label: 'Not again', icon: 'Book', href: '#/not-again' },
  { id: 'team', label: 'Team', icon: 'Group', href: '#/team' },
  { id: 'map', label: 'System map', icon: 'Map', href: '#/system-map' },
];

/* CHIP's own data for the panel, kept between pages (useCached) so the
 * Projects group never blanks while a page loads. The Status counts are the
 * Work board's own lanes (workModel), so the panel and the board always agree;
 * 0 is a real count (no runs), shown as Figma shows it. */
function useShellData() {
  const { data } = useCached(['/projects', '/needs', '/runs']);
  if (!data) return { projects: null, lanes: null };
  const [p, n, r] = data;
  // the Status counts are the board's own, branch filter included, so the two never disagree
  const { branch } = filterFromHash();
  const { lanes } = filtered(workModel({ needs: n?.items ?? [], runs: r?.runs ?? [] }), { branch });
  return { projects: p?.projects ?? [], lanes: Object.fromEntries(lanes.map((l) => [l.id, l.cards.length])) };
}

const STATUS_ROWS = [
  { id: 'needs', label: 'Needs you', tone: 'attention' },
  { id: 'agent', label: 'Agent', tone: 'info' },
  { id: 'gate', label: 'Gate', tone: 'neutral' },
  { id: 'ready', label: 'Ready', tone: 'success' },
];

/* A project folder and, while open, its branches. A branch row filters Work's
   board to that branch (her rule "branches filter the board"). */
function ProjectTree({ p, current, open, onToggle, branch }) {
  const branches = useBranches(open ? p.id : null);
  return (
    <Fragment>
      <TreeItem kind="folder" label={p.name} open={open} current={current} onClick={onToggle} />
      {open ? branches.map((b, i) => <TreeItem key={b.name} kind="branch" label={b.name} status={b.status} lineBelow={i < branches.length - 1} href={`#/work?branch=${encodeURIComponent(b.name)}`} current={branch === b.name} />) : null}
    </Fragment>
  );
}

/* The open project's branches for the tree under it (Figma's project panel):
   the newest four, with what CHIP knows of each: the one checked out is
   "working", one not yet in the default branch is "waiting", one already in
   it "passed". CHIP has no per-branch gate result, so nothing says failed. */
function useBranches(id) {
  const { data } = useCached(id ? [`/projects/${id}`] : []);
  const live = data?.[0]?.live;
  if (!live?.branches) return [];
  return live.branches.slice(0, 4).map((b) => ({ name: b.name, status: b.name === live.branch ? 'working' : b.ahead > 0 ? 'waiting' : 'passed' }));
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
          {said === 'failed' ? <Notification tone="danger" title="Not sent" message={`The progress board doesn't answer at ${BOARD}. Your task is still in the box.`} /> : null}
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
        <Progress label="Project health" shape="bar" showLabel={false} showTarget={false} tone={pct >= 90 ? 'success' : 'attention'} fill={pct} target={0} />
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
  const { projects, lanes } = useShellData();
  const needs = lanes?.needs ?? null;
  const current = projects?.find((p) => p.id === 'chip') ?? projects?.[0];
  const panelOut = useNarrow(1024);
  const phone = useNarrow();
  // below 400 the field would read "Sea": a search button that opens the field across the bar
  const tiny = useNarrow(400);
  const [searching, setSearching] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  // folders open and close; the open project starts open, the others closed
  const [opened, setOpened] = useState(() => new Set());
  const [shut, setShut] = useState(() => new Set());
  const toggle = (p, isCurrent) => {
    const flip = (set) => {
      const next = new Set(set);
      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
      return next;
    };
    isCurrent ? setShut(flip) : setOpened(flip);
  };
  const filter = filterFromHash();
  // the top-left as one plain line (her 21 Nov pick "A, one plain line"; Figma CHIP / Screen 601:112027):
  // the client's name, no tile, no subtitle. No ⌄ yet: there is one client and nothing to switch to.
  const client = <TextStack title="BELLA" />;
  const projectRows =
    projects == null
      ? null
      : projects.map((p) => (
          <ProjectTree key={p.id} p={p} current={p === current} open={p === current ? !shut.has(p.id) : opened.has(p.id)} onToggle={() => toggle(p, p === current)} branch={filter.branch} />
        ));
  // each Status row filters Work's board to its lane (user test 21 Nov, item 4)
  const statusRows = STATUS_ROWS.map((r) => (
    <TreeItem key={r.id} kind="status" label={r.label} tone={r.tone} count={lanes?.[r.id]} showCount={lanes != null} href={`#/work?lane=${r.id}`} current={filter.lane === r.id} />
  ));
  const panel = <ProjectPanel switcher={client} projects={projectRows} status={statusRows} />;
  /* In a drawer, the panel's content only: the drawer's own white, padding and title, never the
     panel's grey box, edge and padding inside it, and "Projects" once (Elleta, 21 Nov: "this is broken.."). */
  const drawerPanel = (title) => (
    <Flow gap={24}>
      {client}
      <Flow as="section" gap={4} aria-label="Projects">
        {title === 'Projects' ? null : <TextStack title="Projects" />}
        {projectRows}
      </Flow>
      <Flow as="section" gap={4} aria-label="Status">
        <TextStack title="Status" />
        {statusRows}
      </Flow>
    </Flow>
  );
  return (
    <div className="chip-screen">
      {/* Below 800 the rail steps out too: the top bar's Menu opens the places
          and the projects in one Drawer, so a phone's content gets the full width
          (b23: at 320 the 72 rail left 248 and words broke). */}
      {phone ? null : (
        <div className="chip-screen__rail">
          <IconRail end={<NavItem iconOnly label="Settings" icon="Settings" href="#/connectors" current={place === 'settings' && !projectsOpen} />}>
            {PLACES.map((p) =>
              p.id === 'projects' && panelOut ? (
                // one current item: while the Projects drawer is open it is Projects, else the page you are on
                <NavItem key={p.id} iconOnly label={p.label} icon={p.icon} onClick={() => setProjectsOpen(true)} current={projectsOpen || p.id === place} />
              ) : (
                <NavItem key={p.id} iconOnly label={p.label} icon={p.icon} href={p.href} current={p.id === place && !projectsOpen} />
              ),
            )}
          </IconRail>
        </div>
      )}
      {/* Below 1024 the panel steps out; the rail's Projects button opens it
          as a Drawer (Elleta, 19 Nov 2026, y13: "A · a Projects button in
          the rail opens it as a drawer"). */}
      {panelOut ? (
        <Drawer open={projectsOpen} onClose={() => setProjectsOpen(false)} label={phone ? 'Menu' : 'Projects'}>
          {phone ? (
            <Flow gap={24}>
              <Flow as="nav" gap={4} aria-label="Places">
                {PLACES.filter((p) => p.id !== 'projects').map((p) => (
                  <NavItem key={p.id} label={p.label} icon={p.icon} href={p.href} current={p.id === place} />
                ))}
                <NavItem label="Settings" icon="Settings" href="#/connectors" current={place === 'settings'} />
              </Flow>
              {drawerPanel('Menu')}
            </Flow>
          ) : (
            drawerPanel('Projects')
          )}
        </Drawer>
      ) : (
        <div className="chip-screen__panel">{panel}</div>
      )}
      <div className="chip-screen__main">
        {/* On a phone the ⌘ K legend steps out so the field keeps room for its words. */}
        <TopBar
          search={tiny && !searching ? <Button variant="tertiary" iconOnly icon="Search" ariaLabel="Search" onClick={() => setSearching(true)} /> : <Search showShortcut={!phone} autoFocus={tiny && searching} />}
          right={
            tiny && searching ? (
              <Button variant="tertiary" iconOnly icon="Xmark" ariaLabel="Close search" onClick={() => setSearching(false)} />
            ) : (
            <Flow direction="row" gap={12} align="center">
              {phone ? <Button variant="tertiary" iconOnly icon="SidebarExpand" ariaLabel="Menu" ariaExpanded={projectsOpen} onClick={() => setProjectsOpen(true)} /> : null}
              {/* the bell opens what needs you, on Work */}
              <Button variant="tertiary" iconOnly icon="Bell" ariaLabel={needs ? `${needs} things need you` : 'What needs you'} href="#/work" />
              <Avatar name="Elleta McDaniel" size="sm" />
            </Flow>
            )
          }
        />
        <div className="chip-screen__page">
          <div className="chip-screen__head">
            {/* project pages carry New task, as Figma; the health bar only on the Health tab (Elleta, 20 Nov: "Take it off"); rail pages (Team, Not again) carry neither */}
            <PageHeader {...(place === 'projects' ? { ...(tabs?.value === 'health' ? { health: <HealthLine /> } : {}), actions: <NewTask />, ...header } : header)} />
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
    </div>
  );
}
