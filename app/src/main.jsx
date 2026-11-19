import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@bella/fonts.css';
import '@bella/tokens.css';
import './kit/tokens.css';
import './app.css';
import App from './App.jsx';
import Kit from './Kit.jsx';
import NotAgain from './pages/NotAgain.jsx';
import Team from './pages/Team.jsx';

// #/kit shows the shared pieces on their own, outside the app shell.
// #/not-again is the first page on the new CHIP / Screen template; the old
// app stays beside it until each page is rebuilt.
function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  if (hash === '#/kit') return <Kit />;
  if (hash === '#/not-again') return <NotAgain />;
  if (hash === '#/team') return <Team />;
  return <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
