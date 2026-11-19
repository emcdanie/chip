// CHIP / Pages / Work: the page (template + WorkContent), one story per Figma
// state built so far (CHIP Dashboard, Work · content 608:207182).
import Work from './Work.jsx';
import { figmaModel, clearModel } from './workFixture.js';

export default {
  title: 'CHIP/Pages/Work',
  component: Work,
};

/** Figma 608:182555. */
export const Default = { args: { model: figmaModel } };
/** Figma 608:205509: nothing on the board. */
export const ClearDay = { name: 'Clear day', args: { model: clearModel } };
/** Figma 612:88931: every task in one list. */
export const List = { args: { model: figmaModel, view: 'list' } };
