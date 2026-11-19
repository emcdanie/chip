// Work's board, from CHIP's own data: what needs her (/needs) and the agent
// runs CHIP started (/runs). Lanes as Figma (Work · content 608:207182):
// Needs you, Agent, Gate, Ready, and Merged today under Ready.
import { useCallback, useEffect, useState } from 'react';

const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const today = (t) => new Date(t).toDateString() === new Date().toDateString();

/* A Needs-you item as a card: the check's own name, not the raw error. */
function needCard(n) {
  const name = n.kind === 'Gate' || n.kind === 'Check' ? String(n.what ?? n.title).split(':')[0] : n.title;
  const failed = /fail/i.test(n.status);
  return { id: n.id, title: name, line: n.detail, status: n.status, tone: failed ? 'danger' : 'attention', failed, at: n.at, action: n.action?.label };
}

/* An agent run as a card, by where it is. */
function runCard(r) {
  return { id: r.id, title: r.title ?? 'Fix', line: r.startedAt ? `Started ${hhmm(r.startedAt)}` : undefined, branch: r.branch };
}

export function workModel({ needs = [], runs = [] }) {
  const needsYou = needs.map(needCard).sort((a, b) => Number(b.failed) - Number(a.failed) || (a.at ?? 0) - (b.at ?? 0));
  const by = (...s) => runs.filter((r) => s.includes(r.status));
  const lanes = [
    { id: 'needs', name: 'Needs you', order: 'Failures first, then what blocks a push.', cards: [...by('failed', 'login').map((r) => ({ ...runCard(r), status: 'Failed', tone: 'danger' })), ...needsYou] },
    { id: 'agent', name: 'Agent', order: 'In the order sent; one runs, the rest queue.', cards: by('starting', 'running').map((r) => ({ ...runCard(r), status: 'Working', tone: 'info' })) },
    { id: 'gate', name: 'Gate', order: 'In the order the agent finished. Nothing waiting.', cards: by('gate').map((r) => ({ ...runCard(r), status: 'Checking', tone: 'info' })) },
    { id: 'ready', name: 'Ready', order: 'Longest waiting first. Accept, or Undo.', cards: by('passed').map((r) => ({ ...runCard(r), status: 'Gate passed', tone: 'success' })) },
  ];
  const merged = by('kept').filter((r) => today(r.endedAt ?? r.startedAt ?? 0));
  const total = lanes.reduce((s, l) => s + l.cards.length, 0);
  const top = needsYou[0];
  const brief = needsYou.length
    ? { message: `${needsYou.length} ${needsYou.length === 1 ? 'thing needs' : 'things need'} you; the top one is ${top.title}${top.failed ? ', which failed' : ''}.${lanes[1].cards.length ? ` ${lanes[1].cards.length} agent ${lanes[1].cards.length === 1 ? 'run is' : 'runs are'} working.` : ''}`, action: top.action }
    : null;
  return { lanes, merged, total, brief, finished: merged.map((r) => ({ id: r.id, text: `${hhmm(r.endedAt ?? r.startedAt)} · ${r.title}` })) };
}

/** Reads CHIP's data; `reload` reads it again (Check again). */
export function useWork() {
  const [state, setState] = useState({ model: null, error: null, at: null });
  const load = useCallback(() => {
    const json = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${u} answered ${r.status}`))));
    Promise.all([json('/needs'), json('/runs')])
      .then(([n, r]) => setState({ model: workModel({ needs: n.items ?? [], runs: r.runs ?? [] }), error: null, at: Date.now() }))
      .catch((e) => setState((s) => ({ ...s, error: e.message })));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener('chip:changed', load);
    return () => window.removeEventListener('chip:changed', load);
  }, [load]);
  return { ...state, reload: load, checked: state.at ? hhmm(state.at) : null };
}
