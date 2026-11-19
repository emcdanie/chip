// Playground: the CHIP / Screen template plus its content (CHIP Dashboard,
// page content set 612:138756). Opens any page of any project live; a link
// (#/playground?project=chip&route=%23%2Fnot-again) picks both.
//
// Where it lives: the IA map (602:29598) draws it as the 6th project tab
// under CHIP, after History; that is a question on Elleta's board (own tab,
// inside Components, or the rail). Built as the project tab meanwhile.
import { useCallback, useState } from 'react';
import Screen from '../templates/Screen.jsx';
import PlaygroundContent from './PlaygroundContent.jsx';

// The project's views, in the IA map's order. Views not yet rebuilt open the
// old app's page.
const TABS = [
  { id: 'work', label: 'Work', href: '#/' },
  { id: 'health', label: 'Health', href: '#/health' },
  { id: 'components', label: 'Components', href: '#/atlas' },
  { id: 'foundations', label: 'Foundations', href: '#/foundations' },
  { id: 'history', label: 'History', href: '#/docs' },
  { id: 'playground', label: 'Playground', href: '#/playground' },
];

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
  const go = (id) => {
    const t = TABS.find((x) => x.id === id);
    if (t && id !== 'playground') window.location.hash = t.href;
  };
  return (
    <Screen
      place="projects"
      header={{ title: 'CHIP' }}
      tabs={{ items: TABS.map(({ id, label }) => ({ id, label })), value: 'playground', onChange: go, label: 'CHIP views', idBase: 'chip-views' }}
    >
      <PlaygroundContent project={project} onProject={pickProject} route={route} onRoute={setRoute} />
    </Screen>
  );
}
