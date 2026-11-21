// Playground: the CHIP / Screen template plus its content (CHIP Dashboard,
// page content set 612:138756), its own project tab after History.
// Two views as Tabs: Your picks (the A/B questions waiting on you, studio
// layout; Elleta, 22 Nov: the A/B opens in the Playground tab) and Parts and
// pages (any part, or any page of any project live, with Mark up). A link
// with a route (#/playground?project=chip&route=%23%2Fnot-again) opens the
// page view.
import { useCallback, useState } from 'react';
import Tabs from '@bella/components/Tabs/Tabs';
import { projectTabs } from '../templates/projectViews.js';
import Screen, { TabPanels } from '../templates/Screen.jsx';
import PlaygroundContent from './PlaygroundContent.jsx';
import PlaygroundPicks from './PlaygroundPicks.jsx';

const VIEWS = [
  { id: 'picks', label: 'Your picks' },
  { id: 'try', label: 'Parts and pages' },
];

function asked() {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  return { project: q.get('project') ?? 'chip', route: q.get('route'), view: q.get('view') };
}

export default function Playground() {
  const [project, setProject] = useState(() => asked().project);
  const [route, setRoute] = useState(() => asked().route);
  const [view, setView] = useState(() => (asked().route || asked().view === 'try' ? 'try' : 'picks'));
  const pickProject = useCallback((p) => {
    setProject(p);
    setRoute(null);
  }, []);
  return (
    <Screen place="projects" header={{ title: 'CHIP' }} tabs={projectTabs('playground')}>
      <Tabs label="Playground views" idBase="playground-view" value={view} onChange={setView} tabs={VIEWS} />
      <TabPanels tabs={{ idBase: 'playground-view', value: view, items: VIEWS }}>
        {view === 'picks' ? <PlaygroundPicks /> : <PlaygroundContent project={project} onProject={pickProject} route={route} onRoute={setRoute} />}
      </TabPanels>
    </Screen>
  );
}
