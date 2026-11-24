// Playground: the CHIP / Screen template plus its content (CHIP Dashboard,
// page content set 612:138756): any part or any page of any project, live, with
// Mark up (Elleta, 23 Nov: "i still want to be able to mark up the site in chip").
// No Your picks tab (24 Nov): everything waiting for her look is in Needs you, and
// an old picks link opens Needs you (routes.js). The Site project in the side menu
// opens the Site (#/playground?view=pages&project=site). A link with a route
// (#/playground?project=chip&route=%23%2Fnot-again) opens that page.
//
// The content has its own guard inside the Screen (24 Nov, her demo walkthrough: the Playground stopped and only
// "Reload CHIP" helped): if it throws, the header and Mark up stay, and Try again starts the content over in place,
// zoom and selection cleared, without reopening the part or page it stopped on.
import { useCallback, useState } from 'react';
import Screen from '../templates/Screen.jsx';
import PageGuard from '../templates/PageGuard.jsx';
import PlaygroundContent from './PlaygroundContent.jsx';

const RECENT = 'chip.playground.recent';

function asked() {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  return { project: q.get('project') ?? 'chip', named: q.has('project'), route: q.get('route') };
}

export default function Playground() {
  const [project, setProject] = useState(() => asked().project);
  const [route, setRoute] = useState(() => asked().route);
  const [round, setRound] = useState(0);
  const pickProject = useCallback((p) => {
    setProject(p);
    setRoute(null);
  }, []);
  const startOver = useCallback(() => {
    // the last part or page opened is the one it stopped on: don't open it again by itself
    try {
      const recent = JSON.parse(localStorage.getItem(RECENT) ?? '[]');
      localStorage.setItem(RECENT, JSON.stringify(Array.isArray(recent) ? recent.slice(1) : []));
    } catch {}
    setRoute(null);
    setRound((r) => r + 1);
  }, []);
  return (
    <Screen place="playground" header={{ title: 'Playground' }}>
      <PageGuard key={round} onReset={startOver}>
        <PlaygroundContent project={project} onProject={pickProject} route={route} onRoute={setRoute} openFirst={round === 0 && asked().named} />
      </PageGuard>
    </Screen>
  );
}
