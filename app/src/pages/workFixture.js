// FIXTURE, not CHIP data: Figma's own board (CHIP Dashboard, Work · content
// 608:207182, state default) for the stories, which run without CHIP's
// server. The page reads /needs and /runs (workModel.js).
import { workModel } from './workModel.js';

const at = Date.parse('2026-11-19T10:19:00+01:00');
export const figmaModel = workModel({
  needs: [
    { id: 'figma', kind: 'Check', status: 'Failed', what: 'Figma check: no file key', detail: 'No file key in server/.env', at },
    { id: 'codeblock', kind: 'Gap', status: 'Gap', title: 'CodeBlock not in Figma', detail: 'Draw it, or mark code-only', at },
    { id: 'push', kind: 'Git', status: 'Waiting', title: 'Push chip/theme', detail: "CI hasn't run. Others see a push.", at },
    { id: 'bench', kind: 'Check', status: 'Waiting', what: 'Bench: agents run', detail: 'Due today', at },
  ],
  runs: [
    { id: 'a1', title: 'Agent in CHIP', status: 'running', branch: 'main', startedAt: at },
    { id: 'a2', title: 'Agent in CHIP', status: 'running', branch: 'chip-button-page', startedAt: at },
    { id: 'r1', title: 'Merge chip/fix-llms-txt', status: 'passed', branch: 'chip/fix-llms-txt', startedAt: at },
  ],
});
export const clearModel = workModel({ needs: [], runs: [] });
