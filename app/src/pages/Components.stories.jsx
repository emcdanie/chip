// CHIP / Pages / Components: the page (template + ComponentsContent), one
// story per Figma state built so far (CHIP Dashboard 612:57549).
import Components from './Components.jsx';
import { figmaModel } from './componentsFixture.js';

export default {
  title: 'CHIP/Pages/Components',
  component: Components,
};

/** Figma 612:56885: CodeBlock, its anatomy and checks. */
export const Default = { args: { model: figmaModel, partId: 'CodeBlock' } };
/** Figma 612:57389: only the parts that need work. */
export const NeedsWork = { name: 'Needs work', args: { model: figmaModel, filter: 'needs' } };
/** Figma 747:51687: no part matches. */
export const NoMatch = { name: 'No match', args: { model: { ...figmaModel, parts: figmaModel.parts.map((p) => ({ ...p, ready: false })), ready: 0 }, filter: 'ready' } };
