// CHIP's frame, as the approved mocks draw it (chip-mock-03, chip-workpanel-01):
// a top bar (wordmark, Find ⌘K, the Work toggle ⌘J), the left nav
// (icons, counts, pins, Collapse; an icon rail under 1180px; Components opens
// the library tree) and the Work panel, docked right or along the bottom, the
// page making room for it. Pages drop into <main>. Needs you, the sessions,
// the terminals and OBI all live in the panel (WorkPanel.jsx). A page rebuilt
// on the kit marks its root k-chrome, so BELLA's Button takes CHIP's blue
// there and nowhere near a specimen (tokens.css).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Health, { COLS } from './Health.jsx';
import Today from './Today.jsx';
import Atlas from './Atlas.jsx';
import Connectors from './Connectors.jsx';
import Foundations from './Foundations.jsx';
import History from './History.jsx';
import Playground from './Playground.jsx';
import Projects from './Projects.jsx';
import ReviewSheet from './ReviewSheet.jsx';
import RunSheet, { startRun } from './Runs.jsx';
import { WorkPanel, useWork, useNeeds, useLanes, clampW, clampH, maxW, maxH, minH } from './WorkPanel.jsx';
import { useObi, OneInput, SourceSheet } from './Obi.jsx';
import { useTheme } from './theme.js';
import { useRole, useVisibility } from './visibility.jsx';
import './shell.css';

