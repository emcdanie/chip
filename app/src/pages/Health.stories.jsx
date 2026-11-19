// CHIP / Pages / Health: the page (template + HealthContent), one story per
// Figma state (CHIP Dashboard, Health · content 601:111049). Figma's numbers.
import Health from './Health.jsx';
import { figmaModel, allClearModel, RUNS } from './healthFixture.js';

export default {
  title: 'CHIP/Pages/Health',
  component: Health,
};

/** Figma 601:109235. */
export const Default = { args: { model: figmaModel } };
/** Figma 601:109694: the gate is running; keep working. */
export const Running = { args: { model: figmaModel, run: RUNS.running } };
/** Figma 601:109725. */
export const Passed = { args: { model: figmaModel, run: RUNS.passed } };
/** Figma 601:110367. */
export const Failed = { args: { model: figmaModel, run: RUNS.failed } };
/** Figma 747:51094: nothing to fix. */
export const AllClear = { name: 'All clear', args: { model: allClearModel, run: RUNS.passed } };
