// FIXTURE, not CHIP data. CHIP has no playbook store yet, so the "Not again"
// suggestion is Figma's own example (CHIP Dashboard, Not again · content,
// state "suggested", 612:72478), word for word. Replace with the real
// playbook list when CHIP records playbooks. Numbers CHIP does not count are
// not here: the page shows "Not measured" for them.
export const suggestion = {
  title: 'Suggested: Add contrast pair',
  description: '9 components have no declared pair',
  action: 'Run on 9',
  components: ['PatternField', 'ScaledFrame', 'Columns', 'Icon', 'Leader', 'Eyebrow', 'Kbd', 'ResourceCard', 'Tag'],
  steps: [
    { title: 'Trigger: Contrast check', detail: 'Finds a component with no pair declared.' },
    { title: 'Claude runs the script', detail: 'Adds the 9 pairs, one commit.' },
    { title: 'The gate', detail: '5 checks must pass.' },
    { title: 'You', detail: 'Accept, or Undo.' },
  ],
};

export const explainer = {
  title: 'What is a playbook?',
  message: 'A fix that worked before, saved as steps, so Claude repeats it the same way when a check finds that problem again.',
};
