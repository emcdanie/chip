import React, { useEffect, useState } from 'react';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import NavList from '@bella/components/NavList/NavList';
import Kbd from '@bella/components/Kbd/Kbd';
import Button from '@bella/components/Button/Button';
import Drawer from '@bella/components/Drawer/Drawer';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import Health from './Health.jsx';
import Atlas from './Atlas.jsx';
import Obi from './Obi.jsx';
import Palette from './Palette.jsx';
import { useTheme, THEMES } from './theme.js';

const WORKSPACES = [
  { id: 'health', label: 'Health' },
  { id: 'atlas', label: 'Atlas' },
];

const HEALTH_SECTIONS = [
  { href: '#overview', label: 'Overview' },
  { href: '#readiness', label: 'Readiness map' },
  { href: '#components', label: 'Components' },
];

const WS_KEYS = { Digit1: 'health', Digit2: 'atlas' };
const OBI_KEY = 'chip-obi-open';

// routes: #/health, #/atlas/<component id>
function routeOf(hash) {
  const m = hash.match(/^#\/(health|atlas)(?:\/([\w-]+))?$/);
  return m ? { ws: m[1], id: m[2] } : null;
}

function useMedia(query) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [query]);
  return on;
}

function failuresOf(bella) {
  const out = [];
  for (const c of bella?.components ?? []) {
    if (!c.hasStory) out.push(`${c.name}: no story`);
    if (!c.hasDocs) out.push(`${c.name}: no docs description`);
    if (c.health?.contract?.status === 'fail') out.push(`${c.name}: contract ${c.health.contract.issues.join('; ')}`);
    if (c.health?.contrast?.status === 'fail') out.push(`${c.name}: contrast ${c.health.contrast.failing.join('; ')}`);
  }
  return out;
}

