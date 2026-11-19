import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@bella/fonts.css';
import '@bella/tokens.css';
import './kit/tokens.css';
import './app.css';
import App from './App.jsx';
import Kit from './Kit.jsx';
import NotAgain from './pages/NotAgain.jsx';
import Playground from './pages/Playground.jsx';

// #/kit shows the shared pieces on their own, outside the app shell.
// Pages on the new CHIP / Screen template; the old app stays beside them
// until each page is rebuilt. The Playground lists these too
// (server/lib/projects.mjs reads NEW_PAGES).
const NEW_PAGES = [
  { id: 'not-again', label: 'Not again' },
  { id: 'playground', label: 'Playground' },
];

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  if (hash === '#/kit') return <Kit />;
  if (hash === '#/not-again') return <NotAgain />;
  if (hash.split('?')[0] === '#/playground') return <Playground />;
  return <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
