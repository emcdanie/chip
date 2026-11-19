// A project's views, in the IA map's order: the Tabs under every project
// page's header (CHIP / Screen). One list, so a view is added or renamed once.
// Views not yet rebuilt open the old app's page.
export const PROJECT_VIEWS = [
  { id: 'work', label: 'Work', href: '#/work' },
  { id: 'health', label: 'Health', href: '#/health' },
  { id: 'components', label: 'Components', href: '#/components' },
  { id: 'foundations', label: 'Foundations', href: '#/foundations' },
  { id: 'history', label: 'History', href: '#/docs' },
  { id: 'playground', label: 'Playground', href: '#/playground' },
];

/** Tabs props for a project page: `current` is the view you are on. */
export function projectTabs(current) {
  return {
    items: PROJECT_VIEWS.map(({ id, label }) => ({ id, label })),
    value: current,
    onChange: (id) => {
      const v = PROJECT_VIEWS.find((x) => x.id === id);
      if (v && id !== current) window.location.hash = v.href;
    },
    label: 'Project views',
    idBase: 'project-views',
  };
}
