// FIXTURE, not CHIP data: a made-up board for the stories, which run without CHIP's server.
// The page reads /needs, /runs, /work/lanes and /work/board (workModel.js boardModel).
import { boardModel } from './workModel.js';

const now = Date.parse('2026-11-22T17:10:00+01:00');
const min = (m) => now - m * 60e3;
const steps = (done, total) => Array.from({ length: total }, (_, i) => ({ text: `Example step ${i + 1}`, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending' }));
export const figmaModel = boardModel({
  now,
  needs: [{ id: 'figma', kind: 'Check', status: 'Failed', what: 'Figma check: no file key', at: min(30), action: { type: 'review', check: 'figma', label: 'See why it failed' } }],
  gaps: { story: { Example: true }, docs: { Example: true } },
  runs: [{ id: 'r1', title: 'Example fix', status: 'running', step: 'Editing a file', startedAt: new Date(min(12)).toISOString() }],
  board: {
    activeMin: 10,
    sessionHours: 36,
    sessions: [
      { id: 's1', title: 'Example session, working', project: 'CHIP', steps: steps(2, 5), startedAt: min(90), updatedAt: min(1), working: true, asks: false },
      { id: 's2', title: 'Example session, no plan yet', project: 'CHIP', steps: [], startedAt: min(20), updatedAt: min(2), working: true, asks: false },
      { id: 's3', title: 'Example session, finished', project: 'CHIP', steps: steps(4, 4), startedAt: min(300), updatedAt: min(120), working: false, asks: false },
    ],
    progress: {
      reached: true,
      tasks: [],
      items: [
        { id: 'p1', title: 'Example review page', stage: 'Waiting on you', track: 'design', link: '#', n: 0 },
        { id: 'p2', title: 'Example idea', stage: 'To do', track: 'parts', n: 1 },
        { id: 'p3', title: 'Example shipped item', stage: 'Done', track: 'library', n: 2 },
      ],
    },
    board: { place: {}, order: {} },
  },
});
export const clearModel = boardModel({ now, board: { activeMin: 10, sessionHours: 36, sessions: [], progress: { reached: true, items: [], tasks: [] }, board: { place: {}, order: {} } } });
