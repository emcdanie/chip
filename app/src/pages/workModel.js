// Work's board, from CHIP's own data: what needs her (/needs) and the agent
// runs CHIP started (/runs). Lanes as Figma (Work · content 608:207182):
// Needs you, Agent, Gate, Ready (slim Work: no Merged today, no Just finished).
import { useEffect, useMemo } from 'react';
import useCached from '../templates/useCached.js';

const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/* A Needs-you item as a card: the check's own name, not the raw error. */
function needCard(n) {
  const name = n.kind === 'Gate' || n.kind === 'Check' ? String(n.what ?? n.title).split(':')[0] : n.title;
  const failed = /fail/i.test(n.status);
  // The line is short meta in the subtext face: what kind and how risky.
  // The long detail is the same paragraph on every gate item, so it stays in
  // the review, never repeated on the board (19 Nov audit).
  // an agent can take a failed check (b21, rule A); pull, merge and push stay hers ("Push and merge: never moves up, always asks")
  const fixable = failed && (n.kind === 'Gate' || n.kind === 'Check') && n.action?.type === 'review';
  return { id: n.id, title: name, line: [n.kind, n.risk ? `${n.risk} risk` : null].filter(Boolean).join(' · ') || undefined, status: n.status, tone: failed ? 'danger' : 'attention', failed, at: n.at, action: n.action?.label, fixable, check: n.action?.check };
}

/* An agent run as a card, by where it is. */
function runCard(r) {
  return { id: r.id, title: r.title ?? 'Fix', // Figma slim: the branch and time on the card's line ("main checkout · 10:19"), no separate branch tag
    line: [r.branch, r.startedAt ? hhmm(r.startedAt) : null].filter(Boolean).join(' · ') || undefined };
}

export function workModel({ needs = [], runs = [] }) {
  // a check an agent is already working on leaves Needs you (its run shows in Agent)
  const working = new Set(runs.filter((r) => ['starting', 'running', 'gate'].includes(r.status)).map((r) => r.title));
  const needsYou = needs.map(needCard).filter((c) => !(c.fixable && working.has(c.title))).sort((a, b) => Number(b.failed) - Number(a.failed) || (a.at ?? 0) - (b.at ?? 0));
  const by = (...s) => runs.filter((r) => s.includes(r.status));
  const lanes = [
    { id: 'needs', name: 'Needs you', cards: [...by('failed', 'login').map((r) => ({ ...runCard(r), status: 'Failed', tone: 'danger' })), ...needsYou] },
    { id: 'agent', name: 'Agent', cards: by('starting', 'running').map((r) => ({ ...runCard(r), status: 'Working', tone: 'info' })) },
    { id: 'gate', name: 'Gate', cards: by('gate').map((r) => ({ ...runCard(r), status: 'Checking', tone: 'info' })) },
    { id: 'ready', name: 'Ready', cards: by('passed').map((r) => ({ ...runCard(r), status: 'Gate passed', tone: 'success' })) },
  ];
  const total = lanes.reduce((s, l) => s + l.cards.length, 0);
  const top = needsYou[0];
  const brief = needsYou.length
    ? { message: `${needsYou.length} ${needsYou.length === 1 ? 'thing needs' : 'things need'} you; the top one is ${top.title}${top.failed ? ', which failed' : ''}.${lanes[1].cards.length ? ` ${lanes[1].cards.length} agent ${lanes[1].cards.length === 1 ? 'run is' : 'runs are'} working.` : ''}`, action: top.action }
    : null;
  return { lanes, total, brief };
}

/** Reads CHIP's data (kept between pages); `reload` reads it again (Check again). */
export function useWork() {
  const { data, error, at, reload } = useCached(['/needs', '/runs']);
  useEffect(() => {
    window.addEventListener('chip:changed', reload);
    return () => window.removeEventListener('chip:changed', reload);
  }, [reload]);
  const model = useMemo(() => (data ? workModel({ needs: data[0].items ?? [], runs: data[1].runs ?? [] }) : null), [data]);
  return { model, error, reload, checked: at ? hhmm(at) : null };
}
