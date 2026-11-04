// The Work panel (work-panel.md, mock chip-workpanel-01): CHIP's one place
// to decide, watch, run and ask. It docks right or along the bottom, the
// page makes room for it, and its inner edge resizes it. Four tabs, each
// saying under the tabs what it is:
//   Needs you: GET /needs (the checks, fix branches, git state and fresh lane
//     questions, High → Low). A review item opens the review card; any other
//     opens in place with "This will · Undo" and one button.
//   Sessions: the terminals open here (live), then the lanes, read from their
//     report files (GET /bar/state). CHIP can't message a lane.
//   Terminal: real shells in a pty; "New Claude" is a shell with claude started.
//   Ask OBI: the OBI thread.
// One input at the bottom says where it sends: on Terminal it types at the
// active prompt without Return; anywhere else it asks OBI. The mic is the Web
// Speech API, on device where the browser can; speech never sends by itself.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Combobox from '@bella/components/Combobox/Combobox';
import { Segmented, segPanelProps } from './kit/index.jsx';
import { openReview } from './ReviewSheet.jsx';
import { OneInput, ObiThread } from './Obi.jsx';
import { Terminals, MAX_TERMS, termName } from './Terminal.jsx';

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const FACE = { dara: 'lane-a', bernie: 'lane-c', saoirse: 'lane-b', frankie: 'lane-d' };
// the folder each lane works in, for "Reply in a terminal" (bar.mjs keeps the
// GitHub repo, not the folder)
const LANE_FOLDER = { dara: 'site', bernie: 'site', saoirse: 'site', frankie: 'bella', liam: 'chip' };
const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
// a lane's claim and its PR's CI disagree: the mock's "Claim ≠ CI"
const mismatch = (l) => (l.prs ?? []).some((pr) => pr.claim !== 'none' && pr.ci !== 'unknown' && pr.ci !== 'none' && pr.ci !== 'merged' && pr.claim !== pr.ci);

/* ---------- layout: dock, size, tab and open, remembered ---------- */
const KEY = 'chip-work';
const LIM = { w: [360, 760], h: [280, 0.7] };
const DEF = { open: true, dock: 'right', w: 440, h: 360, tab: 'needs' };
const TABS = ['needs', 'sessions', 'term', 'ask'];

/** The panel's layout state, kept in localStorage (chip-work). */
export function useWork() {
  const [st, setSt] = useState(() => {
    try {
      const s = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
      return TABS.includes(s.tab) ? s : { ...s, tab: DEF.tab };
    } catch {
      return DEF;
    }
  });
  const set = useCallback((patch) => setSt((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })), []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch {}
  }, [st]);
  return [st, set];
}

// the right dock leaves the page at least 360px; the bottom stops at 70%
export const maxW = (winW, nav) => Math.max(LIM.w[0], Math.min(LIM.w[1], winW - nav - 360));
export const maxH = (winH) => Math.round(winH * LIM.h[1]);
export const clampW = (w, winW, nav) => Math.round(Math.max(LIM.w[0], Math.min(maxW(winW, nav), w)));
export const clampH = (h, winH) => Math.round(Math.max(LIM.h[0], Math.min(maxH(winH), h)));

/* ---------- data ---------- */
/** GET /bar/state every 10 s: the lanes and what each last reported. */
export function useLanes() {
  const [lanes, setLanes] = useState([]);
  useEffect(() => {
    const poll = () =>
      fetch('/bar/state')
        .then((r) => r.json())
        .then((d) => Array.isArray(d.lanes) && setLanes(d.lanes))
        .catch(() => {});
    poll();
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, []);
  return lanes;
}

/** GET /needs every 15 s, and whenever a review changes BELLA. */
export function useNeeds() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const load = () => fetch('/needs').then((r) => r.json()).then(setData).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    window.addEventListener('chip:changed', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('chip:changed', load);
    };
  }, []);
  return data;
}

function run(a, onLane) {
  if (a.type === 'review') openReview(a.check);
  else if (a.type === 'terminal') window.dispatchEvent(new CustomEvent('chip:terminal', { detail: { repo: a.repo, command: a.command } }));
  else if (a.type === 'lane') onLane(a.lane);
}

