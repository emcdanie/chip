// Jev (TypeSafe AI): a "decider" provider. Interface only, not built yet
// (hosted, waitlist). A decider does not stream text: it returns a typed
// decision with a probability, which suits the router ("which route?") and
// design-system calls ("variant or new component?").
//
//   decide({ question, choices: string[] }) -> { choice: string, probability: number }
//
// When it exists, the router asks it first and falls back to the rules below
// 0.7 confidence (see routeFor in app/src/answers.js).
export const jev = {
  id: 'jev',
  kind: 'decider',
  label: 'Jev · decisions with probabilities',
  place: 'cloud',
  async list() {
    return [{ id: 'jev', label: 'Jev', group: 'Cloud', place: 'cloud', available: false, kind: 'decider', note: 'not connected yet' }];
  },
  // eslint-disable-next-line no-unused-vars
  async decide({ question, choices }) {
    throw new Error('Jev is not connected yet');
  },
};
