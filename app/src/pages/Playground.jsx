// Playground: the CHIP / Screen template plus its content (CHIP Dashboard,
// page content set 612:138756), its own project tab after History.
// It opens on Your picks, the A/B questions waiting on you, in the studio
// layout (Elleta, 22 Nov: the A/B opens in the Playground tab). The approved
// mock has no second tab, so Parts and pages (any part, or any page of any
// project live, with Mark up) opens from the last row of the picks list and
// has a way back. A link with a route
// (#/playground?project=chip&route=%23%2Fnot-again) opens the page view.
import { useCallback, useState } from 'react';
import Screen from '../templates/Screen.jsx';
import PlaygroundContent from './PlaygroundContent.jsx';
import PlaygroundPicks from './PlaygroundPicks.jsx';

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
    <Screen place="playground" header={{ title: 'Playground' }}>
      {view === 'picks' ? (
        <PlaygroundPicks onTry={() => setView('try')} />
      ) : (
        <PlaygroundContent project={project} onProject={pickProject} route={route} onRoute={setRoute} onBack={() => setView('picks')} />
      )}
    </Screen>
  );
}
