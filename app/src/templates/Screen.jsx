// CHIP / Screen: the code twin of the Figma template (CHIP Dashboard
// 601:112027). One shell for every new page: the icon rail, the project
// panel, the top bar, then the page header, its tabs and the content slot.
// A page is this template plus one content component (Figma's slot fill);
// pages pass words and parts, never styles (scripts/on-system-guard.mjs).
//
// Built only from published BELLA parts. The grid is the one template CSS
// file (Screen.css), token values only. Data is CHIP's own where it has it
// (/projects, /needs); anything CHIP does not measure shows no number.
import { useState } from 'react';
import useCached from './useCached.js';
import IconRail from '@bella/components/IconRail/IconRail';
import NavItem from '@bella/components/NavItem/NavItem';
import ProjectPanel from '@bella/components/ProjectPanel/ProjectPanel';
import ClientSwitcher from '@bella/components/ClientSwitcher/ClientSwitcher';
import TreeItem from '@bella/components/TreeItem/TreeItem';
import TopBar from '@bella/components/TopBar/TopBar';
import SearchField from '@bella/components/SearchField/SearchField';
import PageHeader from '@bella/components/PageHeader/PageHeader';
import Tabs from '@bella/components/Tabs/Tabs';
import Drawer from '@bella/components/Drawer/Drawer';
import useNarrow from './useNarrow.js';
import { useTheme } from '../theme.js';
import './Screen.css';

/* The rail's places, in Figma's order. Pages not yet rebuilt open the old
 * app, which stays beside the new routes until Elleta has seen that list. */
const PLACES = [
  // Home has no page of its own yet (Figma Home waits on Elleta's pick), so it
  // opens Work, the board, and Work marks Home current (19 Nov re-audit).
  // Projects opens the project's overview (Health), and every other project
  // view marks Projects: one current item, the one you are on. Settings has no page either and opens
  // Projects, where each repo's setup lives (an old page until it is rebuilt).
  { id: 'home', label: 'Home', icon: 'Home', href: '#/work' },
  { id: 'projects', label: 'Projects', icon: 'Folder', href: '#/health' },
  { id: 'not-again', label: 'Not again', icon: 'Book', href: '#/not-again' },
  { id: 'team', label: 'Team', icon: 'Group', href: '#/team' },
  { id: 'map', label: 'System map', icon: 'Map', href: '#/connectors' },
];

/* CHIP's own data for the panel, kept between pages (useCached) so the
 * Projects group never blanks while a page loads. Status lanes CHIP does not
 * count yet show their name only: never an invented number. */
function useShellData() {
  const { data } = useCached(['/projects', '/needs']);
  if (!data) return { projects: null, needs: null };
  const [p, n] = data;
  return { projects: p?.projects ?? [], needs: Array.isArray(n) ? n.length : Array.isArray(n?.items) ? n.items.length : null };
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
  const current = projects?.find((p) => p.id === 'chip') ?? projects?.[0];
  const panelOut = useNarrow(1024);
  const phone = useNarrow();
  const [projectsOpen, setProjectsOpen] = useState(false);
  const panel = (
    <ProjectPanel
      switcher={<ClientSwitcher name="BELLA" caption="Design system" />}
      projects={
        projects == null ? null : (
          <>
            {/* Branch rows wait for a real status: StatusSquare has no
                "not measured" state, and CHIP does not track one per
                branch yet (part gap, reported). */}
            {projects.map((p) => (
              <TreeItem key={p.id} kind="folder" label={p.name} open={p === current} current={p === current} />
            ))}
          </>
        )
      }
      status={
        <>
          <TreeItem kind="status" label="Needs you" tone="attention" count={needs ?? undefined} showCount={needs != null} />
          <TreeItem kind="status" label="Agent" tone="info" />
          <TreeItem kind="status" label="Gate" tone="neutral" />
          <TreeItem kind="status" label="Ready" tone="success" />
        </>
      }
    />
  );
  return (
    <div className="chip-screen">
      <div className="chip-screen__rail">
        <IconRail end={<NavItem iconOnly label="Settings" icon="Settings" href="#/projects" />}>
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
      {/* Below 1024 the panel steps out; the rail's Projects button opens it
          as a Drawer (Elleta, 19 Nov 2026, y13: "A · a Projects button in
          the rail opens it as a drawer"). */}
      {panelOut ? (
        <Drawer open={projectsOpen} onClose={() => setProjectsOpen(false)} label="Projects">
          {panel}
        </Drawer>
      ) : (
        <div className="chip-screen__panel">{panel}</div>
      )}
      <div className="chip-screen__main">
        {/* On a phone the ⌘ K legend steps out so the field keeps room for its words. */}
        <TopBar search={<SearchField showShortcut={!phone} />} />
        <div className="chip-screen__page">
          <div className="chip-screen__head">
            <PageHeader {...header} />
            {tabs ? (
              <Tabs tabs={tabs.items} value={tabs.value} onChange={tabs.onChange} label={tabs.label} idBase={tabs.idBase} />
            ) : null}
          </div>
          <main className="chip-screen__content" id="main">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
