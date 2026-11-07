// The Work panel (work-panel.md, mock chip-workpanel-01): CHIP's one place
// to decide, watch, run and ask. It docks right or along the bottom, the
// page makes room for it, and its inner edge resizes it. Four tabs, each
// saying under the tabs what it is:
//   Needs you: GET /needs (the checks, fix branches, git state and fresh lane
//     questions, High → Low). A review item opens the review card; any other
//     opens in place with "This will · Undo" and one button.
//   Sessions: a tree. CHIP (this page) at the top with the sessions it
//     started nested under it, then the relay lanes, read from their report
//     files (GET /bar/state). CHIP can't message a lane, and it can't see
//     Claude desktop sessions at all; the tab says so.
//   Terminal: real shells in a pty; "New Claude" is a shell with claude started.
//   Ask OBI: the OBI thread.
// One input at the bottom: on Terminal it types at the active prompt without
// Return and a tag says which; anywhere else it asks OBI, as its placeholder says. The mic is the Web
// Speech API, on device where the browser can; speech never sends by itself.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import Combobox from '@bella/components/Combobox/Combobox';
import { Overflow, Segmented, segPanelProps, StatusPill } from './kit/index.jsx';
import { openReview } from './ReviewSheet.jsx';
import { OneInput, ObiThread } from './Obi.jsx';
import { Terminals, MAX_TERMS, termName, STATUS } from './Terminal.jsx';
import { openRun, runLine, runState, useRuns } from './Runs.jsx';

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const RISK_TONE = { High: 'fail', Medium: 'needs', Low: 'neutral' };
// a session's state, on the one status tag
const STATE_TONE = { failed: 'fail', you: 'needs', done: 'pass' };
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
// h: null is the bottom dock's default, 40% of the window; a resize stores px
const DEF = { open: false, dock: 'bottom', w: 380, h: null, tab: 'sessions' };
// closed by default, so pages get the full width (concept lock, 7 Nov); once
// she opens or closes it, that choice (chosen) is kept
// Sessions, Terminal and Ask (concept, afternoon 7 Nov); what needs her is Today's
const TABS = ['sessions', 'term', 'ask'];

/** The panel's layout state, kept in localStorage (chip-work). */
export function useWork() {
  const [st, setSt] = useState(() => {
    try {
      const s = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
      // 360 was the fixed default before 4 Nov, stored whether or not it was resized
      if (s.h === 360) s.h = null;
      // 440 was the default before 6 Nov, stored whether or not it was resized; a
      // width she sets from now on is marked sized, so it stays
      if (s.w === 440 && !s.sized) s.w = DEF.w;
      if (!s.chosen) s.open = false;
      return TABS.includes(s.tab) ? s : { ...s, tab: DEF.tab };
    } catch {
      return DEF;
    }
  });
  const set = useCallback(
    (patch) =>
      setSt((s) => {
        const p = typeof patch === 'function' ? patch(s) : patch;
        return { ...s, ...p, ...('open' in p ? { chosen: true } : null) };
      }),
    [],
  );
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch {}
  }, [st]);
  return [st, set];
}

// the right dock leaves the page at least 360px; the bottom stops at 70%, or
// at 50% on a window under 600px tall (a short screen, or 200% zoom), where
// it opens as a sheet over the lower half instead of 280px of a 450px window
export const maxW = (winW, nav) => Math.max(LIM.w[0], Math.min(LIM.w[1], winW - nav - 360));
export const maxH = (winH) => Math.round(winH * (winH < 600 ? 0.5 : LIM.h[1]));
export const minH = (winH) => Math.min(LIM.h[0], maxH(winH));
export const clampW = (w, winW, nav) => Math.round(Math.max(LIM.w[0], Math.min(maxW(winW, nav), w)));
export const clampH = (h, winH) => Math.round(Math.max(minH(winH), Math.min(maxH(winH), h ?? winH * 0.4)));

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
    const load = () =>
      fetch('/needs')
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
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

export function runNeed(a, onLane) {
  if (a.type === 'review') openReview(a.check);
  else if (a.type === 'terminal') window.dispatchEvent(new CustomEvent('chip:terminal', { detail: { repo: a.repo, command: a.command, from: 'Needs you' } }));
  else if (a.type === 'lane') onLane(a.lane);
}

