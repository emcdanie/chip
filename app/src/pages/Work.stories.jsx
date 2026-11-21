// CHIP / Pages / Work: the page (template + WorkContent), one story per Figma
// state built so far, on a made-up board (workFixture.js).
import Work from './Work.jsx';
import { figmaModel, clearModel } from './workFixture.js';

export default {
  title: 'CHIP/Pages/Work',
  component: Work,
};

/** The board in her Notion lanes. */
export const Default = { args: { model: figmaModel } };
/** Nothing on the board. */
export const ClearDay = { name: 'Clear day', args: { model: clearModel } };
/** Every card in one list. */
export const List = { args: { model: figmaModel, view: 'list' } };