/* ---------- Needs you ---------- */
function NeedsList({ needs, onLane }) {
  const [open, setOpen] = useState(null);
  if (!needs) return <p className="wp-empty">Reading what needs you…</p>;
  return (
    <>
      <ul className="nylist">
        {needs.items.length === 0 ? <li className="wp-empty">Nothing needs you.</li> : null}
        {needs.items.map((n) => {
          const inPlace = n.action.type !== 'review';
          const on = open === n.id;
          return (
            <li key={n.id} className={`ny r-${n.risk.toLowerCase()}`}>
              <button
                type="button"
                className="nyrow"
                aria-expanded={inPlace ? on : undefined}
                aria-haspopup={inPlace ? undefined : 'dialog'}
                onClick={() => (inPlace ? setOpen(on ? null : n.id) : run(n.action, onLane))}
              >
                <span className="nyk">
                  {n.status} · <span className={`risk r-${n.risk.toLowerCase()}`}>{n.risk} risk</span>
                </span>
                <span className="nyw">{n.title ?? n.what}</span>
              </button>
              {on ? (
                <div className="nydet">
                  <p>{n.detail}</p>
                  <p className={`riskwhy r-${n.risk.toLowerCase()}`}>{n.riskWhy}</p>
                  <p className="will">
                    This will: {n.thisWill} · Undo: {n.undo}
                  </p>
                  <Button variant="primary" onClick={() => run(n.action, onLane)}>
                    {n.action.label}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {needs.staleLaneNotes ? (
        <p className="autolow">
          {needs.staleLaneNotes} older lane question{needs.staleLaneNotes === 1 ? '' : 's'} <small>(reports quiet for over {needs.freshDays} days) are in Sessions.</small>
        </p>
      ) : null}
    </>
  );
}

/* ---------- Sessions ---------- */
function laneLine(l) {
  const n = l.needs?.length ?? 0;
  const when = l.updated ? `last report ${day(l.updated)}` : 'no report file';
  if (mismatch(l)) return `Says green; CI disagrees · ${when}`;
  if (l.status === 'waiting on you' && n) return `${n} question${n === 1 ? '' : 's'} for you${Date.now() - l.updated > STALE_MS ? ', older than a week' : ''} · ${when}`;
  return when;
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function Sessions({ lanes, terms, labelOf, openLane, setOpenLane, onGoTerm, onReply }) {
  return (
    <>
      <section className="wp-group" aria-labelledby="wpLive">
        <h3 id="wpLive">
          On this machine · live <small>terminals open in this panel</small>
        </h3>
        <div className="sessgrid">
          {terms.length === 0 ? <p className="wp-empty">No terminals open. Start one from Terminal.</p> : null}
          {terms.map((t) => (
            <div key={t.id} className={`sess${t.status === 'open' ? ' live' : ''}`}>
              <button type="button" className="lrowb" onClick={() => onGoTerm(t.id)}>
                <span className="face mono" aria-hidden="true">
                  {t.kind === 'claude' ? 'C' : '>'}
                </span>
                <span className="lwho">
                  <span className="name">{termName(t, labelOf(t.repo))}</span>
                </span>
                <span className="adot">{t.status === 'open' ? 'Running' : t.status === 'closed' ? 'Stopped' : 'Starting'}</span>
                <span className="line">{t.kind === 'claude' ? 'Claude Code in a shell' : 'Your login shell'} in {labelOf(t.repo)}. Opens in Terminal.</span>
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="wp-group" aria-labelledby="wpLanes">
        <h3 id="wpLanes">
          Lanes · read from report files <small>every 10 s; CHIP can’t message them</small>
        </h3>
        <div className="sessgrid">
          {lanes.length === 0 ? <p className="wp-empty">No lanes reported.</p> : null}
          {lanes.map((l) => {
            const st = mismatch(l) ? 'fail' : l.status === 'waiting on you' && l.needs?.length ? 'you' : '';
            const on = openLane === l.id;
            const folder = LANE_FOLDER[l.id];
            return (
              <div key={l.id} className={`sess lane ${st}`}>
                <button type="button" className="lrowb" aria-expanded={on} onClick={() => setOpenLane(on ? null : l.id)}>
                  <span className="face" data-face={FACE[l.id]} aria-hidden="true">
                    {l.name[0]}
                  </span>
                  <span className="lwho">
                    <span className="name">{l.name}</span>
                    <span className="ljob">{l.role}</span>
                  </span>
                  <span className="adot">{st === 'fail' ? 'Failed' : cap(l.status)}</span>
                  <span className="line">{laneLine(l)}</span>
                </button>
                {on ? (
                  <div className="lthread">
                    {l.needs?.length ? (
                      <ul className="lneeds">
                        {l.needs.map((n, i) => (
                          <li key={i}>{n.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="line">Nothing asked.</p>
                    )}
                    {folder ? (
                      <>
                        <p className="line">CHIP can’t write to this lane. Answer it from a shell in {labelOf(folder)}.</p>
                        <Button onClick={() => onReply(folder)}>Reply in a terminal</Button>
                      </>
                    ) : (
                      <p className="line">No report file to read: this one runs outside CHIP.</p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

/* ---------- voice: Web Speech API, on device where the browser can ---------- */
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const LANG = 'en-GB';

// SR.available() crashed the whole page in headless Chromium (4 Nov; Chrome
// 156 answers fine), so it is never asked where on-device speech can't exist
// (headless, Electron's embedded pane); those get the browser service
const CAN_ASK_LOCAL = SR && typeof SR.available === 'function' && !/HeadlessChrome|Electron/.test(navigator.userAgent);

/**
 * Speech to text into the one input. mode: unknown (still asking) | local |
 * download | cloud | none | blocked. state: idle | installing | listening |
 * stopped | silent | error. It writes the words into the field as they come
 * and never sends.
 */
function useVoice(getBase, onWords) {
  const [mode, setMode] = useState(SR ? (CAN_ASK_LOCAL ? 'unknown' : 'cloud') : 'none');
  const [state, setState] = useState('idle');
  const [err, setErr] = useState('');
  const rec = useRef(null);
  const listening = useRef(false);
  useEffect(() => {
    if (!CAN_ASK_LOCAL) return;
    SR.available({ langs: [LANG], processLocally: true })
      .then((a) => setMode(a === 'available' ? 'local' : a === 'downloadable' || a === 'downloading' ? 'download' : 'cloud'))
      .catch(() => setMode('cloud'));
  }, []);
  useEffect(() => () => rec.current?.abort?.(), []);

  const stop = () => {
    if (!listening.current) return;
    try {
      rec.current?.stop();
    } catch {}
  };
  const start = async () => {
    if (!SR || listening.current) return;
    const base = getBase();
    try {
      let m = mode;
      if (m === 'unknown') {
        const a = await SR.available({ langs: [LANG], processLocally: true }).catch(() => 'unavailable');
        m = a === 'available' ? 'local' : a === 'downloadable' || a === 'downloading' ? 'download' : 'cloud';
        setMode(m);
      }
      if (m === 'download' && typeof SR.install === 'function') {
        setState('installing');
        m = (await SR.install({ langs: [LANG], processLocally: true })) ? 'local' : 'cloud';
        setMode(m);
      }
      const r = new SR();
      r.lang = LANG;
      r.interimResults = true;
      r.continuous = true;
      if (m === 'local' && 'processLocally' in r) r.processLocally = true;
      let heard = false;
      r.onresult = (e) => {
        let fin = '';
        let mid = '';
        for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (mid += e.results[i][0].transcript));
        heard = heard || !!(fin + mid).trim();
        onWords((base + fin + mid).replace(/\s+/g, ' ').trimStart(), !!mid);
      };
      r.onerror = (e) => {
        listening.current = false;
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setMode('blocked');
          setState('idle');
        } else if (e.error === 'no-speech') setState('silent');
        else if (e.error !== 'aborted') {
          setErr(e.error === 'network' ? 'The browser’s speech service didn’t answer.' : e.error);
          setState('error');
        }
      };
      r.onend = () => {
        if (!listening.current) return;
        listening.current = false;
        onWords(null, false);
        setState(heard ? 'stopped' : 'silent');
      };
      rec.current = r;
      r.start();
      listening.current = true;
      setState('listening');
    } catch (e) {
      setErr(String(e.message || e));
      setState('error');
    }
  };
  return { mode, state, err, start, stop, listening: state === 'listening', reset: () => setState('idle') };
}

const MODE = {
  unknown: ['', 'Speech to text.', 'Checking whether this browser can do it on device…'],
  local: ['local', 'On device', 'speech stays on this Mac'],
  download: ['local', 'On device after a one-time download', 'the first press fetches the English pack'],
  cloud: ['cloud', 'Browser speech service', 'audio leaves this Mac'],
  none: ['', 'No speech input in this browser.', 'macOS Dictation works in any field: press Fn twice.'],
  blocked: ['', 'Microphone blocked.', 'Allow it from the address bar, or use macOS Dictation (Fn twice).'],
};
function VoiceLine({ v, verb }) {
  const [cls, name, note] = MODE[v.mode];
  if (v.state === 'listening')
    return (
      <>
        <span className="live">Listening</span> <span className={`mode ${cls}`}>{name}</span> · Esc to stop · nothing sends by itself
      </>
    );
  if (v.state === 'installing') return <b>Downloading the English speech pack…</b>;
  if (v.state === 'stopped')
    return (
      <>
        <b>Stopped.</b> Check the words, then {verb}.
      </>
    );
  if (v.state === 'silent')
    return (
      <>
        <b>Heard nothing.</b> Try again, a little closer to the mic.
      </>
    );
  if (v.state === 'error')
    return (
      <>
        <b>Speech stopped.</b> {v.err} Type instead, or try again.
      </>
    );
  return (
    <>
      <span className={`mode ${cls}`}>{name}</span> {note}
    </>
  );
}

const MIC = (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);
const DOCKS = [
  { id: 'right', label: 'Right', icon: <path d="M14 4v16" /> },
  { id: 'bottom', label: 'Bottom', icon: <path d="M3 14h18" /> },
];

// Right / Bottom: a radiogroup (one of two, no panels), arrows move and choose
function DockPick({ value, onChange }) {
  const ref = useRef(null);
  const keys = (e) => {
    const n = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const next = DOCKS[(DOCKS.findIndex((d) => d.id === value) + n + DOCKS.length) % DOCKS.length];
    onChange(next.id);
    ref.current.querySelector(`[data-dock="${next.id}"]`)?.focus();
  };
  return (
    <div className="seg wp-dock" role="radiogroup" aria-label="Dock the Work panel" ref={ref} onKeyDown={keys}>
      {DOCKS.map((d) => (
        <button key={d.id} type="button" role="radio" data-dock={d.id} aria-checked={d.id === value} tabIndex={d.id === value ? 0 : -1} onClick={() => onChange(d.id)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            {d.icon}
          </svg>
          {d.label}
        </button>
      ))}
    </div>
  );
}

const WHAT = {
  needs: (
    <>
      <b>Decisions waiting on you</b>, from the checks, git and lane reports. Nothing runs until you press its button.
    </>
  ),
  sessions: (
    <>
      <b>Work running elsewhere.</b> Terminals here are live. Lanes are read from their report files; CHIP can’t message them.
    </>
  ),
  term: (
    <>
      <b>A real shell on this Mac.</b> Claude is this shell with <code>claude</code> started. The input below types; Return in the terminal runs.
    </>
  ),
  ask: (
    <>
      <b>OBI answers about BELLA</b> from its docs and data. It can’t run commands or reach a session.
    </>
  ),
};

/**
 * The panel. st and set come from useWork (App owns them: the frame makes
 * room by them). dock is the dock in force: under 961px it is always bottom.
 */
export function WorkPanel({ open, st, set, dock, canDock, size, limits, onResize, onClose, needs, lanes, obiProps, inputProps, notify }) {
  const { obi } = obiProps;
  const right = dock === 'right';
  const tab = st.tab;
  const setTab = (id) => set({ tab: id });

  /* terminals: the list lives here; screens stay mounted while the panel is */
  const [terms, setTerms] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  const [folder, setFolder] = useState('chip');
  const [repos, setRepos] = useState([]);
  const nextId = useRef(1);
  const handles = useRef(new Map());
  const register = useCallback((id, h) => (h ? handles.current.set(id, h) : handles.current.delete(id)), []);
  useEffect(() => {
    fetch('/term/repos').then((r) => r.json()).then(setRepos).catch(() => {});
  }, []);
  const labelOf = (id) => repos.find((r) => r.id === id)?.label ?? { chip: 'CHIP', bella: 'BELLA', site: 'Site' }[id] ?? id;
  const termsRef = useRef(terms);
  termsRef.current = terms;
  const newTerm = (kind, repo, typed) => {
    if (termsRef.current.length >= MAX_TERMS) {
      notify('Six terminals is the most CHIP runs. Close one first.');
      return null;
    }
    const t = { id: nextId.current++, kind, repo, typed: typed ?? null, run: 0, status: 'connecting' };
    setTerms((ts) => [...ts, t]);
    setActiveTerm(t.id);
    set({ open: true, tab: 'term' });
    return t;
  };
  const closeTerm = (id) => {
    const rest = terms.filter((t) => t.id !== id);
    setTerms(rest);
    if (activeTerm === id) setActiveTerm(rest[rest.length - 1]?.id ?? null);
  };
  const restartTerm = (id) => setTerms((ts) => ts.map((t) => (t.id === id ? { ...t, run: t.run + 1, typed: null } : t)));
  const statusOf = useCallback((id, status) => setTerms((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t))), []);
  const goTerm = (id) => {
    setActiveTerm(id);
    setTab('term');
    requestAnimationFrame(() => handles.current.get(id)?.focus());
  };

  // a command from Needs you or a page arrives typed in a fresh shell; a
  // brief (kind claude) goes to the Claude already open, or a new one
  useEffect(() => {
    const on = (e) => {
      const { repo = 'chip', command, kind } = e.detail ?? {};
      if (kind === 'claude') {
        const c = termsRef.current.find((t) => t.kind === 'claude' && t.status !== 'closed');
        if (c) {
          setActiveTerm(c.id);
          set({ open: true, tab: 'term' });
        } else newTerm('claude', repo);
        return;
      }
      if (newTerm('shell', repo, command) && command) notify(`Typed in a new ${labelOf(repo)} shell, not run. Press Return there to run it.`);
    };
    window.addEventListener('chip:terminal', on);
    return () => window.removeEventListener('chip:terminal', on);
  });

  /* lanes */
  const [openLane, setOpenLane] = useState(null);
  const onLane = (id) => {
    setTab('sessions');
    setOpenLane(id);
  };

  /* the one input */
  const [q, setQ] = useState('');
  const [interim, setInterim] = useState(false);
  const qRef = useRef(q);
  qRef.current = q;
  const voice = useVoice(
    () => (qRef.current ? qRef.current.replace(/\s*$/, ' ') : ''),
    (words, mid) => {
      if (words !== null) setQ(words);
      setInterim(mid);
    },
  );
  const onTerm = tab === 'term';
  const at = terms.find((t) => t.id === activeTerm);
  const verb = onTerm ? 'Type' : 'Ask';
  const fieldId = onTerm ? 'wp-type' : 'wp-ask';
  const focusField = () => requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
  useEffect(() => {
    if (voice.state === 'stopped' || voice.state === 'silent') focusField();
  }, [voice.state]);
  const submit = (e) => {
    e?.preventDefault();
    voice.stop();
    voice.reset();
    const v = q.trim();
    if (!v) return;
    if (onTerm) {
      if (!at) return notify('No terminal open. Start one first.');
      if (handles.current.get(at.id)?.type(v)) {
        setQ('');
        notify(`Typed into ${termName(at, labelOf(at.repo))}. Press Return in the terminal to run it.`);
      } else notify('That terminal isn’t running. Start it again first.');
      return;
    }
    if (obi.send(v)) {
      setQ('');
      setTab('ask');
    } else if (obi.busy) notify('OBI is still answering. Try again in a moment.');
  };
  // Escape: stops the mic first, then closes the panel (not inside a
  // terminal: claude uses Escape)
  const onKeyDown = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (voice.listening) {
      e.preventDefault();
      voice.stop();
    } else if (!e.target.closest('.xterm')) {
      e.preventDefault();
      onClose();
    }
  };

  /* the resize edge: drag, arrows (16px), Home / End, double-click resets */
  const [dragging, setDragging] = useState(false);
  const [tip, setTip] = useState(false);
  const tipT = useRef(null);
  const grip = (e) => {
    e.preventDefault();
    const g = e.currentTarget;
    g.setPointerCapture(e.pointerId);
    setDragging(true);
    const move = (ev) => onResize(right ? window.innerWidth - ev.clientX : window.innerHeight - ev.clientY);
    const up = () => {
      g.removeEventListener('pointermove', move);
      setDragging(false);
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up, { once: true });
    g.addEventListener('pointercancel', up, { once: true });
  };
  const gripKey = (e) => {
    const grow = right ? 'ArrowLeft' : 'ArrowUp';
    const shrink = right ? 'ArrowRight' : 'ArrowDown';
    const to = e.key === 'Home' ? limits[0] : e.key === 'End' ? limits[1] : e.key === grow ? size + 16 : e.key === shrink ? size - 16 : null;
    if (to === null) return;
    e.preventDefault();
    onResize(to);
    setTip(true);
    clearTimeout(tipT.current);
    tipT.current = setTimeout(() => setTip(false), 900);
  };
  useEffect(() => {
    document.documentElement.classList.toggle('wp-dragging', dragging);
  }, [dragging]);

  const count = needs?.items.length;
  const tabs = (
    <Segmented
      id="wp"
      label="Work"
      value={tab}
      onChange={setTab}
      items={[
        { id: 'needs', label: <>Needs you <span className="n">{count ?? '…'}</span></> },
        { id: 'sessions', label: <>Sessions <span className="n">{terms.length + lanes.length}</span></> },
        { id: 'term', label: <>Terminal <span className="n">{terms.length}</span></> },
        { id: 'ask', label: 'Ask OBI' },
      ]}
    />
  );
  const micOff = voice.mode === 'none' || voice.mode === 'blocked';

  return (
    <aside className={`wp k-chrome wp-${dock}${dragging ? ' dragging' : ''}`} id="work" aria-label="Work panel" hidden={!open} onKeyDown={onKeyDown}>
      <div
        className="grip"
        role="separator"
        tabIndex={0}
        aria-label="Resize the Work panel"
        aria-orientation={right ? 'vertical' : 'horizontal'}
        aria-valuemin={limits[0]}
        aria-valuemax={limits[1]}
        aria-valuenow={size}
        aria-valuetext={`${size} pixels ${right ? 'wide' : 'tall'}`}
        onPointerDown={grip}
        onKeyDown={gripKey}
        onBlur={() => setTip(false)}
        onDoubleClick={() => (set(right ? { w: DEF.w } : { h: DEF.h }), notify('Size reset.'))}
      />
      {dragging || tip ? (
        <span className="sizetip" aria-hidden="true">
          {size} px
        </span>
      ) : null}
      <div className="wp-head">
        <h2>Work</h2>
        {right ? null : tabs}
        {canDock ? <DockPick value={dock} onChange={(d) => set({ dock: d })} /> : null}
        <button type="button" className="k-iconbtn" onClick={onClose} aria-label="Close the Work panel">
          <span aria-hidden="true">✕</span> Close
        </button>
      </div>
      {right ? <div className="wp-tabs">{tabs}</div> : null}
      <p className="wp-what">{WHAT[tab]}</p>

      <div className="wp-body" {...segPanelProps('wp', 'needs', tab)}>
        <NeedsList needs={needs} onLane={onLane} />
      </div>
      <div className="wp-body" {...segPanelProps('wp', 'sessions', tab)}>
        <Sessions lanes={lanes} terms={terms} labelOf={labelOf} openLane={openLane} setOpenLane={setOpenLane} onGoTerm={goTerm} onReply={(repo) => newTerm('shell', repo)} />
      </div>
      <div className="wp-body fill wp-term" {...segPanelProps('wp', 'term', tab)}>
        <Terminals
          terms={terms}
          active={activeTerm}
          setActive={setActiveTerm}
          repos={repos}
          folder={folder}
          setFolder={setFolder}
          onNew={(kind) => newTerm(kind, folder)}
          onClose={closeTerm}
          onRestart={restartTerm}
          onStatus={statusOf}
          register={register}
        />
      </div>
      <div className="wp-body fill wp-ask" {...segPanelProps('wp', 'ask', tab)}>
        <ObiThread {...obiProps} />
      </div>

      <form className="one" onSubmit={submit} autoComplete="off">
        <div className="one-meta">
          <span className={`one-to${onTerm ? ' term' : ''}`}>{onTerm ? (at ? `Types into ${termName(at, labelOf(at.repo))}` : 'No terminal open') : 'Asks OBI'}</span>
          <p className="voice" aria-live="polite">
            <VoiceLine v={voice} verb={verb} />
          </p>
        </div>
        <div className={`one-row${interim ? ' interim' : ''}`}>
          {onTerm ? (
            <Combobox
              id="wp-type"
              label="Type into the terminal"
              hideLabel
              value={q}
              onChange={setQ}
              groups={[]}
              onSelect={() => {}}
              onKeyDown={(e) => e.key === 'Enter' && submit(e)}
              placeholder="Words to type at the prompt (not run)"
              className="one-input"
            />
          ) : (
            <OneInput {...inputProps} id="wp-ask" value={q} onValue={setQ} onEscape={() => (voice.listening ? voice.stop() : onClose())} />
          )}
          <Button
            onClick={() => (voice.listening ? voice.stop() : voice.start())}
            disabled={micOff}
            ariaLabel={micOff ? 'Talk (not available)' : voice.listening ? 'Stop listening' : 'Talk: start speech to text'}
            className="mic"
          >
            {voice.listening ? null : MIC}
            {voice.listening ? 'Stop' : 'Talk'}
          </Button>
          <Button variant="primary" type="submit">
            {verb}
          </Button>
        </div>
      </form>
    </aside>
  );
}
