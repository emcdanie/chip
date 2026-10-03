import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Tabs, { tabPanelProps } from '@bella/components/Tabs/Tabs';
import NavList from '@bella/components/NavList/NavList';
import Button from '@bella/components/Button/Button';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import Drawer from '@bella/components/Drawer/Drawer';
import Select from '@bella/components/Select/Select';
import Health from './Health.jsx';
import Atlas, { Library } from './Atlas.jsx';
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

const WS_KEYS = { Digit1: 'health', Digit2: 'atlas' };
const OBI_KEY = 'chip-obi-open';
const MODEL_KEY = 'chip-model';
const DOCK_KEY = 'chip-dock-height';
const DOCK_MIN = 160; // px, the brief's floor
const PAGE_MIN = 320; // px the page keeps above the dock

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

const stored = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

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
  const [navOpen, setNavOpen] = useState(false);
  const [trySignal, setTrySignal] = useState(null);
  const [obiOpen, setObiOpen] = useState(() => stored(OBI_KEY, 'closed') === 'open');
  const [dockH, setDockH] = useState(() => Number(stored(DOCK_KEY, '')) || Math.round(window.innerHeight * 0.34));
  const narrow = useMedia('(max-width: 719px)');
  const [models, setModels] = useState([]);
  const [budget, setBudget] = useState(null);
  const [picked, setPicked] = useState(() => stored(MODEL_KEY, 'auto'));
  useEffect(() => store(MODEL_KEY, picked), [picked]);
  useEffect(() => store(OBI_KEY, obiOpen ? 'open' : 'closed'), [obiOpen]);
  useEffect(() => store(DOCK_KEY, String(dockH)), [dockH]);

  const loadModels = () =>
    fetch('/models')
      .then((r) => r.json())
      .then((m) => {
        setModels(m.models);
        setBudget(m.budget);
      })
      .catch(() => {});
  const loadNotes = () => fetch('/notes').then((r) => r.json()).then(setNotes).catch(() => {});
  useEffect(() => {
    fetch('/data/bella.json').then((r) => r.json()).then(setBella).catch(() => setOffline(true));
    fetch('/health').then((r) => r.json()).then(setHealth).catch(() => setOffline(true));
    fetch('/docs').then((r) => r.json()).then(setDocs).catch(() => {});
    loadNotes();
    loadModels();
  }, []);

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
  const obi = useObi({ bella, page, notify: setToast, onSaved: loadNotes, models, budget, picked, onAnswered: loadModels });
  // asking opens OBI, so the answer has somewhere to land
  const send = (text) => {
    const ok = obi.send(text);
    if (ok) setObiOpen(true);
    else if (obi.busy) setToast('OBI is still answering. Try again in a moment.');
    return ok;
  };
  const obiApi = { ...obi, send };

  /* ---- the dock's height: dragged, remembered, never squeezing the page under 320px ---- */
  const topbar = useRef(null);
  const capH = (h) => {
    const room = window.innerHeight - (topbar.current?.offsetHeight ?? 64) - PAGE_MIN;
    return Math.round(Math.max(DOCK_MIN, Math.min(h, room)));
  };
  useEffect(() => {
    const fit = () => setDockH((h) => capH(h));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  function startDrag(e) {
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = dockH;
    const move = (ev) => setDockH(capH(h0 + (y0 - ev.clientY)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function dragKeys(e) {
    const step = e.shiftKey ? 80 : 24;
    if (e.key === 'ArrowUp') setDockH((h) => capH(h + step));
    else if (e.key === 'ArrowDown') setDockH((h) => capH(h - step));
    else return;
    e.preventDefault();
  }

  /* ---- the one input: one element, moved between the bar and the dock ---- */
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

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (narrow) setObiOpen(true);
        requestAnimationFrame(() => holder.querySelector('input')?.focus());
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setObiOpen((o) => !o);
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        setCollapsed((c) => !c);
      } else if (e.altKey && WS_KEYS[e.code]) {
        e.preventDefault();
        setWs(WS_KEYS[e.code]);
      } else if (e.key === 'Escape' && obiOpen && !e.defaultPrevented && !navOpen) {
        setObiOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function openAtlas(idOrName) {
    const c = idOrName ? bella?.components.find((x) => x.id === idOrName || x.name === idOrName) : null;
    if (c) setAtlasId(c.id);
    setWs('atlas');
    setNavOpen(false);
    if (narrow) setObiOpen(false); // the sheet covers the page at phone width
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
  const healthGroups = [{ label: 'On this page', items: HEALTH_SECTIONS.filter((x) => x.href !== '#failures' || failures.length) }];
  const sourceLine = bella ? (
    <p className="source-line">
      BELLA {bella.source.version} @ <span className="mono">{bella.source.commit}</span>
    </p>
  ) : null;

  return (
    <div className="shell" data-nav-collapsed={collapsed || undefined} data-ws={ws} data-obi={obiOpen || undefined}>
      <a className="skip" href="#main">
        Skip to workspace
      </a>

      <header className="topbar" ref={topbar}>
        {narrow ? (
          <>
            {/* sentence case: Button keeps its caps keycap label, these are quiet actions */}
            <ActionChip onClick={() => setNavOpen(true)} ariaLabel="Open the menu">
              Menu
            </ActionChip>
            <p className="brand">CHIP</p>
            <p className="here">{page}</p>
            <ActionChip onClick={() => setObiOpen((o) => !o)} ariaLabel={obiOpen ? 'Close OBI' : 'Open OBI'}>
              OBI
            </ActionChip>
          </>
        ) : (
          <>
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
          </>
        )}
      </header>

      <div className="body">
        {!narrow && ws === 'health' ? (
          <aside className="sidebar">
            <NavList label="On this page" groups={healthGroups} onNavigate={onNavigate} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} footer={sourceLine} />
          </aside>
        ) : null}

        {/* the page above, OBI docked below like an editor's terminal panel */}
        <div className="work" style={obiOpen && !narrow ? { '--dock-h': `${dockH}px` } : undefined}>
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
              {ws === 'atlas' ? (
                <Atlas c={atlas} bella={bella} theme={theme} notes={notes} onOpen={openAtlas} showLibrary={!narrow} trySignal={trySignal} onTryUsed={() => setTrySignal(null)} />
              ) : null}
            </div>
          </main>

          <aside className="dock" data-theme="dark" hidden={!obiOpen} aria-label="OBI">
            {!narrow ? (
              <div
                className="dock-handle"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize OBI"
                aria-valuemin={DOCK_MIN}
                aria-valuemax={capH(Number.MAX_SAFE_INTEGER)}
                aria-valuenow={dockH}
                tabIndex={0}
                onPointerDown={startDrag}
                onKeyDown={dragKeys}
              />
            ) : null}
            <ObiPanel
              bella={bella}
              health={health}
              page={page}
              obi={obiApi}
              inputSlot={panelSlot}
              onOpenAtlas={(n) => openAtlas(n)}
              onSandbox={(n) => {
                openAtlas(n);
                setTrySignal({ at: Date.now() });
              }}
              onClose={() => setObiOpen(false)}
              notify={setToast}
              models={models}
              picked={picked}
              setPicked={setPicked}
              budget={budget}
            />
          </aside>
        </div>
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
          cloud={models.find((m) => m.id === picked)?.place === 'cloud'}
          models={models}
          budget={budget}
          picked={picked}
        />,
        holder
      )}

      {narrow ? (
        <Drawer open={navOpen} onClose={() => setNavOpen(false)} label="CHIP">
          <div className="drawer-stack">
            <NavList
              label="Workspace"
              groups={[{ label: 'Workspace', items: WORKSPACES.map((w) => ({ href: `#/${w.id}`, label: w.label, current: ws === w.id })) }, ...(ws === 'health' ? healthGroups : [])]}
              onNavigate={onNavigate}
            />
            {ws === 'atlas' && bella ? <Library bella={bella} current={atlasId} onOpen={openAtlas} /> : null}
            <Select label="Theme" value={theme} onChange={setTheme} options={THEMES} />
            {sourceLine}
          </div>
        </Drawer>
      ) : null}

      <p className="toast" role="status" aria-live="polite" data-show={toast ? '' : undefined}>
        {toast}
      </p>
    </div>
  );
}
