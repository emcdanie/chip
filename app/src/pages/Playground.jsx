// Playground: the CHIP / Screen template plus its content (CHIP Dashboard,
// page content set 612:138756). Two tabs (Elleta, 23 Nov: "i still want to be
// able to mark up the site in chip"): Your picks, the A/B questions waiting on
// you, and Pages, any part or any page of any project with Mark up. The Site
// project in the side menu opens Pages on the Site (#/playground?view=pages&project=site).
// A link with a route (#/playground?project=chip&route=%23%2Fnot-again) opens Pages on it.
import { useCallback, useState } from 'react';
import Screen from '../templates/Screen.jsx';
import PlaygroundContent from './PlaygroundContent.jsx';
import PlaygroundPicks from './PlaygroundPicks.jsx';

const TABS = [
  { id: 'picks', label: 'Your picks' },
  { id: 'pages', label: 'Pages' },
];

function asked() {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  return { project: q.get('project') ?? 'chip', named: q.has('project'), route: q.get('route'), view: q.get('view') };
}

export default function Playground() {
  const [project, setProject] = useState(() => asked().project);
  const [route, setRoute] = useState(() => asked().route);
  const [view, setView] = useState(() => (asked().route || asked().view === 'pages' ? 'pages' : 'picks'));
  const pickProject = useCallback((p) => {
    setProject(p);
    setRoute(null);
  }, []);
  const tabs = { items: TABS, value: view, onChange: setView, label: 'Playground views', idBase: 'playground-views' };
  return (
    <Screen place="playground" header={{ title: 'Playground' }} tabs={tabs}>
      {view === 'picks' ? <PlaygroundPicks /> : <PlaygroundContent project={project} onProject={pickProject} route={route} onRoute={setRoute} openFirst={asked().named} />}
    </Screen>
  );
}
