// CHIP's frame, as the approved mock draws it (chip-mock-03): a top bar
// (wordmark, Ask OBI or jump to ⌘K, Lead with, The Bar toggle), the left nav
// (icons, counts, pins, Collapse; an icon rail under 1180px; Components opens
// the library tree) and The Bar docked on the right. Pages drop into <main>.
// OBI, Claude and the terminal open in the work sheet: from the top-bar
// input, The Bar's input and Lanes, ⌘J, or a Needs-you item. A page rebuilt
// on the kit marks its root k-chrome, so BELLA's Button takes CHIP's blue
// there and nowhere near a specimen (tokens.css).
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Health, { COLS } from './Health.jsx';
import Atlas from './Atlas.jsx';
import Connectors from './Connectors.jsx';
import Foundations from './Foundations.jsx';
import History from './History.jsx';
import Playground from './Playground.jsx';
import ReviewSheet from './ReviewSheet.jsx';
import { TheBar, useBar, useNeeds } from './TheBar.jsx';
import { useObi, OneInput, ObiPanel } from './Obi.jsx';
import { PageHeader, Sheet } from './kit/index.jsx';
import { useTheme } from './theme.js';
import { useRole, useVisibility } from './visibility.jsx';
import './shell.css';

// route ids stay (#/health, #/atlas/<id>, #/docs, #/connectors), so old links open
const PAGES = [
  { id: 'health', label: 'Overview', icon: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /></> },
  { id: 'foundations', label: 'Foundations', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" /></> },
  { id: 'atlas', label: 'Components', icon: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></> },
  { id: 'play', label: 'Playground', icon: <><rect x="3.5" y="4.5" width="17" height="13" rx="1.5" /><path d="M9 21h6M12 17.5V21" /><path d="M8 13l3-3 2 2 3-3" /></> },
  { id: 'docs', label: 'History', icon: <><path d="M3 12h18" /><circle cx="7" cy="12" r="2.2" fill="currentColor" /><circle cx="13" cy="12" r="2.2" fill="currentColor" /><circle cx="19" cy="12" r="2.2" /></> },
  { id: 'connectors', label: 'Connectors', icon: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8 7.5l3 8M16 7.5l-3 8" /></> },
];
const NAME = Object.fromEntries(PAGES.map((p) => [p.id, p.label]));
const GROUP_ORDER = ['Actions', 'Inputs', 'Layout', 'Data', 'Chat', 'Brand', 'Other'];
const LENSES = [
  { id: 'visual', label: 'Visual' },
  { id: 'technical', label: 'Technical' },
  { id: 'scope', label: 'Scope' },
];
const WS_KEYS = { Digit1: 'health', Digit2: 'foundations', Digit3: 'atlas', Digit4: 'play', Digit5: 'docs', Digit6: 'connectors' };
// v2: Claude answers by default (Elleta, 3 Nov: the local model isn't good
// enough on stage); the local model stays one pick away
const MODEL_KEY = 'chip-model-v2';
const WORK_NAME = { obi: 'OBI', claude: 'Claude', term: 'Terminal' };

function routeOf(hash) {
  const m = hash.match(/^#\/(health|foundations|atlas|play|docs|connectors)(?:\/([\w-]+))?$/);
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

// Lead with: a radiogroup (one of three, no panels), arrows move and choose
function Lens({ value, onChange }) {
  const ref = useRef(null);
  const keys = (e) => {
    const i = LENSES.findIndex((l) => l.id === value);
    const n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const next = LENSES[(n + LENSES.length) % LENSES.length];
    onChange(next.id);
    ref.current.querySelector(`[data-lens="${next.id}"]`)?.focus();
  };
  return (
    <div className="leadwith">
      <span className="lwl" id="lwL">
        Lead with
      </span>
      <div className="seg" role="radiogroup" aria-labelledby="lwL" ref={ref} onKeyDown={keys}>
        {LENSES.map((l) => (
          <button key={l.id} type="button" role="radio" data-lens={l.id} aria-checked={l.id === value} tabIndex={l.id === value ? 0 : -1} onClick={() => onChange(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const [docsVersion, setDocsVersion] = useState(0); // bumped when OBI saves a doc
  const [bella, setBella] = useState(null);
  const [docs, setDocs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [map, setMap] = useState(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState('');
  const [trySignal, setTrySignal] = useState(null);
  const [lens, setLens] = useState(() => stored('chip-lens', 'visual'));
  useEffect(() => store('chip-lens', lens), [lens]);

  /* ---- the frame: nav collapse, The Bar, the narrow drawer ---- */
  const wide = useMedia('(min-width: 961px)');
  const narrow = !wide;
  const [sidePref, setSidePref] = useState(() => stored('chip-side', ''));
  const [winW, setWinW] = useState(window.innerWidth);
  useEffect(() => {
    const f = () => setWinW(window.innerWidth);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  const [barOn, setBarOn] = useState(() => stored('chip-bar', '1') === '1' && wide);
  // opening The Bar on a window under 1281px folds the nav, so the page keeps its columns
  const [barFolded, setBarFolded] = useState(false);
  const collapsed = sidePref === 'col' || (sidePref !== 'open' && (winW < 1180 || barFolded));
  const [navOn, setNavOn] = useState(false);
  const barToggle = useRef(null);
  const setBar = (on, focusBack) => {
    setBarOn(on);
    store('chip-bar', on ? '1' : '0');
    if (on && winW < 1281) setBarFolded(true);
    if (!on) setBarFolded(false);
    if (focusBack) barToggle.current?.focus();
  };
  const setCollapsed = (on) => {
    setSidePref(on ? 'col' : 'open');
    store('chip-side', on ? 'col' : 'open');
  };
  useEffect(() => {
    if (!wide) setBarOn(false);
  }, [wide]);

  /* ---- OBI, Claude and the terminal: one work sheet ---- */
  const [work, setWork] = useState(null); // null | 'obi' | 'claude' | 'term'
  const [inject, setInject] = useState(null);
  const [models, setModels] = useState([]);
  const [budget, setBudget] = useState(null);
  const [picked, setPicked] = useState(() => stored(MODEL_KEY, 'claude'));
  useEffect(() => store(MODEL_KEY, picked), [picked]);

  const loadBella = () =>
    fetch('/data/bella.json')
      .then((r) => r.json())
      .then(setBella)
      .catch(() => setOffline(true));
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
    fetch('/map').then((r) => r.json()).then(setMap).catch(() => {});
    loadNotes();
    loadModels();
  }, []);

  // the address follows the view
  useEffect(() => {
    const want = ws === 'atlas' ? `#/atlas/${atlasId}` : ws === 'docs' && docId ? `#/docs/${docId}` : `#/${ws}`;
    if (window.location.hash !== want) window.history.replaceState(null, '', want);
  }, [ws, atlasId, docId]);
  useEffect(() => {
    const on = () => {
      const r = routeOf(window.location.hash);
      if (!r) return;
      setWs(r.ws);
      if (r.ws === 'docs') setDocId(r.id ?? null);
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
    requestAnimationFrame(() => document.querySelector('main h1')?.focus({ preventScroll: true }));
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
  const lanes = useBar();
  const obi = useObi({ bella, page, notify: setToast, onSaved: loadNotes, models, budget, picked, onAnswered: loadModels, onDocSaved: () => setDocsVersion((v) => v + 1) });
  // asking opens the work sheet on OBI, so the answer has somewhere to land
  const send = (text) => {
    const ok = obi.send(text);
    if (ok) setWork('obi');
    else if (obi.busy) setToast('OBI is still answering. Try again in a moment.');
    return ok;
  };
  const obiApi = { ...obi, send };
  // "Fix in a session": the brief goes on the clipboard and Claude opens
  const session = async (brief) => {
    try {
      await navigator.clipboard.writeText(brief);
      setToast('Brief copied. Paste it into Claude.');
    } catch {
      setToast('Could not copy the brief.');
    }
    setWork('claude');
  };
  useEffect(() => {
    const term = (e) => {
      setInject({ ...e.detail, at: Date.now() });
      setWork('term');
    };
    window.addEventListener('chip:terminal', term);
    return () => window.removeEventListener('chip:terminal', term);
  }, []);

  /* ---- the one input: one element, moved between the top bar and the work sheet ---- */
  const [holder] = useState(() => {
    const d = document.createElement('div');
    d.className = 'one-input-holder';
    return d;
  });
  const topSlot = useRef(null);
  const panelSlot = useRef(null);
  const inPanel = work === 'obi';
  useLayoutEffect(() => {
    const target = inPanel ? panelSlot.current : topSlot.current;
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
  // the top bar hides the input under 1101px, as the mock does: ⌘K opens OBI there
  const searchShown = useMedia('(min-width: 1101px)');

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!searchShown && !work) setWork('obi');
        requestAnimationFrame(() => holder.querySelector('input')?.focus());
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setWork((w) => (w ? null : 'obi'));
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
  const failedGate = needs?.items.filter((x) => x.kind === 'Gate' && x.status === 'Failed').length ?? 0;
  const mapBad = map?.nodes?.filter((x) => x.state === 'bad').length ?? 0;
  const COUNT = {
    health: failedGate ? { n: failedGate, dot: true, title: `The gate fails ${failedGate === 1 ? 'one check' : `${failedGate} checks`}` } : null,
    atlas: bella ? { n: bella.components.length, title: `${bella.components.length} components` } : null,
    connectors: mapBad ? { n: mapBad, dot: true, title: `${mapBad} connector${mapBad === 1 ? '' : 's'} not answering` } : null,
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
        {pinRow(`comp:${c.id}`, c.name)}
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
      {wide ? (
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

  return (
    <div className={`app${barOn ? ' baron' : ''}${collapsed && wide ? ' navcollapsed' : ''}${navOn ? ' navon' : ''}`} data-lead={lens}>
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
        {/* the input lives in this empty node unless OBI is open; React never manages it */}
        <div className="search" ref={topSlot} hidden={!searchShown} />
        <Lens value={lens} onChange={setLens} />
        <button type="button" className="bartoggle" ref={barToggle} aria-expanded={barOn} aria-controls="the-bar" onClick={() => setBar(!barOn)}>
          <span className="thebar">The </span>Bar <span className="count">{needs ? needCount : '…'}</span>
          <span className="k-vh"> need you</span>
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
          {ws === 'health' ? <Health bella={bella} onOpenAtlas={openAtlas} onSession={session} onRefresh={loadBella} /> : null}
          {ws === 'foundations' ? <Foundations bella={bella} onSession={session} onOpenAtlas={openAtlas} /> : null}
          {ws === 'docs' ? <History docId={docId} version={docsVersion} bella={bella} lens={lens} onOpenAtlas={openAtlas} onSession={session} /> : null}
          {ws === 'play' ? <Playground onToast={setToast} /> : null}
          {ws === 'connectors' ? <Connectors narrow={narrow} /> : null}
          {ws === 'atlas' ? <Atlas c={atlas} bella={bella} theme={theme} notes={notes} onOpen={openAtlas} showLibrary={false} trySignal={trySignal} onTryUsed={() => setTrySignal(null)} role={role} vis={vis} setVis={setVis} /> : null}
        </div>
      </main>

      {barOn ? <TheBar needs={needs} lanes={lanes} onClose={(back) => setBar(false, back)} onWork={setWork} onAsk={send} /> : null}

      <Sheet
        open={!!work}
        title={WORK_NAME[work] ?? 'OBI'}
        onClose={() => setWork(null)}
        className="k-wide work-sheet"
        keepMounted
        // Escape belongs to the terminal while it has focus (claude uses it)
        onCancel={(e) => document.activeElement?.closest('.xterm') && e.preventDefault()}
      >
        <ObiPanel
          bella={bella}
          page={page}
          obi={obiApi}
          inputSlot={panelSlot}
          onOpenAtlas={(n) => (setWork(null), openAtlas(n))}
          onSandbox={(n) => {
            setWork(null);
            openAtlas(n);
            setTrySignal({ at: Date.now() });
          }}
          notify={setToast}
          models={models}
          picked={picked}
          setPicked={setPicked}
          budget={budget}
          view={work ?? 'obi'}
          setView={setWork}
          inject={inject}
        />
      </Sheet>

      {createPortal(
        <OneInput
          bella={bella}
          docs={docs}
          page={page}
          obi={obiApi}
          inPanel={inPanel}
          onJump={(id) => (setWork(null), openAtlas(id))}
          onEscape={() => (work ? setWork(null) : document.activeElement?.blur())}
          notify={setToast}
          cloud={models.find((m) => m.id === picked)?.place === 'cloud'}
          models={models}
          budget={budget}
          picked={picked}
        />,
        holder,
      )}

      <ReviewSheet />

      <p className={`toast${toast ? ' on' : ''}`} role="status" aria-live="polite">
        {toast}
      </p>
    </div>
  );
}
