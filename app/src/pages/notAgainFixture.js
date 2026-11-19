// FIXTURE, not CHIP data. CHIP has no store for Not again yet, so every
// state's words are Figma's own example (CHIP Dashboard, Not again · content
// 612:73919: suggested 612:72478, running 612:72730, your call 612:72978,
// kept 612:73238, gate fails 612:73471, library 612:73704), word for word,
// except where Elleta's 19 Nov rules changed the words: the page is "Not
// again" and CHIP never names a model ("the agent"). Replace with the real
// list when CHIP records its fixes. Stats CHIP does not count (runs this
// week, kept) are not here: the page shows the Empty state for them.
export const explainer = {
  title: 'What is Not again?',
  message: 'A fix that worked before, saved as steps, so the agent repeats it the same way when a check finds that problem again.',
};

export const fix = {
  name: 'Add contrast pair',
  components: ['PatternField', 'ScaledFrame', 'Columns', 'Icon', 'Leader', 'Eyebrow', 'Kbd', 'ResourceCard', 'Tag'],
};

const FOUND = { title: 'Trigger: Contrast check', detail: 'Found 9 components with no pair.', state: 'done' };
const ADDED = { title: 'The agent runs the script', detail: 'Added 9 pairs, one commit.', state: 'done' };
const PASSED = { title: 'The gate', detail: '5 of 5 checks passed.', state: 'done' };
const GATE_WAITS = { title: 'The gate', detail: '5 checks must pass.', state: 'pending' };
const YOU_WAIT = { title: 'You', detail: 'Accept, or Undo.', state: 'pending' };

/* Each state: the card's lead word, its line, and the four steps. */
export const states = {
  suggested: {
    lead: 'Suggested',
    description: '9 components have no declared pair',
    steps: [
      { title: 'Trigger: Contrast check', detail: 'Finds a component with no pair declared.', state: 'pending' },
      { title: 'The agent runs the script', detail: 'Adds the 9 pairs, one commit.', state: 'pending' },
      GATE_WAITS,
      YOU_WAIT,
    ],
  },
  running: {
    lead: 'Running',
    description: '9 components have no declared pair',
    steps: [FOUND, { title: 'The agent runs the script', detail: 'Working now: 4 of 9 pairs added.', state: 'current' }, GATE_WAITS, YOU_WAIT],
  },
  'your-call': {
    lead: 'Your call',
    description: 'The agent added 9 pairs and the gate passed',
    steps: [FOUND, ADDED, PASSED, { title: 'You', detail: 'Waiting on you.', state: 'current' }],
  },
  kept: {
    lead: 'Kept',
    description: '9 pairs added. Logged in History',
    banner: { title: 'Kept', message: 'Add contrast pair: 9 pairs added. Logged in History.' },
    steps: [FOUND, ADDED, PASSED, { title: 'You', detail: 'Accepted 10:52.', state: 'done' }],
  },
  'gate-fails': {
    lead: 'Stopped',
    description: '9 components have no declared pair',
    steps: [FOUND, ADDED, { title: 'The gate', detail: '4 of 5 checks passed. Colour contrast failed.', state: 'current' }, YOU_WAIT],
  },
};

/* Library: every saved fix and the check that starts it, as Figma words it. */
export const library = [
  { name: 'Add contrast pair', when: 'When: Contrast check · 2 runs · 1 kept' },
  { name: 'Draw in Figma', when: 'When: Figma check · Not run yet' },
  { name: 'Fill behaviour lines', when: 'When: Contract check · Not run yet' },
  { name: 'Polish pass', when: 'When: Page changed · Not run yet' },
  { name: 'Interface critique', when: 'When: Before done · Not run yet' },
  { name: 'Accessibility audit', when: 'When: a11y field empty · Not run yet' },
  { name: 'Pixel check in Figma', when: 'When: Figma write · Not run yet' },
  { name: 'Lock then verify', when: 'When: Build starts · Not run yet' },
];
