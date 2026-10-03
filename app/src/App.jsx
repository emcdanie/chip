import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import NavList from '@bella/components/NavList/NavList';
import Button from '@bella/components/Button/Button';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Drawer from '@bella/components/Drawer/Drawer';
import Select from '@bella/components/Select/Select';
import Health from './Health.jsx';
import Atlas from './Atlas.jsx';
import { useObi, OneInput, ObiPanel } from './Obi.jsx';
import { useTheme, THEMES } from './theme.js';

const WORKSPACES = [
  { id: 'health', label: 'Health' },
  { id: 'atlas', label: 'Atlas' },
];

const HEALTH_SECTIONS = [
  { href: '#overview', label: 'Overview' },
  { href: '#readiness', label: 'Readiness map' },
  { href: '#failures', label: 'Open failures' },
  { href: '#components', label: 'Components' },
];

// sidebar groups come from each contract's category; components without a
// contract say so instead of hiding
const CATEGORIES = ['Actions', 'Inputs', 'Layout', 'Data', 'Brand'];
const NO_CONTRACT = 'No contract yet';

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
  const [atlasView, setAtlasView] = useState('anatomy');
  const [collapsed, setCollapsed] = useState(false);
  const [bella, setBella] = useState(null);
  const [health, setHealth] = useState(null);
  const [docs, setDocs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [obiOpen, setObiOpen] = useState(() => {
    try {
      return localStorage.getItem(OBI_KEY) === 'open';
    } catch {
      return false;
    }
  });
  const narrow = useMedia('(max-width: 719px)');

  const loadNotes = () => fetch('/notes').then((r) => r.json()).then(setNotes).catch(() => {});
  useEffect(() => {
    fetch('/data/bella.json').then((r) => r.json()).then(setBella).catch(() => setOffline(true));
    fetch('/health').then((r) => r.json()).then(setHealth).catch(() => setOffline(true));
    fetch('/docs').then((r) => r.json()).then(setDocs).catch(() => {});
    loadNotes();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(OBI_KEY, obiOpen ? 'open' : 'closed');
    } catch {}
  }, [obiOpen]);

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

  const failures = failuresOf(bella);
  const atlas = bella?.components.find((c) => c.id === atlasId) ?? null;
  const page = ws === 'atlas' ? `Atlas · ${atlas?.name ?? '…'}` : 'Health';
  const obi = useObi({ bella, page, notify: setToast, onSaved: loadNotes });

  // asking opens OBI, so the answer has somewhere to land
  const send = (text) => {
    const ok = obi.send(text);
    if (ok) setObiOpen(true);
    else if (obi.busy) setToast('OBI is still answering. Try again in a moment.');
    return ok;
  };
  const obiApi = { ...obi, send };

  /* ---- the one input: one element, moved between the bar and the panel ---- */
  const [holder] = useState(() => {
    const d = document.createElement('div');
    d.className = 'one-input-holder';
    return d;
  });
  const barSlot = useRef(null);
  const panelSlot = useRef(null);
  useLayoutEffect(() => {
    const target = obiOpen ? panelSlot.current : barSlot.current;
    if (!target || holder.parentNode === target) return;
    // moving a node drops its focus; carry focus and the caret across
    const input = holder.querySelector('input');
    const had = input && document.activeElement === input;
    const sel = had ? [input.selectionStart, input.selectionEnd] : null;
    target.append(holder);
    if (had) {
      input.focus();
      input.setSelectionRange(...sel);
    }
  });

  function toggleObi() {
    setObiOpen((o) => !o);
  }
  function focusInput() {
    holder.querySelector('input')?.focus();
  }

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusInput();
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggleObi();
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        setCollapsed((c) => !c);
      } else if (e.altKey && WS_KEYS[e.code]) {
        e.preventDefault();
        setWs(WS_KEYS[e.code]);
      } else if (e.key === 'Escape' && obiOpen && !e.defaultPrevented && !navOpen) {
        // Esc closes OBI from anywhere (the input's own list closes first)
        setObiOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function openAtlas(idOrName, view) {
    const c = idOrName ? bella?.components.find((x) => x.id === idOrName || x.name === idOrName) : null;
    if (c) setAtlasId(c.id);
    if (view) setAtlasView(view);
    setWs('atlas');
    setNavOpen(false);
    if (narrow) setObiOpen(false); // the sheet covers the page at phone width
  }

  // Health shows its own sections; the component list belongs to Atlas
  const groups = [];
  if (ws === 'health') groups.push({ label: 'On this page', items: HEALTH_SECTIONS.filter((x) => x.href !== '#failures' || failures.length) });
  const byCat = {};
  for (const c of ws === 'atlas' ? bella?.components ?? [] : []) (byCat[c.category ?? NO_CONTRACT] ??= []).push(c);
  for (const cat of [...CATEGORIES, NO_CONTRACT]) {
    if (!byCat[cat]) continue;
    groups.push({
      label: cat,
      items: byCat[cat].map((c) => ({
        href: `#/atlas/${c.id}`,
        label: c.name,
        badge: c.parts.length ? `${c.parts.length} parts` : undefined,
        current: ws === 'atlas' && c.id === atlasId,
      })),
    });
  }
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

  return (
    <div className="shell" data-nav-collapsed={collapsed || undefined}>
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
        <div className="bar-slot">
          {/* the input lives in this empty node when OBI is closed; React never manages it */}
          <div ref={barSlot} className="bar-input" />
          {obiOpen ? (
            <ActionChip onClick={() => setObiOpen(false)} ariaLabel="OBI is open. Hide it (Command J)">
              OBI open · ⌘J
            </ActionChip>
          ) : null}
        </div>
        <Select label="Theme" value={theme} onChange={setTheme} options={THEMES} className="theme-select" />
      </header>

      <div className="body">
        {!narrow ? (
          <aside className="sidebar">
            <NavList label={ws === 'health' ? 'On this page' : 'Components'} groups={groups} onNavigate={onNavigate} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} footer={sourceLine} />
          </aside>
        ) : null}

        <main id="main" className="main" tabIndex={-1}>
          {offline ? (
            <p className="offline" role="alert">
              The CHIP server is not answering on 127.0.0.1:3100. Start it with npm start.
            </p>
          ) : null}
          <div {...tabPanelProps('ws', 'health', ws === 'health')}>
            <Health bella={bella} health={health} failures={failures} onOpenAtlas={openAtlas} onAsk={send} onRun={send} />
          </div>
          <div {...tabPanelProps('ws', 'atlas', ws === 'atlas')}>
            {ws === 'atlas' ? <Atlas c={atlas} bella={bella} theme={theme} notes={notes} view={atlasView} setView={setAtlasView} /> : null}
          </div>
        </main>
      </div>

      {/* OBI floats over the right edge; the page keeps its layout */}
      <div className="obi-layer" data-theme="dark" hidden={!obiOpen}>
        <ObiPanel
          bella={bella}
          health={health}
          page={page}
          obi={obiApi}
          inputSlot={panelSlot}
          onOpenAtlas={(n) => openAtlas(n)}
          onSandbox={(n) => openAtlas(n, 'try')}
          onClose={() => setObiOpen(false)}
          notify={setToast}
        />
      </div>

      {createPortal(
        <OneInput
          bella={bella}
          docs={docs}
          page={page}
          obi={obiApi}
          inPanel={obiOpen}
          onJump={(id) => openAtlas(id)}
          onEscape={() => (obiOpen ? setObiOpen(false) : document.activeElement?.blur())}
          notify={setToast}
        />,
        holder
      )}

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
