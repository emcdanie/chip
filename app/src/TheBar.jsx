// The Bar (the mock's right-hand column): Needs you and Lanes, then one
// input to ask or tell a session. Needs you is GET /needs (the checks, fix
// branches, git state and fresh lane notes, High → Low); each item reads
// "status · risk", then a short bold title. A review item opens the review
// card; any other opens in place with "This will · Undo" and one button.
// Lanes is GET /bar/state plus the two sessions on this machine (Claude and
// the terminal), which open the work sheet.
import React, { useEffect, useState } from 'react';
import Button from '@bella/components/Button/Button';
import { Segmented, segPanelProps } from './kit/index.jsx';
import { openReview } from './ReviewSheet.jsx';

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const FACE = { dara: 'lane-a', bernie: 'lane-c', saoirse: 'lane-b', frankie: 'lane-d' };
const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
// a lane's claim and its PR's CI disagree: the mock's "Claim ≠ CI"
const mismatch = (l) => (l.prs ?? []).some((pr) => pr.claim !== 'none' && pr.ci !== 'unknown' && pr.ci !== 'none' && pr.ci !== 'merged' && pr.claim !== pr.ci);

/** GET /bar/state every 10 s: the lanes and what each last reported. */
export function useBar() {
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

function NeedsList({ needs, onLane }) {
  const [open, setOpen] = useState(null);
  if (!needs) return <p className="bar-empty">Reading what needs you…</p>;
  return (
    <>
      <ul className="nylist">
        {needs.items.length === 0 ? <li className="bar-empty">Nothing needs you.</li> : null}
        {needs.items.map((n) => {
          const inPlace = n.action.type !== 'review';
          const on = open === n.id;
          return (
            <li key={n.id} className="ny">
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
          {needs.staleLaneNotes} older lane question{needs.staleLaneNotes === 1 ? '' : 's'} <small>(reports quiet for over {needs.freshDays} days) are in Lanes.</small>
        </p>
      ) : null}
    </>
  );
}

function laneLine(l) {
  const n = l.needs?.length ?? 0;
  const when = l.updated ? `last report ${day(l.updated)}` : 'no report yet';
  if (mismatch(l)) return `Says green; CI disagrees · ${when}`;
  if (l.status === 'waiting on you' && n) return `${n} question${n === 1 ? '' : 's'} for you${Date.now() - l.updated > STALE_MS ? ', older than a week' : ''} · ${when}`;
  return `${l.status[0].toUpperCase()}${l.status.slice(1)} · ${when}`;
}

function Lanes({ lanes, openLane, setOpenLane, onWork }) {
  const local = [
    { id: 'claude', name: 'Claude', role: 'session · this machine', face: 'C', line: 'claude in a terminal, in the repo you pick', work: 'claude' },
    { id: 'term', name: 'Terminal', role: 'session · this machine', face: '>', line: 'Your shell. Needs-you commands arrive typed, never run.', work: 'term' },
  ];
  return (
    <div className="sessions">
      {local.map((x) => (
        <div key={x.id} className="sess lane">
          <button type="button" className="lrowb" aria-haspopup="dialog" onClick={() => onWork(x.work)}>
            <span className="face" aria-hidden="true">
              {x.face}
            </span>
            <span className="lwho">
              <span className="name">{x.name}</span>
              <span className="ljob">{x.role}</span>
            </span>
            <span className="line">{x.line}</span>
          </button>
        </div>
      ))}
      {lanes.map((l) => {
        const st = mismatch(l) ? 'fail' : l.status === 'waiting on you' && l.needs?.length ? 'you' : '';
        const on = openLane === l.id;
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
              {st ? <span className="adot">{st === 'fail' ? 'Failed' : 'Waiting on you'}</span> : null}
              <span className="line">{laneLine(l)}</span>
            </button>
            {on ? (
              <div className="lthread">
                {l.repo ? <span className="where">{l.repo}</span> : null}
                {l.needs?.length ? (
                  <ul className="lneeds">
                    {l.needs.map((n, i) => (
                      <li key={i}>{n.text}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="line">Nothing asked.</p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function TheBar({ needs, lanes, onClose, onWork, onAsk }) {
  const [tab, setTab] = useState('needs');
  const [openLane, setOpenLane] = useState(null);
  const [q, setQ] = useState('');
  const onLane = (id) => {
    setTab('lanes');
    setOpenLane(id);
  };
  const count = needs?.items.length;
  return (
    <aside className="bar" id="the-bar" aria-label="The Bar" onKeyDown={(e) => e.key === 'Escape' && !e.defaultPrevented && onClose(true)}>
      <div className="barhead">
        <h2>The Bar</h2>
        <button type="button" className="k-iconbtn" onClick={() => onClose(true)} aria-label="Close The Bar">
          <span aria-hidden="true">✕</span> Close
        </button>
      </div>
      <Segmented
        id="bar"
        label="The Bar"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'needs', label: <>Needs you <span className="n">{count ?? '…'}</span></> },
          { id: 'lanes', label: <>Lanes <span className="n">{lanes.length + 2}</span></> },
        ]}
      />
      <div className="barscroll">
        <div {...segPanelProps('bar', 'needs', tab)}>
          <NeedsList needs={needs} onLane={onLane} />
        </div>
        <div {...segPanelProps('bar', 'lanes', tab)}>
          <Lanes lanes={lanes} openLane={openLane} setOpenLane={setOpenLane} onWork={onWork} />
        </div>
      </div>
      <form
        className="barask"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim() && onAsk(q.trim())) setQ('');
        }}
      >
        <label className="k-vh" htmlFor="barQ">
          Ask OBI or tell a session
        </label>
        <input id="barQ" placeholder="Ask or tell a session…" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="mic" disabled title="Not built: CHIP has no voice input yet">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
          <span>Talk</span>
        </button>
      </form>
    </aside>
  );
}
