// FIXTURE, not CHIP data. Figma's example copy for the Team states (CHIP
// Dashboard 612:82090: default 612:81339, draft 612:81478, sent 612:81620,
// agent quiet 612:81750). Used only to review the drawn states (the story,
// and #/team?state=<name>); the page itself reads The Bar. PR numbers are
// written "PR 184" (Figma uses a hash sign, which the commit hook reads as a hex).
const DAY = 86400000;
const now = Date.now();

const asks = [
  { id: 'liam-0', agent: 'Liam', text: 'OK to merge the fix?', at: now },
  { id: 'dara-0', agent: 'Dara', text: 'Merge PR 184 if green?', at: now - 35 * DAY },
  { id: 'bernie-0', agent: 'Bernie', text: 'PR 202: review or hold?', at: now - 35 * DAY },
  { id: 'frankie-0', agent: 'Frankie', text: 'Push 6 commits?', at: now - 35 * DAY },
];

const base = {
  state: 'ready',
  agents: 6,
  working: 1,
  prs: 15,
  asks,
  thread: [
    { id: 't1', who: 'Seamus', text: 'Do not build the Search case.' },
    { id: 't2', who: 'Liam', text: 'Merge deletes the fix branch. OK to merge the fix?', waiting: true },
  ],
  quiet: null,
};

export const TEAM_STATES = {
  default: { data: base },
  draft: { data: base, draft: { ask: asks[0], text: 'OK to merge. Delete the branch after.' } },
  sent: {
    data: { ...base, thread: [...base.thread] },
    sent: [{ ask: asks[0], text: 'OK to merge. Delete the branch after.' }],
    reply: { id: 't3', who: 'Liam', text: 'Merging now. Back in Today when the gate passes.' },
  },
  'agent quiet': { data: { ...base, quiet: { name: 'Saoirse', role: 'Figma', days: 22, at: now - 22 * DAY } } },
  empty: { data: { ...base, asks: [], thread: [], working: 0 } },
  loading: { data: { state: 'loading' } },
  error: { data: { state: 'error' } },
};