export default function App() {
  const [theme, setTheme] = useTheme();
  const start = routeOf(window.location.hash) ?? { ws: 'health' };
  const [ws, setWs] = useState(start.ws);
  const [atlasId, setAtlasId] = useState(start.id ?? 'button');
  const [collapsed, setCollapsed] = useState(false);
  const [bella, setBella] = useState(null);
  const [health, setHealth] = useState(null);
  const [docs, setDocs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState('');
  const [queued, setQueued] = useState(null);
  const [focusSandbox, setFocusSandbox] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [drawerObi, setDrawerObi] = useState(false);
  const [dockObi, setDockObi] = useState(() => {
    try {
      return localStorage.getItem(OBI_KEY) !== 'closed';
    } catch {
      return true;
    }
  });
  const wide = useMedia('(min-width: 1024px)');
  const narrow = useMedia('(max-width: 719px)');
  const obiOpen = wide ? dockObi : drawerObi;

  const loadNotes = () => fetch('/notes').then((r) => r.json()).then(setNotes).catch(() => {});
  useEffect(() => {
    fetch('/data/bella.json').then((r) => r.json()).then(setBella).catch(() => setOffline(true));
    fetch('/health').then((r) => r.json()).then(setHealth).catch(() => setOffline(true));
    fetch('/docs').then((r) => r.json()).then(setDocs).catch(() => {});
    loadNotes();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(OBI_KEY, dockObi ? 'open' : 'closed');
    } catch {}
  }, [dockObi]);

  // the address follows the view; in-page anchors (#overview) leave it alone
  useEffect(() => {
    const want = ws === 'atlas' ? `#/atlas/${atlasId}` : '#/health';
    if (window.location.hash !== want) window.history.replaceState(null, '', want);
  }, [ws, atlasId]);
  useEffect(() => {
    const on = () => {
      const r = routeOf(window.location.hash);
      if (!r) return;
      setWs(r.ws);
      if (r.id) setAtlasId(r.id);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // no grammar overlays on CHIP's fields
  useEffect(() => {
    for (const el of document.querySelectorAll('input, textarea')) el.setAttribute('data-gramm', 'false');
  });

  function toggleObi() {
    if (wide) setDockObi((o) => !o);
    else setDrawerObi((o) => !o);
  }

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('chip-search')?.focus();
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggleObi();
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        setCollapsed((c) => !c);
      } else if (e.altKey && WS_KEYS[e.code]) {
        e.preventDefault();
        setWs(WS_KEYS[e.code]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const failures = failuresOf(bella);
  const atlas = bella?.components.find((c) => c.id === atlasId) ?? null;
  const page = ws === 'atlas' ? `Atlas · ${atlas?.name ?? '…'}` : 'Health';

  function openAtlas(idOrName) {
    const c = idOrName ? bella?.components.find((x) => x.id === idOrName || x.name === idOrName) : null;
    if (c) setAtlasId(c.id);
    setWs('atlas');
    setNavOpen(false);
  }
  function sendToObi(text) {
    if (wide) setDockObi(true);
    else setDrawerObi(true);
    setQueued({ text, at: Date.now() });
  }
  function sandbox(name) {
    openAtlas(name);
    if (!wide) setDrawerObi(false);
    setFocusSandbox({ at: Date.now() });
  }

  const componentItems = (bella?.components ?? []).map((c) => ({
    href: `#/atlas/${c.id}`,
    label: c.name,
    badge: c.parts.length || undefined,
    current: ws === 'atlas' && c.id === atlasId,
  }));
  const groups = [
    ...(ws === 'health' ? [{ label: 'On this page', items: HEALTH_SECTIONS }] : []),
    { label: 'Components', items: componentItems },
  ];
  const onNavigate = (href, e) => {
    const r = routeOf(href);
    if (r) {
      e.preventDefault();
      if (r.id) openAtlas(r.id);
      else {
        setWs(r.ws);
        setNavOpen(false);
      }
    } else {
      setNavOpen(false);
    }
  };
  const sourceLine = bella ? (
    <p className="source-line">
      BELLA {bella.source.version} @ {bella.source.commit}
      {health ? ` · ${health.chunks.toLocaleString('en')} chunks indexed` : ''}
    </p>
  ) : null;

  const obi = (inDrawer) => (
    <Obi
      bella={bella}
      health={health}
      page={page}
      queued={queued}
      onOpenAtlas={(n) => {
        openAtlas(n);
        if (!wide) setDrawerObi(false);
      }}
      onSandbox={sandbox}
      onSaved={loadNotes}
      onClose={inDrawer ? null : () => setDockObi(false)}
      notify={setToast}
      inDrawer={inDrawer}
    />
  );

  return (
    <div className="shell" data-nav-collapsed={collapsed || undefined} data-obi={(wide && dockObi) || undefined}>
      <a className="skip" href="#main">
        Skip to workspace
      </a>

      <header className="topbar">
        {narrow ? (
          <Button variant="tertiary" onClick={() => setNavOpen(true)} ariaLabel="Open navigation">
            Menu
          </Button>
        ) : null}
        <p className="brand">CHIP</p>
        <Tabs tabs={WORKSPACES} value={ws} onChange={setWs} label="Workspaces" idBase="ws" className="ws-tabs" />
        <Palette bella={bella} docs={docs} onOpenAtlas={openAtlas} onAsk={sendToObi} />
        <div className="topbar-meta">
          <Button variant="secondary" onClick={toggleObi} ariaLabel={obiOpen ? 'Close OBI, Command J' : 'Open OBI, Command J'}>
            OBI <Kbd keys={['⌘', 'J']} />
          </Button>
          <SegmentedControl label="Theme" value={theme} onChange={setTheme} options={THEMES} />
        </div>
      </header>

      <div className="body">
        {!narrow ? (
          <aside className="sidebar">
            <NavList
              label="Sections"
              groups={groups}
              onNavigate={onNavigate}
              collapsed={collapsed}
              onToggle={() => setCollapsed((c) => !c)}
              footer={sourceLine}
            />
          </aside>
        ) : null}

        <main id="main" className="main" tabIndex={-1}>
          {offline ? (
            <p className="offline" role="alert">
              The CHIP server is not answering on 127.0.0.1:3100. Start it with npm start.
            </p>
          ) : null}
          <div {...tabPanelProps('ws', 'health', ws === 'health')}>
            <Health bella={bella} health={health} failures={failures} onOpenAtlas={openAtlas} onAsk={sendToObi} onRun={sendToObi} />
          </div>
          <div {...tabPanelProps('ws', 'atlas', ws === 'atlas')}>
            {ws === 'atlas' ? (
              <Atlas
                c={atlas}
                onAsk={(name) => sendToObi(`What's missing in ${name}, and how is it built?`)}
                bella={bella}
                theme={theme}
                notes={notes}
                focusSandbox={focusSandbox}
              />
            ) : null}
          </div>
        </main>

        {wide && dockObi ? (
          <aside className="obi-dock" data-theme="dark" aria-label="OBI">
            {obi(false)}
          </aside>
        ) : null}
      </div>

      {!wide ? (
        <div data-theme="dark">
          <Drawer open={drawerObi} onClose={() => setDrawerObi(false)} label="OBI" side="right" className="obi-drawer">
            {obi(true)}
          </Drawer>
        </div>
      ) : null}
      {narrow ? (
        <Drawer open={navOpen} onClose={() => setNavOpen(false)} label="CHIP">
          <NavList
            label="Sections"
            groups={[{ label: 'Workspace', items: WORKSPACES.map((w) => ({ href: `#/${w.id}`, label: w.label, current: ws === w.id })) }, ...groups]}
            onNavigate={onNavigate}
            footer={sourceLine}
          />
        </Drawer>
      ) : null}

      <p className="toast" role="status" aria-live="polite" data-show={toast ? '' : undefined}>
        {toast}
      </p>
    </div>
  );
}
