// FIXTURE, not CHIP data: Figma's own numbers (CHIP Dashboard, Health ·
// content 601:111049) for the stories, which run without CHIP's server. The
// page itself reads CHIP's data (healthModel.js).
import { healthModel } from './healthModel.js';

const names = ['PatternField', 'ScaledFrame', 'Columns', 'Icon', 'Leader', 'Eyebrow', 'Kbd', 'ResourceCard', 'Tag'];
const components = Array.from({ length: 44 }, (_, i) => ({ name: `Part${i}` }));
const gaps = {
  story: { BrandWordmark: {}, PatternField: {} },
  contrast: Object.fromEntries(names.map((x) => [x, {}])),
  a11y: { ClientSwitcher: {}, EmptyState: {} },
};
const history = [{ committedAt: '2026-11-10T10:29:00+01:00', gate: { contrastPairs: true, contractParity: true, ok: true } }];

export const figmaModel = healthModel({ components, gaps, history });
export const allClearModel = healthModel({ components, gaps: {}, history });
export const RUNS = {
  running: { state: 'running', done: 3, of: 5, now: 'AGENTS.md' },
  passed: { state: 'passed', of: 5 },
  failed: { state: 'failed', of: 5, failed: 'Contrast', why: '9 pairs under 4.5:1 · Columns, Eyebrow, Icon +6' },
};
