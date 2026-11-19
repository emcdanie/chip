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

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  // a new page opens at its top; a part, query or view inside the same page
  // (#/components/Button, #/history?…) keeps its place
  const page = hash.match(/^#\/([\w-]+)/)?.[1] ?? '';
  useLayoutEffect(openAtTop, [page]);
  if (hash === '#/kit') return <Kit />;
  // The root opens the new shell on Work (19 Nov audit); the old app's
  // Overview stays at #/health-old until Elleta has decided on it.
  if (hash === '' || hash === '#' || hash === '#/') return <Work />;
  if (hash === '#/not-again') return <NotAgain />;
  if (hash.split('?')[0] === '#/playground') return <Playground />;
  if (hash.split('?')[0] === '#/team') return <Team />;
  if (hash === '#/health') return <Health />;
  if (hash.split('?')[0] === '#/history') return <History />;
  if (hash.split('?')[0] === '#/connectors') return <Connectors />;
  if (hash === '#/system-map') return <SystemMap />;
  if (hash === '#/foundations') return <Foundations />;
  if (hash === '#/work') return <Work />;
  if (hash === '#/components' || hash.startsWith('#/components/')) return <Components />;
  return <App />;
}

warmPages();
createRoot(document.getElementById('root')).render(<Root />);