/* ---------- Sessions ---------- */
function laneLine(l) {
  const n = l.needs?.length ?? 0;
  const when = l.updated ? `last report ${day(l.updated)}` : LANE_FOLDER[l.id] ? 'no report yet' : 'runs outside CHIP';
  if (mismatch(l)) return `Says green; CI disagrees · ${when}`;
  if (l.status === 'waiting on you' && n) return `${n} question${n === 1 ? '' : 's'} for you${Date.now() - l.updated > STALE_MS ? ', older than a week' : ''} · ${when}`;
  return when;
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const ago = (ms) => {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${Math.max(s, 1)} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return day(ms);
};
// a terminal's state from what CHIP can see: the socket and its last output
const QUIET_MS = 15000;
function termState(t) {
  if (t.status === 'connecting') return ['working', 'Starting'];
  if (t.status === 'closed') return t.opened ? ['done', 'Done'] : ['failed', 'Failed'];
  if (Date.now() - t.last < QUIET_MS) return ['working', 'Working'];
  return t.kind === 'claude' ? ['you', 'Waiting on you'] : ['idle', 'Idle'];
}
function laneState(l) {
  if (mismatch(l)) return ['failed', 'Failed'];
  if (l.status === 'waiting on you') return ['you', 'Waiting on you'];
  if (l.status === 'working') return ['working', 'Working'];
  if (l.status === 'done') return ['done', 'Done'];
  return ['idle', cap(l.status)];
}
const tally = (states) => {
  const n = {};
  for (const [k, label] of states) n[label] = (n[label] ?? 0) + (k ? 1 : 0);
  return (
    Object.entries(n)
      .map(([label, c]) => `${c} ${label.toLowerCase()}`)
      .join(' · ') || 'nothing yet'
  );
};

function Row({ id, sel, setSel, face, faceKey, mono, name, sub, state, line, branch, last, children }) {
  const on = sel === id;
  return (
    <li className={`snode s-${state[0]}`}>
      <button type="button" className="srow" aria-expanded={children ? on : undefined} onClick={() => children && setSel(on ? null : id)}>
        <span className={`face${mono ? ' mono' : ''}`} data-face={faceKey} aria-hidden="true">
          {face}
        </span>
        <span className="lwho">
          <span className="name">{name}</span>
          {sub ? <span className="ljob">{sub}</span> : null}
        </span>
        <StatusPill tone={STATE_TONE[state[0]]}>{state[1]}</StatusPill>
        <span className="line">{line}</span>
        <span className="smeta">
          {branch ? (
            <>
              <span className="mono">{branch}</span> ·{' '}
            </>
          ) : null}
          {last}
        </span>
      </button>
      {on ? <div className="sdet">{children}</div> : null}
    </li>
  );
}

// a CHIP-started session's detail: what's on its screen, then open, type, stop
function TermDetail({ t, name, handle, onGoTerm, onStop, notify }) {
  const [msg, setMsg] = useState('');
  const [asking, setAsking] = useState(false);
  const tail = handle?.tail?.(8);
  const send = (e) => {
    e.preventDefault();
    if (!msg.trim()) return;
    if (handle?.type(msg.trim())) {
      setMsg('');
      notify(`Typed into ${name}, not sent. Press Return in the terminal to send it.`);
      onGoTerm(t.id);
    } else notify('That session isn’t running.');
  };
  return (
    <>
      {t.brief ? (
        <p className="line">
          <b>Brief</b> (on the clipboard when it opened): {t.brief}
        </p>
      ) : null}
      <p className="line">
        <b>Latest on its screen</b>
      </p>
      {tail ? <pre className="stail">{tail}</pre> : <p className="line">Nothing on screen yet.</p>}
      <div className="sacts">
        <Button variant="primary" onClick={() => onGoTerm(t.id)}>
          Open
        </Button>
        {t.status === 'closed' ? null : asking ? (
          <>
            <span className="line">Stop {name}? It ends the shell and anything running in it.</span>
            <Button onClick={() => (setAsking(false), onStop(t.id))}>Stop it</Button>
            <Button variant="tertiary" onClick={() => setAsking(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button onClick={() => setAsking(true)}>Stop</Button>
        )}
      </div>
      {t.status === 'open' ? (
        <form className="smsg" onSubmit={send} autoComplete="off">
          <Combobox
            id={`smsg-${t.id}`}
            label={`Message for ${name}`}
            hideLabel
            value={msg}
            onChange={setMsg}
            groups={[]}
            onSelect={() => {}}
            onKeyDown={(e) => e.key === 'Enter' && send(e)}
            placeholder="Send a message (typed, not run)"
            className="one-input"
          />
          <Button type="submit">Type</Button>
        </form>
      ) : null}
    </>
  );
}

function Sessions({ lanes, terms, runs, labelOf, branchOf, handles, onGoTerm, onStop, onReply, notify, live }) {
  const [sel, setSel] = useState(null);
  useEffect(() => {
    const on = (e) => setSel(`r${e.detail.id}`);
    window.addEventListener('chip:run-started', on);
    return () => window.removeEventListener('chip:run-started', on);
  }, []);
  const rs = runs.map((r) => [r, runState(r)]);
  // states and "x s ago" move with the clock while the tab shows
  const [, tick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [live]);
  const ts = [...terms.map((t) => [t, termState(t)]), ...rs];
  const ls = lanes.map((l) => [l, laneState(l)]);
  const last = (xs, of) => Math.max(0, ...xs.map(of));
  return (
    <>
      <ul className="stree" aria-label="Sessions">
        <li className="sgroup">
          <ul>
            <Row
              id="chip"
              sel={sel}
              setSel={setSel}
              face="C"
              name="CHIP"
              sub="this page · coordinator"
              state={ts.some(([, s]) => s[0] === 'working') ? ['working', 'Working'] : ts.some(([, s]) => s[0] === 'you') ? ['you', 'Waiting on you'] : ['idle', terms.length ? 'Quiet' : 'Idle']}
              line={
                ts.length
                  ? `Started ${ts.length} session${ts.length === 1 ? '' : 's'}: ${tally(ts.map(([, s]) => s))}`
                  : 'Hasn’t started a session. Fix in a session, the Playground or Terminal starts one.'
              }
              branch={branchOf('chip') ?? 'branch unknown'}
              last={ago(last(terms, (t) => t.last))}
            >
              <p className="line">
                CHIP sees only the sessions it started: Fix with Claude runs headless and reports back here (kept across reloads); the Playground, Needs you and Terminal run in a shell here and end when the page reloads or closes.
              </p>
            </Row>
            <li className="skids">
              <ul>
                {rs.map(([r, state]) => (
                  <Row key={r.id} id={`r${r.id}`} sel={sel} setSel={setSel} face="C" name={r.title} sub={`Claude, headless · from ${r.from ?? 'a page'}`} state={state} line={runLine(r)} branch={r.branch} last={ago(Date.parse(r.startedAt))}>
                    {r.steps?.some((x) => x.claude) ? (
                      <ol className="lneeds">
                        {r.steps
                          .filter((x) => x.claude)
                          .slice(-4)
                          .map((x, i) => (
                            <li key={i}>{x.step}</li>
                          ))}
                      </ol>
                    ) : null}
                    <Button variant={r.status === 'passed' ? 'primary' : 'secondary'} onClick={() => openRun(r.id)}>
                      {r.status === 'passed' ? 'Review: Accept or Undo' : 'Open the report'}
                    </Button>
                  </Row>
                ))}
                {terms.map((t) => [t, termState(t)]).map(([t, state]) => {
                  const name = termName(t, labelOf(t.repo));
                  return (
                    <Row
                      key={t.id}
                      id={`t${t.id}`}
                      sel={sel}
                      setSel={setSel}
                      face={t.kind === 'claude' ? 'C' : '>'}
                      mono
                      name={name}
                      sub={`from ${t.from}`}
                      state={state}
                      line={t.brief ?? (t.typed ? `Typed for you: ${t.typed}` : t.kind === 'claude' ? `Claude Code in ${labelOf(t.repo)}` : `Your shell in ${labelOf(t.repo)} · ${STATUS[t.status]}`)}
                      branch={branchOf(t.repo) ?? 'branch unknown'}
                      last={ago(t.last)}
                    >
                      <TermDetail t={t} name={name} handle={handles.current.get(t.id)} onGoTerm={onGoTerm} onStop={onStop} notify={notify} />
                    </Row>
                  );
                })}
              </ul>
            </li>
          </ul>
        </li>
        <li className="sgroup">
          <ul>
            <Row
              id="lanes"
              sel={sel}
              setSel={setSel}
              face="R"
              name="Relay lanes"
              sub="read from report files every 10 s"
              state={ls.some(([, s]) => s[0] === 'failed') ? ['failed', 'Failed'] : ls.some(([, s]) => s[0] === 'you') ? ['you', 'Waiting on you'] : ['idle', 'Quiet']}
              line={lanes.length ? tally(ls.map(([, s]) => s)) : 'No lanes reported.'}
              branch="several repos"
              last={ago(last(lanes, (l) => l.updated ?? 0))}
            >
              <p className="line">
                Each lane is a pair of files in an inbox: next.md going in, report.md coming back. CHIP reads the reports and lists their “Needs Elleta” lines; it doesn’t write next.md.
              </p>
            </Row>
            <li className="skids">
              <ul>
                {ls.map(([l, state]) => {
                  const folder = LANE_FOLDER[l.id];
                  const prs = (l.prs ?? []).map((pr) => `PR #${pr.n}`).join(', ');
                  return (
                    <Row
                      key={l.id}
                      id={`l${l.id}`}
                      sel={sel}
                      setSel={setSel}
                      face={l.name[0]}
                      faceKey={FACE[l.id]}
                      name={l.name}
                      sub={l.role}
                      state={state}
                      line={laneLine(l)}
                      branch={l.updated ? prs || 'branch not reported' : null}
                      last={l.updated ? `report ${ago(l.updated)}` : 'never'}
                    >
                      <p className="line">
                        <b>Latest report</b>
                        {l.updated ? `, ${day(l.updated)}` : ''}
                        {l.reportVersion ? ` · v${l.reportVersion}` : ''}
                      </p>
                      {l.needs?.length ? (
                        <ul className="lneeds">
                          {l.needs.map((n, i) => (
                            <li key={i}>{n.text}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="line">{folder ? 'Nothing asked.' : 'No report file to read: this one runs outside CHIP.'}</p>
                      )}
                      {(l.prs ?? []).map((pr) => (
                        <p key={pr.n} className="line">
                          PR #{pr.n}: says {pr.claim}, CI {pr.ci}
                        </p>
                      ))}
                      <p className="line">CHIP only reads this lane’s report file: it can’t message or stop it.</p>
                      {folder ? <Button onClick={() => onReply(folder, l.name)}>Reply in a terminal</Button> : null}
                    </Row>
                  );
                })}
              </ul>
            </li>
          </ul>
        </li>
      </ul>
      <p className="wp-empty">Claude desktop sessions aren’t here: the Claude app doesn’t share them with CHIP, so CHIP can’t list, message or stop them. See them in the Claude app.</p>
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
        for (let i = 0; i < e.results.length; i++) e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (mid += e.results[i][0].transcript);
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
  // at rest only a reason the mic is off shows; where speech goes is on Talk's tooltip
  if (v.mode !== 'none' && v.mode !== 'blocked') return null;
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

const ROUTE_NAME = { health: 'Today', coverage: 'Health', foundations: 'Foundations', atlas: 'Components', play: 'Playground', docs: 'History', connectors: 'Connectors' };
const routeName = () => ROUTE_NAME[location.hash.match(/^#\/(\w+)/)?.[1]] ?? 'a page';

const WHAT = {
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
    fetch('/term/repos')
      .then((r) => r.json())
      .then(setRepos)
      .catch(() => {});
  }, []);
  const labelOf = (id) => repos.find((r) => r.id === id)?.label ?? { chip: 'CHIP', bella: 'BELLA', site: 'Site' }[id] ?? id;
  const termsRef = useRef(terms);
  termsRef.current = terms;
  const branchOf = (id) => repos.find((r) => r.id === id)?.branch ?? null;
  const newTerm = (kind, repo, typed, from = 'you, in Terminal', brief = null) => {
    if (termsRef.current.length >= MAX_TERMS) {
      notify('Six terminals is the most CHIP runs. Close one first.');
      return null;
    }
    const now = Date.now();
    const t = { id: nextId.current++, kind, repo, typed: typed ?? null, run: 0, status: 'connecting', opened: false, from, brief, started: now, last: now };
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
  const statusOf = useCallback((id, status) => setTerms((ts) => ts.map((t) => (t.id === id ? { ...t, status, opened: t.opened || status === 'open', last: Date.now() } : t))), []);
  // output marks a session active; the tree is told at most every 5 s
  const seen = useRef(new Map());
  const activity = useCallback((id) => {
    const now = Date.now();
    if (now - (seen.current.get(id) ?? 0) < 5000) return;
    seen.current.set(id, now);
    setTerms((ts) => ts.map((t) => (t.id === id ? { ...t, last: now } : t)));
  }, []);
  const goTerm = (id) => {
    setActiveTerm(id);
    setTab('term');
    requestAnimationFrame(() => handles.current.get(id)?.focus());
  };

  // a command from Needs you or a page arrives typed in a fresh shell; a
  // brief (kind claude) goes to the Claude already open, or a new one
  useEffect(() => {
    const on = (e) => {
      const { repo = 'chip', command, kind, brief = null } = e.detail ?? {};
      // where it came from: the sender says, or the page it was sent from
      const from = e.detail?.from ?? routeName();
      if (kind === 'claude') {
        const c = termsRef.current.find((t) => t.kind === 'claude' && t.status !== 'closed');
        if (c) {
          setTerms((ts) => ts.map((t) => (t.id === c.id ? { ...t, from, brief: brief ?? t.brief } : t)));
          setActiveTerm(c.id);
          set({ open: true, tab: 'term' });
        } else newTerm('claude', repo, null, from, brief);
        return;
      }
      if (newTerm('shell', repo, command, from) && command) notify(`Typed in a new ${labelOf(repo)} shell, not run. Press Return there to run it.`);
    };
    window.addEventListener('chip:terminal', on);
    return () => window.removeEventListener('chip:terminal', on);
  });

  /* a Needs-you lane item goes to the tree */
  const onLane = () => setTab('sessions');

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
  // headless Claude runs ("Fix with Claude"): CHIP's own sessions with a result
  const runs = useRuns(open && tab === 'sessions');
  // the badge counts the tree's rows: CHIP, its runs and terminals, Relay lanes and each lane
  const sessionRows = 2 + runs.length + terms.length + lanes.length;
  const tabs = (
    <Segmented
      id="wp"
      label="Work"
      value={tab}
      onChange={setTab}
      items={[
        {
          id: 'sessions',
          label: (
            <>
              Sessions <span className="n">{sessionRows}</span>
            </>
          ),
        },
        {
          id: 'term',
          label: (
            <>
              Terminal <span className="n">{terms.length}</span>
            </>
          ),
        },
        { id: 'ask', label: 'Ask OBI' },
      ]}
    />
  );
  const micOff = voice.mode === 'none' || voice.mode === 'blocked';

  return (
    <aside className={`wp k-chrome wp-${dock}${dragging ? ' dragging' : ''}`} id="work" aria-label="Work: Sessions, Terminal and Ask" hidden={!open} onKeyDown={onKeyDown} data-theme="dark">
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
        onDoubleClick={() => (set(right ? { w: DEF.w, sized: false } : { h: DEF.h }), notify('Size reset.'))}
      />
      {dragging || tip ? (
        <span className="sizetip" aria-hidden="true">
          {size} px
        </span>
      ) : null}
      <div className="wp-head">
        <h2>Work</h2>
        {right ? null : tabs}
        {canDock ? (
          <Overflow label="Work panel options" className="wp-more">
            <b>Dock</b>
            <DockPick value={dock} onChange={(d) => set({ dock: d })} />
          </Overflow>
        ) : null}
        <button type="button" className="k-iconbtn" onClick={onClose} aria-label="Close the Work panel">
          <span aria-hidden="true">✕</span> Close
        </button>
      </div>
      {right ? <div className="wp-tabs">{tabs}</div> : null}
      {WHAT[tab] ? <p className="wp-what">{WHAT[tab]}</p> : null}

      <div className="wp-body" {...segPanelProps('wp', 'sessions', tab)}>
        <Sessions
          lanes={lanes}
          terms={terms}
          runs={runs}
          labelOf={labelOf}
          branchOf={branchOf}
          handles={handles}
          onGoTerm={goTerm}
          onStop={closeTerm}
          onReply={(repo, who) => newTerm('shell', repo, null, `a reply to ${who}`)}
          notify={notify}
          live={open && tab === 'sessions'}
        />
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
          onActivity={activity}
          register={register}
        />
      </div>
      <div className="wp-body fill wp-ask" {...segPanelProps('wp', 'ask', tab)}>
        <ObiThread {...obiProps} />
      </div>

      <form className="one" onSubmit={submit} autoComplete="off">
        <div className="one-meta">
          {onTerm ? <span className="one-to term">{at ? `Types into ${termName(at, labelOf(at.repo))}` : 'No terminal open'}</span> : null}
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
              placeholder="Words to type (not run)"
              className="one-input"
            />
          ) : (
            <OneInput {...inputProps} id="wp-ask" describedBy="wp-ask-help" value={q} onValue={setQ} onEscape={() => (voice.listening ? voice.stop() : onClose())} />
          )}
          <span className="mic-tip" title={micOff ? undefined : `${MODE[voice.mode][1]}: ${MODE[voice.mode][2]}`}>
            <Button
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              disabled={micOff}
              ariaLabel={micOff ? 'Talk (not available)' : voice.listening ? 'Stop listening' : `Talk: start speech to text. ${MODE[voice.mode][1]}: ${MODE[voice.mode][2]}`}
              className="mic"
            >
              {voice.listening ? null : MIC}
              {voice.listening ? 'Stop' : 'Talk'}
            </Button>
          </span>
          <Button variant="tertiary" type="submit" disabled={!q.trim()}>
            {verb}
          </Button>
        </div>
        {onTerm ? null : (
          <p className="one-help k-vh" id="wp-ask-help">
            {inputProps.cloud ? 'Sent to Anthropic. ' : ''}Type / for a command.
          </p>
        )}
      </form>
    </aside>
  );
}
