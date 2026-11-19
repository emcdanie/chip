// CHIP / Screen: the code twin of the Figma template (CHIP Dashboard
// 601:112027). One shell for every new page: the icon rail, the project
// panel, the top bar, then the page header, its tabs and the content slot.
// A page is this template plus one content component (Figma's slot fill);
// pages pass words and parts, never styles (scripts/on-system-guard.mjs).
//
// Built only from published BELLA parts. The grid is the one template CSS
// file (Screen.css), token values only. Data is CHIP's own where it has it
// (/projects, /needs); anything CHIP does not measure shows no number.
import { useEffect, useState } from 'react';
import IconRail from '@bella/components/IconRail/IconRail';
import NavItem from '@bella/components/NavItem/NavItem';
import ProjectPanel from '@bella/components/ProjectPanel/ProjectPanel';
import ClientSwitcher from '@bella/components/ClientSwitcher/ClientSwitcher';
import TreeItem from '@bella/components/TreeItem/TreeItem';
import TopBar from '@bella/components/TopBar/TopBar';
import SearchField from '@bella/components/SearchField/SearchField';
import PageHeader from '@bella/components/PageHeader/PageHeader';
import Tabs from '@bella/components/Tabs/Tabs';
import { useTheme } from '../theme.js';
import './Screen.css';

/* The rail's places, in Figma's order. Pages not yet rebuilt open the old
 * app, which stays beside the new routes until Elleta has seen that list. */
const PLACES = [
  { id: 'home', label: 'Home', icon: 'Home', href: '#/' },
  { id: 'projects', label: 'Projects', icon: 'Folder', href: '#/' },
  { id: 'not-again', label: 'Not again', icon: 'Book', href: '#/not-again' },
  { id: 'team', label: 'Team', icon: 'Group', href: '#/team' },
  { id: 'map', label: 'System map', icon: 'Map', href: '#/' },
];

/* CHIP's own data for the panel. Status lanes CHIP does not count yet show
 * their name only: never an invented number. */
function useShellData() {
  const [projects, setProjects] = useState(null);
  const [needs, setNeeds] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/projects')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setProjects(d?.projects ?? []))
      .catch(() => live && setProjects([]));
    fetch('/needs')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setNeeds(Array.isArray(d) ? d.length : Array.isArray(d?.items) ? d.items.length : null))
      .catch(() => live && setNeeds(null));
    return () => {
      live = false;
    };
  }, []);
  return { projects, needs };
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
  return (
    <div className="chip-screen">
      <div className="chip-screen__rail">
        <IconRail end={<NavItem iconOnly label="Settings" icon="Settings" href="#/" />}>
          {PLACES.map((p) => (
            <NavItem key={p.id} iconOnly label={p.label} icon={p.icon} href={p.href} current={p.id === place} />
          ))}
        </IconRail>
      </div>
      <div className="chip-screen__panel">
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
      </div>
      <div className="chip-screen__main">
        <TopBar search={<SearchField />} />
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
