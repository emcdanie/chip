import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@bella/fonts.css';
import '@bella/tokens.css';
import './kit/tokens.css';
import './app.css';
import App from './App.jsx';
import Kit from './Kit.jsx';
import NotAgain from './pages/NotAgain.jsx';
import Playground from './pages/Playground.jsx';
import History from './pages/History.jsx';
import Connectors from './pages/Connectors.jsx';
import SystemMap from './pages/SystemMap.jsx';
import Foundations from './pages/Foundations.jsx';
import Team from './pages/Team.jsx';
import Health from './pages/Health.jsx';
import Work from './pages/Work.jsx';
import Components from './pages/Components.jsx';
import { warmPages } from './templates/useCached.js';
import { openAtTop } from './templates/Screen.jsx';
import RunPlanHost from './templates/RunPlan.jsx';
import PageGuard from './templates/PageGuard.jsx';
import { canon } from './templates/routes.js';

// #/kit shows the shared pieces on their own, outside the app shell.
// Pages on the new CHIP / Screen template; the old app stays beside them
// until each page is rebuilt. The Playground lists these too
// (server/lib/projects.mjs reads NEW_PAGES).
const NEW_PAGES = [
  { id: 'not-again', label: 'Not again' },
  { id: 'playground', label: 'Playground' },
  { id: 'team', label: 'Team' },
  { id: 'health', label: 'Health' },
  { id: 'work', label: 'Work' },
  { id: 'components', label: 'Components' },
  { id: 'history', label: 'History' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'system-map', label: 'System map' },
  { id: 'foundations', label: 'Foundations' },
];

function Page({ hash }) {
  // a new page opens at its top; a part, query or view inside the same page
  // (#/components/Button, #/history?…) keeps its place
  const page = hash.match(/^#\/(health\/work|system\/[\w-]+|[\w-]+)/)?.[1] ?? '';
  useLayoutEffect(openAtTop, [page]);
  if (hash === '#/kit') return <Kit />;
  // Health takes Home's place and holds Work; Components, Foundations and History are one System place
  // (Elleta, 23 Nov). The old addresses redirect in Root (templates/routes.js), so only new ones arrive here.
  const at = hash.split('?')[0];
  if (hash === '#/not-again') return <NotAgain />;
  if (at === '#/playground') return <Playground />;
  if (at === '#/team') return <Team />;
  if (at === '#/health') return <Health />;
  if (at === '#/health/work') return <Work />;
  if (at === '#/system/history') return <History />;
  if (at === '#/connectors') return <Connectors />;
  if (hash === '#/system-map') return <SystemMap />;
  if (at === '#/system/foundations') return <Foundations />;
  if (at === '#/system/components' || at.startsWith('#/system/components/')) return <Components />;
  return <App />;
}

/* Every page sits in a guard (an error shows in place, never a white app) beside the one
   plan host (any run opens its plan first). The guard resets when the page changes. */
function Root() {
  // an old address (#/home, #/work, #/components/Button?x) opens its new place, same part and query
  const settle = () => {
    const to = canon(window.location.hash);
    if (to !== window.location.hash) window.history.replaceState(null, '', to);
    return to;
  };
  const [hash, setHash] = useState(settle);
  useEffect(() => {
    const on = () => setHash(settle());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const page = hash.match(/^#\/(health\/work|system\/[\w-]+|[\w-]+)/)?.[1] ?? '';
  return (
    <>
      <PageGuard key={page}>
        <Page hash={hash} />
      </PageGuard>
      <RunPlanHost />
    </>
  );
}

warmPages();
createRoot(document.getElementById('root')).render(<Root />);
