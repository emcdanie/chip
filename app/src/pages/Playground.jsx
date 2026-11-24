// Playground: the CHIP / Screen template plus its content (CHIP Dashboard,
// page content set 612:138756): any part or any page of any project, live, with
// Mark up (Elleta, 23 Nov: "i still want to be able to mark up the site in chip").
// No Your picks tab (24 Nov): everything waiting for her look is in Needs you, and
// an old picks link opens Needs you (routes.js). The Site project in the side menu
// opens the Site (#/playground?view=pages&project=site). A link with a route
// (#/playground?project=chip&route=%23%2Fnot-again) opens that page.
import { useCallback, useState } from 'react';
import Screen from '../templates/Screen.jsx';
import PlaygroundContent from './PlaygroundContent.jsx';

function asked() {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  return { project: q.get('project') ?? 'chip', named: q.has('project'), route: q.get('route') };
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
      <PlaygroundContent project={project} onProject={pickProject} route={route} onRoute={setRoute} openFirst={asked().named} />
    </Screen>
  );
}