// route ids stay (#/health, #/atlas/<id>, #/docs, #/connectors), so old links open
const PAGES = [
  { id: 'health', label: 'Today', icon: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /></> },
  { id: 'foundations', label: 'Foundations', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" /></> },
  { id: 'atlas', label: 'Components', icon: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></> },
  { id: 'play', label: 'Playground', icon: <><rect x="3.5" y="4.5" width="17" height="13" rx="1.5" /><path d="M9 21h6M12 17.5V21" /><path d="M8 13l3-3 2 2 3-3" /></> },
  { id: 'docs', label: 'History', icon: <><path d="M3 12h18" /><circle cx="7" cy="12" r="2.2" fill="currentColor" /><circle cx="13" cy="12" r="2.2" fill="currentColor" /><circle cx="19" cy="12" r="2.2" /></> },
  { id: 'connectors', label: 'Connectors', icon: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8 7.5l3 8M16 7.5l-3 8" /></> },
  { id: 'projects', label: 'Projects', icon: <><path d="M3.5 7.5v11a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 19 8h-7l-2-2.5H5A1.5 1.5 0 0 0 3.5 7z" /></> },
  { id: 'coverage', label: 'Health', icon: <path d="M3 12h4l2.5-6 4 12 2.5-6h5" /> },
];
const NAME = Object.fromEntries(PAGES.map((p) => [p.id, p.label]));
const GROUP_ORDER = ['Actions', 'Inputs', 'Layout', 'Data', 'Chat', 'Brand', 'Other'];
const WS_KEYS = { Digit1: 'health', Digit2: 'foundations', Digit3: 'atlas', Digit4: 'play', Digit5: 'docs', Digit6: 'connectors', Digit7: 'projects', Digit8: 'coverage' };
// v2: Claude answers by default (Elleta, 3 Nov: the local model isn't good
// enough on stage); the local model stays one pick away
const MODEL_KEY = 'chip-model-v2';

// #/play/<project>?route=<page> opens a project's page in the Playground
function routeOf(hash) {
  const m = hash.match(/^#\/(health|foundations|atlas|play|docs|connectors|projects|coverage)(?:\/([\w-]+))?(?:\?route=([^&]*))?$/);
  if (!m) return null;
  let route;
  try {
    route = m[3] ? decodeURIComponent(m[3]) : undefined;
  } catch {}
  return { ws: m[1], id: m[2], route };
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

const PIN = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" />
  </svg>
);

export default function App() {
  const [theme] = useTheme();
  // simulated until CHIP is hosted: the role Components reads (View as left the top bar for Lead with)
  const [role] = useRole();
  const [vis, setVis] = useVisibility();
  const start = routeOf(window.location.hash) ?? { ws: 'health' };
  const [ws, setWs] = useState(start.ws);
  const [atlasId, setAtlasId] = useState(start.ws === 'atlas' ? start.id ?? 'button' : 'button');
  const [docId, setDocId] = useState(start.ws === 'docs' ? start.id ?? null : null);
  const [projId, setProjId] = useState(start.ws === 'projects' ? start.id ?? null : null);
  // what the Playground was asked to open: { project, route }, from #/play/<project>?route=
  const [playTarget, setPlayTarget] = useState(start.ws === 'play' && start.id ? { project: start.id, route: start.route } : null);
  const [docsVersion, setDocsVersion] = useState(0); // bumped when OBI saves a doc
  const [bella, setBella] = useState(null);
  const [docs, setDocs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [connectors, setConnectors] = useState(null); // GET /host's counts, for the nav
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState('');
  const [trySignal, setTrySignal] = useState(null);
  const lens = 'visual'; // the Lead with switch is out for now (Elleta, 6 Nov); pages keep their lens prop

  /* ---- the frame: nav collapse, the Work panel, the narrow drawer ---- */
  const wide = useMedia('(min-width: 961px)');
  const narrow = !wide;
  const [sidePref, setSidePref] = useState(() => stored('chip-side', ''));
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const f = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  const winW = win.w;
  const [work, setWork] = useWork();
  // under 961px the panel always docks at the bottom (no room beside the page)
  const dock = wide ? work.dock : 'bottom';
  const right = work.open && dock === 'right';
  // the panel docked right folds the nav to the rail whenever the full nav
  // would leave the page under 600px, at any width and over an Expand: the
  // page keeps its columns, and Expand hides until there is room for it
  const cramped = right && winW - 256 - clampW(work.w, winW, 256) < 600;
  const collapsed = sidePref === 'col' || cramped || (sidePref !== 'open' && winW < 1180);
  const navW = !wide ? 0 : collapsed ? 104 : 256;
  const wpW = clampW(work.w, winW, navW);
  const wpH = clampH(work.h, win.h);
  const [navOn, setNavOn] = useState(false);
  const workToggle = useRef(null);
  const setOpen = (open) => {
    setWork({ open });
    if (open) requestAnimationFrame(() => document.querySelector('#work [role=tab][aria-selected=true]')?.focus());
    else requestAnimationFrame(() => workToggle.current?.focus());
  };
  const setCollapsed = (on) => {
    setSidePref(on ? 'col' : 'open');
    store('chip-side', on ? 'col' : 'open');
  };

  /* ---- OBI ---- */
  const [models, setModels] = useState([]);
  const [budget, setBudget] = useState(null);
  const [picked, setPicked] = useState(() => stored(MODEL_KEY, 'claude'));
  useEffect(() => store(MODEL_KEY, picked), [picked]);

  // strict (Overview's Refresh) hands the error back instead of only flagging offline
  const loadBella = (strict) =>
    fetch('/data/bella.json')
      .then((r) => {
        if (!r.ok) throw new Error(`bella.json answered ${r.status}`);
        return r.json();
      })
      .then((b) => (setBella(b), setOffline(false), b))
      .catch((e) => {
        if (strict) throw e;
        setOffline(true);
      });
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
    loadBella();
    fetch('/docs').then((r) => r.json()).then(setDocs).catch(() => {});
    loadNotes();
    loadModels();
  }, []);
  useEffect(() => {
    const load = () => fetch('/host').then((r) => r.json()).then((h) => setConnectors(h.counts)).catch(() => {});
    load();
    window.addEventListener('chip:changed', load);
    return () => window.removeEventListener('chip:changed', load);
  }, []);

  // the address follows the view
  useEffect(() => {
    const want =
      ws === 'atlas' ? `#/atlas/${atlasId}`
      : ws === 'docs' && docId ? `#/docs/${docId}`
      : ws === 'projects' && projId ? `#/projects/${projId}`
      : ws === 'play' && playTarget ? `#/play/${playTarget.project}${playTarget.route ? `?route=${encodeURIComponent(playTarget.route)}` : ''}`
      : `#/${ws}`;
    if (window.location.hash !== want) window.history.replaceState(null, '', want);
  }, [ws, atlasId, docId, projId, playTarget]);
  useEffect(() => {
    const on = () => {
      const r = routeOf(window.location.hash);
      if (!r) return;
      setWs(r.ws);
      if (r.ws === 'docs') setDocId(r.id ?? null);
      else if (r.ws === 'projects') setProjId(r.id ?? null);
      else if (r.ws === 'play') setPlayTarget(r.id ? { project: r.id, route: r.route } : null);
      else if (r.id) setAtlasId(r.id);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  // a new page starts at its top, with focus on its heading
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      const h1 = document.querySelector('main h1');
      if (!h1) return;
      h1.tabIndex = -1; // BELLA's Heading takes no tabIndex
      h1.focus({ preventScroll: true });
    });
  }, [ws]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // no grammar overlays on CHIP's fields
  useEffect(() => {
    for (const el of document.querySelectorAll('input, textarea')) el.setAttribute('data-gramm', 'false');
  });

  const atlas = bella?.components.find((c) => c.id === atlasId) ?? null;
  const page = ws === 'atlas' ? `Components · ${atlas?.name ?? '…'}` : NAME[ws];
  const needs = useNeeds();
  const lanes = useLanes();
  const obi = useObi({ bella, page, notify: setToast, onSaved: loadNotes, models, budget, picked, onAnswered: loadModels, onDocSaved: () => setDocsVersion((v) => v + 1) });
  // asking opens the panel on Ask OBI, so the answer has somewhere to land
  const send = (text) => {
    const ok = obi.send(text);
    if (ok) setWork({ open: true, tab: 'ask' });
    else if (obi.busy) setToast('OBI is still answering. Try again in a moment.');
    return ok;
  };
  const obiApi = { ...obi, send };
  // any run started anywhere (a page, a review card) opens Work on Sessions, where its result lands
  useEffect(() => {
    const on = () => setWork({ open: true, tab: 'sessions' });
    window.addEventListener('chip:run-started', on);
    return () => window.removeEventListener('chip:run-started', on);
  }, [setWork]);
  // "Fix in a session": Claude Code runs the brief headless on a BELLA
  // branch (Runs.jsx); its progress and result show in the panel's Sessions
  // tree, and its row opens the report with Accept or Undo. Before 4 Nov the
  // brief only went to the clipboard and Claude opened empty.
  const session = async (brief, title) => {
    try {
      await startRun(brief, title, NAME[ws] ?? 'a page');
      setWork({ open: true, tab: 'sessions' });
    } catch (e) {
      setToast(e.message);
    }
  };

  // the top bar's Find is hidden under 1101px, as the mock does: ⌘K asks in the panel there
  const searchShown = useMedia('(min-width: 1101px)');

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searchShown) document.getElementById('find')?.focus();
        else {
          setWork({ open: true, tab: 'ask' });
          requestAnimationFrame(() => document.getElementById('wp-ask')?.focus());
        }
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen(!work.open);
      } else if (e.altKey && WS_KEYS[e.code]) {
        e.preventDefault();
        go(WS_KEYS[e.code]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function go(id) {
    setWs(id);
    setNavOn(false);
  }
  function openAtlas(idOrName, section) {
    const c = idOrName ? bella?.components.find((x) => x.id === idOrName || x.name === idOrName) : null;
    if (c) setAtlasId(c.id);
    go('atlas');
    if (section) setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }), 300);
  }

  /* ---- the nav: counts, pins, the library tree ---- */
  const failedGate = needs?.gate?.failed ?? 0;
  const needConnector = connectors?.attention ?? [];
  const COUNT = {
    health: failedGate ? { n: failedGate, dot: true, title: `The gate fails ${failedGate} of ${needs.gate.total} checks` } : null,
    atlas: bella ? { n: bella.components.length, title: `${bella.components.length} components` } : null,
    connectors: needConnector.length ? { n: needConnector.length, dot: true, title: `${needConnector.length} connector${needConnector.length === 1 ? ' needs' : 's need'} you: ${needConnector.join(', ')}` } : null,
  };
  const [pins, setPins] = useState(() => {
    try {
      return JSON.parse(stored('chip-pins', '[]'));
    } catch {
      return [];
    }
  });
  const togglePin = (k) =>
    setPins((p) => {
      const next = p.includes(k) ? p.filter((x) => x !== k) : [...p, k];
      store('chip-pins', JSON.stringify(next));
      return next;
    });
  const [compQ, setCompQ] = useState('');
  const groups = useMemo(() => {
    const g = {};
    for (const c of bella?.components ?? []) (g[c.category ?? 'Other'] ??= []).push(c);
    return GROUP_ORDER.filter((k) => g[k]).map((k) => [k, g[k].sort((a, b) => a.name.localeCompare(b.name))]);
  }, [bella]);
  const [openG, setOpenG] = useState(() => new Set());
  const currentGroup = atlas?.category ?? 'Other';
  const gapsOf = (c) => COLS.filter((k) => !k.of(c, [])).length;
  const pinRow = (key, label) => (
    <button type="button" className={`pinb${pins.includes(key) ? ' on' : ''}`} aria-pressed={pins.includes(key)} aria-label={`${pins.includes(key) ? 'Unpin' : 'Pin'} ${label}`} onClick={() => togglePin(key)}>
      {PIN}
    </button>
  );
  const navItem = (p, pinned) => {
    const cnt = COUNT[p.id];
    return (
      <div className="navrow" key={(pinned ? 'pin-' : '') + p.id}>
        <a
          className="navitem"
          href={`#/${p.id}`}
          aria-current={ws === p.id && !pinned ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            go(p.id);
          }}
        >
          <span className="nico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20">
              {p.icon}
            </svg>
          </span>
          <span className="nlab">{p.label}</span>
          {cnt && !pinned ? (
            <span className={cnt.dot ? 'adot fail' : 'count'} title={cnt.title}>
              {cnt.n}
              <span className="k-vh">: {cnt.title}</span>
            </span>
          ) : null}
        </a>
        {pinRow(`page:${p.id}`, p.label)}
      </div>
    );
  };
  const compItem = (c, pinned) => {
    const g = gapsOf(c);
    return (
      <li className="navrow" key={(pinned ? 'pin-' : '') + c.id}>
        <a
          href={`#/atlas/${c.id}`}
          className={pinned ? 'navitem pinned' : 'compitem'}
          aria-current={ws === 'atlas' && atlasId === c.id && !pinned ? 'page' : undefined}
          title={g ? `${g} check${g > 1 ? 's' : ''} missing` : undefined}
          onClick={(e) => {
            e.preventDefault();
            openAtlas(c.id);
          }}
        >
          {pinned ? (
            <span className="nico" aria-hidden="true">
              <b className="pini">{c.name.slice(0, 2)}</b>
            </span>
          ) : null}
          <span className="nlab">{c.name}</span>
          {g && !pinned ? (
            <span className="adot job">
              {g}
              <span className="k-vh"> missing</span>
            </span>
          ) : null}
        </a>
        {pinned ? pinRow(`comp:${c.id}`, c.name) : null}
      </li>
    );
  };
  const q = compQ.trim().toLowerCase();
  const pinList = pins
    .map((k) => {
      const [t, id] = k.split(':');
      if (t === 'page') return PAGES.find((p) => p.id === id) && navItem(PAGES.find((p) => p.id === id), true);
      const c = bella?.components.find((x) => x.id === id);
      return c ? <ul key={k}>{compItem(c, true)}</ul> : null;
    })
    .filter(Boolean);

  const side = (
    <nav className="side" id="side" aria-label="CHIP">
      {wide && !cramped ? (
        <button type="button" className="sidecol" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          <span aria-hidden="true">{collapsed ? '⇥' : '⇤'}</span> <span className="nlab">{collapsed ? 'Expand' : 'Collapse'}</span>
        </button>
      ) : null}
      {pinList.length ? (
        <div className="pins">
          <p className="pinh">Pinned</p>
          {pinList}
        </div>
      ) : null}
      {PAGES.map((p) => (
        <React.Fragment key={p.id}>
          {navItem(p)}
          {p.id === 'atlas' && ws === 'atlas' && bella && !collapsed ? (
            <div className="complist">
              <label className="k-vh" htmlFor="compQ">
                Filter components
              </label>
              <input id="compQ" placeholder={`Filter ${bella.components.length} components…`} autoComplete="off" value={compQ} onChange={(e) => setCompQ(e.target.value)} />
              <div>
                {groups.map(([g, cs]) => {
                  const m = cs.filter((c) => c.name.toLowerCase().includes(q));
                  if (q && !m.length) return null;
                  const open = q ? true : openG.has(g) !== (g === currentGroup);
                  return (
                    <div className="cgrp" key={g}>
                      <button
                        type="button"
                        className="cgh"
                        aria-expanded={open}
                        onClick={() =>
                          setOpenG((s) => {
                            const n = new Set(s);
                            n.has(g) ? n.delete(g) : n.add(g);
                            return n;
                          })
                        }
                      >
                        {g}
                        <span>{cs.length}</span>
                      </button>
                      {open ? <ul>{m.map((c) => compItem(c))}</ul> : null}
                    </div>
                  );
                })}
                {q && !groups.some(([, cs]) => cs.some((c) => c.name.toLowerCase().includes(q))) ? <p className="none2">No match</p> : null}
              </div>
            </div>
          ) : null}
        </React.Fragment>
      ))}
    </nav>
  );

  const needCount = needs?.items.length ?? 0;
  const resize = (px) => setWork(dock === 'right' ? { w: clampW(px, winW, navW), sized: true } : { h: clampH(px, win.h) });

  return (
    <div
      className={`app${work.open ? ` wpon dock-${dock}` : ''}${collapsed && wide ? ' navcollapsed' : ''}${navOn ? ' navon' : ''}`}
      style={{ '--wp-w': `${wpW}px`, '--wp-h': `${wpH}px` }}
      data-lead={lens}
    >
      <a className="skip" href="#main">
        Skip to the page
      </a>
      <header className="top">
        <a
          className="brand"
          href="#/health"
          onClick={(e) => {
            e.preventDefault();
            go('health');
          }}
        >
          CHIP<span>.</span>
        </a>
        {narrow ? (
          <button type="button" className="menubtn" aria-expanded={navOn} aria-controls="side" onClick={() => setNavOn((o) => !o)}>
            Menu
          </button>
        ) : null}
        <div className="search" hidden={!searchShown}>
          <OneInput
            find
            id="find"
            bella={bella}
            docs={docs}
            pages={PAGES}
            page={page}
            obi={obiApi}
            onJump={(id, kind) => (kind === 'page' ? go(id) : openAtlas(id))}
            onEscape={() => document.activeElement?.blur()}
            notify={setToast}
          />
        </div>
        <button type="button" className="wtoggle" ref={workToggle} aria-expanded={work.open} aria-controls="work" onClick={() => setOpen(!work.open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            {dock === 'right' ? <path d="M15 4v16" /> : <path d="M3 15h18" />}
          </svg>
          Work <span className="count">{needs ? needCount : '…'}</span>
          <span className="k-vh"> need you</span>
          <kbd aria-hidden="true">⌘J</kbd>
        </button>
      </header>

      {side}

      <main id="main" tabIndex={-1}>
        <div className="main">
          {offline ? (
            <p className="k-note" role="alert">
              The CHIP server is not answering. Start it with npm start.
            </p>
          ) : null}
          {ws === 'health' ? <Today bella={bella} needs={needs} onSession={session} onRefresh={() => loadBella(true)} onLane={() => setWork({ open: true, tab: 'sessions' })} onHealth={() => go('coverage')} /> : null}
          {ws === 'coverage' ? <Health bella={bella} onOpenAtlas={openAtlas} onSession={session} onRefresh={() => loadBella(true)} /> : null}
          {ws === 'foundations' ? <Foundations bella={bella} onSession={session} onOpenAtlas={openAtlas} /> : null}
          {ws === 'docs' ? <History docId={docId} version={docsVersion} bella={bella} lens={lens} onOpenAtlas={openAtlas} onSession={session} /> : null}
          {ws === 'play' ? <Playground onToast={setToast} project={playTarget?.project} route={playTarget?.route} onTarget={setPlayTarget} /> : null}
          {ws === 'projects' ? <Projects projectId={projId} onProject={setProjId} /> : null}
          {ws === 'connectors' ? <Connectors narrow={narrow} /> : null}
          {ws === 'atlas' ? <Atlas c={atlas} bella={bella} lens={lens} theme={theme} notes={notes} onOpen={openAtlas} showLibrary={false} trySignal={trySignal} onTryUsed={() => setTrySignal(null)} role={role} vis={vis} setVis={setVis} pinned={atlas ? pins.includes(`comp:${atlas.id}`) : false} onPin={atlas ? () => togglePin(`comp:${atlas.id}`) : undefined} /> : null}
        </div>
      </main>

      {/* mounted while closed too: the terminals keep running behind ⌘J */}
      <WorkPanel
          open={work.open}
          st={work}
          set={setWork}
          dock={dock}
          canDock={wide}
          size={dock === 'right' ? wpW : wpH}
          limits={dock === 'right' ? [360, maxW(winW, navW)] : [minH(win.h), maxH(win.h)]}
          onResize={resize}
          onClose={() => setOpen(false)}
          needs={needs}
          lanes={lanes}
          notify={setToast}
          obiProps={{
            bella,
            page,
            obi: obiApi,
            onOpenAtlas: openAtlas,
            onSandbox: (n) => {
              openAtlas(n);
              setTrySignal({ at: Date.now() });
            },
            notify: setToast,
            models,
            picked,
            setPicked,
            budget,
          }}
          inputProps={{
            bella,
            docs,
            pages: PAGES,
            page,
            obi: obiApi,
            onJump: (id, kind) => (kind === 'page' ? go(id) : openAtlas(id)),
            notify: setToast,
            cloud: models.find((m) => m.id === picked)?.place === 'cloud',
            models,
            budget,
            picked,
          }}
        />

      <ReviewSheet />
      <RunSheet />
      <SourceSheet />

      <p className={`toast${toast ? ' on' : ''}`} role="status" aria-live="polite">
        {toast}
      </p>
    </div>
  );
}
