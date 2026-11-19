// Playground: the CHIP / Screen template plus its content (CHIP Dashboard,
// page content set 612:138756). Opens any page of any project live; a link
// (#/playground?project=chip&route=%23%2Fnot-again) picks both.
import { useCallback, useState } from 'react';
import Screen from '../templates/Screen.jsx';
import PlaygroundContent from './PlaygroundContent.jsx';

function asked() {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  return { project: q.get('project') ?? 'chip', route: q.get('route') };
}

export default function Playground() {
  const [project, setProject] = useState(() => asked().project);
  const [route, setRoute] = useState(() => asked().route);
  const pickProject = useCallback((p) => {
    setProject(p);
    setRoute(null);
  }, []);
  return (
    <Screen place="playground" header={{ title: 'Playground' }}>
      <PlaygroundContent project={project} onProject={pickProject} route={route} onRoute={setRoute} />
    </Screen>
  );
}
