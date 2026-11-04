import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@bella/fonts.css';
import '@bella/tokens.css';
import './kit/tokens.css';
import './app.css';
import App from './App.jsx';
import Kit from './Kit.jsx';

// #/kit shows the shared pieces on their own, outside the app shell
function Root() {
  const [kit, setKit] = useState(window.location.hash === '#/kit');
  useEffect(() => {
    const on = () => setKit(window.location.hash === '#/kit');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return kit ? <Kit /> : <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
