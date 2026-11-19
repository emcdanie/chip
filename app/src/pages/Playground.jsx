// Playground: the CHIP / Screen template plus its content (CHIP Dashboard,
// page content set 612:138756). Opens any page of any project live; a link
// (#/playground?project=chip&route=%23%2Fnot-again) picks both.
//
// Where it lives: the IA map (602:29598) draws it as the 6th project tab
// under CHIP, after History; that is a question on Elleta's board (own tab,
// inside Components, or the rail). Built as the project tab meanwhile.
import { useCallback, useState } from 'react';
import { projectTabs } from '../templates/projectViews.js';
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
    <Screen
      place="projects"
      header={{ title: 'CHIP' }}
      tabs={projectTabs('playground')}
    >
      <PlaygroundContent project={project} onProject={pickProject} route={route} onRoute={setRoute} />
    </Screen>
  );
}
